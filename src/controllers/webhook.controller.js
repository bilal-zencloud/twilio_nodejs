/**
 * Webhook controller — Twilio voice & SMS event handlers.
 */
const fs = require('fs');
const path = require('path');
const twilio = require('twilio');
const VoiceResponse = twilio.twiml.VoiceResponse;
const MessagingResponse = twilio.twiml.MessagingResponse;

const config = require('../../config/env');
const { forAccount } = require('../repositories');
const LeadRepository = require('../repositories/LeadRepository');
const MessageRepository = require('../repositories/MessageRepository');
const { resolveAccount } = require('../services/account.service');
const { processMissedCall, markPendingOptIn, hasPendingOptIn } = require('../services/missedCall.service');
const consentService = require('../services/consent.service');
const aiService = require('../services/ai.service');
const smsService = require('../services/sms.service');
const photoService = require('../services/photo.service');
const consentCopy = require('../../config/consent');

const MISSED_STATUSES = new Set(['no-answer', 'busy', 'failed', 'canceled']);
const DIAL_MISSED = new Set(['no-answer', 'busy', 'failed', 'canceled']);
const { STATUSES } = LeadRepository;

const GREETING_AUDIO_FILE = path.join(__dirname, '../../assets/audio/voicemail-greeting.mp3');

/**
 * Owner-recorded greeting + voicemail Record.
 * Opt-in SMS is sent when this flow starts (while the caller is still listening).
 */
function appendVoicemailTwiML(response) {
  if (fs.existsSync(GREETING_AUDIO_FILE)) {
    // Absolute URL so Twilio can fetch the file after Railway domain changes.
    const audioUrl = `${config.appUrl.replace(/\/$/, '')}${consentCopy.VOICEMAIL_GREETING_AUDIO_PATH}`;
    response.play(audioUrl);
  } else {
    console.warn('[voice] Greeting audio missing — falling back to TTS');
    response.say({ voice: 'Polly.Joanna' }, consentCopy.VOICEMAIL_GREETING);
  }

  response.record({
    maxLength: 120,
    playBeep: true,
    timeout: 5,
    trim: 'trim-silence',
    finishOnKey: '#',
    action: '/webhooks/voice/voicemail-complete',
    method: 'POST',
  });
  response.hangup();
}

/** Start voicemail + fire opt-in SMS immediately (lands during the ~24s recording). */
async function startVoicemailAndOptIn({ response, res, from, to, callSid, logPrefix }) {
  markPendingOptIn(callSid);
  appendVoicemailTwiML(response);
  res.type('text/xml');
  res.send(response.toString());

  try {
    await processMissedCall({ from, to, callSid, sendSms: true });
  } catch (err) {
    console.error(`${logPrefix} Opt-in SMS error:`, err.message);
  }
}

/** Build lead update payload from AI extraction + current lead state. */
function buildLeadUpdates(lead, result) {
  const updates = {};

  if (result.extracted_name) updates.name = result.extracted_name;
  if (result.extracted_email) updates.email = result.extracted_email;
  if (result.extracted_need) updates.need_summary = result.extracted_need;
  if (result.extracted_preferred_time) updates.preferred_time = result.extracted_preferred_time;
  if (result.extracted_location) updates.location = result.extracted_location;

  const name = updates.name || lead.name;
  const need = updates.need_summary || lead.need_summary;
  const time = updates.preferred_time || lead.preferred_time;
  const location = updates.location || lead.location;

  if (time && location && name && need) {
    updates.status = STATUSES.PENDING_CONFIRMATION;
  } else if (
    lead.status === STATUSES.NEW ||
    lead.status === STATUSES.CONTACTED ||
    lead.status === STATUSES.QUALIFYING ||
    lead.status === STATUSES.AWAITING_CONSENT
  ) {
    updates.status = STATUSES.QUALIFYING;
  }

  return updates;
}

