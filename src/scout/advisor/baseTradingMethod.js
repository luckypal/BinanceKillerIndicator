const _ = require('lodash');
const fs = require('fs');
const cuid = require('cuid');
const log = require('../../core/log');

const indicatorsPath = `${__dirname}/../../strategy/indicators/`;
const indicatorFiles = fs.readdirSync(indicatorsPath);
const Indicators = {};

const AsyncIndicatorRunner = require('./asyncIndicatorRunner');
const advisorConfig = require('../../core/config').tradingAdvisor;

_.each(indicatorFiles, function (indicator) {
  const indicatorName = indicator.split(".")[0];
  if (indicatorName[0] != "_")
    try {
      Indicators[indicatorName] = require(indicatorsPath + indicator);
    } catch (e) {
      log.error("Failed to load indicator", indicatorName);
    }
});

const allowedIndicators = _.keys(Indicators);
const HOUR_MS = 60 * 60 * 1000;

var Base = function (settings) {
  _.bindAll(this);

  // properties
  this.age = 0;
  this.processedTicks = 0;
  this.setup = false;
  this.settings = settings;
  this.tradingAdvisor = advisorConfig;
  // defaults
  this.priceValue = 'close';
  this.indicators = {};
  this.asyncTick = false;
  this.deferredTicks = [];

  this.propogatedAdvices = 0;

  this.completedWarmup = false;

  this.asyncIndicatorRunner = new AsyncIndicatorRunner();

  this._currentDirection;

  this.lastOpenTime = 0;
  this.lastBuyPrice = 0;
  this.lastBuyIndex = 0;
  this.result = [];
  this.leverage = 5;
  this.lastAdvice = null;

  // make sure we have all methods
  _.each(['init', 'check'], function (fn) {
    if (!this[fn])
      log.error('No ' + fn + ' function in this strategy found.')
  }, this);

  if (!this.update)
    this.update = function () { };

  if (!this.end)
    this.end = function () { };

  if (!this.onTrade)
    this.onTrade = function () { };

  // let's run the implemented starting point
  this.init();

  this.requiredHistory = this.tradingAdvisor.historySize;

  if (!this.log)
    this.log = function () { };

  this.setup = true;

  if (_.size(this.asyncIndicatorRunner.talibIndicators) || _.size(this.asyncIndicatorRunner.tulipIndicators))
    this.asyncTick = true;
  else
    delete this.asyncIndicatorRunner;
}

Base.prototype.tick = function (candle, done) {
  this.age++;
  this.lastAdvice = null;

  const afterAsync = () => {
    this.calculateSyncIndicators(candle, done);
  }

  if (this.asyncTick) {
    this.asyncIndicatorRunner.processCandle(candle, () => {

      if (!this.talibIndicators) {
        this.talibIndicators = this.asyncIndicatorRunner.talibIndicators;
        this.tulipIndicators = this.asyncIndicatorRunner.tulipIndicators;
      }

      afterAsync();
    });
  } else {
    afterAsync();
  }
}

Base.prototype.isBusy = function () {
  if (!this.asyncTick)
    return false;

  return this.asyncIndicatorRunner.inflight;
}

Base.prototype.calculateSyncIndicators = function (candle, done) {
  // update all indicators
  var price = candle[this.priceValue];
  _.each(this.indicators, function (i) {
    if (i.input === 'price')
      i.update(price);
    if (i.input === 'candle')
      i.update(candle);
  }, this);

  this.propogateTick(candle);

  return done();
}

Base.prototype.propogateTick = function (candle) {
  this.candle = candle;
  this.update(candle);
  this.checkLimits();

  this.processedTicks++;
  var isAllowedToCheck = this.requiredHistory <= this.age;

  if (!this.completedWarmup) {

    // in live mode we might receive more candles
    // than minimally needed. In that case check
    // whether candle start time is > startTime
    var isPremature = false;

    // if (mode === 'realtime') {
    //   const startTimeMinusCandleSize = startTime
    //     .clone()
    //     .subtract(this.tradingAdvisor.candleSize, "minutes");

    //   isPremature = candle.start < startTimeMinusCandleSize;
    // }

    if (isAllowedToCheck && !isPremature) {
      this.completedWarmup = true;
      // this.emit(
      //   'stratWarmupCompleted',
      //   { start: candle.start.clone() }
      // );
    }
  }

  if (this.completedWarmup) {
    this.log(candle);
    this.check(candle);

    if (
      this.asyncTick &&
      this.hasSyncIndicators &&
      this.deferredTicks.length
    ) {
      return this.tick(this.deferredTicks.shift())
    }
  }

  const indicators = {};
  _.each(this.indicators, (indicator, name) => {
    indicators[name] = indicator.result;
  });

  _.each(this.tulipIndicators, (indicator, name) => {
    indicators[name] = indicator.result.result
      ? indicator.result.result
      : indicator.result;
  });

  _.each(this.talibIndicators, (indicator, name) => {
    indicators[name] = indicator.result.outReal
      ? indicator.result.outReal
      : indicator.result;
  });

  // this.emit('stratUpdate', {
  //   date: candle.start.clone(),
  //   indicators
  // });

  // are we totally finished?
  const completed = this.age === this.processedTicks;
  if (completed && this.finishCb)
    this.finishCb();
}

