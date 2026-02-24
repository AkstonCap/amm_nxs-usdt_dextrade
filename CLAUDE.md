# CLAUDE.md — Agent instructions for NXS/USDT AMM

## Project overview

This repo contains an AMM (Automated Market Maker) trading bot and dashboard for the NXS/USDT pair on dex-trade.com. Two independent packages:

- **Frontend** (`src/`, `package.json`) — React/Redux UI that runs inside the Nexus wallet as a module
- **Bot** (`bot/`, `bot/package.json`) — Node.js Express server + trading loop

## Build and run

```bash
# Frontend
npm install
npm run build              # production → dist/js/app.js
npm run dev                # dev server on :24011

# Bot
cd bot && npm install
cp .env.example .env       # fill in DEXTRADE_LOGIN_TOKEN and DEXTRADE_SECRET
node index.js              # starts on :17442
```

There are **no tests** in this project. Do not try to run a test suite.

## Architecture rules

- The frontend communicates with the bot **only** via HTTP polling (every 4 s). Do not introduce WebSockets.
- All bot state is in-memory (`bot/state.js`). Do not add a database.
- The bot tick loop runs every 15 seconds. A `tickInProgress` guard prevents overlapping ticks — respect this pattern.
- Strategies are self-contained modules in `bot/strategies/`. Each exports `{ name, displayName, description, defaultParams, paramSchema, computeTargetOrders, needsRebalance }`. To add a strategy, create a new file and register it in `bot/strategies/index.js`.
- The dex-trade client (`bot/dextrade.js`) is rate-limited (10 req/s public, 5 req/s private). Do not bypass the rate limiter.

## Frontend conventions

- Styling: Emotion `styled()` — no CSS files
- State: Redux with `redux-thunk`; persisted settings go in `reducers/settings/`, session-only state in `reducers/ui/`
- UI components: `nexus-module` provides `Panel`, `Button`, `TextField`, `FieldSet`, `showErrorDialog`, `showSuccessDialog`, `ModuleWrapper`
- No TypeScript compilation (tsconfig exists for editor type-checking only, `allowJs: true`)
- Babel handles JSX + optional chaining

## Bot conventions

- CommonJS (`require`/`module.exports`) — no ES modules
- `'use strict'` at top of every file
- Logger (`bot/logger.js`) — in-memory ring buffer, use `logger.info/warn/error/debug`
- HMAC-SHA256 auth for dex-trade private endpoints
- Graceful shutdown on SIGINT/SIGTERM cancels open orders

## Bot state machine

```
STOPPED  ──start──►  RUNNING  ──tick error──►  ERROR
   ▲                    │                        │
   └────stop/signal─────┘────────stop/signal─────┘
```

- `stopped` → `running`: via `POST /api/start`
- `running` → `error`: when a tick throws
- `error` → `running`: when the next tick succeeds
- `running`/`error` → `stopped`: via `POST /api/stop` or SIGINT/SIGTERM

## File ownership

| Area | Key files |
|------|-----------|
| Entry points | `src/index.js`, `bot/index.js` |
| Redux store | `src/configureStore.js`, `src/reducers/**` |
| Dashboard UI | `src/App/Main.js`, `src/App/components/*` |
| Bot core | `bot/index.js` (tick loop, rebalance), `bot/state.js`, `bot/server.js` |
| Exchange API | `bot/dextrade.js` |
| Strategies | `bot/strategies/{constantProduct,grid,spreadMaker}.js` |
| Build config | `webpack.config.babel.js`, `babel.config.js` |

## Common pitfalls

- `fetch()` in the browser does not support a `timeout` option — use `AbortController` with `signal`.
- Operator precedence: when computing realized PnL, parenthesize clearly. The formula is `sellRevenue - (buyCost * sellVolume / buyVolume)`.
- `setInterval` + async: the tick guard (`tickInProgress`) is critical. Never remove it.
- `managedOrders` is pruned to 200 closed orders. If you change reconciliation logic, keep the pruning call in `reconcileOrders`.
- Balance validation happens per-order in `rebalance()`. The available balance is decremented locally after each successful placement.
