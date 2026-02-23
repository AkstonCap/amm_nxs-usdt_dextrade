import styled from '@emotion/styled';
import { FieldSet } from 'nexus-module';

const Table = styled.table({
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 12,
  fontFamily: 'monospace',
});

const Th = styled.th({
  textAlign: 'left',
  padding: '4px 8px',
  color: '#888',
  fontWeight: 600,
  borderBottom: '1px solid rgba(255,255,255,0.08)',
  fontSize: 11,
});

const Td = styled.td({
  padding: '5px 8px',
  borderBottom: '1px solid rgba(255,255,255,0.04)',
});

const SideBadge = styled.span(({ side }) => ({
  display: 'inline-block',
  padding: '1px 6px',
  borderRadius: 3,
  fontSize: 11,
  fontWeight: 700,
  background: side === 'buy' ? 'rgba(76,175,80,0.2)' : 'rgba(244,67,54,0.2)',
  color:      side === 'buy' ? '#4caf50'              : '#f44336',
}));

const StatusDot = styled.span(({ status }) => ({
  display: 'inline-block',
  width: 7,
  height: 7,
  borderRadius: '50%',
  marginRight: 5,
  background: status === 'open'      ? '#4caf50' :
              status === 'filled'    ? '#2196f3' :
              status === 'cancelled' ? '#888'    : '#ff9800',
}));

const Empty = styled.div({
  textAlign: 'center',
  color: '#666',
  padding: '20px 0',
  fontSize: 12,
});

const BalanceRow = styled.div({
  display: 'flex',
  gap: 20,
  marginBottom: 10,
  fontSize: 12,
  color: '#aaa',
  '& strong': { color: '#ddd' },
});

export default function OrdersPanel({ orders, balances }) {
  const orderList = Object.values(orders).sort(
    (a, b) => new Date(b.placedAt) - new Date(a.placedAt)
  );

  const fmt = (n, d = 8) => (n == null ? '—' : Number(n).toFixed(d));

  return (
    <FieldSet legend="Orders & Balances">
      <BalanceRow>
        <div>
          NXS — Available: <strong>{fmt(balances.NXS?.available, 4)}</strong>{' '}
          / Total: <strong>{fmt(balances.NXS?.total, 4)}</strong>
        </div>
        <div>
          USDT — Available: <strong>{fmt(balances.USDT?.available, 4)}</strong>{' '}
          / Total: <strong>{fmt(balances.USDT?.total, 4)}</strong>
        </div>
      </BalanceRow>

      {orderList.length === 0 ? (
        <Empty>No managed orders yet</Empty>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>ID</Th>
              <Th>Side</Th>
              <Th>Price (USDT)</Th>
              <Th>Volume (NXS)</Th>
              <Th>Status</Th>
              <Th>Placed</Th>
            </tr>
          </thead>
          <tbody>
            {orderList.map((o) => (
              <tr key={o.id}>
                <Td style={{ color: '#777', fontSize: 11 }}>#{o.id}</Td>
                <Td><SideBadge side={o.side}>{o.side.toUpperCase()}</SideBadge></Td>
                <Td>{fmt(o.price, 8)}</Td>
                <Td>{fmt(o.volume, 4)}</Td>
                <Td>
                  <StatusDot status={o.status} />
                  {o.status}
                </Td>
                <Td style={{ color: '#666', fontSize: 10 }}>
                  {o.placedAt ? o.placedAt.slice(11, 19) : '—'}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </FieldSet>
  );
}
