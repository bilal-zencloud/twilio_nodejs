/**
 * Root router — mounts sub-routers and health check.
 */
const express = require('express');
const webhookRoutes = require('./webhook.routes');
const dashboardRoutes = require('./dashboard.routes');

const router = express.Router();

router.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

router.use('/webhooks', webhookRoutes);
router.use('/dashboard', dashboardRoutes);

// Redirect root to dashboard
router.get('/', (_req, res) => res.redirect('/dashboard'));

module.exports = router;
