const _ = require('lodash');
const cron = require('node-cron');
const axios = require('axios').default;
var moment = require('moment');
const { readSymbols } = require("../util/storage");
const log = require('../core/log');
const WrappedStrategy = require('./advisor/baseTradingMethod');
const { getCandles } = require('../exchange/binance');
const tradingAdvisorConfig = require('../core/config');
const { candleSize, profitHours } = tradingAdvisorConfig.tradingAdvisor;
const { KILLER_PORTS = '' } = process.env;
const killerPorts = KILLER_PORTS.split(',');

const strategyName = 'StochRSI';
// const strategyName = 'StochRSINew';
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

function getProfits() {
  const profits = {};
  symbols.forEach(symbol => {
    const tradingStrategy = tradingMethods[symbol];
    profits[symbol] = tradingStrategy.getDailyProfit();
  });
  return profits;
}

const start = async () => {
  const historyCandleSize = profitHours * (60 / candleSize);
  console.log('historyCandleSize', historyCandleSize);
  const currentTime = Date.now();

  await Promise.all(symbols.map(async symbol => {
    const tradingStrategy = new WrappedStrategy({
      symbol,
      ...tradingAdvisorConfig[strategyName]
    });
    const candles = await getCandles(symbol, historyCandleSize);
    _.forEach(candles, (candle) => {
      if (candle.closeTime > currentTime) return;
      tradingStrategy.tick(candle, () => { });
    });
    tradingMethods[symbol] = tradingStrategy;
    tradingStrategy.finish(() => { });
  }));
  console.log('Ready.', getProfits());
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

  if (!newAdvices.length) return;

  const profits = getProfits();

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

  const date = moment().utcOffset(-5).format('MM-DD HH:mm:ss');
  console.log(
    date,
    newAdvices);

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
