/**
 * Authentication service — password hashing and JWT signing.
 */
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const config = require('../../config/env');
const AdminRepository = require('../repositories/AdminRepository');

const BCRYPT_ROUNDS = 10;

function hashPassword(plain) {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

function inactivityMs() {
  return config.auth.inactivityMinutes * 60 * 1000;
}

function signToken(admin, now = Date.now()) {
  return jwt.sign(
    {
      sub: admin.id,
      email: admin.email,
      account_id: admin.account_id,
      last_activity: Math.floor(now / 1000),
    },
    config.auth.jwtSecret,
    { expiresIn: config.auth.jwtExpiry }
  );
}

function verifyToken(token) {
  try {
    return jwt.verify(token, config.auth.jwtSecret);
  } catch {
    return null;
  }
}

function isInactive(payload, now = Date.now()) {
  if (!payload?.last_activity) return true;
  return now - payload.last_activity * 1000 > inactivityMs();
}

/** Cookie options for the session token. */
function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProduction,
    path: '/',
    maxAge: inactivityMs(),
  };
}

/**
 * Attempt login with email + password.
 * @returns {Promise<{ admin, token } | null>}
 */
async function login(email, password) {
  const admin = AdminRepository.findByEmail(email);
  if (!admin) return null;

  const ok = await verifyPassword(password, admin.password_hash);
  if (!ok) return null;

  return { admin, token: signToken(admin) };
}

/**
 * Change password for the given admin. Requires the current password.
 * @throws Error('invalid_current_password') if current password is wrong
 */
async function changePassword(adminId, { currentPassword, newPassword }) {
  const admin = AdminRepository.findById(adminId);
  if (!admin) throw new Error('admin_not_found');

  const ok = await verifyPassword(currentPassword, admin.password_hash);
  if (!ok) throw new Error('invalid_current_password');

  if (!newPassword || newPassword.length < 8) {
    throw new Error('password_too_short');
  }

  const passwordHash = await hashPassword(newPassword);
  return AdminRepository.updatePassword(adminId, passwordHash);
}

function publicAdmin(admin) {
  return {
    id: admin.id,
    email: admin.email,
    account_id: admin.account_id,
  };
}

module.exports = {
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  isInactive,
  sessionCookieOptions,
  login,
  changePassword,
  publicAdmin,
};
