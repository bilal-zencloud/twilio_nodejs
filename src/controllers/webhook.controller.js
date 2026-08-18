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
const voicemailService = require('../services/voicemail.service');
const handoffService = require('../services/handoff.service');
const consentCopy = require('../../config/consent');

const MISSED_STATUSES = new Set(['no-answer', 'busy', 'failed', 'canceled']);
const DIAL_MISSED = new Set(['no-answer', 'busy', 'failed', 'canceled']);
const { STATUSES } = LeadRepository;

const GREETING_AUDIO_FILE = path.join(__dirname, '../../assets/audio/voicemail-greeting.mp3');

function appendVoicemailTwiML(response) {
  if (fs.existsSync(GREETING_AUDIO_FILE)) {
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

/** Start voicemail + fire opt-in SMS for new inquiries while the caller listens. */
async function startVoicemailAndOptIn({ response, res, from, to, callSid, logPrefix }) {
  markPendingOptIn(callSid);

  try {
    await processMissedCall({ from, to, callSid, sendSms: true });
  } catch (err) {
    console.error(`${logPrefix} Opt-in SMS error:`, err.message);
  }

  appendVoicemailTwiML(response);
  res.type('text/xml');
  res.send(response.toString());
}

function touchIncomingCall({ from, to, callSid }) {
  const account = resolveAccount(to);
  if (!account || !from) return null;

  const { leads } = forAccount(account.id);
  const existing = leads.findOpenByPhone(from);
  if (!existing) return null;

  leads.touchActivity(existing.id);
  return existing;
}

function buildLeadUpdates(lead, result) {
  const updates = {};

  if (result.extracted_name) updates.name = result.extracted_name;
  if (result.extracted_email) updates.email = result.extracted_email;
  if (result.extracted_vehicle) updates.vehicle = result.extracted_vehicle;
  if (result.extracted_need) updates.need_summary = result.extracted_need;
  if (result.extracted_preferred_time) updates.preferred_time = result.extracted_preferred_time;
  if (result.extracted_location) updates.location = result.extracted_location;

  if (
    lead.status === STATUSES.NEW ||
    lead.status === STATUSES.CONTACTED ||
    lead.status === STATUSES.QUALIFYING ||
    lead.status === STATUSES.AWAITING_CONSENT
  ) {
    updates.status = STATUSES.QUALIFYING;
  }

  return updates;
}

function isIntakeComplete(lead, updates, photoCount, result) {
  if (LeadRepository.isAiPaused(lead.status)) return false;

  const merged = { ...lead, ...updates };
  const hasCore = Boolean(
    merged.name &&
      merged.vehicle &&
      merged.need_summary &&
      merged.preferred_time &&
      merged.location
  );
  const photosOk = photoCount > 0 || result.photos_declined === true;
  return hasCore && photosOk && (result.intake_complete === true || hasCore);
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
    touchIncomingCall({ from: From, to: To, callSid: CallSid });

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
   * New inquiries get opt-in (backup). Repeat calls notify Devin with the recording.
   */
  async handleVoicemailComplete(req, res) {
    const {
      From,
      To,
      CallSid,
      RecordingDuration,
      RecordingUrl,
      RecordingSid,
    } = req.body;
    console.log(
      `[voice/voicemail-complete] From=${From} To=${To} CallSid=${CallSid} RecordingDuration=${RecordingDuration}`
    );

    let missed = null;
    try {
      missed = await processMissedCall({ from: From, to: To, callSid: CallSid, sendSms: true });
    } catch (err) {
      console.error('[voice/voicemail-complete] Opt-in backup error:', err.message);
    }

    if (missed?.lead && RecordingUrl) {
      try {
        const { voicemails, leads } = forAccount(missed.accountId);
        const saved = await voicemailService.saveVoicemail({
          accountId: missed.accountId,
          leadId: missed.lead.id,
          recordingUrl: RecordingUrl,
          recordingSid: RecordingSid,
          callSid: CallSid,
          duration: RecordingDuration,
          voicemails,
        });

        leads.touchActivity(missed.lead.id);

        if (missed.isRepeat) {
          await handoffService.notifyRepeatCall({
            accountId: missed.accountId,
            lead: missed.lead,
            voicemail: saved,
          });
        }
      } catch (err) {
        console.error('[voice/voicemail-complete] Voicemail save/notify error:', err.message);
      }
    }

    const response = new VoiceResponse();
    response.say({ voice: 'Polly.Joanna' }, consentCopy.VOICEMAIL_THANKS);
    response.hangup();
    res.type('text/xml');
    res.send(response.toString());
  },

  async handleCallStatus(req, res) {
    const { CallStatus, From, CallSid, To } = req.body;
    console.log(`[voice/status] CallStatus=${CallStatus} From=${From} CallSid=${CallSid}`);

    try {
      if (CallStatus === 'completed' && hasPendingOptIn(CallSid)) {
        await processMissedCall({ from: From, to: To, callSid: CallSid, sendSms: true });
      } else if (!config.twilio.ownerPhoneNumber && MISSED_STATUSES.has(CallStatus)) {
        await processMissedCall({ from: From, to: To, callSid: CallSid, sendSms: true });
      }
    } catch (err) {
      console.error('[voice/status] Error:', err.message);
    }

    res.sendStatus(200);
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

      let lead = leads.findOpenByPhone(From);
      if (!lead) {
        // New inquiry (including after a closed lead) — consent gate before AI.
        lead = leads.create({ callerPhone: From });
        leads.update(lead.id, { status: STATUSES.AWAITING_CONSENT });
      }

      leads.touchActivity(lead.id);

      const savedPhotos = [];
      for (const media of mediaItems) {
        try {
          const saved = await photoService.saveLeadPhoto({
            accountId: account.id,
            leadId: lead.id,
            mediaUrl: media.url,
            mimeType: media.contentType,
          });

          const row = photos.create({
            leadId: lead.id,
            filePath: saved.storageKey,
            mimeType: saved.mimeType,
            storage: saved.storage,
          });
          savedPhotos.push(row);

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

      if (keyword === 'stop') {
        consentService.handleStopOptOut({ lead, leads, messages });
        if (LeadRepository.isAiPaused(lead.status) || lead.status === STATUSES.QUALIFYING) {
          await handoffService.forwardToOwner({
            accountId: account.id,
            lead,
            messageBody: inboundLogBody,
            photos: savedPhotos,
          });
        }
        res.type('text/xml');
        return res.send(twiml.toString());
      }

      if (keyword === 'start' && lead.status === STATUSES.OPTED_OUT) {
        consentService.handleStartResubscribe({ lead, leads, messages });
        res.type('text/xml');
        return res.send(twiml.toString());
      }

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

      if (keyword === 'help') {
        await smsService.sendSmsAndConfirm(From, consentCopy.HELP_SMS);
        messages.create({
          leadId: lead.id,
          direction: MessageRepository.DIRECTIONS.OUTBOUND,
          body: consentCopy.HELP_SMS,
        });
        if (LeadRepository.isAiPaused(lead.status)) {
          await handoffService.forwardToOwner({
            accountId: account.id,
            lead,
            messageBody: inboundLogBody,
            photos: savedPhotos,
          });
        }
        res.type('text/xml');
        return res.send(twiml.toString());
      }

      if (LeadRepository.isAiPaused(lead.status)) {
        await handoffService.forwardToOwner({
          accountId: account.id,
          lead,
          messageBody: inboundLogBody,
          photos: savedPhotos.length ? savedPhotos : photos.findByLead(lead.id).slice(-5),
        });
        console.log(`[sms/inbound] Lead #${lead.id} is ${lead.status} — forwarded to owner, AI paused`);
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
      lead = leads.findById(lead.id);
      leads.touchActivity(lead.id);

      if (isIntakeComplete(lead, updates, photoCount, result)) {
        await handoffService.completeIntake({
          accountId: account.id,
          lead,
          lastMessage: inboundLogBody,
        });
        res.type('text/xml');
        return res.send(twiml.toString());
      }

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
