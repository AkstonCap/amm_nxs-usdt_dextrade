'use strict';

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const logLevel = LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info;

const MAX_ENTRIES = 500;
const entries = [];

function timestamp() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function log(level, message) {
  if (LEVELS[level] < logLevel) return;
  const entry = { time: timestamp(), level, message };
  entries.push(entry);
  if (entries.length > MAX_ENTRIES) entries.shift();
  const prefix = { debug: '[DBG]', info: '[INF]', warn: '[WRN]', error: '[ERR]' }[level];
  console.log(`${entry.time} ${prefix} ${message}`);
}

module.exports = {
  debug: (msg) => log('debug', msg),
  info:  (msg) => log('info',  msg),
  warn:  (msg) => log('warn',  msg),
  error: (msg) => log('error', msg),
  getEntries: (limit = 100) => entries.slice(-limit),
  clear: () => { entries.length = 0; },
};
