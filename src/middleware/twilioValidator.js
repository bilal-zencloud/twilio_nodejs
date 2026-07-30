/**
 * Validates that incoming Twilio webhooks are genuinely from Twilio.
 * Set TWILIO_VALIDATE_SIGNATURE=false to disable (local dev without ngrok).
 *
 * Builds the validation URL from the request Host when possible so signature
 * checks still work after Railway domain changes (as long as APP_URL is close).
 */
const twilio = require('twilio');
const config = require('../../config/env');

function requestPublicUrl(req) {
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'https')
    .toString()
    .split(',')[0]
    .trim();
  const host = (req.headers['x-forwarded-host'] || req.headers.host || '')
    .toString()
    .split(',')[0]
    .trim();

  if (host) {
    return `${proto}://${host}${req.originalUrl}`;
  }

  return `${config.appUrl.replace(/\/$/, '')}${req.originalUrl}`;
}

function twilioValidator(req, res, next) {
  if (!config.twilio.validateSignature) {
    return next();
  }

  const signature = req.headers['x-twilio-signature'];
  if (!signature) {
    return res.status(403).send('Missing Twilio signature');
  }

  const candidates = [
    requestPublicUrl(req),
    `${config.appUrl.replace(/\/$/, '')}${req.originalUrl}`,
  ];

  const valid = candidates.some((url) =>
    twilio.validateRequest(config.twilio.authToken, signature, url, req.body)
  );

  if (!valid) {
    console.error('[twilio-validator] Invalid signature. Tried:', candidates.join(' | '));
    return res.status(403).send('Invalid Twilio signature');
  }

  next();
}

module.exports = twilioValidator;
