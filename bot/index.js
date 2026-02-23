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

// ─── API client ───────────────────────────────────────────────────────────────
const api = new DexTradeClient(LOGIN_TOKEN, SECRET);

// ─── Tick control ─────────────────────────────────────────────────────────────
let tickTimer  = null;
let running    = false;
let forceRebal = false;

// ─── Market data fetch ────────────────────────────────────────────────────────
async function fetchMarket() {
  const ticker = await api.getTicker();
  const bid    = parseFloat(ticker.buy  || ticker.bid  || ticker.high_bid) || null;
  const ask    = parseFloat(ticker.sell || ticker.ask  || ticker.low_ask)  || null;
  const last   = parseFloat(ticker.last || ticker.price)                    || null;
  const vol    = parseFloat(ticker.volume || ticker.vol24)                  || null;
  const mid    = bid && ask ? (bid + ask) / 2 : last;

  state.market = { bid, ask, mid, last, volume24h: vol, updatedAt: new Date().toISOString() };
  return mid;
}

// ─── Balance fetch ────────────────────────────────────────────────────────────
async function fetchBalances() {
  try {
    const balances = await api.getBalances();
    // dex-trade returns an array or object of currencies
    const normalize = (entry) => ({
      available: parseFloat(entry.available || entry.balance || 0),
      total:     parseFloat(entry.total     || entry.balance || 0),
    });

    if (Array.isArray(balances)) {
      for (const b of balances) {
        const curr = (b.currency || b.coin || '').toUpperCase();
        if (curr === 'NXS' || curr === 'USDT') state.balances[curr] = normalize(b);
      }
    } else {
      if (balances.NXS)  state.balances.NXS  = normalize(balances.NXS);
      if (balances.USDT) state.balances.USDT = normalize(balances.USDT);
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
      logger.info(`Order filled: ${sideLabel} ${order.volume.toFixed(4)} NXS @ ${order.price.toFixed(8)} USDT [#${id}]`);

      // Track PnL
      if (order.side === 'buy') {
        state.pnl.totalBuyVolume += order.volume;
        state.pnl.totalBuyCost   += order.volume * order.price;
      } else {
        state.pnl.totalSellVolume  += order.volume;
        state.pnl.totalSellRevenue += order.volume * order.price;
      }
      state.pnl.realizedPnlUsdt =
        state.pnl.totalSellRevenue - state.pnl.totalBuyCost *
        (state.pnl.totalSellVolume / (state.pnl.totalBuyVolume || 1));
    }
  }
}

// ─── Rebalance: cancel & rebuild orders ──────────────────────────────────────
async function rebalance(midPrice) {
  const strategy = getStrategy(state.strategyName);
  const targetOrders = strategy.computeTargetOrders(midPrice, state.strategyParams);

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

  // Place new orders
  let placed = 0;
  for (const order of targetOrders) {
    if (!running) break;
    try {
      const result = await api.createLimitOrder(order.side, order.price, order.volume);
      const id = String(result.id || result.order_id || result.orderId);
      state.managedOrders[id] = {
        id,
        side:     order.side,
        price:    order.price,
        volume:   order.volume,
        status:   'open',
        placedAt: new Date().toISOString(),
      };
      logger.info(
        `Placed ${order.side.toUpperCase()} ${order.volume.toFixed(4)} NXS ` +
        `@ ${order.price.toFixed(8)} USDT [#${id}]`
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
  state.tickCount++;
  state.lastTickAt = new Date().toISOString();

  try {
    const midPrice = await fetchMarket();
    if (!midPrice) { logger.warn('No mid price available, skipping tick'); return; }

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
});

server.on('error', (e) => {
  logger.error(`Server error: ${e.message}`);
  process.exit(1);
});

process.on('SIGINT',  () => { logger.info('SIGINT received, shutting down…'); process.exit(0); });
process.on('SIGTERM', () => { logger.info('SIGTERM received, shutting down…'); process.exit(0); });
