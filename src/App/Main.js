import { useEffect, useCallback, useRef } from 'react';
import styled from '@emotion/styled';
import { Panel, Button, showErrorDialog } from 'nexus-module';
import { useSelector, useDispatch } from 'react-redux';

import StatusBar     from './components/StatusBar';
import StrategyPanel from './components/StrategyPanel';
import OrdersPanel   from './components/OrdersPanel';
import LogPanel      from './components/LogPanel';
import SettingsPanel from './components/SettingsPanel';
import BalancesPanel from './components/BalancesPanel';

import {
  setBotStatus,
  setMarketData,
  setOrders,
  setBalances,
  setPnl,
  setStrategies,
  setLogs,
  setPollingError,
  setActiveTab,
} from 'actions/actionCreators';

const POLL_INTERVAL = 4000; // ms

// ─── Styled layout ───────────────────────────────────────────────────────────

const TabBar = styled.div({
  display: 'flex',
  gap: 2,
  marginBottom: 12,
  borderBottom: '1px solid rgba(255,255,255,0.1)',
});

const Tab = styled.button(({ active }) => ({
  background: 'none',
  border: 'none',
  borderBottom: active ? '2px solid #64b5f6' : '2px solid transparent',
  color: active ? '#64b5f6' : '#888',
  cursor: 'pointer',
  padding: '6px 16px',
  fontSize: 13,
  fontWeight: active ? 600 : 400,
  transition: 'color 0.15s, border-color 0.15s',
  '&:hover': { color: '#ddd' },
}));

const OfflineBanner = styled.div({
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  background: 'rgba(244,67,54,0.12)',
  border: '1px solid rgba(244,67,54,0.3)',
  borderRadius: 6,
  padding: '10px 14px',
  marginBottom: 12,
  fontSize: 12,
  color: '#ef9a9a',
});

// ─── API helpers ──────────────────────────────────────────────────────────────

