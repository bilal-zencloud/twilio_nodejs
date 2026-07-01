/**
 * Express application setup — middleware and routes.
 * Dashboard UI is served by the Next.js app in frontend/.
 */
const express = require('express');
const routes = require('./routes');

require('../config/database');

const app = express();

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(routes);

module.exports = app;
