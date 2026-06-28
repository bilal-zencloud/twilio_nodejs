/**
 * Prompt config repository — editable AI prompts per tenant.
 * Keyed by account_id + prompt_type (e.g. greeting, qualify).
 */
const db = require('../../config/database');
const TenantScope = require('./TenantScope');

const PROMPT_TYPES = {
  GREETING: 'greeting',
  QUALIFY: 'qualify',
};

class PromptConfigRepository extends TenantScope {
  static PROMPT_TYPES = PROMPT_TYPES;

  findByType(promptType) {
    return db
      .prepare(
        `SELECT * FROM prompt_configs
         WHERE account_id = ? AND prompt_type = ?`
      )
      .get(this.accountId, promptType);
  }

  findAll() {
    return db
      .prepare(
        `SELECT * FROM prompt_configs WHERE account_id = ? ORDER BY prompt_type`
      )
      .all(this.accountId);
  }

  upsert({ promptType, systemPrompt, userPrompt }) {
    db.prepare(
      `INSERT INTO prompt_configs (account_id, prompt_type, system_prompt, user_prompt)
       VALUES (@accountId, @promptType, @systemPrompt, @userPrompt)
       ON CONFLICT(account_id, prompt_type) DO UPDATE SET
         system_prompt = excluded.system_prompt,
         user_prompt = excluded.user_prompt,
         updated_at = datetime('now')`
    ).run({
      accountId: this.accountId,
      promptType,
      systemPrompt,
      userPrompt,
    });

    return this.findByType(promptType);
  }
}

module.exports = PromptConfigRepository;
