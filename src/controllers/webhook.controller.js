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

const MISSED_STATUSES = new Set(['no-answer', 'busy', 'failed', 'canceled']);

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

    try {
      const account = resolveAccount(To);
      if (!account) {
        console.error('[sms/inbound] No account resolved for To:', To);
        twiml.message('Sorry, this number is not configured.');
        res.type('text/xml');
        return res.send(twiml.toString());
      }

      const { leads, messages } = forAccount(account.id);

      let lead = leads.findByPhone(From);
      if (!lead) {
        lead = leads.create({ callerPhone: From });
        leads.update(lead.id, { status: LeadRepository.STATUSES.QUALIFYING });
      }

      messages.create({
        leadId: lead.id,
        direction: MessageRepository.DIRECTIONS.INBOUND,
        body: Body,
      });

      const history = messages.formatHistory(lead.id);
      const result = await aiService.processQualifyingReply({
        accountId: account.id,
        businessName: account.name,
        conversationHistory: history,
        callerMessage: Body,
      });

      const updates = { status: LeadRepository.STATUSES.QUALIFYING };
      if (result.extracted_name) updates.name = result.extracted_name;
      if (result.extracted_email) updates.email = result.extracted_email;
      if (result.extracted_need) updates.need_summary = result.extracted_need;
      if (result.is_complete) updates.status = LeadRepository.STATUSES.CAPTURED;

      leads.update(lead.id, updates);

      const replyText = result.reply_sms || 'Thanks! We will be in touch shortly.';
      await smsService.sendSmsAndConfirm(From, replyText);

      messages.create({
        leadId: lead.id,
        direction: MessageRepository.DIRECTIONS.OUTBOUND,
        body: replyText,
      });

      console.log(`[sms/inbound] Lead #${lead.id} updated → ${updates.status}`);
    } catch (err) {
      console.error('[sms/inbound] Error:', err.message);
      twiml.message('Sorry, something went wrong. Please try again later.');
    }

    res.type('text/xml');
    res.send(twiml.toString());
  },
};

module.exports = WebhookController;
