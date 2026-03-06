'use strict';

require('dotenv').config();

const http = require('http');
const DexTradeClient = require('./dextrade');
const { getStrategy } = require('./strategies');
const { state } = require('./state');
const logger = require('./logger');
const createServer = require('./server');

// ─── Configuration ────────────────────────────────────────────────────────────
const PORT         = parseInt(process.env.BOT_PORT, 10) || 17442;
const LOGIN_TOKEN  = process.env.DEXTRADE_LOGIN_TOKEN || '';
const SECRET       = process.env.DEXTRADE_SECRET || '';
const TICK_INTERVAL_MS = 15_000; // poll + rebalance every 15 s
const PRICE_DECIMALS = 4;
const IDLE_PREFETCH_INTERVAL_MS = 15_000;

function roundOrderPrice(price) {
  return Number(price.toFixed(PRICE_DECIMALS));
}

// ─── API client ───────────────────────────────────────────────────────────────
const api = new DexTradeClient(LOGIN_TOKEN, SECRET);

// ─── Tick control ─────────────────────────────────────────────────────────────
let tickTimer  = null;
let idlePrefetchTimer = null;
let running    = false;
let forceRebal = false;
let tickInProgress = false;

async function prefetchSnapshotWhenStopped() {
  if (running || tickInProgress) return;

  try {
    await fetchMarket();
  } catch (e) {
    logger.warn(`Idle market fetch failed: ${e.message}`);
  }

  try {
    await fetchBalances();
  } catch (e) {
    logger.warn(`Idle balance fetch failed: ${e.message}`);
  }
}

// ─── Market data fetch ────────────────────────────────────────────────────────
async function fetchMarket() {
  const ticker = await api.getTicker();
  const last   = parseFloat(ticker.last || ticker.price)                        || null;
  const vol    = parseFloat(ticker.volume_24H || ticker.volume || ticker.vol24) || null;

  // Ticker doesn't include bid/ask — fetch from order book
  let bid = null, ask = null;
  try {
    const book = await api.getOrderBook();
    const bids = book.buy  || book.bids || [];
    const asks = book.sell || book.asks || [];
    if (bids.length > 0) bid = parseFloat(bids[0].rate || bids[0].price) || null;
    if (asks.length > 0) ask = parseFloat(asks[0].rate || asks[0].price) || null;
  } catch (e) {
    logger.warn(`Order book fetch failed: ${e.message}`);
  }

  const mid = bid && ask ? (bid + ask) / 2 : last;

  state.market = { bid, ask, mid, last, volume24h: vol, updatedAt: new Date().toISOString() };
  return mid;
}

// ─── Balance fetch ────────────────────────────────────────────────────────────
async function fetchBalances() {
  try {
    const balances = await api.getBalances();
    // dex-trade returns { list: [ { balances: { total, available }, currency: { iso3 } }, ... ] }
    const list = Array.isArray(balances) ? balances : (balances.list || []);
    for (const entry of list) {
      const iso = (entry.currency?.iso3 || entry.currency || entry.coin || '').toUpperCase();
      if (iso !== 'NXS' && iso !== 'USDT') continue;
      state.balances[iso] = {
        available: parseFloat(entry.balances?.available ?? entry.balance_available ?? entry.available ?? 0),
        total:     parseFloat(entry.balances?.total     ?? entry.balance          ?? entry.total     ?? 0),
      };
    }
  } catch (e) {
    logger.warn(`Balance fetch failed: ${e.message}`);
  }
}

// ─── Order reconciliation ─────────────────────────────────────────────────────
async function reconcileOrders() {
  // Get currently open orders from the exchange
  let openOrders = [];
  try {
    openOrders = await api.getOpenOrders();
    if (!Array.isArray(openOrders)) openOrders = openOrders.list || [];
  } catch (e) {
    logger.warn(`Open orders fetch failed: ${e.message}`);
    return;
  }

  const exchangeIds = new Set(openOrders.map((o) => String(o.id)));

  // Mark any managed orders that have been filled/cancelled
  for (const [id, order] of Object.entries(state.managedOrders)) {
    if (order.status === 'open' && !exchangeIds.has(id)) {
      state.managedOrders[id] = { ...order, status: 'filled' };
      const sideLabel = order.side === 'buy' ? 'BUY' : 'SELL';
      logger.info(`Order filled: ${sideLabel} ${order.volume.toFixed(4)} NXS @ ${order.price.toFixed(4)} USDT [#${id}]`);

      // Track PnL
      if (order.side === 'buy') {
        state.pnl.totalBuyVolume += order.volume;
        state.pnl.totalBuyCost   += order.volume * order.price;
      } else {
        state.pnl.totalSellVolume  += order.volume;
        state.pnl.totalSellRevenue += order.volume * order.price;
      }
      // Realized PnL = sell revenue − weighted cost basis for the sold volume
      const avgBuyCost =
        state.pnl.totalBuyCost * (state.pnl.totalSellVolume / (state.pnl.totalBuyVolume || 1));
      state.pnl.realizedPnlUsdt = state.pnl.totalSellRevenue - avgBuyCost;
    }
  }

  pruneClosedOrders();
}

