'use strict';

const constantProduct = require('./constantProduct');
const grid            = require('./grid');
const spreadMaker     = require('./spreadMaker');

const strategies = { constantProduct, grid, spreadMaker };

function getStrategy(name) {
  if (!Object.prototype.hasOwnProperty.call(strategies, name)) {
    throw new Error(`Unknown strategy: ${name}`);
  }
  return strategies[name];
}

function listStrategies() {
  return Object.values(strategies).map(({ name, displayName, description, defaultParams, paramSchema }) => ({
    name, displayName, description, defaultParams, paramSchema,
  }));
}

module.exports = { getStrategy, listStrategies };
