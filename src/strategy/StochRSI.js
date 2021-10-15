var _ = require('lodash');

var method = {};


method.init = function() {
  this.interval = this.settings.interval;

  this.trend = {
    direction: 'none',
    duration: 0,
    persisted: false,
    adviced: false
  };

  this.requiredHistory = this.tradingAdvisor.historySize;

  // define the indicators we need
  this.addIndicator('rsi', 'RSI', { interval: this.interval });

	this.RSIhistory = [];
  this.lastBuyPrice = 0;
  this.index = 0;
	this.lastBuyIndex = 0;
  this.result = {
    succeed: 0,
    failed: 0,
		candleSum: 0,
		count: 0,
		total: 1000,
		percent: 0
  };
	this.leverage = 5;
}

// what happens on every new candle?
/**
 * @param {Candle} candle {start, open, high, low, close, vwp, volume, trades}
 */
method.update = function(candle) {
	this.rsi = this.indicators.rsi.result;

	this.RSIhistory.push(this.rsi);

	if(_.size(this.RSIhistory) > this.interval) {
		// remove oldest RSI value
		this.RSIhistory.shift();
  }

	this.lowestRSI = _.min(this.RSIhistory);
	this.highestRSI = _.max(this.RSIhistory);
	this.shortRSI = ((this.rsi - this.lowestRSI) / (this.highestRSI - this.lowestRSI)) * 100;
}

// for debugging purposes log the last
// calculated parameters.
method.log = function() {
  var digits = 8;
}

method.check = function() {
	const {leverage} = this;
  if (this.lastBuyPrice) {
    const longLimit = this.lastBuyPrice * 1.01;
    const shortLimit = this.lastBuyPrice * (1 - 1 / leverage / 2);
    if (this.candle.low <= shortLimit) {
      this.lastBuyPrice = 0;
      this.result.failed += 50;
			this.result.percent = 0.5;
			this.result.total *= this.result.percent;
      this.logResult();
    } else if (longLimit <= this.candle.high) {
      this.lastBuyPrice = 0;
      this.result.succeed += leverage * 0.9994;
			this.result.percent = (1 + leverage * 0.01) * 0.9994
			this.result.total *= this.result.percent;
      this.logResult(1);
    }
  }
	if(this.shortRSI > this.settings.thresholds.high) {
		// new trend detected
		if(this.trend.direction !== 'high')
			this.trend = {
				duration: 0,
				persisted: false,
				direction: 'high',
				adviced: false
			};

		this.trend.duration++;

		if(this.trend.duration >= this.settings.thresholds.persistence)
			this.trend.persisted = true;

		if(this.trend.persisted && !this.trend.adviced) {
			this.trend.adviced = true;
			this.advice('short');
      if (this.lastBuyPrice) {
        const percent = (this.candle.close - this.lastBuyPrice) / this.lastBuyPrice;
				const aPercent = Math.abs(percent);
        if (percent >= 0) {
					this.result.succeed += leverage * percent * 0.9992;
					this.result.percent = (1 + leverage * aPercent) * 0.9992;
					this.result.total *= this.result.percent;
				} else {
					this.result.failed -= leverage * percent * 1.0008;
					this.result.percent = (1 - leverage * aPercent) * 1.0008;
					this.result.total *= this.result.percent;
				}
        this.logResult(percent);
      }
      this.lastBuyPrice = 0;
		} else
			this.advice();

	} else if(this.shortRSI < this.settings.thresholds.low) {

		// new trend detected
		if(this.trend.direction !== 'low')
			this.trend = {
				duration: 0,
				persisted: false,
				direction: 'low',
				adviced: false
			};

		this.trend.duration++;

		if(this.trend.duration >= this.settings.thresholds.persistence)
			this.trend.persisted = true;

		if(this.trend.persisted && !this.trend.adviced) {
			this.trend.adviced = true;
			this.advice('long');
      this.lastBuyPrice = this.candle.close;
			this.lastBuyIndex = this.index;
		} else
			this.advice();

	} else {
		// trends must be on consecutive candles
		this.trend.duration = 0;
		this.advice();
	}

  this.index += 1;
}

method.logResult = function() {
	const candleLen = this.index - this.lastBuyIndex;
	this.result.candleSum += candleLen;
	this.result.count += 1;
  // console.log(this.index, this.result, this.result.candleSum / this.result.count);
}

method.end = function() {
  console.log(this.settings.symbol, this.result);
	console.log('Average candle length per trade', this.result.candleSum / this.result.count);
}

module.exports = method;
