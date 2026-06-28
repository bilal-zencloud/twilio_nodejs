/**
 * Resolve the tenant account for an incoming webhook.
 * Production: match Twilio "To" number → account row.
 * Fallback: DEFAULT_ACCOUNT_ID from env (demo mode).
 */
const config = require('../../config/env');
const { AccountRepository } = require('../repositories');

function resolveAccount(twilioToNumber) {
  if (twilioToNumber) {
    const account = AccountRepository.findByTwilioNumber(twilioToNumber);
    if (account) return account;
  }

  return AccountRepository.findById(config.defaultAccountId);
}

module.exports = { resolveAccount };
