'use strict';

const axios = require('axios');
const crypto = require('crypto');
const logger = require('./logger');

const PUBLIC_BASE  = 'https://api.dex-trade.com/v1/public';
const PRIVATE_BASE = 'https://api.dex-trade.com/v1/private';
const PAIR = 'NXSUSDT';

// Rate limiting: 10 req/s public, 5 req/s private
let lastPublicCall  = 0;
let lastPrivateCall = 0;

async function rateLimit(isPrivate) {
  const minGap = isPrivate ? 210 : 110; // ms between calls
  const last = isPrivate ? lastPrivateCall : lastPublicCall;
  const gap = Date.now() - last;
  if (gap < minGap) await sleep(minGap - gap);
  if (isPrivate) lastPrivateCall = Date.now();
  else lastPublicCall = Date.now();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

class DexTradeClient {
  constructor(loginToken, secret) {
    this.loginToken = loginToken;
    this.secret = secret;
  }

  _sign(body) {
    return crypto
      .createHmac('sha256', this.secret)
      .update(JSON.stringify(body))
      .digest('hex');
  }

  async _publicGet(path, params = {}) {
    await rateLimit(false);
    const url = `${PUBLIC_BASE}${path}`;
    const resp = await axios.get(url, { params, timeout: 10000 });
    return resp.data;
  }

  async _privatePost(path, body = {}) {
    if (!this.loginToken || !this.secret) {
      throw new Error('API credentials not configured');
    }
    await rateLimit(true);
    const url = `${PRIVATE_BASE}${path}`;
    const sign = this._sign(body);
    const resp = await axios.post(url, body, {
      headers: {
        'content-type': 'application/json',
        'login-token': this.loginToken,
        'x-auth-sign': sign,
      },
      timeout: 10000,
    });
    return resp.data;
  }

  // ─── Public endpoints ────────────────────────────────────────────────────

  async getTicker() {
    const data = await this._publicGet('/ticker', { pair: PAIR });
    return data.data || data;
  }

  async getOrderBook() {
    const data = await this._publicGet('/book', { pair: PAIR });
    return data.data || data;
  }

  async getTradeHistory(limit = 50) {
    const data = await this._publicGet('/history', { pair: PAIR, limit });
    return data.data || data;
  }

  async getSymbols() {
    const data = await this._publicGet('/symbols');
    return data.data || data;
  }

  // ─── Private endpoints ───────────────────────────────────────────────────

  async getBalances() {
    const data = await this._privatePost('/balances', {});
    return data.data || data;
  }

  /**
   * Create a limit order.
   * @param {'buy'|'sell'} side
   * @param {number} price  - price in USDT per NXS
   * @param {number} volume - volume in NXS
   */
  async createLimitOrder(side, price, volume) {
    const body = {
      pair:       PAIR,
      type_trade: side === 'buy' ? 0 : 1,
      type:       2, // 2 = limit order
      rate:       price.toFixed(8),
      volume:     volume.toFixed(4),
      request:    Math.floor(Date.now() / 1000),
    };
    logger.debug(`createLimitOrder: ${JSON.stringify(body)}`);
    const data = await this._privatePost('/create-order', body);
    return data.data || data;
  }

  /**
   * Cancel an order by ID.
   * @param {number|string} orderId
   */
  async cancelOrder(orderId) {
    const body = {
      id: orderId,
      request: Math.floor(Date.now() / 1000),
    };
    logger.debug(`cancelOrder: ${orderId}`);
    const data = await this._privatePost('/delete-order', body);
    return data.data || data;
  }

  /**
   * Get open orders for the pair.
   */
  async getOpenOrders() {
    const body = {
      pair:    PAIR,
      request: Math.floor(Date.now() / 1000),
    };
    const data = await this._privatePost('/orders', body);
    return data.data || data;
  }

  /**
   * Get order history (closed/filled orders).
   */
  async getOrderHistory(page = 1, limit = 50) {
    const body = {
      pair:    PAIR,
      page,
      limit,
      request: Math.floor(Date.now() / 1000),
    };
    const data = await this._privatePost('/order-history', body);
    return data.data || data;
  }

  /**
   * Cancel all open orders we track (by our bot IDs).
   */
  async cancelAll(orderIds) {
    const results = [];
    for (const id of orderIds) {
      try {
        results.push(await this.cancelOrder(id));
      } catch (e) {
        logger.warn(`Failed to cancel order ${id}: ${e.message}`);
      }
    }
    return results;
  }
}

module.exports = DexTradeClient;
