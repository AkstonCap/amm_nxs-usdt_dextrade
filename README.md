# NXS/USDT AMM — dex-trade.com

Automated Market Maker dashboard and trading bot for the **NXS/USDT** pair on [dex-trade.com](https://dex-trade.com). Consists of two parts:

1. **Frontend** — React/Redux dashboard that runs as a [Nexus Wallet](https://nexus.io) module
2. **Bot** — Node.js process that connects to the dex-trade API and places/manages limit orders

```
┌─────────────────────┐  HTTP (poll 4 s)  ┌───────────────────────┐  HTTPS  ┌──────────────┐
│  Nexus Wallet UI    │ ◄──────────────── │  Bot (Express :17442) │ ──────► │ dex-trade.com│
│  React / Redux      │ ─────────────────►│  Trading loop (15 s)  │ ◄────── │ REST API     │
└─────────────────────┘  start/stop/rebal └───────────────────────┘         └──────────────┘
```

---

## Quick start

### 1. Start the bot

```bash
cd bot
cp .env.example .env          # then edit with your API keys
npm install
node index.js                 # listens on http://127.0.0.1:17442
```

Required environment variables (`bot/.env`):

| Variable | Description |
|----------|-------------|
| `DEXTRADE_LOGIN_TOKEN` | Login token from dex-trade.com API profile |
| `DEXTRADE_SECRET` | HMAC secret from dex-trade.com API profile |
| `BOT_PORT` | HTTP port (default `17442`) |
| `LOG_LEVEL` | `debug` / `info` / `warn` / `error` (default `info`) |

### 2. Build the frontend module

```bash
npm install
npm run build        # production build → dist/
npm run dev          # dev server on http://localhost:24011
```

Then install the module in the Nexus wallet (Settings > Modules > Install from file, point to `nxs_package.json`).

---

## Bot state machine

The bot has four states. Transitions are triggered by API calls and internal events.

```
                  POST /api/start
    ┌────────┐ ──────────────────► ┌─────────┐
    │ STOPPED│                     │ RUNNING │ ◄──── tick succeeds after error
    └────────┘ ◄────────────────── └─────────┘
                  POST /api/stop       │
                  SIGINT / SIGTERM     │ tick throws
                                       ▼
                                  ┌─────────┐
                                  │  ERROR  │
                                  └─────────┘
                                       │
                                       │ POST /api/stop
                                       │ SIGINT / SIGTERM
                                       ▼
                                  ┌────────┐
                                  │ STOPPED│
                                  └────────┘
```

**State descriptions:**

| State | Meaning |
|-------|---------|
| `stopped` | Bot is idle. No tick loop. No managed orders. |
| `running` | Tick loop active (every 15 s). Fetches market data, reconciles orders, rebalances when needed. |
| `error` | A tick failed. Loop continues; next successful tick returns to `running`. |

**Tick lifecycle** (every 15 seconds while `running`):

```
fetchMarket() → reconcileOrders() → fetchBalances() → needsRebalance?
                                                          │
                                         no ──────────────┤
                                                          │ yes
                                                          ▼
                                                    rebalance()
                                                    ├─ cancel open orders
                                                    ├─ refresh balances
                                                    ├─ validate per-order balance
                                                    └─ place new limit orders
```

**Rebalance trigger:** the active strategy's `needsRebalance(lastMid, currentMid, params)` returns `true` when the mid price has moved beyond the configured threshold since the last rebalance (or on the very first tick, or after a forced rebalance request).

---

## Trading strategies

### Constant Product (`constantProduct`)

Simulates a Uniswap v2-style x*y=k AMM. Places laddered buy/sell orders along the constant-product curve — more liquidity near the current price, less at the extremes.

| Parameter | Default | Description |
|-----------|---------|-------------|
| `liquidity` | 1000 | Virtual liquidity pool in USDT |
| `priceRangePct` | 10 | One-sided range as % from mid |
| `numOrders` | 5 | Orders per side |
| `rebalanceThresholdPct` | 2 | Rebuild when mid moves > this % |
| `minOrderSize` | 1 | Skip orders smaller than this (NXS) |

### Grid Trading (`grid`)

Places evenly-spaced buy/sell orders across a fixed price range. Each grid level has the same order size. Effective in sideways markets.

| Parameter | Default | Description |
|-----------|---------|-------------|
| `gridLow` | 0 (auto) | Lower price bound in USDT (0 = auto from mid) |
| `gridHigh` | 0 (auto) | Upper price bound in USDT (0 = auto from mid) |
| `gridRangePct` | 15 | Auto range one-sided % when bounds are 0 |
| `numGrids` | 10 | Total number of grid levels |
| `orderSize` | 50 | NXS per grid order |
| `rebalanceThresholdPct` | 5 | Rebuild when mid moves > this % |

### Spread Market Maker (`spreadMaker`)

Maintains bid/ask quotes at a configurable spread around mid. Refreshes when the price moves. Supports up to 3 tiered quote levels with widening spreads.

| Parameter | Default | Description |
|-----------|---------|-------------|
| `spreadPct` | 2 | Total spread as % (half each side) |
| `orderSize` | 200 | NXS per order |
| `refreshThresholdPct` | 0.5 | Re-quote when mid moves > this % |
| `maxOrdersPerSide` | 1 | Tier count per side (1-3) |
| `tierSpreadMultiplier` | 1.5 | Each tier widens spread by this factor |

---

## REST API (bot)

All endpoints return `{ ok: boolean, data?, error?, message? }`.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/status` | Full bot state snapshot (market, orders, balances, PnL) |
| GET | `/api/strategies` | List available strategies with param schemas |
| GET | `/api/logs?limit=N` | Recent log entries (default 100) |
| POST | `/api/start` | Start bot. Body: `{ strategyName, strategyParams }` |
| POST | `/api/stop` | Stop bot. Body: `{ cancelOrders: true }` |
| POST | `/api/config` | Update strategy params (triggers rebalance). Body: `{ strategyName, strategyParams }` |
| POST | `/api/rebalance` | Force immediate rebalance |
| GET | `/api/health` | Health check with uptime |

---

## Project layout

```
├── src/                          # Frontend (React/Redux)
│   ├── index.js                  # Entry point, Redux store setup
│   ├── configureStore.js         # Store configuration + middleware
│   ├── App/
│   │   ├── index.js              # Root component (ModuleWrapper)
│   │   ├── Main.js               # Dashboard container, polling, bot commands
│   │   └── components/
│   │       ├── StatusBar.js      # Real-time metrics bar
│   │       ├── StrategyPanel.js  # Strategy selection + param controls
│   │       ├── OrdersPanel.js    # Balances + managed orders table
│   │       ├── LogPanel.js       # Activity log viewer
│   │       └── SettingsPanel.js  # Bot URL configuration + connection test
│   ├── actions/
│   │   ├── types.js              # Redux action type constants
│   │   └── actionCreators.js     # Action creator functions
│   └── reducers/
│       ├── index.js              # Root reducer
│       ├── settings/             # Persisted to disk
│       │   ├── ammConfig.js      # Bot URL, strategy name, params
│       │   └── showingConnections.js
│       └── ui/
│           ├── index.js
│           └── botStatus.js      # Session-only state (status, market, orders...)
├── bot/                          # Backend (Node.js)
│   ├── index.js                  # Server bootstrap + trading loop
│   ├── server.js                 # Express HTTP API
│   ├── state.js                  # In-memory shared state
│   ├── logger.js                 # In-memory log buffer (500 entries)
│   ├── dextrade.js               # dex-trade.com API client (rate-limited, HMAC-signed)
│   ├── strategies/
│   │   ├── index.js              # Strategy registry
│   │   ├── constantProduct.js    # x*y=k AMM strategy
│   │   ├── grid.js               # Grid trading strategy
│   │   └── spreadMaker.js        # Spread market maker strategy
│   ├── .env.example              # Environment template
│   └── package.json
├── dist/                         # Built frontend assets
├── Nexus API docs/               # Nexus module SDK reference
├── nxs_package.json              # Nexus module manifest (production)
├── nxs_package.dev.json          # Nexus module manifest (dev)
├── package.json                  # Frontend dependencies + build scripts
├── webpack.config.babel.js       # Production webpack config
├── webpack-dev.config.babel.js   # Dev webpack config
├── babel.config.js               # Babel presets + plugins
└── tsconfig.json                 # TypeScript (type-check only, allowJs)
```

---

## Key design decisions

- **Polling over WebSockets**: the frontend polls the bot every 4 seconds via HTTP. This keeps the bot stateless with respect to clients and avoids WebSocket complexity in the Nexus module sandbox.
- **In-memory state**: all bot state lives in a shared JS object (`bot/state.js`). No database. State is lost on restart — this is intentional for a trading bot that reconciles from the exchange on each tick.
- **Rate limiting**: the dex-trade client enforces 10 req/s for public endpoints and 5 req/s for private endpoints to stay within API limits.
- **Tick guard**: only one tick can run at a time. If a tick takes longer than 15 s, the next one is skipped rather than overlapping (prevents double-placing orders).
- **Balance validation**: before placing each order, the bot checks available balance and skips orders that would exceed it, logging a warning.
- **Graceful shutdown**: SIGINT/SIGTERM cancel all open managed orders before exiting.
- **Order pruning**: closed orders are pruned to a cap of 200 to prevent unbounded memory growth.

---

## Known limitations

- **Partial fills assumed as full fills.** When an order leaves the open orders list, the bot records the entire order volume as filled. dex-trade does not expose fill amounts during normal polling, so PnL is approximate.
- **Weighted-average cost PnL.** Realized PnL uses `sellRevenue - (totalBuyCost * sellVolume / buyVolume)`. New buys recalculate the cost basis retroactively (not FIFO).
- **No retry within a tick.** A single network error or 5xx from dex-trade fails the tick. Recovery happens on the next tick (15 s later).
- **Rate limiter is not atomic.** Concurrent async calls can both pass the check before either updates the timestamp. Safe in practice (tick loop is sequential) but a `/api/stop` during a tick could briefly exceed limits.
