/**
 * Seed-only business name — loaded into accounts.name on startup.
 * To change at runtime, UPDATE accounts SET name = '...' WHERE id = 'demo-account-1';
 * or edit this file and restart the server.
 */
const fs = require('fs');
const path = require('path');

const BUSINESS_PATH = path.join(__dirname, 'business.json');

function loadBusinessConfig() {
  const raw = fs.readFileSync(BUSINESS_PATH, 'utf8');
  return JSON.parse(raw);
}

module.exports = { loadBusinessConfig };
