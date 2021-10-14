const _ = require('lodash');
const cron = require('node-cron');
const { readSymbols } = require("../util/storage");
const WrappedStrategy = require('./advisor/baseTradingMethod');
const strategy = require('../strategy/StochRSI');

_.each(strategy, function (fn, name) {
  WrappedStrategy.prototype[name] = fn;
});

let symbols = readSymbols();
const tradingMethods = {};

const updateSymbol = () => {
  symbols = readSymbols();
}

const start = () => {
  console.log(symbols);
  symbols.forEach(symbol => {
    // getIntroCandles(symbol);
    tradingMethods[symbol] = new WrappedStrategy({
      interval: 3,
      low: 20,
      high: 80,
      persistence: 3
    })
  })
}

cron.schedule('*/15 * * * *', () => {
  console.log('Schedule', new Date());
});

module.exports = {
  updateSymbol,
  start
};
