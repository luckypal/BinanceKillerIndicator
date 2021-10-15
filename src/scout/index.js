const _ = require('lodash');
const cron = require('node-cron');
const axios = require('axios').default;
const { readSymbols } = require("../util/storage");
const WrappedStrategy = require('./advisor/baseTradingMethod');
const strategy = require('../strategy/StochRSI');
const { getCandles } = require('../exchange/binance');
const { config: advisorConfig } = require('./advisor/advisorConfig');
const { candleSize, historySize } = advisorConfig;
const { KILLER_PORTS = '' } = process.env;
const killerPorts = KILLER_PORTS.split(',');

_.each(strategy, function (fn, name) {
  WrappedStrategy.prototype[name] = fn;
});

WrappedStrategy.prototype.emit = function (event, data) {
  killerPorts.forEach(async (port) => {
    const url = `http://localhost:${port}/api/bisignal`;
    try {
      await axios.post(url, data);
    } catch (e) { }
  });
};

let symbols = readSymbols();
const tradingMethods = {};

const updateSymbol = () => {
  symbols = readSymbols();
}

const start = () => {
  console.log(symbols);
  symbols.forEach(async symbol => {
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
    // tradingStrategy.finish(() => { });
  });
}

cron.schedule(`*/${candleSize} * * * *`, async () => {
  symbols.forEach(async symbol => {
    const candles = await getCandles(symbol, 2);
    const candle = candles[0];
    const tradingStrategy = tradingMethods[symbol];
    if (!tradingStrategy) return;
    tradingStrategy.tick(candle, () => { });
  });
});

module.exports = {
  updateSymbol,
  start
};
