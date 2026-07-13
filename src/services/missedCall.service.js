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

/** CallSids that entered the voicemail path (eligible for opt-in / completed backup). */
const pendingOptInByCallSid = new Set();

const { STATUSES } = LeadRepository;

/** Leads already consented and mid-pipeline — do not re-send opt-in. */
const CONSENTED_PIPELINE = new Set([
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

function looksLikeOptInSms(body) {
  return typeof body === 'string' && body.includes('Reply YES to continue');
}

/**
 * True if we already sent the opt-in SMS for this lead within the cooldown window.
 */
function hasRecentOptInSms(messages, leadId, withinMinutes = GREETING_COOLDOWN_MINUTES) {
  const rows = messages.findByLead(leadId);
  const cutoff = Date.now() - withinMinutes * 60 * 1000;

  return rows.some((m) => {
    if (m.direction !== MessageRepository.DIRECTIONS.OUTBOUND) return false;
    if (!looksLikeOptInSms(m.body)) return false;
    const created = Date.parse(m.created_at.includes('T') ? m.created_at : `${m.created_at}Z`);
    return Number.isFinite(created) && created >= cutoff;
  });
}

/**
 * Create/update the lead and optionally send the A2P opt-in SMS.
 *
 * Opt-in is skipped ONLY when the lead already has sms_opted_in_at and is still
 * in the post-consent pipeline (qualifying → confirmed). Legacy "qualifying"
 * leads without consent still receive the gate.
 */
async function processMissedCall({ from, to, callSid, sendSms = true }) {
  if (!from) {
    console.error('[missed-call] Missing From phone — cannot send opt-in SMS');
    return null;
  }

  const account = resolveAccount(to);
  if (!account) {
    console.error('[missed-call] No account resolved for To:', to);
    return null;
  }

  const { leads, messages } = forAccount(account.id);
  const key = lockKey(account.id, from);

  // Wait briefly if another webhook is mid-flight (avoid dropping the SMS send).
  for (let i = 0; i < 20 && processing.has(key); i++) {
    await new Promise((r) => setTimeout(r, 100));
  }

  if (processing.has(key)) {
    console.log(`[missed-call] Still locked for ${from} after wait — proceeding carefully`);
  }

  processing.add(key);

  try {
    let lead = leads.findByPhone(from);

    if (lead && CONSENTED_PIPELINE.has(lead.status) && lead.sms_opted_in_at) {
      leads.update(lead.id, { call_sid: callSid || lead.call_sid });
      clearPendingOptIn(callSid);
      console.log(
        `[missed-call] Lead #${lead.id} already consented (${lead.status}) — skipping opt-in SMS`
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

    lead = leads.findById(lead.id);

    if (!sendSms) {
      return lead;
    }

    if (hasRecentOptInSms(messages, lead.id)) {
      clearPendingOptIn(callSid);
      console.log(
        `[missed-call] Opt-in already sent to ${from} within ${GREETING_COOLDOWN_MINUTES}m, skipping SMS`
      );
      leads.update(lead.id, { status: STATUSES.AWAITING_CONSENT });
      return leads.findById(lead.id);
    }

    try {
      console.log(`[missed-call] Sending opt-in SMS to ${from} (To was ${to})`);
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
      throw err;
    }

    return leads.findById(lead.id);
  } finally {
    processing.delete(key);
  }
}

module.exports = {
  processMissedCall,
  hasRecentOptInSms,
  markPendingOptIn,
  hasPendingOptIn,
  clearPendingOptIn,
};
