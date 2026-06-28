/**
 * Express application setup — middleware, view engine, routes.
 */
const express = require('express');
const path = require('path');
const routes = require('./routes');

// Initialize DB schema on import
require('../config/database');

const app = express();

// Twilio sends webhooks as application/x-www-form-urlencoded
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// EJS view engine (MVC "Views" layer)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(routes);

module.exports = app;
