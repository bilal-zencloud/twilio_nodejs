/**
 * API routes — JSON endpoints for the Next.js dashboard.
 * Auth routes are public; lead endpoints require a valid session.
 */
const express = require('express');
const cors = require('../middleware/cors');
const { requireAuth } = require('../middleware/authMiddleware');
const ApiController = require('../controllers/api.controller');
const authRoutes = require('./auth.routes');

const router = express.Router();

router.use(cors);

router.use('/auth', authRoutes);

router.get('/leads', requireAuth, ApiController.listLeads);
router.get('/leads/:id', requireAuth, ApiController.getLead);
router.post('/leads/:id/confirm', requireAuth, ApiController.confirmLead);
router.get('/leads/:id/photos/:photoId', requireAuth, ApiController.photo);

module.exports = router;
