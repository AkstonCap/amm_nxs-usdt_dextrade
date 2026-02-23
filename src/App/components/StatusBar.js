import styled from '@emotion/styled';

const Bar = styled.div({
  display: 'flex',
  alignItems: 'center',
  gap: 24,
  padding: '10px 16px',
  borderRadius: 6,
  background: 'var(--color-background, rgba(0,0,0,0.25))',
  border: '1px solid rgba(255,255,255,0.08)',
  flexWrap: 'wrap',
  marginBottom: 12,
});

const Indicator = styled.div(({ running }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: 7,
  fontWeight: 700,
  fontSize: 13,
  color: running === 'running' ? '#4caf50' :
         running === 'error'   ? '#f44336' :
         running === 'paused'  ? '#ff9800' : '#888',
}));

const Dot = styled.div(({ status }) => ({
  width: 9,
  height: 9,
  borderRadius: '50%',
  background: status === 'running' ? '#4caf50' :
              status === 'error'   ? '#f44336' :
              status === 'paused'  ? '#ff9800' : '#666',
  boxShadow: status === 'running' ? '0 0 6px #4caf50' : 'none',
  animation: status === 'running' ? 'pulse 1.4s ease-in-out infinite' : 'none',
  '@keyframes pulse': {
    '0%, 100%': { opacity: 1 },
    '50%':      { opacity: 0.4 },
  },
}));

const Metric = styled.div({
  display: 'flex',
  flexDirection: 'column',
  fontSize: 11,
  color: '#aaa',
  '& span': { fontSize: 14, fontWeight: 600, color: '#ddd', fontFamily: 'monospace' },
});

const Divider = styled.div({
  width: 1,
  height: 32,
  background: 'rgba(255,255,255,0.1)',
});

export default function StatusBar({ botStatus, market, pnl }) {
  const { status, errorMessage, tickCount, strategyName } = botStatus;
  const statusLabel = {
    running: 'Running',
    stopped: 'Stopped',
    error:   'Error',
    paused:  'Paused',
  }[status] || status;

  const fmt = (n, dec = 6) =>
    n == null ? '—' : Number(n).toFixed(dec);

  const fmtPct = (n) =>
    n == null ? '—' : (n * 100).toFixed(2) + '%';

  const spread =
    market.bid && market.ask
      ? ((market.ask - market.bid) / market.ask)
      : null;

  const pnlColor = pnl.realizedPnlUsdt > 0 ? '#4caf50' : pnl.realizedPnlUsdt < 0 ? '#f44336' : '#aaa';

  return (
    <Bar>
      <Indicator running={status}>
        <Dot status={status} />
        {statusLabel}
        {status === 'error' && errorMessage && (
          <span style={{ fontSize: 11, fontWeight: 400, color: '#f44336', marginLeft: 4 }}>
            — {errorMessage}
          </span>
        )}
      </Indicator>

      <Divider />

      <Metric>Strategy<span>{strategyName || '—'}</span></Metric>
      <Metric>Last Price<span>{fmt(market.last, 8)}</span></Metric>
      <Metric>Bid<span style={{ color: '#4caf50' }}>{fmt(market.bid, 8)}</span></Metric>
      <Metric>Ask<span style={{ color: '#f44336' }}>{fmt(market.ask, 8)}</span></Metric>
      <Metric>Spread<span>{fmtPct(spread)}</span></Metric>
      <Metric>24h Vol<span>{market.volume24h != null ? Number(market.volume24h).toLocaleString() : '—'} NXS</span></Metric>

      <Divider />

      <Metric>Realized PnL<span style={{ color: pnlColor }}>
        {pnl.realizedPnlUsdt != null ? (pnl.realizedPnlUsdt >= 0 ? '+' : '') + pnl.realizedPnlUsdt.toFixed(4) : '—'} USDT
      </span></Metric>
      <Metric>Ticks<span>{tickCount ?? '—'}</span></Metric>
    </Bar>
  );
}
