/**
 * Auto-close Human Follow-Up leads with no Twilio activity for LEAD_INACTIVITY_DAYS.
 *
 *   npm run close:inactive
 */
require('dotenv').config();
require('../config/database');
const { closeInactiveFollowUps } = require('../src/services/handoff.service');
const config = require('../config/env');

const closed = closeInactiveFollowUps();
console.log(
  `Inactive Human Follow-Up leads closed: ${closed} (window: ${config.inactivityCloseDays} days)`
);
