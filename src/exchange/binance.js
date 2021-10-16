const Binance = require('binance-api-node').default;
const config = require('../core/config').tradingAdvisor;

const client = Binance()

const getCandles = async (symbol, limit) => {
  const { candleSize } = config;
  const candleInterval = `${candleSize}m`;
  const candles = await client.candles({
    symbol: symbol,
    interval: candleInterval,
    limit
  });
  return candles;
}

const checkDayStats = async () => {
  const stats = await client.dailyStats();
  const symbols = stats.filter(stat => stat.symbol.endsWith('USDT'))
    .sort((a, b) => {
      const { quoteVolume: aq } = a;
      const { quoteVolume: bq } = b;
      if (parseFloat(aq) < parseFloat(bq)) return 1;
      return -1;
    })
    .filter(({ symbol }, index) => index <= 30 && symbol != 'BUSDUSDT')
    .map(({ symbol }) => symbol);
}

// checkDayStats()

module.exports = {
  getCandles
}
