/**
 * SQLite database setup with multi-tenant schema.
 *
 * Architecture:
 *  - accounts          → tenant root
 *  - admins            → dashboard login (nullable account_id: null = global, else per-tenant)
 *  - leads             → account_id FK, indexed
 *  - messages          → account_id FK, indexed (SMS conversation log)
 *  - lead_photos       → account_id FK, MMS images tied to leads (S3 storage keys)
 *  - prompt_configs    → account_id + prompt_type, indexed (editable AI prompts)
 *
 * All tenant data access goes through src/repositories/ with mandatory account scope.
 */
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');
const config = require('./env');

const dbDir = path.dirname(path.resolve(config.databasePath));
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(config.databasePath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function columnExists(table, column) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  return cols.some((c) => c.name === column);
}

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

/** Wave 2 — scheduling fields, photos table. */
function migrateWave2Schema() {
  const leadColumns = [
    ['preferred_time', 'TEXT'],
    ['location', 'TEXT'],
    ['appointment_type', 'TEXT'],
    ['confirmed_time', 'TEXT'],
  ];

  for (const [name, type] of leadColumns) {
    if (!columnExists('leads', name)) {
      db.exec(`ALTER TABLE leads ADD COLUMN ${name} ${type}`);
    }
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS lead_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id TEXT NOT NULL,
      lead_id INTEGER NOT NULL,
      file_path TEXT NOT NULL,
      mime_type TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (account_id) REFERENCES accounts(id),
      FOREIGN KEY (lead_id) REFERENCES leads(id)
    );

    CREATE INDEX IF NOT EXISTS idx_lead_photos_account ON lead_photos(account_id);
    CREATE INDEX IF NOT EXISTS idx_lead_photos_lead ON lead_photos(account_id, lead_id);
  `);
}

/** Milestone 3 — admin login + S3 photo storage. */
function migrateAdminsAndStorage() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id TEXT,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (account_id) REFERENCES accounts(id)
    );

    CREATE INDEX IF NOT EXISTS idx_admins_account ON admins(account_id);
  `);

  // Storage backend column for lead_photos ('local' legacy | 's3').
  if (!columnExists('lead_photos', 'storage')) {
    db.exec("ALTER TABLE lead_photos ADD COLUMN storage TEXT NOT NULL DEFAULT 'local'");
  }
}

/** A2P SMS consent — retain affirmative opt-in proof permanently. */
function migrateConsentSchema() {
  if (!columnExists('leads', 'sms_opted_in_at')) {
    db.exec('ALTER TABLE leads ADD COLUMN sms_opted_in_at TEXT');
  }
  if (!columnExists('leads', 'sms_consent_status')) {
    db.exec('ALTER TABLE leads ADD COLUMN sms_consent_status TEXT');
  }
  if (!columnExists('leads', 'sms_consent_method')) {
    db.exec('ALTER TABLE leads ADD COLUMN sms_consent_method TEXT');
  }
  if (!columnExists('leads', 'sms_consent_reply')) {
    db.exec('ALTER TABLE leads ADD COLUMN sms_consent_reply TEXT');
  }
  if (!columnExists('leads', 'sms_consent_source')) {
    db.exec('ALTER TABLE leads ADD COLUMN sms_consent_source TEXT');
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
      preferred_time TEXT,
      location TEXT,
      appointment_type TEXT,
      confirmed_time TEXT,
      call_sid TEXT,
      sms_opted_in_at TEXT,
      sms_consent_status TEXT,
      sms_consent_method TEXT,
      sms_consent_reply TEXT,
      sms_consent_source TEXT,
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

  migrateWave2Schema();
  migrateAdminsAndStorage();
  migrateConsentSchema();
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

function seedWave2Prompts() {
  const prompts = loadSeedJson('prompts.json');
  if (!prompts) return;

  const upsert = db.prepare(`
    INSERT INTO prompt_configs (account_id, prompt_type, system_prompt, user_prompt)
    VALUES (@accountId, @promptType, @systemPrompt, @userPrompt)
    ON CONFLICT(account_id, prompt_type) DO UPDATE SET
      system_prompt = excluded.system_prompt,
      user_prompt = excluded.user_prompt,
      updated_at = datetime('now')
  `);

  const wave2Types = ['greeting', 'qualify', 'confirmation'];
  const accountIds = db.prepare('SELECT id FROM accounts').all().map((a) => a.id);

  for (const accountId of accountIds) {
    for (const promptType of wave2Types) {
      if (!prompts[promptType]) continue;
      upsert.run({
        accountId,
        promptType,
        systemPrompt: prompts[promptType].system,
        userPrompt: prompts[promptType].user,
      });
    }
  }
}

/**
 * Seed the first admin from ADMIN_EMAIL / ADMIN_PASSWORD on first run.
 * Only runs if no admin exists. Global admin (account_id NULL) for now.
 */
function seedDefaultAdmin() {
  const existing = db.prepare('SELECT COUNT(*) AS c FROM admins').get().c;
  if (existing > 0) return;

  const email = config.auth.defaultAdminEmail;
  const password = config.auth.defaultAdminPassword;

  if (!email || !password) {
    console.warn('[db] No ADMIN_EMAIL/ADMIN_PASSWORD set — skipping default admin seed.');
    return;
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  db.prepare(
    `INSERT INTO admins (account_id, email, password_hash)
     VALUES (NULL, @email, @passwordHash)`
  ).run({ email, passwordHash });

  console.log(`[db] Seeded default admin: ${email}`);
  if (password === 'changeme') {
    console.warn('[db] ⚠  Default password in use — change it via the dashboard.');
  }
}

initializeSchema();
seedDemoAccount();
seedPromptConfigs();
seedWave2Prompts();
seedDefaultAdmin();

module.exports = db;
