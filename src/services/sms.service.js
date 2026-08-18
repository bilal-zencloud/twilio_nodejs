/**
 * Twilio SMS service — outbound messaging wrapper.
 */
const twilio = require('twilio');
const config = require('../../config/env');

let client = null;

function getClient() {
  if (!client) {
    client = twilio(config.twilio.accountSid, config.twilio.authToken);
  }
  return client;
}

/** Map common Twilio SMS error codes to actionable messages. */
const ERROR_HINTS = {
  21608: 'Trial account: verify this number in Twilio Console → Verified Caller IDs (SMS method).',
  21211: 'Invalid phone number format — must be E.164 (e.g. +15165551234).',
  21264: 'Trial account: caller must be a verified Caller ID to reach your Twilio number.',
  30034: 'US A2P 10DLC: register your brand/campaign in Twilio Console, or upgrade the account.',
  21408: 'Permission denied — enable SMS geo permissions for this country in Twilio Console.',
  21612: 'Invalid From/To pair — e.g. US numbers cannot send A2P SMS to UK mobiles. Use a UK sender or test with US numbers.',
};

function formatSmsError(err, to) {
  const code = err.code || err.status;
  const hint = ERROR_HINTS[code] ? ` ${ERROR_HINTS[code]}` : '';
  return `SMS to ${to} failed (${code}): ${err.message}.${hint}`;
}

/**
 * Send an SMS from the business Twilio number to the caller.
 * @returns {Promise<{ sid: string, status: string }>}
 */
async function sendSms(to, body, { mediaUrl } = {}) {
  const params = {
    to,
    from: config.twilio.phoneNumber,
    body,
  };

  if (mediaUrl && mediaUrl.length) {
    params.mediaUrl = mediaUrl;
  }

  if (config.twilio.messagingServiceSid) {
    delete params.from;
    params.messagingServiceSid = config.twilio.messagingServiceSid;
  }

  try {
    const message = await getClient().messages.create(params);
    return { sid: message.sid, status: message.status };
  } catch (err) {
    throw new Error(formatSmsError(err, to));
  }
}

/**
 * Poll message status briefly — catches async delivery failures (e.g. A2P 30034).
 */
async function sendSmsAndConfirm(to, body, { waitMs = 4000, mediaUrl } = {}) {
  const { sid, status } = await sendSms(to, body, { mediaUrl });

  if (waitMs > 0) {
    await new Promise((r) => setTimeout(r, waitMs));
    const updated = await getClient().messages(sid).fetch();

    if (updated.status === 'failed' || updated.status === 'undelivered') {
      const hint = ERROR_HINTS[updated.errorCode] || '';
      throw new Error(
        `SMS to ${to} ${updated.status} (error ${updated.errorCode}).${hint ? ` ${hint}` : ''}`
      );
    }

    return { sid, status: updated.status };
  }

  return { sid, status };
}

/**
 * Notify Devin on OWNER_PHONE_NUMBER. Falls back to text-only if MMS is rejected.
 */
async function sendOwnerMessage(body, { mediaUrl } = {}) {
  const to = config.twilio.ownerPhoneNumber;
  if (!to) {
    throw new Error('OWNER_PHONE_NUMBER is not set — cannot notify Devin');
  }

  try {
    return await sendSmsAndConfirm(to, body, { waitMs: 0, mediaUrl });
  } catch (err) {
    if (mediaUrl && mediaUrl.length) {
      console.warn('[sms] Owner MMS failed, retrying text-only:', err.message);
      return sendSmsAndConfirm(to, body, { waitMs: 0 });
    }
    throw err;
  }
}

module.exports = { sendSms, sendSmsAndConfirm, sendOwnerMessage, ERROR_HINTS };