// ─── Prune stale orders ──────────────────────────────────────────────────────
const MAX_CLOSED_ORDERS = 200;

function pruneClosedOrders() {
  const closed = Object.entries(state.managedOrders)
    .filter(([, o]) => o.status !== 'open')
    .sort((a, b) => (a[1].placedAt || '').localeCompare(b[1].placedAt || ''));

  if (closed.length > MAX_CLOSED_ORDERS) {
    const toRemove = closed.slice(0, closed.length - MAX_CLOSED_ORDERS);
    for (const [id] of toRemove) {
      delete state.managedOrders[id];
    }
    logger.debug(`Pruned ${toRemove.length} stale orders`);
  }
}

// ─── Rebalance: cancel & rebuild orders ──────────────────────────────────────
async function rebalance(midPrice) {
  const strategy = getStrategy(state.strategyName);
  const targetOrders = strategy.computeTargetOrders(midPrice, state.strategyParams);
  logger.debug(`Target orders from strategy: ${JSON.stringify(targetOrders)}`);
  logger.debug(`Balances: NXS=${JSON.stringify(state.balances.NXS)}, USDT=${JSON.stringify(state.balances.USDT)}`);

  // Cancel all currently open managed orders
  const openIds = Object.entries(state.managedOrders)
    .filter(([, o]) => o.status === 'open')
    .map(([id]) => id);

  if (openIds.length > 0) {
    logger.info(`Cancelling ${openIds.length} managed orders for rebalance…`);
    await api.cancelAll(openIds);
    for (const id of openIds) {
      if (state.managedOrders[id]) state.managedOrders[id].status = 'cancelled';
    }
  }

  // Refresh balances after cancellations so limits are up-to-date
  await fetchBalances();
  let availNxs  = state.balances.NXS?.available  || 0;
  let availUsdt = state.balances.USDT?.available || 0;

  // Place new orders
  const MIN_ORDER_VALUE_USDT = 5; // dex-trade minimum order value
  let placed = 0;
  for (const order of targetOrders) {
    if (!running) break;

    const price = roundOrderPrice(order.price);
    if (!Number.isFinite(price) || price <= 0) {
      logger.warn(`Skipping ${order.side.toUpperCase()} order with invalid rounded price: ${order.price}`);
      continue;
    }

    const orderValue = price * order.volume;

    // Check dex-trade minimum order value
    if (orderValue < MIN_ORDER_VALUE_USDT) {
      logger.warn(`Skipping ${order.side.toUpperCase()} ${order.volume.toFixed(4)} NXS @ ${price.toFixed(4)} — value ${orderValue.toFixed(4)} USDT < ${MIN_ORDER_VALUE_USDT} USDT minimum`);
      continue;
    }

    // Check available balance
    if (order.side === 'buy') {
      const cost = orderValue;
      if (cost > availUsdt) {
        logger.warn(`Skipping BUY ${order.volume.toFixed(4)} NXS — need ${cost.toFixed(4)} USDT, have ${availUsdt.toFixed(4)}`);
        continue;
      }
    } else {
      if (order.volume > availNxs) {
        logger.warn(`Skipping SELL ${order.volume.toFixed(4)} NXS — have ${availNxs.toFixed(4)}`);
        continue;
      }
    }

    try {
      const result = await api.createLimitOrder(order.side, price, order.volume);
      const id = String(result.id || result.order_id || result.orderId);
      state.managedOrders[id] = {
        id,
        side:     order.side,
        price,
        volume:   order.volume,
        status:   'open',
        placedAt: new Date().toISOString(),
      };
      // Reserve placed balance locally to avoid over-committing
      if (order.side === 'buy') availUsdt -= price * order.volume;
      else availNxs -= order.volume;

      logger.info(
        `Placed ${order.side.toUpperCase()} ${order.volume.toFixed(4)} NXS ` +
        `@ ${price.toFixed(4)} USDT [#${id}]`
      );
      placed++;
    } catch (e) {
      logger.error(`Failed to place ${order.side} order: ${e.message}`);
    }
  }

  state.lastMidPrice = midPrice;
  logger.info(`Rebalance complete: ${placed}/${targetOrders.length} orders placed`);
}

