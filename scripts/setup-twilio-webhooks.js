/**
 * Configure Twilio phone number webhooks via the REST API.
 *
 * Uses credentials from .env — no Twilio Console access required.
 * Webhook URLs are built from APP_URL:
 *   {APP_URL}/webhooks/voice/incoming
 *   {APP_URL}/webhooks/sms/inbound
 *
 * Run whenever APP_URL changes (e.g. after restarting ngrok):
 *   npm run setup:twilio
 */
require('dotenv').config();
const twilio = require('twilio');

const {
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_PHONE_NUMBER,
  TWILIO_PHONE_NUMBER_SID,
  APP_URL,
} = process.env;

function requireEnv(name, value) {
  if (!value) {
    console.error(`Missing required env variable: ${name}`);
    process.exit(1);
  }
}

requireEnv('TWILIO_ACCOUNT_SID', TWILIO_ACCOUNT_SID);
requireEnv('TWILIO_AUTH_TOKEN', TWILIO_AUTH_TOKEN);
requireEnv('APP_URL', APP_URL);

if (!TWILIO_PHONE_NUMBER && !TWILIO_PHONE_NUMBER_SID) {
  console.error('Set TWILIO_PHONE_NUMBER or TWILIO_PHONE_NUMBER_SID in .env');
  process.exit(1);
}

const voiceUrl = `${APP_URL.replace(/\/$/, '')}/webhooks/voice/incoming`;
const smsUrl = `${APP_URL.replace(/\/$/, '')}/webhooks/sms/inbound`;

async function main() {
  const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

  let phoneNumberSid = TWILIO_PHONE_NUMBER_SID;

  if (!phoneNumberSid) {
    console.log(`Looking up phone number ${TWILIO_PHONE_NUMBER}...`);
    const numbers = await client.incomingPhoneNumbers.list({
      phoneNumber: TWILIO_PHONE_NUMBER,
      limit: 1,
    });

    if (numbers.length === 0) {
      console.error(`Phone number not found in this account: ${TWILIO_PHONE_NUMBER}`);
      process.exit(1);
    }

    phoneNumberSid = numbers[0].sid;
  }

  console.log('Updating webhooks...');
  console.log(`  Voice: ${voiceUrl}`);
  console.log(`  SMS:   ${smsUrl}`);

  const updated = await client.incomingPhoneNumbers(phoneNumberSid).update({
    voiceUrl,
    voiceMethod: 'POST',
    smsUrl,
    smsMethod: 'POST',
  });

  console.log('\nDone. Twilio webhooks configured for', updated.phoneNumber);
  console.log(JSON.stringify({
    phoneNumber: updated.phoneNumber,
    voiceUrl: updated.voiceUrl,
    voiceMethod: updated.voiceMethod,
    smsUrl: updated.smsUrl,
    smsMethod: updated.smsMethod,
  }, null, 2));
}

main().catch((err) => {
  console.error('\nFailed to configure webhooks:', err.message);
  if (err.code === 20003) {
    console.error('Twilio authentication failed — check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in .env');
  }
  process.exit(1);
});
