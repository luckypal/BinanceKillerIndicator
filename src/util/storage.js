const fs = require('fs');

const { DATA_STORAGE } = process.env;

const readSymbols = () => {
  const filePath = `${DATA_STORAGE}/symbols.json`;
  const fileContent = fs.readFileSync(filePath, { encoding: 'utf8' });
  return JSON.parse(fileContent);
}

module.exports = {
  readSymbols
}