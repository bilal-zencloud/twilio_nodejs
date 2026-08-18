/**
 * Owner handoff — summary SMS to Devin, pause AI, forward follow-ups, auto-close.
 */
const db = require('../../config/database');
const config = require('../../config/env');
const { forAccount } = require('../repositories');
const LeadRepository = require('../repositories/LeadRepository');
const MessageRepository = require('../repositories/MessageRepository');
const smsService = require('./sms.service');
const photoService = require('./photo.service');
const voicemailService = require('./voicemail.service');
const consentCopy = require('../../config/consent');

const { STATUSES } = LeadRepository;

function dashboardLeadUrl(leadId) {
  const base = (config.frontendUrl || '').replace(/\/$/, '');
  return base ? `${base}/leads/${leadId}` : '';
}

function clickablePhone(phone) {
  return phone || '';
}

function lastInboundBody(messages, leadId) {
  const rows = messages.findByLead(leadId);
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i].direction === MessageRepository.DIRECTIONS.INBOUND) {
      return rows[i].body;
    }
  }
  return '';
}

function buildIntakeSummary({ lead, lastMessage, photoLinks, voicemailUrl }) {
  const lines = [
    'New PDR intake ready',
    '',
    `Name: ${lead.name || '—'}`,
    'Phone:',
    clickablePhone(lead.caller_phone),
    `Vehicle: ${lead.vehicle || '—'}`,
    `Damage/service: ${lead.need_summary || '—'}`,
    `Location: ${lead.location || '—'}`,
    `Preferred time: ${lead.preferred_time || '—'}`,
  ];

  if (lastMessage) {
    lines.push('', `Latest customer message: ${lastMessage}`);
  }

  if (photoLinks.length) {
    lines.push('', 'Photos:');
    photoLinks.forEach((url, i) => lines.push(`${i + 1}. ${url}`));
  } else {
    lines.push('', 'Photos: none');
  }

  if (voicemailUrl) {
    lines.push('', `Voicemail: ${voicemailUrl}`);
  }

  const dash = dashboardLeadUrl(lead.id);
  if (dash) {
    lines.push('', `Dashboard: ${dash}`);
  }

  return lines.join('\n');
}

function buildFollowUpNotice({ lead, messageBody, photoLinks }) {
  const lines = [
    `Follow-up from ${lead.name || 'customer'}`,
    'Phone:',
    clickablePhone(lead.caller_phone),
    '',
    messageBody || '(no text)',
  ];

  if (photoLinks.length) {
    lines.push('', 'Photos:');
    photoLinks.forEach((url, i) => lines.push(`${i + 1}. ${url}`));
  }

  const dash = dashboardLeadUrl(lead.id);
  if (dash) lines.push('', `Dashboard: ${dash}`);

  return lines.join('\n');
}

function buildRepeatCallNotice({ lead, voicemailUrl, duration }) {
  const lines = [
    `Repeat missed call from ${lead.name || 'customer'}`,
    'Phone:',
    clickablePhone(lead.caller_phone),
    `Lead #${lead.id} (${lead.status.replace(/_/g, ' ')})`,
  ];

  if (voicemailUrl) {
    lines.push('', `Voicemail${duration ? ` (${duration}s)` : ''}: ${voicemailUrl}`);
  } else {
    lines.push('', 'No voicemail recording was saved.');
  }

  const dash = dashboardLeadUrl(lead.id);
  if (dash) lines.push('', `Dashboard: ${dash}`);

  return lines.join('\n');
}

async function logOwnerCopy(messages, leadId, body) {
  messages.create({
    leadId,
    direction: MessageRepository.DIRECTIONS.OUTBOUND,
    body: `[to Devin]\n${body}`,
  });
}

