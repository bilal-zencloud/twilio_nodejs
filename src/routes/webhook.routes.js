/**
 * Webhook routes — Twilio voice & SMS endpoints.
 */
const express = require('express');
const WebhookController = require('../controllers/webhook.controller');
const twilioValidator = require('../middleware/twilioValidator');
const webhookLogger = require('../middleware/webhookLogger');

const router = express.Router();

router.use(webhookLogger);

// Voice: ring owner first (optional), then voicemail / opt-in on miss
router.post('/voice/incoming', twilioValidator, WebhookController.handleIncomingCall);
router.post('/voice/dial-result', twilioValidator, WebhookController.handleDialResult);
router.post('/voice/voicemail-complete', twilioValidator, WebhookController.handleVoicemailComplete);
router.post('/voice/status', twilioValidator, WebhookController.handleCallStatus);

// SMS: inbound replies from callers
router.post('/sms/inbound', twilioValidator, WebhookController.handleInboundSms);

module.exports = router;
