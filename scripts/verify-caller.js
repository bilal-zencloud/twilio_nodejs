/**
 * Manage Twilio verified caller IDs for trial accounts.
 *
 * Trial accounts only accept inbound calls from verified numbers.
 * The API verification flow uses a phone CALL, which trial accounts block.
 * Use this script to list what's already verified, or verify via Console (SMS).
 *
 * List verified numbers:
 *   npm run verify:caller
 *
 * Attempt API verification (may fail on trial — use Console SMS instead):
 *   VERIFICATION_PHONE=+1XXXXXXXXXX npm run verify:caller -- --request
 *
 * Submit verification code (after Console or API sends one):
 *   VERIFICATION_PHONE=+1XXXXXXXXXX VERIFICATION_CODE=123456 npm run verify:caller
 */
require('dotenv').config();
const twilio = require('twilio');

const phone = process.env.VERIFICATION_PHONE;
const code = process.env.VERIFICATION_CODE;
const requestCode = process.argv.includes('--request');
const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } = process.env;

if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
  console.error('Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in .env');
  process.exit(1);
}

const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

async function listVerified() {
  const ids = await client.outgoingCallerIds.list({ limit: 20 });
  console.log('\nVerified caller IDs on this account:');
  if (ids.length === 0) {
    console.log('  (none — trial inbound calls will be rejected)');
  } else {
    ids.forEach((id) => console.log(`  ${id.phoneNumber}  (${id.friendlyName})`));
  }
  console.log('\nOn a trial account, inbound calls only work FROM these numbers.');
  console.log('To add a new number: Twilio Console → Phone Numbers → Verified Caller IDs → Add (choose SMS).');
  console.log('API verification uses a phone call, which trial accounts do not support.\n');
}

async function submitVerificationCode(phoneNumber, verificationCode) {
  const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/OutgoingCallerIds.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ PhoneNumber: phoneNumber, VerificationCode: verificationCode }),
    }
  );

  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.message || `HTTP ${response.status}`);
  }
  return body;
}

async function main() {
  if (code && phone) {
    console.log(`Verifying ${phone} with code ${code}...`);
    const result = await submitVerificationCode(phone, code);
    console.log('Verified:', result.phone_number);
    console.log('You can now call your Twilio number from this phone.');
    return;
  }

  if (requestCode && phone) {
    console.log(`Requesting verification for ${phone}...`);
    console.log('Note: trial accounts usually cannot use API verification (call-based).\n');
    try {
      await client.validationRequests.create({
        phoneNumber: phone,
        friendlyName: 'Caller',
      });
      console.log('Verification initiated. Check the phone for a call or code.');
      console.log(`Then run: VERIFICATION_PHONE=${phone} VERIFICATION_CODE=<code> npm run verify:caller`);
    } catch (err) {
      console.error('Failed:', err.message);
      if (err.message.includes('trial')) {
        console.error('\nUse Twilio Console instead: Verified Caller IDs → Add → SMS verification.');
      }
      process.exit(1);
    }
    return;
  }

  await listVerified();
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
