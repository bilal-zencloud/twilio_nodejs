/**
 * Lead photo repository — MMS images scoped by account_id.
 * `file_path` holds the S3 object key when `storage = 's3'`.
 */
const db = require('../../config/database');
const TenantScope = require('./TenantScope');

class LeadPhotoRepository extends TenantScope {
  create({ leadId, filePath, mimeType, storage = 's3' }) {
    const result = db
      .prepare(
        `INSERT INTO lead_photos (account_id, lead_id, file_path, mime_type, storage)
         VALUES (@accountId, @leadId, @filePath, @mimeType, @storage)`
      )
      .run({
        accountId: this.accountId,
        leadId,
        filePath,
        mimeType: mimeType || null,
        storage,
      });

    return this.findById(result.lastInsertRowid);
  }

  findById(id) {
    return db
      .prepare('SELECT * FROM lead_photos WHERE account_id = ? AND id = ?')
      .get(this.accountId, id);
  }

  findByLead(leadId) {
    return db
      .prepare(
        `SELECT * FROM lead_photos
         WHERE account_id = ? AND lead_id = ?
         ORDER BY created_at ASC`
      )
      .all(this.accountId, leadId);
  }

  countByLead(leadId) {
    const row = db
      .prepare(
        `SELECT COUNT(*) AS count FROM lead_photos
         WHERE account_id = ? AND lead_id = ?`
      )
      .get(this.accountId, leadId);
    return row.count;
  }
}

module.exports = LeadPhotoRepository;
