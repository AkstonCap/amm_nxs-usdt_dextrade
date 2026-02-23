'use strict';

/**
 * Spread Market Maker Strategy
 *
 * Maintains a single bid and a single ask at a configurable spread around the
 * current mid price. Cancels and re-quotes whenever the market moves more than
 * `refreshThresholdPct` from the last quoted mid.
 *
 * Parameters:
 *   spreadPct           (number) - Total spread as %, e.g. 2 = 1% each side
 *   orderSize           (number) - NXS volume per order
 *   refreshThresholdPct (number) - Re-quote if mid moves > this %, e.g. 0.5
 *   maxOrdersPerSide    (number) - Place multiple tiered quotes (1-3)
 *   tierSpreadMultiplier (number) - Additional spread per tier, e.g. 1.5x
 */

const DEFAULT_PARAMS = {
  spreadPct: 2,
  orderSize: 200,
  refreshThresholdPct: 0.5,
  maxOrdersPerSide: 1,
  tierSpreadMultiplier: 1.5,
};

function computeTargetOrders(midPrice, params) {
  const p = { ...DEFAULT_PARAMS, ...params };
  const {
    spreadPct,
    orderSize,
    maxOrdersPerSide,
    tierSpreadMultiplier,
  } = p;

  const orders = [];
  const sides = maxOrdersPerSide > 3 ? 3 : maxOrdersPerSide;

  for (let tier = 1; tier <= sides; tier++) {
    // Each tier widens the spread by the multiplier
    const tierSpread = spreadPct * Math.pow(tierSpreadMultiplier, tier - 1);
    const half = tierSpread / 100 / 2;

    orders.push({
      side:   'buy',
      price:  midPrice * (1 - half),
      volume: orderSize,
    });
    orders.push({
      side:   'sell',
      price:  midPrice * (1 + half),
      volume: orderSize,
    });
  }

  return orders;
}

function needsRebalance(lastMid, currentMid, params) {
  const p = { ...DEFAULT_PARAMS, ...params };
  if (!lastMid) return true;
  const change = Math.abs(currentMid - lastMid) / lastMid * 100;
  return change >= p.refreshThresholdPct;
}

module.exports = {
  name: 'spreadMaker',
  displayName: 'Spread Market Maker',
  description:
    'Quotes a bid and ask at a fixed spread around the current mid price. ' +
    'Refreshes quotes whenever the price moves beyond a threshold. ' +
    'Best for trending markets where you want tight spread control.',
  defaultParams: DEFAULT_PARAMS,
  paramSchema: {
    spreadPct:            { label: 'Spread (%)',               type: 'number', min: 0.1, step: 0.1 },
    orderSize:            { label: 'Order Size (NXS)',         type: 'number', min: 1,   step: 1 },
    refreshThresholdPct:  { label: 'Refresh Trigger (%)',      type: 'number', min: 0.1, step: 0.1 },
    maxOrdersPerSide:     { label: 'Tiers Per Side (1-3)',     type: 'number', min: 1,   max: 3, step: 1 },
    tierSpreadMultiplier: { label: 'Tier Spread Multiplier',   type: 'number', min: 1.1, step: 0.1 },
  },
  computeTargetOrders,
  needsRebalance,
};
