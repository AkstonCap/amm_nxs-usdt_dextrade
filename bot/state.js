'use strict';

/**
 * In-memory bot state shared between the AMM loop and the HTTP server.
 */
const state = {
  // Bot lifecycle
  status: 'stopped', // 'stopped' | 'running' | 'paused' | 'error'
  errorMessage: null,
  startedAt: null,
  stoppedAt: null,
  tickCount: 0,
  lastTickAt: null,

  // Active strategy
  strategyName: 'constantProduct',
  strategyParams: {},
  lastMidPrice: null, // mid price at last rebalance

  // Current market snapshot (updated every tick)
  market: {
    bid:       null,
    ask:       null,
    mid:       null,
    last:      null,
    volume24h: null,
    updatedAt: null,
  },

  // Orders placed and managed by the bot (by dex-trade order ID)
  // { [id]: { id, side, price, volume, status, placedAt } }
  managedOrders: {},

  // PnL tracking
  pnl: {
    totalBuyVolume:  0, // NXS bought
    totalSellVolume: 0, // NXS sold
    totalBuyCost:    0, // USDT spent
    totalSellRevenue:0, // USDT received
    realizedPnlUsdt: 0,
    feesPaid:        0,
  },

  // Account balances (from last fetch)
  balances: {
    NXS:  { available: null, total: null },
    USDT: { available: null, total: null },
  },
};

function getSnapshot() {
  // Deep-copy nested objects to prevent callers from mutating live state
  const orders = {};
  for (const [id, o] of Object.entries(state.managedOrders)) {
    orders[id] = { ...o };
  }

  return {
    status:         state.status,
    errorMessage:   state.errorMessage,
    startedAt:      state.startedAt,
    stoppedAt:      state.stoppedAt,
    tickCount:      state.tickCount,
    lastTickAt:     state.lastTickAt,
    strategyName:   state.strategyName,
    strategyParams: { ...state.strategyParams },
    lastMidPrice:   state.lastMidPrice,
    market:         { ...state.market },
    managedOrders:  orders,
    pnl:            { ...state.pnl },
    balances: {
      NXS:  { ...state.balances.NXS },
      USDT: { ...state.balances.USDT },
    },
  };
}

module.exports = { state, getSnapshot };
