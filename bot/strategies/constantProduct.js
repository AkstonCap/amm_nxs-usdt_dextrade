'use strict';

/**
 * Constant Product Market Maker (x*y = k)
 *
 * Simulates a Uniswap v2-style AMM. Given a virtual liquidity L (USDT equivalent)
 * and a price range [P_low, P_high], it distributes buy and sell limit orders
 * along the AMM curve so that the order sizes decrease as price moves away from mid.
 *
 * Parameters:
 *   liquidity       (number) - Total virtual liquidity in USDT, e.g. 1000
 *   priceRangePct   (number) - One-sided price range as %, e.g. 10 = ±10% from mid
 *   numOrders       (number) - Orders per side, e.g. 5
 *   rebalanceThresholdPct (number) - Cancel & rebuild if mid moves > this %, e.g. 2
 *   minOrderSize    (number) - Min NXS per order (skip if smaller)
 */

const DEFAULT_PARAMS = {
  liquidity: 1000,
  priceRangePct: 10,
  numOrders: 5,
  rebalanceThresholdPct: 2,
  minOrderSize: 1,
};

/**
 * Given a virtual liquidity position x*y=k centered at midPrice,
 * compute the NXS and USDT amounts at a given price P.
 *   x(P) = sqrt(k / P)  (NXS reserves)
 *   y(P) = sqrt(k * P)  (USDT reserves)
 *   k    = L^2 / (4 * midPrice)  [from x(mid)*y(mid) = L^2/4midPrice * midPrice = L^2/4... no]
 *
 * Actually for a Uniswap v2 pool with total liquidity L in USDT at price P_mid:
 *   x_mid = L / (2 * P_mid)  (NXS)
 *   y_mid = L / 2            (USDT)
 *   k = x_mid * y_mid = L^2 / (4 * P_mid)
 */
function computePosition(midPrice, liquidity) {
  const xMid = liquidity / (2 * midPrice);
  const yMid = liquidity / 2;
  const k    = xMid * yMid;
  return { xMid, yMid, k };
}

/**
 * Compute order volume (in NXS) for a buy order between prices P1 > P2 (lower).
 * Moving from P2 to P1 (price rises), we give x2-x1 NXS and receive y1-y2 USDT.
 * nxsVolume = x(P2) - x(P1)
 */
function nxsVolumeForBuy(k, priceHigh, priceLow) {
  return Math.sqrt(k / priceLow) - Math.sqrt(k / priceHigh);
}

/**
 * Compute order volume (in NXS) for a sell order between prices P1 < P2 (higher).
 * nxsVolume = x(P1) - x(P2)
 */
function nxsVolumeForSell(k, priceLow, priceHigh) {
  return Math.sqrt(k / priceLow) - Math.sqrt(k / priceHigh);
}

/**
 * Compute the desired set of limit orders given the current mid price and params.
 * Returns an array of { side, price, volume } objects.
 */
function computeTargetOrders(midPrice, params) {
  const p = { ...DEFAULT_PARAMS, ...params };
  const { liquidity, priceRangePct, numOrders, minOrderSize } = p;

  const rangeFactor = priceRangePct / 100;
  const pLow  = midPrice * (1 - rangeFactor);
  const pHigh = midPrice * (1 + rangeFactor);

  const { k } = computePosition(midPrice, liquidity);

  // Price levels, equally spaced on a log scale for better coverage
  const buyLevels  = [];
  const sellLevels = [];

  for (let i = 1; i <= numOrders; i++) {
    const t = i / numOrders;
    // Log-space: price = mid * exp(-rangeFactor * t)
    buyLevels.push(midPrice * Math.exp(-rangeFactor * t));
    sellLevels.push(midPrice * Math.exp(+rangeFactor * t));
  }

  const orders = [];

  // Buy orders: price below mid, volume is the NXS acquired as price falls to each level
  for (let i = 0; i < buyLevels.length; i++) {
    const priceHigh = i === 0 ? midPrice : buyLevels[i - 1];
    const priceLow  = buyLevels[i];
    const volume = nxsVolumeForBuy(k, priceHigh, priceLow);
    if (volume >= minOrderSize) {
      orders.push({ side: 'buy', price: priceLow, volume });
    }
  }

  // Sell orders: price above mid, volume is NXS sold as price rises to each level
  for (let i = 0; i < sellLevels.length; i++) {
    const priceLow  = i === 0 ? midPrice : sellLevels[i - 1];
    const priceHigh = sellLevels[i];
    const volume = nxsVolumeForSell(k, priceLow, priceHigh);
    if (volume >= minOrderSize) {
      orders.push({ side: 'sell', price: priceHigh, volume });
    }
  }

  return orders;
}

/**
 * Returns true if the current mid price has moved beyond the rebalance threshold
 * relative to the price at which orders were last set.
 */
function needsRebalance(lastMid, currentMid, params) {
  const p = { ...DEFAULT_PARAMS, ...params };
  if (!lastMid) return true;
  const change = Math.abs(currentMid - lastMid) / lastMid * 100;
  return change >= p.rebalanceThresholdPct;
}

module.exports = {
  name: 'constantProduct',
  displayName: 'Constant Product (x·y=k)',
  description:
    'Simulates a Uniswap v2-style AMM. Places laddered buy/sell orders ' +
    'along the constant-product curve, providing more liquidity near the ' +
    'current price and less at the extremes.',
  defaultParams: DEFAULT_PARAMS,
  paramSchema: {
    liquidity:             { label: 'Virtual Liquidity (USDT)', type: 'number', min: 10,  step: 10 },
    priceRangePct:         { label: 'Price Range (%)',          type: 'number', min: 0.5, step: 0.5 },
    numOrders:             { label: 'Orders Per Side',          type: 'number', min: 1,   max: 20, step: 1 },
    rebalanceThresholdPct: { label: 'Rebalance Trigger (%)',    type: 'number', min: 0.1, step: 0.1 },
    minOrderSize:          { label: 'Min Order Size (NXS)',     type: 'number', min: 0.1, step: 0.1 },
  },
  computeTargetOrders,
  needsRebalance,
};
