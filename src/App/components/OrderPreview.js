import { useMemo } from 'react';
import styled from '@emotion/styled';

const MIN_ORDER_VALUE_USDT = 5;

function roundOrderPrice(price) {
  return Number(price.toFixed(4));
}

// ─── Strategy simulators (mirror bot logic) ──────────────────────────────────

function simulateConstantProduct(midPrice, params) {
  const liquidity = params.liquidity || 1000;
  const rangePct = params.priceRangePct || 10;
  const numOrders = params.numOrders || 5;
  const minSize = params.minOrderSize || 1;
  const rangeFactor = rangePct / 100;

  const xMid = liquidity / (2 * midPrice);
  const yMid = liquidity / 2;
  const k = xMid * yMid;

  const orders = [];

  const buyLevels = [];
  const sellLevels = [];
  for (let i = 1; i <= numOrders; i++) {
    const t = i / numOrders;
    buyLevels.push(midPrice * Math.exp(-rangeFactor * t));
    sellLevels.push(midPrice * Math.exp(+rangeFactor * t));
  }

  for (let i = 0; i < buyLevels.length; i++) {
    const priceHigh = i === 0 ? midPrice : buyLevels[i - 1];
    const priceLow = buyLevels[i];
    const volume = Math.sqrt(k / priceLow) - Math.sqrt(k / priceHigh);
    orders.push({ side: 'buy', price: roundOrderPrice(priceLow), volume, skippedMinSize: volume < minSize });
  }

  for (let i = 0; i < sellLevels.length; i++) {
    const priceLow = i === 0 ? midPrice : sellLevels[i - 1];
    const priceHigh = sellLevels[i];
    const volume = Math.sqrt(k / priceLow) - Math.sqrt(k / priceHigh);
    orders.push({ side: 'sell', price: roundOrderPrice(priceHigh), volume, skippedMinSize: volume < minSize });
  }

  return orders;
}

function simulateGrid(midPrice, params) {
  const rangePct = params.gridRangePct || 15;
  const numGrids = params.numGrids || 10;
  const orderSize = params.orderSize || 50;
  const rawLow = params.gridLow || 0;
  const rawHigh = params.gridHigh || 0;

  const rangeFactor = rangePct / 100;
  const pLow = rawLow > 0 ? rawLow : midPrice * (1 - rangeFactor);
  const pHigh = rawHigh > 0 ? rawHigh : midPrice * (1 + rangeFactor);

  if (pLow >= pHigh) return [];

  const levels = [];
  for (let i = 0; i <= numGrids; i++) {
    levels.push(pLow + (pHigh - pLow) * (i / numGrids));
  }

  const orders = [];
  for (const level of levels) {
    if (level < midPrice) {
      orders.push({ side: 'buy', price: roundOrderPrice(level), volume: orderSize, skippedMinSize: false });
    } else if (level > midPrice) {
      orders.push({ side: 'sell', price: roundOrderPrice(level), volume: orderSize, skippedMinSize: false });
    }
  }
  return orders;
}

function simulateSpreadMaker(midPrice, params) {
  const spreadPct = params.spreadPct || 2;
  const orderSize = params.orderSize || 200;
  const maxTiers = Math.min(params.maxOrdersPerSide || 1, 3);
  const tierMult = params.tierSpreadMultiplier || 1.5;

  const orders = [];
  for (let tier = 1; tier <= maxTiers; tier++) {
    const tierSpread = spreadPct * Math.pow(tierMult, tier - 1);
    const half = tierSpread / 100 / 2;
    orders.push({ side: 'buy', price: roundOrderPrice(midPrice * (1 - half)), volume: orderSize, skippedMinSize: false });
    orders.push({ side: 'sell', price: roundOrderPrice(midPrice * (1 + half)), volume: orderSize, skippedMinSize: false });
  }
  return orders;
}

