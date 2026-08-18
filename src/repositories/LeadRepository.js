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
  HUMAN_FOLLOW_UP: 'human_follow_up',
  OPTED_OUT: 'opted_out',
  CLOSED: 'closed',
};

const APPOINTMENT_TYPES = {
  INSPECTION: 'inspection',
  REPAIR: 'repair',
};

const PAUSED_AI_STATUSES = new Set([
  STATUSES.HUMAN_FOLLOW_UP,
  STATUSES.CONFIRMED,
  STATUSES.PENDING_CONFIRMATION,
  STATUSES.CAPTURED,
]);

const REPEAT_NO_OPT_IN_STATUSES = new Set([
  ...PAUSED_AI_STATUSES,
  STATUSES.QUALIFYING,
  STATUSES.OPTED_OUT,
]);

class LeadRepository extends TenantScope {
  static STATUSES = STATUSES;
  static APPOINTMENT_TYPES = APPOINTMENT_TYPES;
  static PAUSED_AI_STATUSES = PAUSED_AI_STATUSES;
  static REPEAT_NO_OPT_IN_STATUSES = REPEAT_NO_OPT_IN_STATUSES;

  static isAiPaused(status) {
    return PAUSED_AI_STATUSES.has(status);
  }

  static skipOptInOnRepeat(status) {
    return REPEAT_NO_OPT_IN_STATUSES.has(status);
  }

  create({ callerPhone, callSid }) {
    const result = db
      .prepare(
        `INSERT INTO leads (account_id, caller_phone, call_sid, status, last_activity_at)
         VALUES (@accountId, @callerPhone, @callSid, @status, datetime('now'))`
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

  /**
   * Latest lead for this phone, including closed records.
   * Prefer findOpenByPhone for inbound Twilio events.
   */
  findByPhone(callerPhone) {
    return db
      .prepare(
        `SELECT * FROM leads
         WHERE account_id = ? AND caller_phone = ?
         ORDER BY datetime(created_at) DESC LIMIT 1`
      )
      .get(this.accountId, callerPhone);
  }

  /** Latest non-closed lead for this phone — used to attach repeat activity. */
  findOpenByPhone(callerPhone) {
    return db
      .prepare(
        `SELECT * FROM leads
         WHERE account_id = ? AND caller_phone = ? AND status != ?
         ORDER BY datetime(created_at) DESC LIMIT 1`
      )
      .get(this.accountId, callerPhone, STATUSES.CLOSED);
  }

  findAll() {
    return db
      .prepare(
        `SELECT * FROM leads WHERE account_id = ?
         ORDER BY
           CASE status
             WHEN 'human_follow_up' THEN 0
             WHEN 'pending_confirmation' THEN 1
             ELSE 2
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
        status === 'action' ? STATUSES.HUMAN_FOLLOW_UP : status;
    }

    if (search) {
      where.push(`(
        lower(coalesce(name, '')) LIKE @search OR
        lower(caller_phone) LIKE @search OR
        lower(coalesce(need_summary, '')) LIKE @search OR
        lower(coalesce(vehicle, '')) LIKE @search OR
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
             WHEN 'human_follow_up' THEN 0
             WHEN 'pending_confirmation' THEN 1
             ELSE 2
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
      humanFollowUp: counts[STATUSES.HUMAN_FOLLOW_UP] || 0,
      closed: counts[STATUSES.CLOSED] || 0,
      active:
        (counts[STATUSES.NEW] || 0) +
        (counts[STATUSES.CONTACTED] || 0) +
        (counts[STATUSES.AWAITING_CONSENT] || 0) +
        (counts[STATUSES.QUALIFYING] || 0) +
        (counts[STATUSES.CAPTURED] || 0) +
        (counts[STATUSES.PENDING_CONFIRMATION] || 0) +
        (counts[STATUSES.HUMAN_FOLLOW_UP] || 0),
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
      'vehicle',
      'last_activity_at',
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

  touchActivity(id) {
    db.prepare(
      `UPDATE leads
       SET last_activity_at = datetime('now'), updated_at = datetime('now')
       WHERE account_id = ? AND id = ?`
    ).run(this.accountId, id);
    return this.findById(id);
  }

  close(id) {
    return this.update(id, { status: STATUSES.CLOSED });
  }
}

module.exports = LeadRepository;
