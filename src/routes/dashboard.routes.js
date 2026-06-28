/**
 * Dashboard routes — lead listing and detail pages.
 */
const express = require('express');
const DashboardController = require('../controllers/dashboard.controller');

const router = express.Router();

router.get('/', DashboardController.index);
router.get('/leads/:id', DashboardController.show);

module.exports = router;
