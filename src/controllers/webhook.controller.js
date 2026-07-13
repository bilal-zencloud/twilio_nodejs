/**
 * Webhook controller — Twilio voice & SMS event handlers.
 */
const twilio = require('twilio');
const VoiceResponse = twilio.twiml.VoiceResponse;
const MessagingResponse = twilio.twiml.MessagingResponse;

const { forAccount } = require('../repositories');
const LeadRepository = require('../repositories/LeadRepository');
const MessageRepository = require('../repositories/MessageRepository');
const { resolveAccount } = require('../services/account.service');
const { processMissedCall } = require('../services/missedCall.service');
const consentService = require('../services/consent.service');
const aiService = require('../services/ai.service');
const smsService = require('../services/sms.service');
const photoService = require('../services/photo.service');
const consentCopy = require('../../config/consent');

const MISSED_STATUSES = new Set(['no-answer', 'busy', 'failed', 'canceled']);
const { STATUSES } = LeadRepository;

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
   * Answer the forwarded call with TTS disclosure + voicemail, then send the
   * one-time opt-in SMS (qualifying starts only after YES).
   */
  handleIncomingCall(req, res) {
    const response = new VoiceResponse();
    response.say({ voice: 'Polly.Joanna' }, consentCopy.VOICEMAIL_GREETING);
    response.record({
      maxLength: 120,
      playBeep: true,
      timeout: 5,
      trim: 'trim-silence',
    });
    response.say({ voice: 'Polly.Joanna' }, consentCopy.VOICEMAIL_THANKS);

    res.type('text/xml');
    res.send(response.toString());

    const { From, To, CallSid } = req.body;
    processMissedCall({ from: From, to: To, callSid: CallSid }).catch((err) => {
      console.error('[voice/incoming] Error:', err.message);
    });
  },

  async handleCallStatus(req, res) {
    const { CallStatus, From, CallSid, To } = req.body;
    res.sendStatus(200);

    // Backup path for carriers that report a missed status instead of connecting.
    // When we answer with Say/Record, status is typically "completed" and is skipped.
    if (!MISSED_STATUSES.has(CallStatus)) return;

    try {
      await processMissedCall({ from: From, to: To, callSid: CallSid });
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
