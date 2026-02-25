import styled from '@emotion/styled';
import { FieldSet } from 'nexus-module';

const CurrencyCard = styled.div({
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 8,
  padding: '14px 18px',
  marginBottom: 12,
});

const CurrencyHeader = styled.div({
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  marginBottom: 12,
});

const CurrencyName = styled.span({
  fontSize: 16,
  fontWeight: 700,
  color: '#e2e8f0',
});

const TotalValue = styled.span({
  fontSize: 13,
  color: '#94a3b8',
  marginLeft: 'auto',
});

const Row = styled.div({
  display: 'flex',
  justifyContent: 'space-between',
  padding: '6px 0',
  borderBottom: '1px solid rgba(255,255,255,0.04)',
  '&:last-child': { borderBottom: 'none' },
});

const RowLabel = styled.span({
  fontSize: 12,
  color: '#94a3b8',
});

const RowValue = styled.span({
  fontSize: 12,
  fontWeight: 600,
  fontFamily: 'monospace',
});

const AvailableValue = styled(RowValue)({
  color: '#4ade80',
});

const LockedValue = styled(RowValue)({
  color: '#fbbf24',
});

const TotalRowValue = styled(RowValue)({
  color: '#e2e8f0',
});

const Offline = styled.div({
  textAlign: 'center',
  color: '#666',
  padding: '20px 0',
  fontSize: 12,
});

function fmt(n, decimals = 4) {
  return n == null ? '—' : Number(n).toFixed(decimals);
}

function BalanceCard({ currency, data }) {
  const available = data?.available;
  const total = data?.total;
  const locked =
    available != null && total != null ? total - available : null;

  return (
    <CurrencyCard>
      <CurrencyHeader>
        <CurrencyName>{currency}</CurrencyName>
        <TotalValue>Total: {fmt(total)}</TotalValue>
      </CurrencyHeader>
      <Row>
        <RowLabel>Available (free)</RowLabel>
        <AvailableValue>{fmt(available)}</AvailableValue>
      </Row>
      <Row>
        <RowLabel>Locked in orders</RowLabel>
        <LockedValue>{locked != null ? fmt(locked) : '—'}</LockedValue>
      </Row>
      <Row>
        <RowLabel>Total</RowLabel>
        <TotalRowValue>{fmt(total)}</TotalRowValue>
      </Row>
    </CurrencyCard>
  );
}

export default function BalancesPanel({ balances }) {
  const hasData = balances?.NXS?.total != null || balances?.USDT?.total != null;

  return (
    <FieldSet legend="Dex-Trade Balances">
      {!hasData ? (
        <Offline>Balance data unavailable — is the bot server running?</Offline>
      ) : (
        <>
          <BalanceCard currency="NXS" data={balances.NXS} />
          <BalanceCard currency="USDT" data={balances.USDT} />
        </>
      )}
    </FieldSet>
  );
}