Base.prototype.processTrade = function (trade) {
  if (
    this._pendingTriggerAdvice &&
    trade.action === 'sell' &&
    this._pendingTriggerAdvice === trade.adviceId
  ) {
    // This trade came from a trigger of the previous advice,
    // update stored direction
    this._currentDirection = 'short';
    this._pendingTriggerAdvice = null;
  }

  this.onTrade(trade);
}

Base.prototype.addTalibIndicator = function (name, type, parameters) {
  this.asyncIndicatorRunner.addTalibIndicator(name, type, parameters);
}

Base.prototype.addTulipIndicator = function (name, type, parameters) {
  this.asyncIndicatorRunner.addTulipIndicator(name, type, parameters);
}

Base.prototype.addIndicator = function (name, type, parameters) {
  if (!_.contains(allowedIndicators, type))
    log.error('I do not know the indicator ' + type);

  if (this.setup)
    log.error('Can only add indicators in the init method!');

  return this.indicators[name] = new Indicators[type](parameters);

  // some indicators need a price stream, others need full candles
}

Base.prototype.checkLimits = function () {
  if (!this.lastBuyPrice) return;

  const { leverage } = this;
  const longLimit = this.lastBuyPrice * 1.01;
  const shortLimit = this.lastBuyPrice * (1 - 1 / leverage / 2);
  if (this.candle.low <= shortLimit) {
    this.lastBuyPrice = 0;
    const percent = 0.5;
    this.storeResult(percent);
  } else if (longLimit <= this.candle.high) {
    this.lastBuyPrice = 0;
    const percent = (1 + leverage * 0.01) * 0.9994
    this.storeResult(percent);
  }
}

Base.prototype.advice = function (newDirection) {
  // ignore legacy soft advice
  if (!newDirection) {
    return;
  }

  let trigger;
  if (_.isObject(newDirection)) {
    if (!_.isString(newDirection.direction)) {
      log.error('Strategy emitted unparsable advice:', newDirection);
      return;
    }

    if (newDirection.direction === this._currentDirection) {
      return;
    }

    if (_.isObject(newDirection.trigger)) {
      if (newDirection.direction !== 'long') {
        log.warn(
          'Strategy adviced a stop on not long, this is not supported.',
          'As such the stop is ignored'
        );
      } else {

        // the trigger is implemented in a trader
        trigger = newDirection.trigger;

        if (trigger.trailPercentage && !trigger.trailValue) {
          trigger.trailValue = trigger.trailPercentage / 100 * this.candle.close;
          log.info('[StratRunner] Trailing stop trail value specified as percentage, setting to:', trigger.trailValue);
        }
      }
    }

    newDirection = newDirection.direction;
  }

  if (newDirection === this._currentDirection) {
    return;
  }

  if (newDirection === 'short' && this._pendingTriggerAdvice) {
    this._pendingTriggerAdvice = null;
  }

  this._currentDirection = newDirection;
  const price = this.candle[this.priceValue];

  if (newDirection == 'short' && this.lastBuyPrice) {
    const { leverage } = this;
    let percent = (price - this.lastBuyPrice) / this.lastBuyPrice;
    const aPercent = Math.abs(percent);
    if (percent >= 0) {
      percent = (1 + leverage * aPercent) * 0.9992;
    } else {
      percent = (1 - leverage * aPercent * 1.0008);
    }
    this.storeResult(percent);
    this.lastBuyPrice = 0;
  } else if (newDirection == 'long') {
    this.lastBuyPrice = price;
    this.lastBuyIndex = this.age;
    this.lastOpenTime = this.candle.openTime;
  }

  this.propogatedAdvices++;

  const advice = {
    id: cuid(),
    symbol: this.settings.symbol,
    price,
    date: this.candle.closeTime,
    direction: newDirection,
    dailyProfit: this.getDailyProfit()
  };
  // const date = moment(this.candle.closeTime + 1)
  //   .utcOffset(-5)
  //   .format('YYYY-MM-DD HH:mm:ss');
  // console.log(this.settings.symbol, newDirection, date, this.candle.close);

  if (trigger) {
    advice.trigger = trigger;
    this._pendingTriggerAdvice = 'advice-' + this.propogatedAdvices;
  } else {
    this._pendingTriggerAdvice = null;
  }

  this.emit('advice', advice);

  return this.propogatedAdvices;
}

Base.prototype.storeResult = function (profit) {
  const candleCount = this.age - this.lastBuyIndex;
  this.result.push({
    profit: Math.floor(profit * 10000) / 10000,
    candleCount,
    openTime: this.lastOpenTime,
    closeTime: this.candle.closeTime
  });

  const { profitHours } = advisorConfig;
  const limitTime = this.candle.closeTime - profitHours * HOUR_MS;
  this.result = this.result.filter(({ openTime }) => openTime > limitTime);
}

Base.prototype.getDailyProfit = function () {
  let total = 1;
  this.result.forEach(({ profit }) => total *= profit);
  return Math.floor(total * 10000) / 10000;
}

Base.prototype.notify = function (content) {
  this.emit('stratNotification', {
    content,
    date: new Date(),
  })
}

Base.prototype.finish = function (done) {
  // Because the strategy might be async we need
  // to be sure we only stop after all candles are
  // processed.
  if (!this.asyncTick) {
    this.end();
    return done();
  }

  if (this.age === this.processedTicks) {
    this.end();
    return done();
  }

  // we are not done, register cb
  // and call after we are..
  this.finishCb = done;
}

Base.prototype.emit = function (event, data) {
  if (event == 'advice') this.lastAdvice = data;
}

module.exports = Base;
