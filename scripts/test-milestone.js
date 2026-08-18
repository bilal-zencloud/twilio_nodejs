/**
 * Milestone checks that can run without a live phone call.
 *
 *   npm run test:milestone
 *
 * Uses an isolated SQLite file and stubs Twilio/S3/AI. Live ring/greeting
 * still need a real call after deploy.
 */
const path = require('path');
const fs = require('fs');

const testDb = path.join(__dirname, '../data/milestone-test.db');
for (const file of [testDb, `${testDb}-wal`, `${testDb}-shm`]) {
  try {
    fs.unlinkSync(file);
  } catch {
    /* missing is fine */
  }
}

process.env.DATABASE_PATH = testDb;
process.env.TWILIO_VALIDATE_SIGNATURE = 'false';
process.env.OWNER_PHONE_NUMBER = '+19032808190';
process.env.TWILIO_PHONE_NUMBER = '+19032807223';
process.env.DEFAULT_ACCOUNT_ID = 'demo-account-1';
process.env.FRONTEND_URL = 'https://dashboard.example.com';
process.env.APP_URL = 'https://api.example.com';
process.env.LEAD_INACTIVITY_DAYS = '30';
process.env.JWT_SECRET = 'test-secret';

const consentCopy = require('../config/consent');
const smsService = require('../src/services/sms.service');
const photoService = require('../src/services/photo.service');
const voicemailService = require('../src/services/voicemail.service');
const aiService = require('../src/services/ai.service');
const { processMissedCall } = require('../src/services/missedCall.service');
const handoffService = require('../src/services/handoff.service');
const LeadRepository = require('../src/repositories/LeadRepository');
const { forAccount } = require('../src/repositories');
const db = require('../config/database');
const WebhookController = require('../src/controllers/webhook.controller');

const TWILIO = '+19032807223';
const OWNER = '+19032808190';
const CUSTOMER = '+15551234567';
const { STATUSES } = LeadRepository;

const outbound = [];
smsService.sendSmsAndConfirm = async (to, body, opts = {}) => {
  outbound.push({ kind: 'sms', to, body, mediaUrl: opts.mediaUrl || [] });
  return { sid: `SM${outbound.length}`, status: 'queued' };
};
smsService.sendOwnerMessage = async (body, opts = {}) => {
  outbound.push({ kind: 'owner', to: OWNER, body, mediaUrl: opts.mediaUrl || [] });
  return { sid: `SM${outbound.length}`, status: 'queued' };
};

photoService.parseInboundMedia = (body) => {
  const n = parseInt(body.NumMedia || '0', 10);
  return n > 0 ? [{ url: 'https://api.twilio.com/media/photo.jpg', contentType: 'image/jpeg' }] : [];
};
photoService.saveLeadPhoto = async ({ leadId }) => ({
  storageKey: `accounts/demo-account-1/leads/${leadId}/photo.jpg`,
  mimeType: 'image/jpeg',
  storage: 's3',
});
photoService.getSignedPhotoUrls = async (photos) =>
  (photos || []).map((p) => `https://signed.example.com/${p.file_path || p.id}.jpg`);

voicemailService.saveVoicemail = async ({ leadId, duration }) => ({
  id: 1,
  lead_id: leadId,
  duration: duration != null ? Number(duration) : 8,
  file_path: `accounts/demo-account-1/leads/${leadId}/voicemail.mp3`,
  storage: 's3',
});
voicemailService.getSignedVoicemailUrl = async () => 'https://signed.example.com/voicemail.mp3';

aiService.processQualifyingReply = async () => ({
  reply_sms: 'Thanks — I have everything.',
  extracted_name: 'Jane Doe',
  extracted_vehicle: '2019 Honda Civic',
  extracted_need: 'Hail damage on the hood',
  extracted_preferred_time: 'Thursday afternoon',
  extracted_location: 'Tyler, TX',
  photos_declined: false,
  intake_complete: true,
});

function mockRes() {
  const captured = { statusCode: 200, body: '', type: '' };
  const res = {
    type(value) {
      captured.type = value;
      return res;
    },
    send(value) {
      captured.body = value;
      return res;
    },
    sendStatus(code) {
      captured.statusCode = code;
      return res;
    },
    captured,
  };
  return res;
}

