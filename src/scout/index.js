const _ = require('lodash');
const cron = require('node-cron');
const axios = require('axios').default;
const { readSymbols } = require("../util/storage");
const log = require('../core/log');
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

let symbols = readSymbols();
const tradingMethods = {};

const updateSymbol = () => {
  symbols = readSymbols();
}

function getNearCandle(candles) {
  const now = Date.now();
  const diff0 = Math.abs(now - candles[0].closeTime);
  const diff1 = Math.abs(now - candles[1].closeTime);

  if (diff0 < diff1) return candles[0];
  return candles[1];
}

const start = async () => {
  await Promise.all(symbols.map(async symbol => {
    const tradingStrategy = new WrappedStrategy({
      symbol,
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
    const candle = getNearCandle(candles);
    const tradingStrategy = tradingMethods[symbol];
    if (!tradingStrategy) return;

    await new Promise((resolve) => {
      tradingStrategy.tick(candle, () => { resolve() });
    });

    return tradingStrategy.lastAdvice;
  }))).filter(advice => !!advice);

  const profits = {};
  symbols.forEach(symbol => {
    const tradingStrategy = tradingMethods[symbol];
    profits[symbol] = tradingStrategy.getDailyProfit();
  });

  const ranks = Object.assign([], symbols);
  ranks.sort((a, b) => {
    if (profits[a] < profits[b]) return 1;
    return -1;
  });

  newAdvices.forEach(advice => {
    advice.rank = ranks.indexOf(advice.symbol);
  });

  newAdvices.sort((a, b) => {
    if (a.rank > b.rank) return 1;
    return -1;
  });

  killerPorts.forEach(async (port) => {
    const url = `http://localhost:${port}/api/bisignal`;
    try {
      await axios.post(url, newAdvices);
    } catch (e) { }
  });
});

module.exports = {
  updateSymbol,
  start
};
