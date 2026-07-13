/**
 * Clear lead data for a fresh test run.
 * Keeps accounts, admins, and prompt configs.
 *
 * Usage:
 *   npm run clear:leads
 *
 * On Railway: open the API service shell and run the same command.
 */
require('dotenv').config();
const db = require('../config/database');

const before = {
  leads: db.prepare('SELECT COUNT(*) AS c FROM leads').get().c,
  messages: db.prepare('SELECT COUNT(*) AS c FROM messages').get().c,
  photos: db.prepare('SELECT COUNT(*) AS c FROM lead_photos').get().c,
};

const tx = db.transaction(() => {
  db.exec('DELETE FROM messages');
  db.exec('DELETE FROM lead_photos');
  db.exec('DELETE FROM leads');
});
tx();

// Ensure account name matches config/business.json after wipe workflows.
const business = require('../config/business.json');
db.prepare(
  `UPDATE accounts SET name = @name WHERE id = @id`
).run({
  name: business.name,
  id: process.env.DEFAULT_ACCOUNT_ID || 'demo-account-1',
});

const after = {
  leads: db.prepare('SELECT COUNT(*) AS c FROM leads').get().c,
  messages: db.prepare('SELECT COUNT(*) AS c FROM messages').get().c,
  photos: db.prepare('SELECT COUNT(*) AS c FROM lead_photos').get().c,
};

console.log('Cleared lead data:');
console.log(`  leads:    ${before.leads} → ${after.leads}`);
console.log(`  messages: ${before.messages} → ${after.messages}`);
console.log(`  photos:   ${before.photos} → ${after.photos}`);
console.log(`Account name set to: ${business.name}`);
