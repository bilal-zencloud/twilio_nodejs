/**
 * Validates that incoming Twilio webhooks are genuinely from Twilio.
 * Set TWILIO_VALIDATE_SIGNATURE=false to disable (local dev without ngrok).
 */
const twilio = require('twilio');
const config = require('../../config/env');

function twilioValidator(req, res, next) {
  if (!config.twilio.validateSignature) {
    return next();
  }

  const signature = req.headers['x-twilio-signature'];
  if (!signature) {
    return res.status(403).send('Missing Twilio signature');
  }

  const url = `${config.appUrl}${req.originalUrl}`;
  const valid = twilio.validateRequest(
    config.twilio.authToken,
    signature,
    url,
    req.body
  );

  if (!valid) {
    return res.status(403).send('Invalid Twilio signature');
  }

  next();
}

module.exports = twilioValidator;