async function botFetch(botUrl, path, options = {}) {
  const res = await fetch(`${botUrl}${path}`, {
    headers: { 'content-type': 'application/json' },
    ...options,
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Bot API error');
  return json.data;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Main() {
  const dispatch = useDispatch();
  const botUrl      = useSelector((s) => s.settings.ammConfig.botUrl);
  const botStatus   = useSelector((s) => s.ui.botStatus);
  const activeTab   = useSelector((s) => s.ui.botStatus.activeTab);
  const strategies  = useSelector((s) => s.ui.botStatus.strategies);
  const orders      = useSelector((s) => s.ui.botStatus.orders);
  const balances    = useSelector((s) => s.ui.botStatus.balances);
  const pnl         = useSelector((s) => s.ui.botStatus.pnl);
  const market      = useSelector((s) => s.ui.botStatus.market);
  const logs        = useSelector((s) => s.ui.botStatus.logs);
  const pollingError = useSelector((s) => s.ui.botStatus.pollingError);

  const pollerRef = useRef(null);

  // ── Fetch full status from bot server ────────────────────────────────────
  const pollStatus = useCallback(async () => {
    try {
      const data = await botFetch(botUrl, '/api/status');
      dispatch(setBotStatus(data));
      dispatch(setMarketData(data.market || {}));
      dispatch(setOrders(data.managedOrders || {}));
      dispatch(setBalances(data.balances || {}));
      dispatch(setPnl(data.pnl || {}));
      dispatch(setPollingError(null));
    } catch (e) {
      dispatch(setPollingError(e.message));
    }
  }, [botUrl, dispatch]);

  const pollLogs = useCallback(async () => {
    try {
      const data = await botFetch(botUrl, '/api/logs?limit=150');
      dispatch(setLogs(Array.isArray(data) ? data : []));
    } catch (_) {}
  }, [botUrl, dispatch]);

  const fetchStrategies = useCallback(async () => {
    try {
      const data = await botFetch(botUrl, '/api/strategies');
      dispatch(setStrategies(Array.isArray(data) ? data : []));
    } catch (_) {}
  }, [botUrl, dispatch]);

  // ── Start polling when component mounts / botUrl changes ─────────────────
  useEffect(() => {
    fetchStrategies();
    pollStatus();
    pollLogs();

    pollerRef.current = setInterval(() => {
      pollStatus();
      pollLogs();
      fetchStrategies();
    }, POLL_INTERVAL);

    return () => clearInterval(pollerRef.current);
  }, [botUrl, pollStatus, pollLogs, fetchStrategies]);

  // ── Bot command helpers ───────────────────────────────────────────────────
  async function handleStart(strategyName, strategyParams) {
    try {
      await botFetch(botUrl, '/api/start', {
        method: 'POST',
        body: JSON.stringify({ strategyName, strategyParams }),
      });
      await pollStatus();
    } catch (e) {
      showErrorDialog({ message: 'Failed to start bot', note: e.message });
    }
  }

  async function handleStop() {
    try {
      await botFetch(botUrl, '/api/stop', {
        method: 'POST',
        body: JSON.stringify({ cancelOrders: true }),
      });
      await pollStatus();
    } catch (e) {
      showErrorDialog({ message: 'Failed to stop bot', note: e.message });
    }
  }

  async function handleForceRebalance() {
    try {
      await botFetch(botUrl, '/api/rebalance', { method: 'POST' });
    } catch (e) {
      showErrorDialog({ message: 'Rebalance failed', note: e.message });
    }
  }

  async function handleTestConnection(url) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(`${url}/api/health`, { signal: controller.signal });
      const json = await res.json();
      return json;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <Panel
      title="NXS/USDT — AMM Dashboard"
      icon={{ url: 'distordia-logo.svg', id: 'icon' }}
    >
      {/* Offline warning */}
      {pollingError && (
        <OfflineBanner>
          <span>⚠</span>
          <div>
            <strong>Bot server offline</strong> — cannot reach{' '}
            <code style={{ fontSize: 11 }}>{botUrl}</code>.{' '}
            Start the bot: <code style={{ fontSize: 11 }}>cd bot && node index.js</code>
          </div>
        </OfflineBanner>
      )}

      {/* Status bar */}
      <StatusBar botStatus={botStatus} market={market} pnl={pnl} />

      {/* Tab navigation */}
      <TabBar>
        {['strategy', 'orders', 'balances', 'log', 'settings'].map((tab) => (
          <Tab
            key={tab}
            active={activeTab === tab ? 1 : 0}
            onClick={() => dispatch(setActiveTab(tab))}
          >
            {{ strategy: 'Strategy', orders: 'Orders', balances: 'Balances', log: 'Log', settings: 'Settings' }[tab]}
            {tab === 'orders' && Object.values(orders).filter((o) => o.status === 'open').length > 0 && (
              <span style={{ marginLeft: 6, fontSize: 10, background: 'rgba(100,181,246,0.2)', padding: '1px 5px', borderRadius: 10 }}>
                {Object.values(orders).filter((o) => o.status === 'open').length}
              </span>
            )}
          </Tab>
        ))}
      </TabBar>

      {/* Tab content */}
      {activeTab === 'strategy' && (
        <StrategyPanel
          strategies={strategies}
          botStatus={botStatus}
          market={market}
          balances={balances}
          onStart={handleStart}
          onStop={handleStop}
          onForceRebalance={handleForceRebalance}
        />
      )}

      {activeTab === 'orders' && (
        <OrdersPanel orders={orders} balances={balances} />
      )}

      {activeTab === 'balances' && (
        <BalancesPanel balances={balances} />
      )}

      {activeTab === 'log' && (
        <LogPanel logs={logs} />
      )}

      {activeTab === 'settings' && (
        <SettingsPanel onTestConnection={handleTestConnection} />
      )}
    </Panel>
  );
}
