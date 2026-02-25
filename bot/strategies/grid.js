'use strict';

/**
 * Grid Trading Strategy
 *
 * Places a fixed number of buy and sell limit orders at uniform price intervals
 * (grid) above and below the current price. Each order has the same NXS volume.
 * When an order fills, a new order is placed on the opposite side at the same
 * grid level (handled by the bot loop via re-evaluation).
 *
 * Parameters:
 *   gridLow        (number) - Lower bound of the grid (USDT price), 0 = auto (mid - range%)
 *   gridHigh       (number) - Upper bound of the grid (USDT price), 0 = auto (mid + range%)
 *   gridRangePct   (number) - Auto range one-sided % (used when gridLow/High = 0)
 *   numGrids       (number) - Total number of grid levels (split evenly buy/sell)
 *   orderSize      (number) - NXS volume per grid order
 *   rebalanceThresholdPct (number) - Rebuild if mid moves > this %
 */

const DEFAULT_PARAMS = {
  gridLow: 0,
  gridHigh: 0,
  gridRangePct: 15,
  numGrids: 10,
  orderSize: 50,
  rebalanceThresholdPct: 5,
};

function computeTargetOrders(midPrice, params) {
  const p = { ...DEFAULT_PARAMS, ...params };
  const {
    gridLow: rawLow,
    gridHigh: rawHigh,
    gridRangePct,
    numGrids,
    orderSize,
  } = p;

  const rangeFactor = gridRangePct / 100;
  const pLow  = rawLow  > 0 ? rawLow  : midPrice * (1 - rangeFactor);
  const pHigh = rawHigh > 0 ? rawHigh : midPrice * (1 + rangeFactor);

  if (pLow >= pHigh) return [];

  // Distribute levels evenly between pLow and pHigh
  const levels = [];
  for (let i = 0; i <= numGrids; i++) {
    levels.push(pLow + (pHigh - pLow) * (i / numGrids));
  }

  const orders = [];
  for (const level of levels) {
    if (level < midPrice) {
      // Below mid → buy order
      orders.push({ side: 'buy',  price: level, volume: orderSize });
    } else if (level > midPrice) {
      // Above mid → sell order
      orders.push({ side: 'sell', price: level, volume: orderSize });
    }
    // Skip level exactly at mid (price ambiguous)
  }

  return orders;
}

function needsRebalance(lastMid, currentMid, params) {
  const p = { ...DEFAULT_PARAMS, ...params };
  if (!lastMid) return true;
  const change = Math.abs(currentMid - lastMid) / lastMid * 100;
  return change >= p.rebalanceThresholdPct;
}

module.exports = {
  name: 'grid',
  displayName: 'Grid Trading',
  description:
    'Places evenly-spaced buy/sell orders across a price range. ' +
    'Simple and effective in sideways markets. Each grid level has the same order size.',
  defaultParams: DEFAULT_PARAMS,
  paramSchema: {
    gridLow:               { label: 'Grid Low Price (USDT, 0=auto)',  type: 'number', min: 0, step: 0.0001, description: 'Lower bound of the grid. Use 0 to auto-calculate from current mid price and Auto Range (%).' },
    gridHigh:              { label: 'Grid High Price (USDT, 0=auto)', type: 'number', min: 0, step: 0.0001, description: 'Upper bound of the grid. Use 0 to auto-calculate from current mid price and Auto Range (%).' },
    gridRangePct:          { label: 'Auto Range (%)',                 type: 'number', min: 1, step: 1, description: 'When gridLow/gridHigh are 0, this sets the one-sided auto range around mid price (for example 15 means roughly ±15%).' },
    numGrids:              { label: 'Number of Grid Levels',          type: 'number', min: 2, max: 40, step: 1, description: 'Total number of evenly spaced grid levels between low and high bounds. More levels create denser buy/sell coverage.' },
    orderSize:             { label: 'Order Size (NXS)',               type: 'number', min: 1, step: 1, description: 'NXS volume placed on each grid order. All levels use this same size.' },
    rebalanceThresholdPct: { label: 'Rebalance Trigger (%)',          type: 'number', min: 1, step: 1, description: 'Rebuilds the grid when mid price drifts beyond this percentage from the last anchoring price.' },
  },
  computeTargetOrders,
  needsRebalance,
};
