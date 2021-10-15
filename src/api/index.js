const express = require('express');
// const { updateSymbol } = require('../exchange/binance');
const app = express()
const { HTTP_PORT: httpPort } = process.env;

app.get('/updateSymbol', function (req, res) {
  // updateSymbol();
})

app.listen(httpPort);
