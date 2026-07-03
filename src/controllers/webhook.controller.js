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
const aiService = require('../services/ai.service');
const smsService = require('../services/sms.service');
const photoService = require('../services/photo.service');

const MISSED_STATUSES = new Set(['no-answer', 'busy', 'failed', 'canceled']);

/** Build lead update payload from AI extraction + current lead state. */
function buildLeadUpdates(lead, result) {
  const updates = {};
  const { STATUSES } = LeadRepository;

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
    lead.status === STATUSES.QUALIFYING
  ) {
    updates.status = STATUSES.QUALIFYING;
  }

  return updates;
}

const WebhookController = {
  handleIncomingCall(req, res) {
    const response = new VoiceResponse();
    response.reject({ reason: 'busy' });
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
        lead = leads.create({ callerPhone: From });
        leads.update(lead.id, { status: LeadRepository.STATUSES.QUALIFYING });
      }

      // Store inbound MMS photos (S3) before AI processing
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

      // Skip AI reply for already confirmed/closed leads — still store photos/messages
      if (
        lead.status === LeadRepository.STATUSES.CONFIRMED ||
        lead.status === LeadRepository.STATUSES.CLOSED
      ) {
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
