/**
 * Root router — mounts sub-routers and health check.
 */
const express = require('express');
const config = require('../../config/env');
const webhookRoutes = require('./webhook.routes');
const apiRoutes = require('./api.routes');

const router = express.Router();

router.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

router.use('/webhooks', webhookRoutes);
router.use('/api', apiRoutes);

router.get('/', (_req, res) => {
  res.redirect(config.frontendUrl);
});

module.exports = router;