async function completeIntake({ accountId, lead, lastMessage }) {
  const { leads, messages, photos } = forAccount(accountId);
  const fresh = leads.findById(lead.id);
  if (!fresh) return null;

  if (fresh.status === STATUSES.HUMAN_FOLLOW_UP || fresh.status === STATUSES.CLOSED) {
    return fresh;
  }

  const photoRows = photos.findByLead(fresh.id);
  const photoLinks = await photoService.getSignedPhotoUrls(photoRows, { limit: 5 });
  const summary = buildIntakeSummary({
    lead: fresh,
    lastMessage: lastMessage || lastInboundBody(messages, fresh.id),
    photoLinks,
  });

  try {
    await smsService.sendOwnerMessage(summary, { mediaUrl: photoLinks });
    await logOwnerCopy(messages, fresh.id, summary);
    console.log(`[handoff] Owner summary sent for lead #${fresh.id}`);
  } catch (err) {
    console.error('[handoff] Owner summary failed:', err.message);
  }

  await smsService.sendSmsAndConfirm(fresh.caller_phone, consentCopy.HANDOFF_SMS, { waitMs: 0 });
  messages.create({
    leadId: fresh.id,
    direction: MessageRepository.DIRECTIONS.OUTBOUND,
    body: consentCopy.HANDOFF_SMS,
  });

  const updated = leads.update(fresh.id, { status: STATUSES.HUMAN_FOLLOW_UP });
  leads.touchActivity(fresh.id);
  console.log(`[handoff] Lead #${fresh.id} → human_follow_up; AI paused`);
  return updated;
}

async function forwardToOwner({ accountId, lead, messageBody, photos: photoRows }) {
  const { messages } = forAccount(accountId);
  const photoLinks = await photoService.getSignedPhotoUrls(photoRows || [], { limit: 5 });
  const body = buildFollowUpNotice({
    lead,
    messageBody,
    photoLinks,
  });

  try {
    await smsService.sendOwnerMessage(body, { mediaUrl: photoLinks });
    await logOwnerCopy(messages, lead.id, body);
    console.log(`[handoff] Follow-up forwarded for lead #${lead.id}`);
  } catch (err) {
    console.error('[handoff] Follow-up forward failed:', err.message);
  }
}

async function notifyRepeatCall({ accountId, lead, voicemail }) {
  const { messages } = forAccount(accountId);
  const voicemailUrl = voicemail ? await voicemailService.getSignedVoicemailUrl(voicemail) : null;
  const body = buildRepeatCallNotice({
    lead,
    voicemailUrl,
    duration: voicemail?.duration,
  });

  try {
    await smsService.sendOwnerMessage(body);
    await logOwnerCopy(messages, lead.id, body);
    console.log(`[handoff] Repeat-call notice sent for lead #${lead.id}`);
  } catch (err) {
    console.error('[handoff] Repeat-call notice failed:', err.message);
  }
}

function closeLead({ accountId, leadId }) {
  const { leads } = forAccount(accountId);
  const lead = leads.findById(leadId);
  if (!lead) {
    throw new Error('Lead not found');
  }
  if (lead.status === STATUSES.CLOSED) {
    return lead;
  }
  const closed = leads.close(leadId);
  console.log(`[handoff] Lead #${leadId} closed manually`);
  return closed;
}

function closeInactiveFollowUps() {
  const days = config.inactivityCloseDays || 30;
  const result = db
    .prepare(
      `UPDATE leads
       SET status = @closed, updated_at = datetime('now')
       WHERE status = @followUp
         AND datetime(COALESCE(last_activity_at, updated_at, created_at)) <= datetime('now', @window)`
    )
    .run({
      closed: STATUSES.CLOSED,
      followUp: STATUSES.HUMAN_FOLLOW_UP,
      window: `-${days} days`,
    });

  if (result.changes) {
    console.log(`[handoff] Auto-closed ${result.changes} Human Follow-Up lead(s) after ${days} days`);
  }
  return result.changes;
}

module.exports = {
  completeIntake,
  forwardToOwner,
  notifyRepeatCall,
  closeLead,
  closeInactiveFollowUps,
  buildIntakeSummary,
};
