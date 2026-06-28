/**
 * Lead repository — all queries scoped by account_id.
 */
const db = require('../../config/database');
const TenantScope = require('./TenantScope');

const STATUSES = {
  NEW: 'new',
  CONTACTED: 'contacted',
  QUALIFYING: 'qualifying',
  CAPTURED: 'captured',
  CLOSED: 'closed',
};

class LeadRepository extends TenantScope {
  static STATUSES = STATUSES;

  create({ callerPhone, callSid }) {
    const result = db
      .prepare(
        `INSERT INTO leads (account_id, caller_phone, call_sid, status)
         VALUES (@accountId, @callerPhone, @callSid, @status)`
      )
      .run({
        accountId: this.accountId,
        callerPhone,
        callSid: callSid || null,
        status: STATUSES.NEW,
      });

    return this.findById(result.lastInsertRowid);
  }

  findById(id) {
    return db
      .prepare('SELECT * FROM leads WHERE account_id = ? AND id = ?')
      .get(this.accountId, id);
  }

  findByCallSid(callSid) {
    return db
      .prepare('SELECT * FROM leads WHERE account_id = ? AND call_sid = ?')
      .get(this.accountId, callSid);
  }

  findByPhone(callerPhone) {
    return db
      .prepare(
        `SELECT * FROM leads
         WHERE account_id = ? AND caller_phone = ?
         ORDER BY updated_at DESC LIMIT 1`
      )
      .get(this.accountId, callerPhone);
  }

  findAll() {
    return db
      .prepare(
        `SELECT * FROM leads WHERE account_id = ?
         ORDER BY created_at DESC`
      )
      .all(this.accountId);
  }

  update(id, fields) {
    const allowed = ['status', 'name', 'email', 'need_summary', 'call_sid'];
    const sets = [];
    const params = { accountId: this.accountId, id };

    for (const key of allowed) {
      if (fields[key] !== undefined) {
        sets.push(`${key} = @${key}`);
        params[key] = fields[key];
      }
    }

    if (sets.length === 0) return this.findById(id);

    sets.push("updated_at = datetime('now')");

    db.prepare(
      `UPDATE leads SET ${sets.join(', ')} WHERE account_id = @accountId AND id = @id`
    ).run(params);

    return this.findById(id);
  }
}

module.exports = LeadRepository;
