/**
 * Lead confirmation service — owner confirms from dashboard, sends confirmation SMS.
 */
const { forAccount, AccountRepository } = require('../repositories');
const LeadRepository = require('../repositories/LeadRepository');
const MessageRepository = require('../repositories/MessageRepository');
const aiService = require('./ai.service');
const smsService = require('./sms.service');

/**
 * Confirm a pending lead: tag inspection/repair, optionally adjust time, send SMS.
 */
async function confirmLead({ accountId, leadId, appointmentType, preferredTime }) {
  const { leads, messages } = forAccount(accountId);
  const lead = leads.findById(leadId);

  if (!lead) {
    throw new Error('Lead not found');
  }

  if (lead.status !== LeadRepository.STATUSES.PENDING_CONFIRMATION) {
    throw new Error('Lead is not pending confirmation');
  }

  const validTypes = Object.values(LeadRepository.APPOINTMENT_TYPES);
  if (!validTypes.includes(appointmentType)) {
    throw new Error('Invalid appointment type');
  }

  const account = AccountRepository.findById(accountId);
  const time = (preferredTime || lead.preferred_time || '').trim();
  const location = lead.location || '';

  if (!time || !location) {
    throw new Error('Lead is missing preferred time or location');
  }

  const smsBody = await aiService.generateConfirmationSms({
    accountId,
    businessName: account?.name || 'Our Business',
    appointmentType,
    customerName: lead.name,
    needSummary: lead.need_summary,
    location,
    preferredTime: time,
  });

  await smsService.sendSmsAndConfirm(lead.caller_phone, smsBody);

  messages.create({
    leadId: lead.id,
    direction: MessageRepository.DIRECTIONS.OUTBOUND,
    body: smsBody,
  });

  return leads.update(lead.id, {
    status: LeadRepository.STATUSES.CONFIRMED,
    appointment_type: appointmentType,
    preferred_time: time,
    confirmed_time: time,
  });
}

module.exports = { confirmLead };
