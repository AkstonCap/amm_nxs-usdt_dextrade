import * as TYPE from './types';

// ─── Persisted settings ───────────────────────────────────────────────────────

export const setBotUrl = (url) => ({ type: TYPE.SET_BOT_URL, payload: url });

export const setStrategy = (name, defaultParams) => ({
  type: TYPE.SET_STRATEGY,
  payload: { name, defaultParams },
});

export const setStrategyParam = (key, value) => ({
  type: TYPE.SET_STRATEGY_PARAM,
  payload: { key, value },
});

export const resetStrategyParams = (defaultParams) => ({
  type: TYPE.RESET_STRATEGY_PARAMS,
  payload: defaultParams,
});

// ─── Session UI state ─────────────────────────────────────────────────────────

export const setBotStatus   = (status)  => ({ type: TYPE.SET_BOT_STATUS,    payload: status });
export const setMarketData  = (data)    => ({ type: TYPE.SET_MARKET_DATA,   payload: data });
export const setOrders      = (orders)  => ({ type: TYPE.SET_ORDERS,        payload: orders });
export const setBalances    = (bals)    => ({ type: TYPE.SET_BALANCES,      payload: bals });
export const setPnl         = (pnl)    => ({ type: TYPE.SET_PNL,           payload: pnl });
export const setStrategies  = (list)   => ({ type: TYPE.SET_STRATEGIES,    payload: list });
export const setLogs        = (logs)   => ({ type: TYPE.SET_LOGS,          payload: logs });
export const setPollingError = (err)   => ({ type: TYPE.SET_POLLING_ERROR, payload: err });
export const setActiveTab   = (tab)    => ({ type: TYPE.SET_ACTIVE_TAB,    payload: tab });
