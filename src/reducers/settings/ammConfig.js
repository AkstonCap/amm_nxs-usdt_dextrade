import * as TYPE from 'actions/types';

const initialState = {
  botUrl:         'http://127.0.0.1:17442',
  strategyName:   'constantProduct',
  strategyParams: {
    // constantProduct defaults
    liquidity:             1000,
    priceRangePct:         10,
    numOrders:             5,
    rebalanceThresholdPct: 2,
    minOrderSize:          1,
  },
};

export default (state = initialState, action) => {
  switch (action.type) {
    case TYPE.SET_BOT_URL:
      return { ...state, botUrl: action.payload };

    case TYPE.SET_STRATEGY:
      return {
        ...state,
        strategyName:   action.payload.name,
        strategyParams: { ...action.payload.defaultParams },
      };

    case TYPE.SET_STRATEGY_PARAM:
      return {
        ...state,
        strategyParams: {
          ...state.strategyParams,
          [action.payload.key]: action.payload.value,
        },
      };

    case TYPE.RESET_STRATEGY_PARAMS:
      return { ...state, strategyParams: { ...action.payload } };

    default:
      return state;
  }
};
