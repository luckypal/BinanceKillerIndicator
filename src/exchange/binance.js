const Binance = require('binance-api-node').default

const { CANDLE_INTERVAL: candleInterval } = process.env;
const client = Binance()

const getCandles = async (symbol, limit) => {
  const candles = await client.candles({
    symbol,
    interval: candleInterval,
    limit
  });
  return candles;
}

module.exports = {
  getCandles
}
