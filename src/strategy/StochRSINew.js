/*

	StochRSI - SamThomp 11/06/2014

	(updated by askmike) @ 30/07/2016

 */
// helpers
var _ = require('lodash');
var moment = require('moment');
var log = require('../core/log.js');

var SMA = require('./indicators/SMA.js');

// let's create our own method
var method = {};

// prepare everything our method needs
method.init = function () {
	this.trend = {
		direction: 'none',
		duration: 0,
		persisted: false,
		adviced: false
	};

	this.direction = 'down';
	const {
		rsiLength,
		stochLength,
		smoothK,
		smoothD } = this.settings;

	this.requiredHistory = Math.max(this.tradingAdvisor.historySize, rsiLength + stochLength + Math.max(smoothK, smoothD));

	// define the indicators we need
	this.addTalibIndicator('rsi', 'rsi', { optInTimePeriod: rsiLength });
	this.fastrsi = new SMA(smoothK);
	this.slowrsi = new SMA(smoothD);

	this.RSIhistory = [];
}

// what happens on every new candle?
method.update = function (candle) {
	this.rsi = this.talibIndicators.rsi.result.outReal;
	if (!this.rsi) return;

	this.RSIhistory.push(this.rsi);
	const { stochLength } = this.settings;

	if (_.size(this.RSIhistory) > stochLength) {
		// remove oldest RSI value
		this.RSIhistory.shift();

		this.lowestRSI = _.min(this.RSIhistory);
		this.highestRSI = _.max(this.RSIhistory);
		this.stochRSI = ((this.rsi - this.lowestRSI) / (this.highestRSI - this.lowestRSI)) * 100;

		// console.log(this.fastrsi, this.slowrsi);
		if (!isNaN(this.stochRSI)) { //Only put numbers in here
			this.fastrsi.update(this.stochRSI);
		}
		if (!isNaN(this.fastrsi.result)) { //Only put numbers in here
			this.slowrsi.update(this.fastrsi.result);
		}
	}
}

// for debugging purposes log the last
// calculated parameters.
method.log = function () {
	var digits = 8;

	// log.debug('calculated StochRSI properties for candle:');
	// log.debug('\t', 'rsi:', this.rsi.toFixed(digits));
	// log.debug("StochRSI min:\t\t" + this.lowestRSI.toFixed(digits));
	// log.debug("StochRSI max:\t\t" + this.highestRSI.toFixed(digits));
	// log.debug("StochRSI Value:\t\t" + this.stochRSI.toFixed(2));
}

method.check = function () {
	//IF THERE'S REASON TO BUY.. THEN DO IT
	const {
		high,
		low,
		persistence
	} = this.settings;

	const fastRsi = this.fastrsi.result;
	const slowRsi = this.slowrsi.result;
  const date = moment(this.candle.openTime).utcOffset(-5).format('MM-DD HH:mm:ss');
  // console.log(
  //   date,
	// 	this.candle.open,
	// 	this.candle.high,
	// 	this.candle.low,
	// 	this.candle.close,
	// 	fastRsi,
	// 	slowRsi,);

	if (fastRsi > slowRsi
		&& low > slowRsi
		) {
		// new trend detected
		if (this.trend.direction !== 'high')
			this.trend = {
				duration: 0,
				persisted: false,
				direction: 'high',
				adviced: false
			};

		this.trend.duration++;

		// log.debug('In high since', this.trend.duration, 'candle(s)');

		if (this.trend.duration >= persistence)
			this.trend.persisted = true;

		if (this.trend.persisted && !this.trend.adviced) {
			this.trend.adviced = true;
			this.advice('long');
		} else
			this.advice();

	} else if (fastRsi < slowRsi
		&& slowRsi > high
		) {

		// new trend detected
		if (this.trend.direction !== 'low')
			this.trend = {
				duration: 0,
				persisted: false,
				direction: 'low',
				adviced: false
			};

		this.trend.duration++;

		// log.debug('In low since', this.trend.duration, 'candle(s)');

		if (this.trend.duration >= persistence)
			this.trend.persisted = true;

		if (this.trend.persisted && !this.trend.adviced) {
			this.trend.adviced = true;
			this.advice('short');
		} else
			this.advice();

	} else {
		// trends must be on consecutive candles
		this.trend.duration = 0;
		// log.debug('In no trend');

		this.advice();
	}

}

module.exports = method;
