'use strict';

const express = require('express');
const cors    = require('cors');
const logger  = require('./logger');
const { getSnapshot, state } = require('./state');
const { listStrategies } = require('./strategies');

module.exports = function createServer(botController) {
  const app = express();

  // Allow the Nexus module webview to reach us (any origin from localhost)
  app.use(cors({ origin: '*' }));
  app.use(express.json());

  // ─── GET /api/status ───────────────────────────────────────────────────
  // Returns the complete bot state snapshot
  app.get('/api/status', (_req, res) => {
    res.json({ ok: true, data: getSnapshot() });
  });

  // ─── GET /api/strategies ───────────────────────────────────────────────
  // Returns all available strategy definitions (names, params, schema)
  app.get('/api/strategies', (_req, res) => {
    res.json({ ok: true, data: listStrategies() });
  });

  // ─── GET /api/logs ─────────────────────────────────────────────────────
  app.get('/api/logs', (req, res) => {
    const limit = parseInt(req.query.limit, 10) || 100;
    res.json({ ok: true, data: logger.getEntries(limit) });
  });

  // ─── POST /api/start ───────────────────────────────────────────────────
  // Body: { strategyName, strategyParams }
  app.post('/api/start', async (req, res) => {
    const { strategyName, strategyParams } = req.body || {};
    try {
      await botController.start(strategyName, strategyParams);
      res.json({ ok: true, message: 'Bot started' });
    } catch (e) {
      logger.error(`Start failed: ${e.message}`);
      res.status(400).json({ ok: false, error: e.message });
    }
  });

  // ─── POST /api/stop ────────────────────────────────────────────────────
  app.post('/api/stop', async (req, res) => {
    const { cancelOrders = true } = req.body || {};
    try {
      await botController.stop(cancelOrders);
      res.json({ ok: true, message: 'Bot stopped' });
    } catch (e) {
      logger.error(`Stop failed: ${e.message}`);
      res.status(400).json({ ok: false, error: e.message });
    }
  });

  // ─── POST /api/config ──────────────────────────────────────────────────
  // Update strategy params while running (triggers immediate rebalance)
  app.post('/api/config', async (req, res) => {
    const { strategyName, strategyParams } = req.body || {};
    try {
      await botController.updateConfig(strategyName, strategyParams);
      res.json({ ok: true, message: 'Config updated' });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });

  // ─── POST /api/rebalance ───────────────────────────────────────────────
  // Force immediate rebalance without waiting for next tick
  app.post('/api/rebalance', async (_req, res) => {
    try {
      await botController.forceRebalance();
      res.json({ ok: true, message: 'Rebalance triggered' });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });

  // ─── GET /api/health ───────────────────────────────────────────────────
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, status: state.status, uptime: process.uptime() });
  });

  return app;
};
