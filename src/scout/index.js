const _ = require('lodash');
const cron = require('node-cron');
const { readSymbols } = require("../util/storage");
const WrappedStrategy = require('./advisor/baseTradingMethod');
const strategy = require('../strategy/StochRSI');
const { getCandles } = require('../exchange/binance');
const { config: advisorConfig } = require('./advisor/advisorConfig');
const { candleSize, historySize } = advisorConfig;

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
  symbols.forEach(async symbol => {
    // getIntroCandles(symbol);
    const tradingStrategy = new WrappedStrategy({
      symbol,
      interval: 3,
      thresholds: {
        low: 20,
        high: 80,
        persistence: 3
      }
    });

    const candles = await getCandles(symbol, historySize);
    _.forEach(candles, (candle) => tradingStrategy.tick(candle, () => { }));
    tradingMethods[symbol] = tradingStrategy;
  });
}

cron.schedule(`*/${candleSize} * * * *`, async () => {
  symbols.forEach(async symbol => {
    const candles = await getCandles(symbol, 2);
    const candle = candles[0];
    const tradingStrategy = tradingMethods[symbol];
    tradingStrategy.tick(candle, () => { });
  });
});

module.exports = {
  updateSymbol,
  start
};
