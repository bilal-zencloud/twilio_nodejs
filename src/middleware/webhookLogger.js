/**
 * Logs incoming Twilio webhook requests for debugging.
 */
function webhookLogger(req, _res, next) {
  const { CallSid, CallStatus, From, To, Body } = req.body;
  console.log(`[webhook] ${req.method} ${req.originalUrl}`, {
    CallSid,
    CallStatus,
    From,
    To,
    Body: Body ? Body.substring(0, 80) : undefined,
  });
  next();
}

module.exports = webhookLogger;
