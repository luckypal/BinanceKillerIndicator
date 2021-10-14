require('dotenv').config()

require('./api');

const { start } = require('./scout');
start();
