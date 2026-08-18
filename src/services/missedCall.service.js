/**
 * Shared missed-call handler — creates a lead for new inquiries and sends the
 * one-time A2P opt-in SMS. Repeat calls on an open lead attach to that record
 * and do not restart intake or re-send opt-in.
 */
const { forAccount } = require('../repositories');
const LeadRepository = require('../repositories/LeadRepository');
const MessageRepository = require('../repositories/MessageRepository');
const { resolveAccount } = require('./account.service');
const smsService = require('./sms.service');
const consentCopy = require('../../config/consent');

/** Dedupes voice + voicemail-complete + status webhooks for the same call. */
const GREETING_COOLDOWN_MINUTES = 5;
const processing = new Set();

/** CallSids that entered the voicemail path (eligible for opt-in / completed backup). */
const pendingOptInByCallSid = new Set();

const { STATUSES } = LeadRepository;

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

async function sendOptIn({ from, to, callSid, lead, leads, messages }) {
  console.log(`[missed-call] Sending opt-in SMS to ${from} (To was ${to})`);
  await smsService.sendSmsAndConfirm(from, consentCopy.OPT_IN_SMS, { waitMs: 0 });

  messages.create({
    leadId: lead.id,
    direction: MessageRepository.DIRECTIONS.OUTBOUND,
    body: consentCopy.OPT_IN_SMS,
  });

  leads.update(lead.id, { status: STATUSES.AWAITING_CONSENT });
  leads.touchActivity(lead.id);
  clearPendingOptIn(callSid);
  console.log(`[missed-call] Opt-in SMS sent to ${from}`);
  return leads.findById(lead.id);
}

/**
 * Create a new lead (or attach to an open one) and optionally send the opt-in SMS.
 * Closed leads are left untouched — a new inquiry gets a new lead.
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

  for (let i = 0; i < 20 && processing.has(key); i++) {
    await new Promise((r) => setTimeout(r, 100));
  }

  if (processing.has(key)) {
    console.log(`[missed-call] Still locked for ${from} after wait — proceeding carefully`);
  }

  processing.add(key);

  try {
    let lead = leads.findOpenByPhone(from);

    if (lead) {
      const isRepeat =
        LeadRepository.skipOptInOnRepeat(lead.status) ||
        Boolean(lead.call_sid && callSid && lead.call_sid !== callSid);

      leads.update(lead.id, { call_sid: callSid || lead.call_sid });
      leads.touchActivity(lead.id);
      lead = leads.findById(lead.id);

      if (LeadRepository.skipOptInOnRepeat(lead.status)) {
        clearPendingOptIn(callSid);
        console.log(
          `[missed-call] Repeat call for lead #${lead.id} (${lead.status}) — skipping opt-in SMS`
        );
        return { lead, isRepeat: true, accountId: account.id };
      }

      const alreadySent = hasRecentOptInSms(messages, lead.id);
      if (!sendSms || alreadySent) {
        clearPendingOptIn(callSid);
        if (alreadySent) {
          console.log(
            `[missed-call] Opt-in already sent to ${from} within ${GREETING_COOLDOWN_MINUTES}m, skipping SMS`
          );
        }
        return { lead, isRepeat, accountId: account.id };
      }

      try {
        lead = await sendOptIn({ from, to, callSid, lead, leads, messages });
      } catch (err) {
        leads.update(lead.id, { status: STATUSES.CONTACTED });
        console.error('[missed-call] SMS error (lead saved):', err.message);
        throw err;
      }

      return { lead, isRepeat, accountId: account.id };
    }

    lead = leads.create({ callerPhone: from, callSid: callSid || null });
    leads.update(lead.id, { status: STATUSES.AWAITING_CONSENT });
    console.log(`[missed-call] Lead #${lead.id} created for ${from}`);
    lead = leads.findById(lead.id);

    if (!sendSms) {
      return { lead, isRepeat: false, accountId: account.id };
    }

    try {
      lead = await sendOptIn({ from, to, callSid, lead, leads, messages });
    } catch (err) {
      leads.update(lead.id, { status: STATUSES.CONTACTED });
      console.error('[missed-call] SMS error (lead saved):', err.message);
      throw err;
    }

    return { lead, isRepeat: false, accountId: account.id };
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
