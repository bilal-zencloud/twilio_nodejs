/**
 * SQLite database setup with multi-tenant schema.
 *
 * Architecture:
 *  - accounts          → tenant root
 *  - leads             → account_id FK, indexed
 *  - messages          → account_id FK, indexed (SMS conversation log)
 *  - prompt_configs    → account_id + prompt_type, indexed (editable AI prompts)
 *
 * All tenant data access goes through src/repositories/ with mandatory account scope.
 */
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const config = require('./env');

const dbDir = path.dirname(path.resolve(config.databasePath));
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(config.databasePath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/** Migrate legacy table names. */
function migrateSchema() {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all()
    .map((t) => t.name);

  if (tables.includes('conversations') && !tables.includes('messages')) {
    db.exec('ALTER TABLE conversations RENAME TO messages');
  }
}

function initializeSchema() {
  migrateSchema();

  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      twilio_phone_number TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id TEXT NOT NULL,
      caller_phone TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new',
      name TEXT,
      email TEXT,
      need_summary TEXT,
      call_sid TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (account_id) REFERENCES accounts(id)
    );

    CREATE INDEX IF NOT EXISTS idx_leads_account ON leads(account_id);
    CREATE INDEX IF NOT EXISTS idx_leads_caller ON leads(account_id, caller_phone);
    CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(account_id, status);

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id TEXT NOT NULL,
      lead_id INTEGER NOT NULL,
      direction TEXT NOT NULL CHECK(direction IN ('inbound', 'outbound')),
      body TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (account_id) REFERENCES accounts(id),
      FOREIGN KEY (lead_id) REFERENCES leads(id)
    );

    CREATE INDEX IF NOT EXISTS idx_messages_account ON messages(account_id);
    CREATE INDEX IF NOT EXISTS idx_messages_lead ON messages(account_id, lead_id);

    CREATE TABLE IF NOT EXISTS prompt_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id TEXT NOT NULL,
      prompt_type TEXT NOT NULL,
      system_prompt TEXT NOT NULL,
      user_prompt TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (account_id) REFERENCES accounts(id),
      UNIQUE(account_id, prompt_type)
    );

    CREATE INDEX IF NOT EXISTS idx_prompt_configs_account ON prompt_configs(account_id);
  `);
}

function loadSeedJson(filename) {
  const filePath = path.join(__dirname, filename);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function seedDemoAccount() {
  const business = loadSeedJson('business.json') || { name: 'Our Business' };

  db.prepare(`
    INSERT INTO accounts (id, name, twilio_phone_number)
    VALUES (@id, @name, @twilio_phone_number)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      twilio_phone_number = excluded.twilio_phone_number
  `).run({
    id: config.defaultAccountId,
    name: business.name,
    twilio_phone_number: config.twilio.phoneNumber || null,
  });
}

/** Seed default prompt configs from config/prompts.json for the demo account. */
function seedPromptConfigs() {
  const prompts = loadSeedJson('prompts.json');
  if (!prompts) return;

  const stmt = db.prepare(`
    INSERT INTO prompt_configs (account_id, prompt_type, system_prompt, user_prompt)
    VALUES (@accountId, @promptType, @systemPrompt, @userPrompt)
    ON CONFLICT(account_id, prompt_type) DO NOTHING
  `);

  for (const [promptType, config_] of Object.entries(prompts)) {
    stmt.run({
      accountId: config.defaultAccountId,
      promptType,
      systemPrompt: config_.system,
      userPrompt: config_.user,
    });
  }
}

initializeSchema();
seedDemoAccount();
seedPromptConfigs();

module.exports = db;
