/**
 * Anthropic AI service — loads prompts from prompt_configs table per account.
 */
const Anthropic = require('@anthropic-ai/sdk');
const config = require('../../config/env');
const { forAccount } = require('../repositories');
const PromptConfigRepository = require('../repositories/PromptConfigRepository');

let client = null;

function getClient() {
  if (!client) {
    client = new Anthropic({ apiKey: config.anthropic.apiKey });
  }
  return client;
}

/** Replace {{placeholders}} in a template string. */
function interpolate(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
}

function loadPrompt(accountId, promptType) {
  const { prompts } = forAccount(accountId);
  const row = prompts.findByType(promptType);
  if (!row) {
    throw new Error(`Prompt config not found: account=${accountId} type=${promptType}`);
  }
  return { system: row.system_prompt, user: row.user_prompt };
}

/**
 * Generate the initial greeting SMS after a missed call.
 */
async function generateGreeting(accountId, businessName) {
  const prompt = loadPrompt(accountId, PromptConfigRepository.PROMPT_TYPES.GREETING);
  const vars = { business_name: businessName };

  const response = await getClient().messages.create({
    model: config.anthropic.model,
    max_tokens: 256,
    system: interpolate(prompt.system, vars),
    messages: [{ role: 'user', content: interpolate(prompt.user, vars) }],
  });

  return response.content[0].text.trim();
}

/**
 * Process a caller's SMS reply: extract lead fields and craft follow-up SMS.
 */
async function processQualifyingReply({
  accountId,
  businessName,
  conversationHistory,
  callerMessage,
}) {
  const prompt = loadPrompt(accountId, PromptConfigRepository.PROMPT_TYPES.QUALIFY);
  const vars = {
    business_name: businessName,
    conversation_history: conversationHistory,
    caller_message: callerMessage,
  };

  const response = await getClient().messages.create({
    model: config.anthropic.model,
    max_tokens: 512,
    system: interpolate(prompt.system, vars),
    messages: [{ role: 'user', content: interpolate(prompt.user, vars) }],
  });

  const raw = response.content[0].text.trim();
  const jsonText = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(jsonText);
}

module.exports = { generateGreeting, processQualifyingReply, loadPrompt };