const WebhookController = {
  /**
   * Incoming call on the Twilio number:
   * 1) If OWNER_PHONE_NUMBER is set → ring the owner first (they can pick up).
   * 2) Otherwise → recorded greeting + voicemail; opt-in SMS fires as greeting starts.
   */
  async handleIncomingCall(req, res) {
    const response = new VoiceResponse();
    const ownerPhone = config.twilio.ownerPhoneNumber;
    const { From, To, CallSid } = req.body;

    console.log(`[voice/incoming] From=${From} To=${To} CallSid=${CallSid} owner=${ownerPhone || 'none'}`);

    if (ownerPhone) {
      const dial = response.dial({
        timeout: config.twilio.ownerRingTimeoutSeconds,
        action: '/webhooks/voice/dial-result',
        method: 'POST',
        callerId: config.twilio.phoneNumber || undefined,
        answerOnBridge: true,
      });
      dial.number(ownerPhone);

      res.type('text/xml');
      res.send(response.toString());
      console.log(
        `[voice/incoming] Dialing owner ${ownerPhone} (${config.twilio.ownerRingTimeoutSeconds}s) for ${From}`
      );
      return;
    }

    await startVoicemailAndOptIn({
      response,
      res,
      from: From,
      to: To,
      callSid: CallSid,
      logPrefix: '[voice/incoming]',
    });
  },

  /**
   * Dial finished. If the owner answered, end quietly. If not, play recording + send opt-in.
   */
  async handleDialResult(req, res) {
    const { DialCallStatus, From, To, CallSid } = req.body;
    const response = new VoiceResponse();

    console.log(`[voice/dial-result] DialCallStatus=${DialCallStatus} CallSid=${CallSid}`);

    if (!DIAL_MISSED.has(DialCallStatus)) {
      response.hangup();
      res.type('text/xml');
      return res.send(response.toString());
    }

    await startVoicemailAndOptIn({
      response,
      res,
      from: From,
      to: To,
      callSid: CallSid,
      logPrefix: '[voice/dial-result]',
    });
  },

  /**
   * After Record completes — thank caller and hang up.
   * Opt-in SMS should already have been sent when the greeting started; this is a backup only.
   */
  async handleVoicemailComplete(req, res) {
    const { From, To, CallSid, RecordingDuration } = req.body;
    console.log(
      `[voice/voicemail-complete] From=${From} To=${To} CallSid=${CallSid} RecordingDuration=${RecordingDuration}`
    );

    const response = new VoiceResponse();
    response.say({ voice: 'Polly.Joanna' }, consentCopy.VOICEMAIL_THANKS);
    response.hangup();
    res.type('text/xml');
    res.send(response.toString());

    if (hasPendingOptIn(CallSid)) {
      try {
        await processMissedCall({ from: From, to: To, callSid: CallSid, sendSms: true });
      } catch (err) {
        console.error('[voice/voicemail-complete] Opt-in backup error:', err.message);
      }
    }
  },

  async handleCallStatus(req, res) {
    const { CallStatus, From, CallSid, To } = req.body;
    res.sendStatus(200);

    console.log(`[voice/status] CallStatus=${CallStatus} From=${From} CallSid=${CallSid}`);

    // Backup if caller hung up before opt-in SMS was sent.
    if (CallStatus === 'completed' && hasPendingOptIn(CallSid)) {
      try {
        await processMissedCall({ from: From, to: To, callSid: CallSid, sendSms: true });
      } catch (err) {
        console.error('[voice/status] Opt-in backup error:', err.message);
      }
      return;
    }

    if (config.twilio.ownerPhoneNumber) return;
    if (!MISSED_STATUSES.has(CallStatus)) return;

    try {
      await processMissedCall({ from: From, to: To, callSid: CallSid, sendSms: true });
    } catch (err) {
      console.error('[voice/status] Error:', err.message);
    }
  },

  async handleInboundSms(req, res) {
    const { From, Body, To } = req.body;
    const twiml = new MessagingResponse();
    const messageBody = (Body || '').trim();
    const mediaItems = photoService.parseInboundMedia(req.body);

    try {
      const account = resolveAccount(To);
      if (!account) {
        console.error('[sms/inbound] No account resolved for To:', To);
        twiml.message('Sorry, this number is not configured.');
        res.type('text/xml');
        return res.send(twiml.toString());
      }

      const { leads, messages, photos } = forAccount(account.id);

      let lead = leads.findByPhone(From);
      if (!lead) {
        // Cold inbound SMS: still require YES before any qualifying AI.
        lead = leads.create({ callerPhone: From });
        leads.update(lead.id, { status: STATUSES.AWAITING_CONSENT });
      }

      // Store inbound MMS photos (S3) before further processing
      for (const media of mediaItems) {
        try {
          const saved = await photoService.saveLeadPhoto({
            accountId: account.id,
            leadId: lead.id,
            mediaUrl: media.url,
            mimeType: media.contentType,
          });

          photos.create({
            leadId: lead.id,
            filePath: saved.storageKey,
            mimeType: saved.mimeType,
            storage: saved.storage,
          });

          console.log(`[sms/inbound] Photo saved to S3 for lead #${lead.id}: ${saved.storageKey}`);
        } catch (photoErr) {
          console.error('[sms/inbound] Photo save failed:', photoErr.message);
        }
      }

      const inboundLogBody =
        messageBody ||
        (mediaItems.length > 0 ? `[${mediaItems.length} photo(s) attached]` : '(empty message)');

      messages.create({
        leadId: lead.id,
        direction: MessageRepository.DIRECTIONS.INBOUND,
        body: inboundLogBody,
      });

      const keyword = consentService.classifyConsentReply(messageBody);

      // Carrier STOP — Twilio Advanced Opt-Out sends the phone SMS; we log it for chat parity
      if (keyword === 'stop') {
        consentService.handleStopOptOut({ lead, leads, messages });
        res.type('text/xml');
        return res.send(twiml.toString());
      }

      // START re-opens the consent gate (YES still required before AI qualify)
      if (keyword === 'start') {
        consentService.handleStartResubscribe({ lead, leads, messages });
        res.type('text/xml');
        return res.send(twiml.toString());
      }

      // After STOP: YES re-opens consent + qualifies; HELP sends compliance text; else silent
      if (lead.status === STATUSES.OPTED_OUT) {
        if (keyword === 'yes') {
          lead = leads.update(lead.id, { status: STATUSES.AWAITING_CONSENT });
          await consentService.handleAwaitingConsent({
            lead,
            from: From,
            messageBody,
            account,
            leads,
            messages,
          });
        } else if (keyword === 'help') {
          await smsService.sendSmsAndConfirm(From, consentCopy.HELP_SMS);
          messages.create({
            leadId: lead.id,
            direction: MessageRepository.DIRECTIONS.OUTBOUND,
            body: consentCopy.HELP_SMS,
          });
        }
        res.type('text/xml');
        return res.send(twiml.toString());
      }

      // Consent gate — wait for YES before any AI conversation
      if (
        lead.status === STATUSES.AWAITING_CONSENT ||
        lead.status === STATUSES.NEW ||
        lead.status === STATUSES.CONTACTED
      ) {
        await consentService.handleAwaitingConsent({
          lead,
          from: From,
          messageBody,
          account,
          leads,
          messages,
        });
        res.type('text/xml');
        return res.send(twiml.toString());
      }

      // Skip AI reply for already confirmed/closed leads — still store photos/messages
      if (lead.status === STATUSES.CONFIRMED || lead.status === STATUSES.CLOSED) {
        console.log(`[sms/inbound] Lead #${lead.id} is ${lead.status} — message logged only`);
        res.type('text/xml');
        return res.send(twiml.toString());
      }

      const history = messages.formatHistory(lead.id);
      const photoCount = photos.countByLead(lead.id);

      const result = await aiService.processQualifyingReply({
        accountId: account.id,
        businessName: account.name,
        conversationHistory: history,
        callerMessage: messageBody || inboundLogBody,
        photoCount,
      });

      const updates = buildLeadUpdates(lead, result);
      leads.update(lead.id, updates);

      const replyText = result.reply_sms || 'Thanks! We will be in touch shortly.';
      await smsService.sendSmsAndConfirm(From, replyText);

      messages.create({
        leadId: lead.id,
        direction: MessageRepository.DIRECTIONS.OUTBOUND,
        body: replyText,
      });

      console.log(`[sms/inbound] Lead #${lead.id} updated → ${updates.status || lead.status}`);
    } catch (err) {
      console.error('[sms/inbound] Error:', err.message);
      twiml.message('Sorry, something went wrong. Please try again later.');
    }

    res.type('text/xml');
    res.send(twiml.toString());
  },
};

module.exports = WebhookController;
