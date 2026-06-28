/**
 * Test SMS delivery to a phone number and report Twilio errors.
 *
 * Usage:
 *   TEST_PHONE=+15165551234 npm run check:sms
 */
require('dotenv').config();
const twilio = require('twilio');
const { ERROR_HINTS } = require('../src/services/sms.service');

const phone = process.env.TEST_PHONE;
const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER } = process.env;

if (!phone) {
  console.error('Usage: TEST_PHONE=+1XXXXXXXXXX npm run check:sms');
  process.exit(1);
}

const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

async function main() {
  const account = await client.api.accounts(TWILIO_ACCOUNT_SID).fetch();
  console.log(`Account type: ${account.type}\n`);

  const verified = await client.outgoingCallerIds.list({ limit: 20 });
  console.log('Verified numbers on account:');
  verified.forEach((v) => console.log(`  ${v.phoneNumber}`));
  console.log(`\nSending test SMS from ${TWILIO_PHONE_NUMBER} to ${phone}...\n`);

  const message = await client.messages.create({
    to: phone,
    from: TWILIO_PHONE_NUMBER,
    body: 'Missed Call Capture — test message. If you received this, SMS delivery works.',
  });

  console.log('Initial status:', message.status, `(SID: ${message.sid})`);
  await new Promise((r) => setTimeout(r, 5000));

  const result = await client.messages(message.sid).fetch();
  console.log('After 5s:   ', result.status, result.errorCode ? `(error ${result.errorCode})` : '');

  if (result.status === 'delivered') {
    console.log('\nSuccess — this number can receive SMS from your Twilio number.');
    return;
  }

  if (result.errorCode && ERROR_HINTS[result.errorCode]) {
    console.log('\nFix:', ERROR_HINTS[result.errorCode]);
  }

  if (account.type === 'Trial') {
    console.log('\nTrial account notes:');
    console.log('  • Callers must be in Verified Caller IDs to reach your Twilio number.');
    console.log('  • SMS recipients must also be verified (same page, SMS method).');
    console.log('  • Upgrade the account to message any number without verification.');
  }

  console.log('\nFor US numbers, you also need A2P 10DLC registration:');
  console.log('  Twilio Console → Messaging → Regulatory Compliance → A2P 10DLC');
}

main().catch((err) => {
  console.error('\nFailed:', err.message);
  if (err.code && ERROR_HINTS[err.code]) console.error('Fix:', ERROR_HINTS[err.code]);
  process.exit(1);
});