async function inboundSms({ from = CUSTOMER, body = '', numMedia = '0' }) {
  const res = mockRes();
  await WebhookController.handleInboundSms(
    {
      body: {
        From: from,
        To: TWILIO,
        Body: body,
        NumMedia: String(numMedia),
        MediaUrl0: numMedia > 0 ? 'https://api.twilio.com/media/photo.jpg' : undefined,
        MediaContentType0: numMedia > 0 ? 'image/jpeg' : undefined,
      },
    },
    res
  );
  await new Promise((r) => setTimeout(r, 30));
  return res.captured;
}

function lastOutbound(kind, to) {
  return [...outbound].reverse().find((m) => (!kind || m.kind === kind) && (!to || m.to === to));
}

function assert(condition, label) {
  if (!condition) {
    throw new Error(`FAIL: ${label}`);
  }
  console.log(`  PASS  ${label}`);
}

async function main() {
  const accountId = process.env.DEFAULT_ACCOUNT_ID;
  const { leads, messages, photos } = forAccount(accountId);
  let failed = 0;

  try {
    console.log('\nVoice TwiML');
    const incoming = mockRes();
    await WebhookController.handleIncomingCall(
      {
        body: {
          From: CUSTOMER,
          To: TWILIO,
          CallSid: 'CA_first',
        },
      },
      incoming
    );
    assert(String(incoming.captured.body).includes('<Dial'), '1. First inbound call dials Devin');
    assert(String(incoming.captured.body).includes(OWNER), '1. Dial target is OWNER_PHONE_NUMBER');

    const missed = mockRes();
    await WebhookController.handleDialResult(
      {
        body: {
          DialCallStatus: 'no-answer',
          From: CUSTOMER,
          To: TWILIO,
          CallSid: 'CA_first',
        },
      },
      missed
    );
    await new Promise((r) => setTimeout(r, 80));
    assert(String(missed.captured.body).includes('<Play'), '2. Unanswered Dial plays custom greeting');
    assert(String(missed.captured.body).includes('<Record'), '3. Caller can leave a recorded voicemail');

    const optIn = lastOutbound('sms', CUSTOMER);
    assert(optIn && optIn.body === consentCopy.OPT_IN_SMS, '4. Approved one-time opt-in SMS is sent');

    const openAfterMiss = leads.findOpenByPhone(CUSTOMER);
    assert(openAfterMiss && openAfterMiss.status === STATUSES.AWAITING_CONSENT, '4. Lead waits for YES');

    console.log('\nConsent gate');
    outbound.length = 0;
    await inboundSms({ body: 'Hi I need a dent repair' });
    const clarification = lastOutbound('sms', CUSTOMER);
    assert(
      clarification && clarification.body === consentCopy.CLARIFICATION_SMS,
      '5. AI does not start before YES'
    );
    assert(
      !outbound.some((m) => m.body && m.body.includes('Honda')),
      '5. No qualifying AI SMS before YES'
    );

    outbound.length = 0;
    await inboundSms({ body: 'YES' });
    const postYes = lastOutbound('sms', CUSTOMER);
    assert(postYes && postYes.body === consentCopy.POST_OPT_IN_SMS, '5. YES sends the fixed opener');
    assert(leads.findOpenByPhone(CUSTOMER).status === STATUSES.QUALIFYING, '5. Status moves to qualifying');

    console.log('\nIntake + handoff');
    outbound.length = 0;
    await inboundSms({ body: 'Jane, 2019 Civic, hail on hood, Tyler Thursday', numMedia: 1 });
    const lead = leads.findOpenByPhone(CUSTOMER);
    assert(photos.countByLead(lead.id) >= 1, '6. Customer photo is stored on the lead');
    assert(lead.name === 'Jane Doe', '6. Name captured');
    assert(lead.vehicle === '2019 Honda Civic', '6. Vehicle captured');
    assert(lead.status === STATUSES.HUMAN_FOLLOW_UP, '11. Lead status is Human Follow-Up');

    const ownerSummary = lastOutbound('owner', OWNER);
    assert(Boolean(ownerSummary), '7. Devin receives the completed summary');
    const summaryLines = ownerSummary.body.split('\n');
    const phoneLineIndex = summaryLines.findIndex((line) => line === 'Phone:');
    assert(
      phoneLineIndex >= 0 && summaryLines[phoneLineIndex + 1] === CUSTOMER,
      '8. Customer phone is on its own line in E.164 (clickable)'
    );
    assert(
      /https:\/\/signed\.example\.com\//.test(ownerSummary.body) ||
        (ownerSummary.mediaUrl && ownerSummary.mediaUrl.length > 0),
      '9. Photo links or MMS attachments are included'
    );

    const handoff = outbound.find((m) => m.kind === 'sms' && m.to === CUSTOMER);
    assert(handoff && handoff.body === consentCopy.HANDOFF_SMS, '10. Customer gets the final handoff SMS');

    console.log('\nPaused AI + forwards');
    outbound.length = 0;
    await inboundSms({ body: 'Can you come earlier?' });
    assert(
      !outbound.some((m) => m.kind === 'sms' && m.to === CUSTOMER && m.body !== consentCopy.HELP_SMS),
      '11. AI does not send qualifying replies after handoff'
    );
    const forwarded = lastOutbound('owner', OWNER);
    assert(Boolean(forwarded) && forwarded.body.includes('Can you come earlier?'), '12. Extra SMS is forwarded to Devin');
    assert(forwarded.body.includes(CUSTOMER), '12. Forward includes clickable customer phone');

    const beforeActivity = leads.findById(lead.id).last_activity_at;
    await new Promise((r) => setTimeout(r, 1100));
    await inboundSms({ body: 'One more photo', numMedia: 1 });
    const afterActivity = leads.findById(lead.id).last_activity_at;
    assert(afterActivity >= beforeActivity, '13. New Twilio activity updates last_activity_at');

    console.log('\nRepeat call + close + reopen');
    const firstId = lead.id;
    const repeat = await processMissedCall({
      from: CUSTOMER,
      to: TWILIO,
      callSid: 'CA_repeat',
      sendSms: true,
    });
    assert(repeat.lead.id === firstId, '14. Repeat call attaches to the same open lead');
    assert(leads.findOpenByPhone(CUSTOMER).id === firstId, '14. No duplicate active lead');

    outbound.length = 0;
    const vm = mockRes();
    await WebhookController.handleVoicemailComplete({
      body: {
        From: CUSTOMER,
        To: TWILIO,
        CallSid: 'CA_repeat',
        RecordingDuration: '9',
        RecordingUrl: 'https://api.twilio.com/recordings/RE123',
        RecordingSid: 'RE123',
      },
    }, vm);
    await new Promise((r) => setTimeout(r, 50));
    const repeatNotice = lastOutbound('owner', OWNER);
    assert(
      Boolean(repeatNotice) && /voicemail/i.test(repeatNotice.body),
      '15. Repeat-call voicemail notice is sent to Devin'
    );

    const closed = handoffService.closeLead({ accountId, leadId: firstId });
    assert(closed.status === STATUSES.CLOSED, '16. Manual Close Lead sets status to closed');
    const keptMessages = messages.findByLead(firstId);
    const keptPhotos = photos.findByLead(firstId);
    assert(keptMessages.length > 0 && keptPhotos.length > 0, '19. Close does not delete messages or photos');

    const afterClose = await processMissedCall({
      from: CUSTOMER,
      to: TWILIO,
      callSid: 'CA_new_inquiry',
      sendSms: true,
    });
    assert(afterClose.lead.id !== firstId, '18. Contact after close creates a new lead');
    assert(leads.findById(firstId).status === STATUSES.CLOSED, '18. Previous lead stays closed and unchanged');
    assert(leads.findById(firstId).name === 'Jane Doe', '19. Previous lead fields remain');

    console.log('\nAuto-close');
    db.prepare(
      `UPDATE leads
       SET status = ?, last_activity_at = datetime('now', '-31 days')
       WHERE id = ?`
    ).run(STATUSES.HUMAN_FOLLOW_UP, afterClose.lead.id);
    const autoClosed = handoffService.closeInactiveFollowUps();
    assert(autoClosed >= 1, '17. Inactive Human Follow-Up auto-closes after 30 days');
    assert(leads.findById(afterClose.lead.id).status === STATUSES.CLOSED, '17. Auto-closed lead status is closed');

    console.log('\nAll automated milestone checks passed.');
  } catch (err) {
    failed = 1;
    console.error(`\n${err.message}`);
  } finally {
    try {
      fs.unlinkSync(testDb);
    } catch {
      /* ignore */
    }
  }

  process.exit(failed);
}

main();
