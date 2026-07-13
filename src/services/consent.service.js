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
 * Accepts YES / Y (with optional trailing punctuation). STOP and HELP are whole-word.
 * @returns {'yes' | 'stop' | 'help' | 'other'}
 */
function classifyConsentReply(body) {
  const raw = (body || '').trim();
  if (!raw) return 'other';

  const normalized = raw.replace(/[.!,]+$/g, '').trim().toUpperCase();

  if (normalized === 'YES' || normalized === 'Y') return 'yes';
  if (normalized === 'STOP') return 'stop';
  if (normalized === 'HELP') return 'help';
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

/**
 * Handle an inbound SMS while the lead is waiting for SMS consent.
 * Returns true if the gateway handled the message (caller must not run AI qualify).
 */
async function handleAwaitingConsent({ lead, from, messageBody, account, leads, messages }) {
  const keyword = classifyConsentReply(messageBody);

  if (keyword === 'stop') {
    leads.update(lead.id, { status: STATUSES.OPTED_OUT });
    console.log(`[consent] Lead #${lead.id} opted out via STOP`);
    return { handled: true, action: 'stop' };
  }

  if (keyword === 'help') {
    await sendAndLog({
      to: from,
      body: consentCopy.HELP_SMS,
      leadId: lead.id,
      messages,
    });
    // Remain in awaiting_consent
    console.log(`[consent] Lead #${lead.id} HELP reply sent`);
    return { handled: true, action: 'help' };
  }

  if (keyword === 'yes') {
    // Affirmative YES is already logged as inbound by the webhook controller.
    // Persist opt-in timestamp on the lead for compliance retention.
    const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    leads.update(lead.id, {
      status: STATUSES.QUALIFYING,
      sms_opted_in_at: now,
    });

    // Start the existing qualifying workflow (first AI question).
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

  // Unrecognized reply — one clarification SMS, stay waiting.
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
 * Global STOP handling for any active lead (carrier opt-out).
 */
async function handleStopOptOut({ lead, leads }) {
  leads.update(lead.id, { status: STATUSES.OPTED_OUT });
  console.log(`[consent] Lead #${lead.id} opted out via STOP`);
  return { handled: true, action: 'stop' };
}

module.exports = {
  classifyConsentReply,
  handleAwaitingConsent,
  handleStopOptOut,
  copy: consentCopy,
};
