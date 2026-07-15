/**
 * Lead repository — all queries scoped by account_id.
 */
const db = require('../../config/database');
const TenantScope = require('./TenantScope');

const STATUSES = {
  NEW: 'new',
  CONTACTED: 'contacted',
  AWAITING_CONSENT: 'awaiting_consent',
  QUALIFYING: 'qualifying',
  CAPTURED: 'captured',
  PENDING_CONFIRMATION: 'pending_confirmation',
  CONFIRMED: 'confirmed',
  OPTED_OUT: 'opted_out',
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

  buildListWhere({ status, search } = {}) {
    const where = ['account_id = @accountId'];
    const params = { accountId: this.accountId };

    if (status && status !== 'all') {
      where.push('status = @status');
      params.status =
        status === 'action' ? STATUSES.PENDING_CONFIRMATION : status;
    }

    if (search) {
      where.push(`(
        lower(coalesce(name, '')) LIKE @search OR
        lower(caller_phone) LIKE @search OR
        lower(coalesce(need_summary, '')) LIKE @search OR
        lower(coalesce(location, '')) LIKE @search
      )`);
      params.search = `%${search.toLowerCase()}%`;
    }

    return { where: where.join(' AND '), params };
  }

  findPage({ page = 1, limit = 30, status = 'all', search = '' } = {}) {
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 30, 1), 30);
    const safePage = Math.max(parseInt(page, 10) || 1, 1);
    const offset = (safePage - 1) * safeLimit;
    const { where, params } = this.buildListWhere({
      status,
      search: search.trim(),
    });

    return db
      .prepare(
        `SELECT * FROM leads
         WHERE ${where}
         ORDER BY
           CASE status
             WHEN 'pending_confirmation' THEN 0
             ELSE 1
           END,
           created_at DESC
         LIMIT @limit OFFSET @offset`
      )
      .all({ ...params, limit: safeLimit, offset });
  }

  count({ status = 'all', search = '' } = {}) {
    const { where, params } = this.buildListWhere({
      status,
      search: search.trim(),
    });

    return db
      .prepare(`SELECT COUNT(*) AS count FROM leads WHERE ${where}`)
      .get(params).count;
  }

  stats() {
    const rows = db
      .prepare(
        `SELECT status, COUNT(*) AS count
         FROM leads
         WHERE account_id = ?
         GROUP BY status`
      )
      .all(this.accountId);

    const counts = Object.fromEntries(rows.map((r) => [r.status, r.count]));
    return {
      total: rows.reduce((sum, r) => sum + r.count, 0),
      pending: counts[STATUSES.PENDING_CONFIRMATION] || 0,
      confirmed: counts[STATUSES.CONFIRMED] || 0,
      active:
        (counts[STATUSES.NEW] || 0) +
        (counts[STATUSES.CONTACTED] || 0) +
        (counts[STATUSES.AWAITING_CONSENT] || 0) +
        (counts[STATUSES.QUALIFYING] || 0) +
        (counts[STATUSES.CAPTURED] || 0),
      awaitingConsent: counts[STATUSES.AWAITING_CONSENT] || 0,
      optedOut: counts[STATUSES.OPTED_OUT] || 0,
    };
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
      'sms_opted_in_at',
      'sms_consent_status',
      'sms_consent_method',
      'sms_consent_reply',
      'sms_consent_source',
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
