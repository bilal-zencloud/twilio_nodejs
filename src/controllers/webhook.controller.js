/**
 * Webhook controller — Twilio voice & SMS event handlers.
 */
const twilio = require('twilio');
const VoiceResponse = twilio.twiml.VoiceResponse;
const MessagingResponse = twilio.twiml.MessagingResponse;

const config = require('../../config/env');
const { forAccount } = require('../repositories');
const LeadRepository = require('../repositories/LeadRepository');
const MessageRepository = require('../repositories/MessageRepository');
const { resolveAccount } = require('../services/account.service');
const { processMissedCall, hasPendingOptIn } = require('../services/missedCall.service');
const consentService = require('../services/consent.service');
const aiService = require('../services/ai.service');
const smsService = require('../services/sms.service');
const photoService = require('../services/photo.service');
const consentCopy = require('../../config/consent');

const MISSED_STATUSES = new Set(['no-answer', 'busy', 'failed', 'canceled']);
const DIAL_MISSED = new Set(['no-answer', 'busy', 'failed', 'canceled']);
const { STATUSES } = LeadRepository;

/**
 * TTS disclosure + Record. Always set `action` — without it Twilio re-requests
 * the current webhook after Record and the greeting loops forever.
 */
function appendVoicemailTwiML(response) {
  response.say({ voice: 'Polly.Joanna' }, consentCopy.VOICEMAIL_GREETING);
  response.record({
    maxLength: 120,
    playBeep: true,
    timeout: 5,
    trim: 'trim-silence',
    finishOnKey: '#',
    action: '/webhooks/voice/voicemail-complete',
    method: 'POST',
  });
  // Safety net if Record is skipped somehow
  response.hangup();
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
   * 2) Otherwise (carrier already forwarded after no-answer) → voicemail + opt-in.
   */
  handleIncomingCall(req, res) {
    const response = new VoiceResponse();
    const ownerPhone = config.twilio.ownerPhoneNumber;
    const { From, To, CallSid } = req.body;

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

    // No owner dial configured — assume call already forwarded after no-answer.
    // Create the lead now; send opt-in SMS after voicemail ends (more reliable than
    // fire-and-forget after this response, which Railway can cut off).
    appendVoicemailTwiML(response);
    res.type('text/xml');
    res.send(response.toString());

    processMissedCall({ from: From, to: To, callSid: CallSid, sendSms: false }).catch((err) => {
      console.error('[voice/incoming] Error:', err.message);
    });
  },

  /**
   * Dial finished. If the owner answered, end quietly. If not, play disclosure + voicemail.
   * Opt-in SMS is sent from voicemail-complete (or call completed backup).
   */
  handleDialResult(req, res) {
    const { DialCallStatus, From, To, CallSid } = req.body;
    const response = new VoiceResponse();

    console.log(`[voice/dial-result] DialCallStatus=${DialCallStatus} CallSid=${CallSid}`);

    if (!DIAL_MISSED.has(DialCallStatus)) {
      // Owner answered (completed) or unexpected success status — do not start AI flow.
      response.hangup();
      res.type('text/xml');
      return res.send(response.toString());
    }

    appendVoicemailTwiML(response);
    res.type('text/xml');
    res.send(response.toString());

    processMissedCall({ from: From, to: To, callSid: CallSid, sendSms: false }).catch((err) => {
      console.error('[voice/dial-result] Error:', err.message);
    });
  },

  /**
   * After Record completes (including silence timeout) — thank the caller, hang up,
   * and send the one-time opt-in SMS on this live request (avoids dropped background work).
   */
  async handleVoicemailComplete(req, res) {
    const { From, To, CallSid } = req.body;

    try {
      await processMissedCall({ from: From, to: To, callSid: CallSid, sendSms: true });
    } catch (err) {
      console.error('[voice/voicemail-complete] Error:', err.message);
    }

    const response = new VoiceResponse();
    response.say({ voice: 'Polly.Joanna' }, consentCopy.VOICEMAIL_THANKS);
    response.hangup();
    res.type('text/xml');
    res.send(response.toString());
  },

  async handleCallStatus(req, res) {
    const { CallStatus, From, CallSid, To } = req.body;
    res.sendStatus(200);

    // Backup: caller hung up during the greeting before Record's action fired.
    // Only send if this CallSid entered the voicemail path (never when owner answered).
    if (CallStatus === 'completed' && hasPendingOptIn(CallSid)) {
      try {
        await processMissedCall({ from: From, to: To, callSid: CallSid, sendSms: true });
      } catch (err) {
        console.error('[voice/status] Opt-in backup error:', err.message);
      }
      return;
    }

    // Legacy backup when carrier forwarding reports a missed status without Dial.
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

      // Carrier STOP — end automated messaging for this lead
      if (keyword === 'stop') {
        await consentService.handleStopOptOut({ lead, leads });
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
