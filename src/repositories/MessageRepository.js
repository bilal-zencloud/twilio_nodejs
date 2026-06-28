/**
 * Message repository — SMS log; all queries scoped by account_id.
 */
const db = require('../../config/database');
const TenantScope = require('./TenantScope');

const DIRECTIONS = {
  INBOUND: 'inbound',
  OUTBOUND: 'outbound',
};

class MessageRepository extends TenantScope {
  static DIRECTIONS = DIRECTIONS;

  create({ leadId, direction, body }) {
    const result = db
      .prepare(
        `INSERT INTO messages (account_id, lead_id, direction, body)
         VALUES (@accountId, @leadId, @direction, @body)`
      )
      .run({ accountId: this.accountId, leadId, direction, body });

    return this.findById(result.lastInsertRowid);
  }

  findById(id) {
    return db
      .prepare('SELECT * FROM messages WHERE account_id = ? AND id = ?')
      .get(this.accountId, id);
  }

  findByLead(leadId) {
    return db
      .prepare(
        `SELECT * FROM messages
         WHERE account_id = ? AND lead_id = ?
         ORDER BY created_at ASC`
      )
      .all(this.accountId, leadId);
  }

  hasRecentOutbound(leadId, withinMinutes = 5) {
    const row = db
      .prepare(
        `SELECT 1 FROM messages
         WHERE account_id = ? AND lead_id = ? AND direction = 'outbound'
           AND datetime(created_at) > datetime('now', ?)
         LIMIT 1`
      )
      .get(this.accountId, leadId, `-${withinMinutes} minutes`);
    return !!row;
  }

  formatHistory(leadId) {
    const messages = this.findByLead(leadId);
    return messages
      .map((m) => {
        const role = m.direction === 'outbound' ? 'Business' : 'Caller';
        return `${role}: ${m.body}`;
      })
      .join('\n');
  }
}

module.exports = MessageRepository;
