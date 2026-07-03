/**
 * Admin repository — dashboard login accounts.
 *
 * account_id is nullable:
 *   - NULL  → global admin (can access all accounts; used for the single-admin demo)
 *   - <id>  → per-tenant admin (future: each shop sees only its own data)
 *
 * NOT extended from TenantScope: admins are the entity that CREATES tenant scope.
 */
const db = require('../../config/database');

const AdminRepository = {
  findById(id) {
    return db.prepare('SELECT * FROM admins WHERE id = ?').get(id);
  },

  findByEmail(email) {
    return db
      .prepare('SELECT * FROM admins WHERE lower(email) = lower(?)')
      .get(email);
  },

  create({ email, passwordHash, accountId = null }) {
    const result = db
      .prepare(
        `INSERT INTO admins (email, password_hash, account_id)
         VALUES (@email, @passwordHash, @accountId)`
      )
      .run({ email, passwordHash, accountId });

    return AdminRepository.findById(result.lastInsertRowid);
  },

  updatePassword(id, passwordHash) {
    db.prepare(
      `UPDATE admins
       SET password_hash = @passwordHash,
           updated_at = datetime('now')
       WHERE id = @id`
    ).run({ id, passwordHash });
    return AdminRepository.findById(id);
  },

  count() {
    return db.prepare('SELECT COUNT(*) AS c FROM admins').get().c;
  },
};

module.exports = AdminRepository;
