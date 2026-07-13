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

/** CallSids that entered the voicemail path and still need an opt-in SMS. */
const pendingOptInByCallSid = new Set();

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

function markPendingOptIn(callSid) {
  if (callSid) pendingOptInByCallSid.add(callSid);
}

function hasPendingOptIn(callSid) {
  return Boolean(callSid && pendingOptInByCallSid.has(callSid));
}

function clearPendingOptIn(callSid) {
  if (callSid) pendingOptInByCallSid.delete(callSid);
}

/**
 * @param {{ from: string, to: string, callSid?: string, sendSms?: boolean }} opts
 *   sendSms — when false, only create/update the lead (voicemail starting).
 *             when true (default), send the opt-in SMS if needed.
 */
async function processMissedCall({ from, to, callSid, sendSms = true }) {
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
    let lead = leads.findByPhone(from);

    if (lead && IN_PIPELINE.has(lead.status)) {
      leads.update(lead.id, { call_sid: callSid || lead.call_sid });
      clearPendingOptIn(callSid);
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

    if (!sendSms) {
      markPendingOptIn(callSid);
      return leads.findById(lead.id);
    }

    if (messages.hasRecentOutbound(lead.id, GREETING_COOLDOWN_MINUTES)) {
      clearPendingOptIn(callSid);
      console.log(
        `[missed-call] Opt-in already sent to ${from} within ${GREETING_COOLDOWN_MINUTES}m, skipping SMS`
      );
      leads.update(lead.id, { status: STATUSES.AWAITING_CONSENT });
      return leads.findById(lead.id);
    }

    try {
      // Don't block the voice webhook on delivery polling — create the message and move on.
      await smsService.sendSmsAndConfirm(from, consentCopy.OPT_IN_SMS, { waitMs: 0 });

      messages.create({
        leadId: lead.id,
        direction: MessageRepository.DIRECTIONS.OUTBOUND,
        body: consentCopy.OPT_IN_SMS,
      });

      leads.update(lead.id, { status: STATUSES.AWAITING_CONSENT });
      clearPendingOptIn(callSid);
      console.log(`[missed-call] Opt-in SMS sent to ${from}`);
    } catch (err) {
      leads.update(lead.id, { status: STATUSES.CONTACTED });
      console.error('[missed-call] SMS error (lead saved):', err.message);
      // Keep pending so call-status completed can retry once.
    }

    return leads.findById(lead.id);
  } finally {
    processing.delete(key);
  }
}

module.exports = {
  processMissedCall,
  markPendingOptIn,
  hasPendingOptIn,
  clearPendingOptIn,
};