// ─── Main tick ────────────────────────────────────────────────────────────────
async function tick() {
  if (!running) return;
  if (tickInProgress) { logger.debug('Tick skipped — previous tick still running'); return; }
  tickInProgress = true;

  state.tickCount++;
  state.lastTickAt = new Date().toISOString();

  try {
    const midPrice = await fetchMarket();
    if (!midPrice || midPrice <= 0) { logger.warn('No valid mid price available, skipping tick'); return; }

    await reconcileOrders();
    await fetchBalances();

    const strategy = getStrategy(state.strategyName);
    if (forceRebal || strategy.needsRebalance(state.lastMidPrice, midPrice, state.strategyParams)) {
      logger.info(`Rebalancing at mid ${midPrice.toFixed(8)} USDT…`);
      await rebalance(midPrice);
      forceRebal = false;
    }

    if (state.status === 'error') {
      state.status = 'running';
      state.errorMessage = null;
    }
  } catch (e) {
    logger.error(`Tick error: ${e.message}`);
    state.status = 'error';
    state.errorMessage = e.message;
  } finally {
    tickInProgress = false;
  }
}

// ─── Bot controller (exposed to HTTP server) ──────────────────────────────────
const botController = {
  async start(strategyName = 'constantProduct', strategyParams = {}) {
    if (running) throw new Error('Bot is already running');
    if (!LOGIN_TOKEN || !SECRET) throw new Error('API credentials not set in .env');

    const strat = getStrategy(strategyName); // validates name
    state.strategyName   = strategyName;
    state.strategyParams = { ...strat.defaultParams, ...strategyParams };
    state.status         = 'running';
    state.errorMessage   = null;
    state.startedAt      = new Date().toISOString();
    state.stoppedAt      = null;
    running              = true;

    logger.info(`Bot started: strategy=${strategyName}`);

    // Run first tick immediately, then on interval
    await tick();
    tickTimer = setInterval(tick, TICK_INTERVAL_MS);
  },

  async stop(cancelOrders = true) {
    if (!running) throw new Error('Bot is not running');
    running = false;
    clearInterval(tickTimer);
    tickTimer = null;

    if (cancelOrders) {
      const openIds = Object.entries(state.managedOrders)
        .filter(([, o]) => o.status === 'open')
        .map(([id]) => id);
      if (openIds.length > 0) {
        logger.info(`Cancelling ${openIds.length} open orders on stop…`);
        await api.cancelAll(openIds);
        for (const id of openIds) {
          if (state.managedOrders[id]) state.managedOrders[id].status = 'cancelled';
        }
      }
    }

    state.status    = 'stopped';
    state.stoppedAt = new Date().toISOString();
    logger.info('Bot stopped');
  },

  async updateConfig(strategyName, strategyParams) {
    const strat = getStrategy(strategyName || state.strategyName);
    state.strategyName   = strat.name;
    state.strategyParams = { ...strat.defaultParams, ...(strategyParams || {}) };
    state.lastMidPrice   = null; // force rebalance
    logger.info(`Config updated: strategy=${state.strategyName}`);
  },

  async forceRebalance() {
    if (!running) throw new Error('Bot is not running');
    forceRebal = true;
    logger.info('Force rebalance requested');
  },
};

// ─── HTTP server ──────────────────────────────────────────────────────────────
const app    = createServer(botController);
const server = http.createServer(app);

server.listen(PORT, '127.0.0.1', () => {
  logger.info(`AMM Bot server listening on http://127.0.0.1:${PORT}`);
  logger.info(`API credentials: ${LOGIN_TOKEN ? 'configured' : 'MISSING – set DEXTRADE_LOGIN_TOKEN and DEXTRADE_SECRET in bot/.env'}`);
  logger.info(`Strategies available: constantProduct, grid, spreadMaker`);

  // Keep status snapshot fresh for UI even before trading is started.
  prefetchSnapshotWhenStopped().catch((e) => {
    logger.warn(`Initial idle prefetch failed: ${e.message}`);
  });
  idlePrefetchTimer = setInterval(prefetchSnapshotWhenStopped, IDLE_PREFETCH_INTERVAL_MS);
});

server.on('error', (e) => {
  logger.error(`Server error: ${e.message}`);
  process.exit(1);
});

async function gracefulShutdown(signal) {
  logger.info(`${signal} received, shutting down…`);
  if (idlePrefetchTimer) {
    clearInterval(idlePrefetchTimer);
    idlePrefetchTimer = null;
  }
  if (running) {
    try {
      await botController.stop(true);
    } catch (e) {
      logger.error(`Shutdown error: ${e.message}`);
    }
  }
  process.exit(0);
}

process.on('SIGINT',  () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
