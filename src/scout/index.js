const cron = require('node-cron');
const { readSymbols } = require("../util/storage");

let symbols = readSymbols();

const updateSymbol = () => {
  symbols = readSymbols();
}

const start = () => {
  console.log(symbols);
}

cron.schedule('*/15 * * * *', () => {
  console.log('Schedule', new Date());
});

module.exports = {
  updateSymbol,
  start
};
