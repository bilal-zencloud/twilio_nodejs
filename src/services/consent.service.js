/**
 * A2P SMS consent gate — keyword parsing and awaiting-consent replies.
 */
const consentCopy = require('../../config/consent');
const LeadRepository = require('../repositories/LeadRepository');
const MessageRepository = require('../repositories/MessageRepository');
const smsService = require('./sms.service');

const { STATUSES } = LeadRepository;

/**
 * Normalize an inbound SMS for consent keywords.
 * @returns {'yes' | 'stop' | 'help' | 'start' | 'other'}
 */
function classifyConsentReply(body) {
  const raw = (body || '').trim();
  if (!raw) return 'other';

  const normalized = raw.replace(/[.!,]+$/g, '').trim().toUpperCase();

  if (normalized === 'YES' || normalized === 'Y') return 'yes';
  if (normalized === 'STOP') return 'stop';
  if (normalized === 'HELP') return 'help';
  if (normalized === 'START') return 'start';
  return 'other';
}

async function sendAndLog({ to, body, leadId, messages }) {
  await smsService.sendSmsAndConfirm(to, body);
  messages.create({
    leadId,
    direction: MessageRepository.DIRECTIONS.OUTBOUND,
    body,
  });
}

/** Log a carrier/Twilio auto-reply in chat history without sending a duplicate SMS. */
function logSystemOutbound(messages, leadId, body) {
  messages.create({
    leadId,
    direction: MessageRepository.DIRECTIONS.OUTBOUND,
    body,
  });
}

/** Permanent consent proof payload when the caller replies YES / Y. */
function buildVerifiedConsentFields(messageBody) {
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const reply = (messageBody || 'YES').trim().toUpperCase().replace(/[.!,]+$/g, '') || 'YES';

  return {
    sms_opted_in_at: now,
    sms_consent_status: consentCopy.CONSENT_STATUS.VERIFIED,
    sms_consent_method: consentCopy.CONSENT_METHOD,
    sms_consent_reply: reply === 'Y' ? 'YES' : reply,
    sms_consent_source: consentCopy.CONSENT_SOURCE,
  };
}

/**
 * Handle an inbound SMS while the lead is waiting for SMS consent.
 */
async function handleAwaitingConsent({ lead, from, messageBody, account, leads, messages }) {
  const keyword = classifyConsentReply(messageBody);

  if (keyword === 'stop') {
    return handleStopOptOut({ lead, leads, messages });
  }

  if (keyword === 'start') {
    return handleStartResubscribe({ lead, leads, messages });
  }

  if (keyword === 'help') {
    await sendAndLog({
      to: from,
      body: consentCopy.HELP_SMS,
      leadId: lead.id,
      messages,
    });
    console.log(`[consent] Lead #${lead.id} HELP reply sent`);
    return { handled: true, action: 'help' };
  }

  if (keyword === 'yes') {
    const consentFields = buildVerifiedConsentFields(messageBody);
    leads.update(lead.id, {
      status: STATUSES.QUALIFYING,
      ...consentFields,
    });

    // Fixed opener after YES — not AI-generated.
    await sendAndLog({
      to: from,
      body: consentCopy.POST_OPT_IN_SMS,
      leadId: lead.id,
      messages,
    });

    console.log(
      `[consent] Lead #${lead.id} opted in at ${consentFields.sms_opted_in_at} — qualifying started`
    );
    return { handled: true, action: 'yes' };
  }

  await sendAndLog({
    to: from,
    body: consentCopy.CLARIFICATION_SMS,
    leadId: lead.id,
    messages,
  });
  console.log(`[consent] Lead #${lead.id} clarification sent`);
  return { handled: true, action: 'clarification' };
}

/**
 * Global STOP — Twilio Advanced Opt-Out sends the phone confirmation.
 * Keep original YES consent proof on the lead (compliance audit trail).
 */
function handleStopOptOut({ lead, leads, messages }) {
  leads.update(lead.id, {
    status: STATUSES.OPTED_OUT,
    sms_consent_status: consentCopy.CONSENT_STATUS.OPTED_OUT,
  });
  if (messages) {
    logSystemOutbound(messages, lead.id, consentCopy.STOP_ACK_SMS);
  }
  console.log(`[consent] Lead #${lead.id} opted out via STOP (consent proof retained)`);
  return { handled: true, action: 'stop' };
}

/**
 * START after STOP — reopen the consent gate; keep prior consent proof unless they YES again.
 */
function handleStartResubscribe({ lead, leads, messages }) {
  leads.update(lead.id, {
    status: STATUSES.AWAITING_CONSENT,
  });
  if (messages) {
    logSystemOutbound(messages, lead.id, consentCopy.START_ACK_SMS);
  }
  console.log(`[consent] Lead #${lead.id} re-subscribed via START — awaiting YES`);
  return { handled: true, action: 'start' };
}

module.exports = {
  classifyConsentReply,
  handleAwaitingConsent,
  handleStopOptOut,
  handleStartResubscribe,
  buildVerifiedConsentFields,
  copy: consentCopy,
};
