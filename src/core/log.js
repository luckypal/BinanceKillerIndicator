/*

  Lightweight logger, print everything that is send to error, warn
  and messages to stdout (the terminal). If config.debug is set in config
  also print out everything send to debug.

*/

var moment = require('moment');
var fmt = require('util').format;
var _ = require('lodash');

var Log = function () {
  _.bindAll(this);

  this.output = console;
};

Log.prototype = {
  _write: function (method, args, name) {
    if (!name)
      name = method.toUpperCase();

    var message = moment().format('YYYY-MM-DD HH:mm:ss');
    message += ' (' + name + '):\t';
    message += fmt.apply(null, args);

    this.output[method](message);
  },
  error: function () {
    this._write('error', arguments);
  },
  warn: function () {
    this._write('warn', arguments);
  },
  info: function () {
    this._write('info', arguments);
  },
  write: function () {
    var args = _.toArray(arguments);
    var message = fmt.apply(null, args);
    this.output.info(message);
  }
}

Log.prototype.debug = function () {
  this._write('info', arguments, 'DEBUG');
}


module.exports = new Log;