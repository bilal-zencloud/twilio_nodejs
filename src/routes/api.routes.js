/**
 * API routes — JSON endpoints for the Next.js dashboard.
 */
const express = require('express');
const cors = require('../middleware/cors');
const ApiController = require('../controllers/api.controller');

const router = express.Router();

router.use(cors);

router.get('/leads', ApiController.listLeads);
router.get('/leads/:id', ApiController.getLead);
router.post('/leads/:id/confirm', ApiController.confirmLead);
router.get('/leads/:id/photos/:photoId', ApiController.photo);

module.exports = router;
