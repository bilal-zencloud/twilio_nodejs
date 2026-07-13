/**
 * Shared missed-call handler — creates/updates a lead and sends the one-time
 * A2P opt-in SMS. Qualifying conversation starts only after the caller replies YES.
 */
const { forAccount } = require('../repositories');
const LeadRepository = require('../repositories/LeadRepository');
const MessageRepository = require('../repositories/MessageRepository');
const { resolveAccount } = require('./account.service');
const smsService = require('./sms.service');
const consentCopy = require('../../config/consent');

const GREETING_COOLDOWN_MINUTES = 5;
const processing = new Set();

const { STATUSES } = LeadRepository;

/** Leads already past consent — do not reset or re-send the opt-in SMS. */
const IN_PIPELINE = new Set([
  STATUSES.QUALIFYING,
  STATUSES.CAPTURED,
  STATUSES.PENDING_CONFIRMATION,
  STATUSES.CONFIRMED,
]);

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

    if (lead && IN_PIPELINE.has(lead.status)) {
      leads.update(lead.id, { call_sid: callSid || lead.call_sid });
      console.log(
        `[missed-call] Lead #${lead.id} already ${lead.status} — skipping opt-in SMS`
      );
      return lead;
    }

    if (lead) {
      leads.update(lead.id, {
        call_sid: callSid || lead.call_sid,
        status: STATUSES.AWAITING_CONSENT,
      });
      console.log(`[missed-call] Updated existing lead #${lead.id} for ${from}`);
    } else {
      lead = leads.create({ callerPhone: from, callSid: callSid || null });
      leads.update(lead.id, { status: STATUSES.AWAITING_CONSENT });
      console.log(`[missed-call] Lead #${lead.id} created for ${from}`);
    }

    if (messages.hasRecentOutbound(lead.id, GREETING_COOLDOWN_MINUTES)) {
      console.log(
        `[missed-call] Opt-in already sent to ${from} within ${GREETING_COOLDOWN_MINUTES}m, skipping SMS`
      );
      leads.update(lead.id, { status: STATUSES.AWAITING_CONSENT });
      return leads.findById(lead.id);
    }

    try {
      await smsService.sendSmsAndConfirm(from, consentCopy.OPT_IN_SMS);

      messages.create({
        leadId: lead.id,
        direction: MessageRepository.DIRECTIONS.OUTBOUND,
        body: consentCopy.OPT_IN_SMS,
      });

      leads.update(lead.id, { status: STATUSES.AWAITING_CONSENT });
      console.log(`[missed-call] Opt-in SMS sent to ${from}`);
    } catch (err) {
      leads.update(lead.id, { status: STATUSES.CONTACTED });
      console.error('[missed-call] SMS error (lead saved):', err.message);
    }

    return leads.findById(lead.id);
  } finally {
    processing.delete(key);
  }
}

module.exports = { processMissedCall };
