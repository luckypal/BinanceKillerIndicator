var _ = require('lodash');
var config = require('../core/config.js');
var settings = config.StochRSI;

var method = {};


method.init = function() {
  this.interval = settings.interval;

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
	if(this.shortRSI > settings.thresholds.high) {
		// new trend detected
		if(this.trend.direction !== 'high')
			this.trend = {
				duration: 0,
				persisted: false,
				direction: 'high',
				adviced: false
			};

		this.trend.duration++;

		if(this.trend.duration >= settings.thresholds.persistence)
			this.trend.persisted = true;

		if(this.trend.persisted && !this.trend.adviced) {
			this.trend.adviced = true;
			this.advice('short');
		} else
			this.advice();

	} else if(this.shortRSI < settings.thresholds.low) {

		// new trend detected
		if(this.trend.direction !== 'low')
			this.trend = {
				duration: 0,
				persisted: false,
				direction: 'low',
				adviced: false
			};

		this.trend.duration++;

		if(this.trend.duration >= settings.thresholds.persistence)
			this.trend.persisted = true;

		if(this.trend.persisted && !this.trend.adviced) {
			this.trend.adviced = true;
			this.advice('long');
		} else
			this.advice();

	} else {
		// trends must be on consecutive candles
		this.trend.duration = 0;
		this.advice();
	}
}

method.end = function() {
}

module.exports = method;
