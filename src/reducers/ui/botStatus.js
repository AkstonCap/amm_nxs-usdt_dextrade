import * as TYPE from 'actions/types';

const initialState = {
  status:        'stopped', // 'stopped' | 'running' | 'paused' | 'error'
  errorMessage:  null,
  startedAt:     null,
  stoppedAt:     null,
  tickCount:     0,
  lastTickAt:    null,
  lastMidPrice:  null,
  strategyName:  null,
  strategyParams: {},
  market: {
    bid:       null,
    ask:       null,
    mid:       null,
    last:      null,
    volume24h: null,
    updatedAt: null,
  },
  orders:   {},
  balances: { NXS: { available: null, total: null }, USDT: { available: null, total: null } },
  pnl:      { realizedPnlUsdt: 0, totalBuyVolume: 0, totalSellVolume: 0, totalBuyCost: 0, totalSellRevenue: 0 },
  strategies:   [],
  logs:         [],
  pollingError: null,
  activeTab:    'strategy', // 'strategy' | 'orders' | 'log' | 'settings'
};

export default (state = initialState, action) => {
  switch (action.type) {
    case TYPE.SET_BOT_STATUS: {
      const s = action.payload;
      return {
        ...state,
        status:         s.status,
        errorMessage:   s.errorMessage,
        startedAt:      s.startedAt,
        stoppedAt:      s.stoppedAt,
        tickCount:      s.tickCount,
        lastTickAt:     s.lastTickAt,
        lastMidPrice:   s.lastMidPrice,
        strategyName:   s.strategyName   ?? state.strategyName,
        strategyParams: s.strategyParams ?? state.strategyParams,
        pollingError:   null,
      };
    }
    case TYPE.SET_MARKET_DATA:
      return { ...state, market: action.payload };

    case TYPE.SET_ORDERS:
      return { ...state, orders: action.payload };

    case TYPE.SET_BALANCES:
      return { ...state, balances: action.payload };

    case TYPE.SET_PNL:
      return { ...state, pnl: action.payload };

    case TYPE.SET_STRATEGIES:
      return { ...state, strategies: action.payload };

    case TYPE.SET_LOGS:
      return { ...state, logs: action.payload };

    case TYPE.SET_POLLING_ERROR:
      return { ...state, pollingError: action.payload };

    case TYPE.SET_ACTIVE_TAB:
      return { ...state, activeTab: action.payload };

    default:
      return state;
  }
};