const simulators = {
  constantProduct: simulateConstantProduct,
  grid: simulateGrid,
  spreadMaker: simulateSpreadMaker,
};

// ─── Styled components ───────────────────────────────────────────────────────

const PreviewBox = styled.div({
  marginTop: 14,
  padding: '10px 12px',
  borderRadius: 6,
  border: '1px solid rgba(255,255,255,0.08)',
  background: 'rgba(0,0,0,0.18)',
  fontSize: 12,
});

const PreviewTitle = styled.div({
  fontSize: 12,
  fontWeight: 600,
  color: '#b0bec5',
  marginBottom: 8,
});

const SummaryRow = styled.div({
  display: 'flex',
  flexWrap: 'wrap',
  gap: '6px 18px',
  marginBottom: 8,
  fontSize: 11,
  color: '#aaa',
  '& span': { color: '#ddd', fontWeight: 600, fontFamily: 'monospace' },
});

const OrderTable = styled.table({
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 11,
  fontFamily: 'monospace',
  '& th': {
    textAlign: 'left',
    color: '#888',
    fontWeight: 500,
    padding: '3px 6px',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  '& td': {
    padding: '3px 6px',
    color: '#ccc',
  },
});

const Warning = styled.div({
  display: 'flex',
  alignItems: 'flex-start',
  gap: 6,
  padding: '6px 10px',
  marginTop: 8,
  borderRadius: 4,
  fontSize: 11,
  lineHeight: 1.5,
});

const WarningError = styled(Warning)({
  background: 'rgba(244,67,54,0.1)',
  border: '1px solid rgba(244,67,54,0.25)',
  color: '#ef9a9a',
});

const WarningCaution = styled(Warning)({
  background: 'rgba(255,152,0,0.1)',
  border: '1px solid rgba(255,152,0,0.25)',
  color: '#ffcc80',
});

// ─── Component ───────────────────────────────────────────────────────────────

export default function OrderPreview({ strategyName, strategyParams, market, balances }) {
  const midPrice = market?.mid || market?.last || null;

  const preview = useMemo(() => {
    if (!midPrice || midPrice <= 0) return null;
    const simulate = simulators[strategyName];
    if (!simulate) return null;

    const orders = simulate(midPrice, strategyParams);
    const buys = orders.filter((o) => o.side === 'buy');
    const sells = orders.filter((o) => o.side === 'sell');

    const activeOrders = orders.filter((o) => !o.skippedMinSize);
    const skippedOrders = orders.filter((o) => o.skippedMinSize);

    const belowMinValue = activeOrders.filter((o) => o.price * o.volume < MIN_ORDER_VALUE_USDT);

    const totalBuyCost = buys.filter((o) => !o.skippedMinSize)
      .reduce((s, o) => s + o.price * o.volume, 0);
    const totalSellVol = sells.filter((o) => !o.skippedMinSize)
      .reduce((s, o) => s + o.volume, 0);

    return {
      orders,
      buys,
      sells,
      activeOrders,
      skippedOrders,
      belowMinValue,
      totalBuyCost,
      totalSellVol,
    };
  }, [strategyName, strategyParams, midPrice]);

  if (!midPrice) {
    return (
      <PreviewBox>
        <PreviewTitle>Order Preview</PreviewTitle>
        <div style={{ color: '#888', fontSize: 11 }}>
          Waiting for market data to compute preview…
        </div>
      </PreviewBox>
    );
  }

  if (!preview) return null;

  const { orders, activeOrders, skippedOrders, belowMinValue, totalBuyCost, totalSellVol } = preview;
  const availNxs = balances?.NXS?.available ?? null;
  const availUsdt = balances?.USDT?.available ?? null;

  const hasNoOrders = activeOrders.length === 0;
  const allSkipped = orders.length > 0 && hasNoOrders;
  const insufficientUsdt = availUsdt != null && totalBuyCost > availUsdt;
  const insufficientNxs = availNxs != null && totalSellVol > availNxs;

  return (
    <PreviewBox>
      <PreviewTitle>Order Preview (at current mid {midPrice.toFixed(8)} USDT)</PreviewTitle>

      <SummaryRow>
        <div>Buy orders: <span>{activeOrders.filter((o) => o.side === 'buy').length}</span></div>
        <div>Sell orders: <span>{activeOrders.filter((o) => o.side === 'sell').length}</span></div>
        <div>USDT needed: <span>{totalBuyCost.toFixed(2)}</span></div>
        <div>NXS needed: <span>{totalSellVol.toFixed(2)}</span></div>
        {availUsdt != null && <div>USDT available: <span>{availUsdt.toFixed(2)}</span></div>}
        {availNxs != null && <div>NXS available: <span>{availNxs.toFixed(2)}</span></div>}
      </SummaryRow>

      {/* Order table */}
      {activeOrders.length > 0 && (
        <div style={{ maxHeight: 200, overflowY: 'auto' }}>
          <OrderTable>
            <thead>
              <tr>
                <th>Side</th>
                <th>Price (USDT)</th>
                <th>Volume (NXS)</th>
                <th>Value (USDT)</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {activeOrders.map((o, i) => {
                const value = o.price * o.volume;
                const belowMin = value < MIN_ORDER_VALUE_USDT;
                return (
                  <tr key={i} style={{ opacity: belowMin ? 0.6 : 1 }}>
                    <td style={{ color: o.side === 'buy' ? '#4caf50' : '#f44336', fontWeight: 600 }}>
                      {o.side.toUpperCase()}
                    </td>
                    <td>{o.price.toFixed(4)}</td>
                    <td>{o.volume.toFixed(4)}</td>
                    <td style={{ color: belowMin ? '#ff9800' : '#ccc' }}>
                      {value.toFixed(4)}
                      {belowMin && ' ⚠'}
                    </td>
                    <td style={{ fontSize: 10, color: belowMin ? '#ff9800' : '#666' }}>
                      {belowMin ? '< 5 USDT min' : 'OK'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </OrderTable>
        </div>
      )}

      {/* Warnings */}
      {allSkipped && (
        <WarningError>
          <span>✗</span>
          <div>
            <strong>No orders will be placed.</strong> All {orders.length} computed orders are below
            the minimum order size ({strategyParams.minOrderSize || '?'} NXS).
            Increase Virtual Liquidity or decrease Min Order Size.
          </div>
        </WarningError>
      )}

      {!allSkipped && skippedOrders.length > 0 && (
        <WarningCaution>
          <span>⚠</span>
          <div>
            {skippedOrders.length} order(s) filtered by Min Order Size ({strategyParams.minOrderSize} NXS).
          </div>
        </WarningCaution>
      )}

      {belowMinValue.length > 0 && !hasNoOrders && (
        <WarningError>
          <span>✗</span>
          <div>
            <strong>{belowMinValue.length} order(s) below dex-trade's 5 USDT minimum</strong> and will
            be rejected. Increase order volume or Virtual Liquidity so each order ≥ 5 USDT.
          </div>
        </WarningError>
      )}

      {insufficientUsdt && (
        <WarningCaution>
          <span>⚠</span>
          <div>
            Buy orders need <strong>{totalBuyCost.toFixed(2)} USDT</strong> but
            only <strong>{availUsdt.toFixed(2)} USDT</strong> available.
            Some buy orders will be skipped.
          </div>
        </WarningCaution>
      )}

      {insufficientNxs && (
        <WarningCaution>
          <span>⚠</span>
          <div>
            Sell orders need <strong>{totalSellVol.toFixed(2)} NXS</strong> but
            only <strong>{availNxs.toFixed(2)} NXS</strong> available.
            Some sell orders will be skipped.
          </div>
        </WarningCaution>
      )}
    </PreviewBox>
  );
}
