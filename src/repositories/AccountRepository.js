/**
 * Account repository — tenant root (not scoped by accountId).
 * Resolves accounts by id or Twilio phone number.
 */
const db = require('../../config/database');

const AccountRepository = {
  findById(id) {
    return db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);
  },

  findByTwilioNumber(phoneNumber) {
    return db
      .prepare('SELECT * FROM accounts WHERE twilio_phone_number = ?')
      .get(phoneNumber);
  },

  findAll() {
    return db.prepare('SELECT * FROM accounts ORDER BY name').all();
  },

  updateName(id, name) {
    db.prepare(
      `UPDATE accounts SET name = @name WHERE id = @id`
    ).run({ id, name });
    return AccountRepository.findById(id);
  },
};

module.exports = AccountRepository;
