/**
 * Root router — mounts sub-routers and health check.
 */
const path = require('path');
const fs = require('fs');
const express = require('express');
const config = require('../../config/env');
const consentCopy = require('../../config/consent');
const webhookRoutes = require('./webhook.routes');
const apiRoutes = require('./api.routes');

const router = express.Router();

const GREETING_AUDIO = path.join(__dirname, '../../assets/audio/voicemail-greeting.mp3');

router.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

/** Public audio for Twilio <Play> — must be reachable without auth. */
router.get(consentCopy.VOICEMAIL_GREETING_AUDIO_PATH, (_req, res) => {
  if (!fs.existsSync(GREETING_AUDIO)) {
    return res.status(404).send('Greeting audio not found');
  }
  res.set('Cache-Control', 'public, max-age=86400');
  res.type('audio/mpeg');
  res.sendFile(GREETING_AUDIO);
});

router.use('/webhooks', webhookRoutes);
router.use('/api', apiRoutes);

router.get('/', (_req, res) => {
  res.redirect(config.frontendUrl);
});

module.exports = router;
