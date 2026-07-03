/**
 * Auth middleware — requires a valid session cookie.
 * Sets req.admin and req.accountId (from admin.account_id, falling back to default for globals).
 */
const config = require('../../config/env');
const authService = require('../services/auth.service');
const AdminRepository = require('../repositories/AdminRepository');

function requireAuth(req, res, next) {
  const token = req.cookies?.[config.auth.cookieName];
  if (!token) {
    return res.status(401).json({ error: 'not_authenticated' });
  }

  const payload = authService.verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'invalid_or_expired_session' });
  }

  if (authService.isInactive(payload)) {
    res.clearCookie(config.auth.cookieName, {
      ...authService.sessionCookieOptions(),
      maxAge: 0,
    });
    return res.status(401).json({ error: 'session_inactive' });
  }

  const admin = AdminRepository.findById(payload.sub);
  if (!admin) {
    return res.status(401).json({ error: 'admin_not_found' });
  }

  req.admin = admin;
  // Global admin (account_id NULL) defaults to the demo account. Future per-shop
  // admins are already scoped to their own account_id.
  req.accountId = admin.account_id || config.defaultAccountId;

  // Sliding inactivity window: every authenticated API request renews the
  // httpOnly cookie and token activity timestamp for another 15 minutes.
  res.cookie(
    config.auth.cookieName,
    authService.signToken(admin),
    authService.sessionCookieOptions()
  );
  next();
}

module.exports = { requireAuth };
