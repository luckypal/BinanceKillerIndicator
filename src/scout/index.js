const _ = require('lodash');
const cron = require('node-cron');
const axios = require('axios').default;
const { readSymbols } = require("../util/storage");
const WrappedStrategy = require('./advisor/baseTradingMethod');
const { getCandles } = require('../exchange/binance');
const { candleSize, historySize } = require('../core/config').tradingAdvisor;
const { KILLER_PORTS = '' } = process.env;
const killerPorts = KILLER_PORTS.split(',');

const strategyName = 'StochRSI';
// const strategyName = 'Supertrend';
const strategy = require(`../strategy/${strategyName}`);

_.each(strategy, function (fn, name) {
  WrappedStrategy.prototype[name] = fn;
});

// WrappedStrategy.prototype.emit = function (event, data) {
//   killerPorts.forEach(async (port) => {
//     const url = `http://localhost:${port}/api/bisignal`;
//     try {
//       await axios.post(url, data);
//     } catch (e) { }
//   });
// };

let symbols = ['DASHUSDT']; // readSymbols();
const tradingMethods = {};

const updateSymbol = () => {
  symbols = readSymbols();
}

const start = async () => {
  await Promise.all(symbols.map(async symbol => {
    const tradingStrategy = new WrappedStrategy({
      symbol,
      profitHours: 3
    });

    const candles = await getCandles(symbol, historySize * 30);
    _.forEach(candles, (candle) => tradingStrategy.tick(candle, () => { }));
    tradingMethods[symbol] = tradingStrategy;
    tradingStrategy.finish(() => { });
  }));
  console.log('Ready.');
}

cron.schedule(`*/${candleSize} * * * *`, async () => {
  const newAdvices = (await Promise.all(symbols.map(async symbol => {
    const candles = await getCandles(symbol, 2);
    const candle = candles[0];
    const tradingStrategy = tradingMethods[symbol];
    if (!tradingStrategy) return;

    await new Promise((resolve) => {
      tradingStrategy.tick(candle, () => { resolve() });
    });

    return tradingStrategy.lastAdvice;
  }))).filter(advice => !!advice);

  console.log(newAdvices);
});

module.exports = {
  updateSymbol,
  start
};
