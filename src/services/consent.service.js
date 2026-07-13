/**
 * A2P SMS consent gate — keyword parsing and awaiting-consent replies.
 */
const consentCopy = require('../../config/consent');
const LeadRepository = require('../repositories/LeadRepository');
const MessageRepository = require('../repositories/MessageRepository');
const aiService = require('./ai.service');
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
    const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    leads.update(lead.id, {
      status: STATUSES.QUALIFYING,
      sms_opted_in_at: now,
    });

    const greeting = await aiService.generateGreeting(account.id, account.name);
    await sendAndLog({
      to: from,
      body: greeting,
      leadId: lead.id,
      messages,
    });

    console.log(`[consent] Lead #${lead.id} opted in at ${now} — qualifying started`);
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
 * Global STOP handling — Twilio Advanced Opt-Out sends the phone confirmation;
 * we only log that text so the dashboard matches the phone thread.
 */
function handleStopOptOut({ lead, leads, messages }) {
  leads.update(lead.id, {
    status: STATUSES.OPTED_OUT,
    sms_opted_in_at: null,
  });
  if (messages) {
    logSystemOutbound(messages, lead.id, consentCopy.STOP_ACK_SMS);
  }
  console.log(`[consent] Lead #${lead.id} opted out via STOP`);
  return { handled: true, action: 'stop' };
}

/**
 * START after STOP — Twilio re-subscribes; we reopen the consent gate and log the ack.
 */
function handleStartResubscribe({ lead, leads, messages }) {
  leads.update(lead.id, {
    status: STATUSES.AWAITING_CONSENT,
    sms_opted_in_at: null,
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
  copy: consentCopy,
};
