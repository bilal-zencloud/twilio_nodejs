/**
 * Repository factory — creates tenant-scoped repositories for an account.
 * Every data access path goes through here with an explicit accountId.
 */
const AccountRepository = require('./AccountRepository');
const LeadRepository = require('./LeadRepository');
const MessageRepository = require('./MessageRepository');
const PromptConfigRepository = require('./PromptConfigRepository');

function forAccount(accountId) {
  return {
    leads: new LeadRepository(accountId),
    messages: new MessageRepository(accountId),
    prompts: new PromptConfigRepository(accountId),
  };
}

module.exports = {
  AccountRepository,
  LeadRepository,
  MessageRepository,
  PromptConfigRepository,
  forAccount,
};
