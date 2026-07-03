/**
 * Centralized environment configuration.
 * All env vars are read once at startup and exported as a frozen config object.
 */
require('dotenv').config();

const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  databasePath: process.env.DATABASE_PATH || './data/leads.db',

  // Multi-tenant: demo runs a single account; production resolves by Twilio number
  defaultAccountId: process.env.DEFAULT_ACCOUNT_ID || 'demo-account-1',

  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    phoneNumber: process.env.TWILIO_PHONE_NUMBER,
    messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID || null,
    validateSignature: process.env.TWILIO_VALIDATE_SIGNATURE !== 'false',
  },

  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
  },

  aws: {
    region: process.env.AWS_REGION || 'us-east-2',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    s3Bucket: process.env.S3_BUCKET,
  },

  auth: {
    jwtSecret: process.env.JWT_SECRET || 'dev-only-change-me',
    jwtExpiry: process.env.JWT_EXPIRY || '7d',
    inactivityMinutes: parseInt(process.env.SESSION_INACTIVITY_MINUTES || '15', 10),
    cookieName: 'mcc_session',
    // Default admin seeded on first run (only if no admin exists)
    defaultAdminEmail: process.env.ADMIN_EMAIL || 'admin@example.com',
    defaultAdminPassword: process.env.ADMIN_PASSWORD || 'changeme',
  },

  // Public URL of this app (required for Twilio webhook signature validation)
  appUrl: process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`,

  // Next.js dashboard URL (CORS + root redirect)
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3001',

  isProduction: process.env.NODE_ENV === 'production',
};

module.exports = config;
