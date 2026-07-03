/**
 * Auth controller — login, logout, session info, change password.
 */
const config = require('../../config/env');
const authService = require('../services/auth.service');

const AuthController = {
  async login(req, res) {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: 'email_and_password_required' });
    }

    try {
      const result = await authService.login(email, password);
      if (!result) {
        return res.status(401).json({ error: 'invalid_credentials' });
      }

      res.cookie(config.auth.cookieName, result.token, authService.sessionCookieOptions());
      res.json({ admin: authService.publicAdmin(result.admin) });
    } catch (err) {
      console.error('[auth/login] Error:', err.message);
      res.status(500).json({ error: 'login_failed' });
    }
  },

  logout(req, res) {
    res.clearCookie(config.auth.cookieName, {
      ...authService.sessionCookieOptions(),
      maxAge: 0,
    });
    res.json({ success: true });
  },

  me(req, res) {
    res.json({ admin: authService.publicAdmin(req.admin) });
  },

  async changePassword(req, res) {
    const { current_password: currentPassword, new_password: newPassword } = req.body || {};

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'current_and_new_password_required' });
    }

    try {
      await authService.changePassword(req.admin.id, { currentPassword, newPassword });
      res.json({ success: true });
    } catch (err) {
      const code = err.message;
      const known = new Set([
        'invalid_current_password',
        'password_too_short',
        'admin_not_found',
      ]);
      if (known.has(code)) {
        return res.status(400).json({ error: code });
      }
      console.error('[auth/change-password] Error:', err.message);
      res.status(500).json({ error: 'change_password_failed' });
    }
  },
};

module.exports = AuthController;
