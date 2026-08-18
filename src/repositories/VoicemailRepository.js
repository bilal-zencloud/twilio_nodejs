/**
 * Lead voicemail repository — Twilio recordings stored in S3, scoped by account.
 */
const db = require('../../config/database');
const TenantScope = require('./TenantScope');

class VoicemailRepository extends TenantScope {
  create({
    leadId,
    callSid,
    recordingSid,
    filePath,
    twilioUrl,
    duration,
    storage = 's3',
  }) {
    const result = db
      .prepare(
        `INSERT INTO lead_voicemails (
           account_id, lead_id, call_sid, recording_sid, file_path, twilio_url, duration, storage
         ) VALUES (
           @accountId, @leadId, @callSid, @recordingSid, @filePath, @twilioUrl, @duration, @storage
         )`
      )
      .run({
        accountId: this.accountId,
        leadId,
        callSid: callSid || null,
        recordingSid: recordingSid || null,
        filePath: filePath || null,
        twilioUrl: twilioUrl || null,
        duration: duration != null ? Number(duration) : null,
        storage,
      });

    return this.findById(result.lastInsertRowid);
  }

  findById(id) {
    return db
      .prepare('SELECT * FROM lead_voicemails WHERE account_id = ? AND id = ?')
      .get(this.accountId, id);
  }

  findByLead(leadId) {
    return db
      .prepare(
        `SELECT * FROM lead_voicemails
         WHERE account_id = ? AND lead_id = ?
         ORDER BY created_at ASC`
      )
      .all(this.accountId, leadId);
  }
}

module.exports = VoicemailRepository;
