import { createStore, compose, applyMiddleware } from 'redux';

import createReducer from './reducers';
import { storageMiddleware, stateMiddleware } from 'nexus-module';

export default function configureStore() {
  // state.settings is persisted to disk (AMM config, bot URL, strategy config)
  // state.ui is session-only (bot status, market data, logs)
  const middlewares = [
    storageMiddleware(({ settings }) => ({ settings })),
    stateMiddleware(({ ui }) => ({ ui })),
  ];
  const enhancers = [applyMiddleware(...middlewares)];

  const composeEnhancers =
    process.env.NODE_ENV !== 'production' &&
    typeof window === 'object' &&
    window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__
      ? window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__({ shouldHotReload: false })
      : compose;

  const store = createStore(createReducer(), composeEnhancers(...enhancers));

  if (module.hot) {
    module.hot.accept('./reducers', () => {
      store.replaceReducer(createReducer());
    });
  }

  return store;
}
