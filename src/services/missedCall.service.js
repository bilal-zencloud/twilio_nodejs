/**
 * Shared missed-call handler — creates or updates a lead and sends the AI greeting SMS.
 * One lead per phone number per account; repeat calls update the existing record.
 */
const { forAccount } = require('../repositories');
const LeadRepository = require('../repositories/LeadRepository');
const MessageRepository = require('../repositories/MessageRepository');
const { resolveAccount } = require('./account.service');
const aiService = require('./ai.service');
const smsService = require('./sms.service');

const GREETING_COOLDOWN_MINUTES = 5;
const processing = new Set();

function lockKey(accountId, phone) {
  return `${accountId}:${phone}`;
}

async function processMissedCall({ from, to, callSid }) {
  const account = resolveAccount(to);
  if (!account) {
    console.error('[missed-call] No account resolved for To:', to);
    return null;
  }

  const { leads, messages } = forAccount(account.id);
  const key = lockKey(account.id, from);

  if (processing.has(key)) {
    console.log(`[missed-call] Already in flight for ${from}, skipping duplicate webhook`);
    return leads.findByPhone(from);
  }

  processing.add(key);

  try {
    if (callSid) {
      const existing = leads.findByCallSid(callSid);
      if (existing) {
        console.log(`[missed-call] Already processed CallSid ${callSid} → lead #${existing.id}`);
        return existing;
      }
    }

    let lead = leads.findByPhone(from);
    if (lead) {
      leads.update(lead.id, { call_sid: callSid || lead.call_sid, status: LeadRepository.STATUSES.NEW });
      console.log(`[missed-call] Updated existing lead #${lead.id} for ${from}`);
    } else {
      lead = leads.create({ callerPhone: from, callSid: callSid || null });
      console.log(`[missed-call] Lead #${lead.id} created for ${from}`);
    }

    if (messages.hasRecentOutbound(lead.id, GREETING_COOLDOWN_MINUTES)) {
      console.log(
        `[missed-call] Greeting already sent to ${from} within ${GREETING_COOLDOWN_MINUTES}m, skipping SMS`
      );
      leads.update(lead.id, { status: LeadRepository.STATUSES.QUALIFYING });
      return lead;
    }

    try {
      const greeting = await aiService.generateGreeting(account.id, account.name);
      await smsService.sendSmsAndConfirm(from, greeting);

      messages.create({
        leadId: lead.id,
        direction: MessageRepository.DIRECTIONS.OUTBOUND,
        body: greeting,
      });

      leads.update(lead.id, { status: LeadRepository.STATUSES.QUALIFYING });
      console.log(`[missed-call] Greeting SMS sent to ${from}`);
    } catch (err) {
      leads.update(lead.id, { status: LeadRepository.STATUSES.CONTACTED });
      console.error('[missed-call] SMS/AI error (lead saved):', err.message);
    }

    return leads.findById(lead.id);
  } finally {
    processing.delete(key);
  }
}

module.exports = { processMissedCall };
