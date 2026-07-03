/**
 * Auth routes — login/logout/me/change-password.
 */
const express = require('express');
const AuthController = require('../controllers/auth.controller');
const { requireAuth } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/login', AuthController.login);
router.post('/logout', AuthController.logout);

router.get('/me', requireAuth, AuthController.me);
router.post('/change-password', requireAuth, AuthController.changePassword);

module.exports = router;
