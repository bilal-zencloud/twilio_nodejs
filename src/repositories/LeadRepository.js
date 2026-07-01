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
  PENDING_CONFIRMATION: 'pending_confirmation',
  CONFIRMED: 'confirmed',
  CLOSED: 'closed',
};

const APPOINTMENT_TYPES = {
  INSPECTION: 'inspection',
  REPAIR: 'repair',
};

class LeadRepository extends TenantScope {
  static STATUSES = STATUSES;
  static APPOINTMENT_TYPES = APPOINTMENT_TYPES;

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
         ORDER BY
           CASE status
             WHEN 'pending_confirmation' THEN 0
             ELSE 1
           END,
           created_at DESC`
      )
      .all(this.accountId);
  }

  update(id, fields) {
    const allowed = [
      'status',
      'name',
      'email',
      'need_summary',
      'preferred_time',
      'location',
      'appointment_type',
      'confirmed_time',
      'call_sid',
    ];
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
