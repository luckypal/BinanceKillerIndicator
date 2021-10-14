const Binance = require('binance-api-node').default;
const { config } = require('../scout/advisor/advisorConfig');

const client = Binance()

const getCandles = async (symbol, limit) => {
  const { candleSize } = config;
  const candleInterval = `${candleSize}m`;
  const candles = await client.candles({
    symbol: `${symbol}USDT`,
    interval: candleInterval,
    limit
  });
  return candles;
}

const checkDayStats = async () => {
  const stats = await client.dailyStats();
  stats.filter(stat => stat.symbol.endsWith('USDT'))
    .sort((a, b) => {
      const { quoteVolume: aq } = a;
      const { quoteVolume: bq } = b;
      if (parseFloat(aq) < parseFloat(bq)) return 1;
      return -1;
    })
    .filter((stat, index) => index <= 30)
    .map(({ symbol, quoteVolume }) => {
      console.log(symbol, quoteVolume);
    });
}

// checkDayStats()

module.exports = {
  getCandles
}
