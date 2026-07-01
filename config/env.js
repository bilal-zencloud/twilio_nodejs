/**
 * Centralized environment configuration.
 * All env vars are read once at startup and exported as a frozen config object.
 */
require('dotenv').config();

const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  databasePath: process.env.DATABASE_PATH || './data/leads.db',
  photosPath: process.env.PHOTOS_PATH || './data/photos',

  // Multi-tenant: demo runs a single account; production resolves by Twilio number
  defaultAccountId: process.env.DEFAULT_ACCOUNT_ID || 'demo-account-1',

  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    phoneNumber: process.env.TWILIO_PHONE_NUMBER,
    // Optional: Messaging Service SID after A2P 10DLC registration
    messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID || null,
    validateSignature: process.env.TWILIO_VALIDATE_SIGNATURE !== 'false',
  },

  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
  },

  // Public URL of this app (required for Twilio webhook signature validation)
  appUrl: process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`,

  // Next.js dashboard URL (CORS + root redirect)
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3001',
};

module.exports = config;
