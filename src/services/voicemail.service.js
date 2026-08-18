/**
 * Save Twilio voicemail recordings to S3 for dashboard playback and owner SMS links.
 */
const config = require('../../config/env');
const s3 = require('./s3.service');

function mp3RecordingUrl(recordingUrl) {
  if (!recordingUrl) return null;
  if (recordingUrl.endsWith('.mp3')) return recordingUrl;
  return `${recordingUrl}.mp3`;
}

async function downloadRecording(mediaUrl) {
  const auth = Buffer.from(
    `${config.twilio.accountSid}:${config.twilio.authToken}`
  ).toString('base64');

  const response = await fetch(mediaUrl, {
    headers: { Authorization: `Basic ${auth}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to download recording (${response.status})`);
  }

  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get('content-type'),
  };
}

async function saveVoicemail({
  accountId,
  leadId,
  recordingUrl,
  recordingSid,
  callSid,
  duration,
  voicemails,
}) {
  if (!recordingUrl) return null;

  let filePath = null;
  let storage = 'twilio';

  try {
    const { buffer, contentType } = await downloadRecording(mp3RecordingUrl(recordingUrl));
    const key = `accounts/${accountId}/leads/${leadId}/voicemail/${recordingSid || Date.now()}.mp3`;
    await s3.uploadObject({
      key,
      body: buffer,
      contentType: contentType && contentType.includes('audio') ? contentType : 'audio/mpeg',
    });
    filePath = key;
    storage = 's3';
  } catch (err) {
    console.error('[voicemail] S3 upload failed, storing Twilio URL only:', err.message);
  }

  return voicemails.create({
    leadId,
    callSid,
    recordingSid,
    filePath,
    twilioUrl: recordingUrl,
    duration,
    storage,
  });
}

async function getVoicemailObject(voicemail) {
  if (voicemail.storage === 's3' && voicemail.file_path) {
    return s3.getObject(voicemail.file_path);
  }
  return null;
}

async function getSignedVoicemailUrl(voicemail) {
  if (voicemail?.storage === 's3' && voicemail.file_path) {
    return s3.getSignedDownloadUrl(voicemail.file_path);
  }
  return voicemail?.twilio_url || null;
}

module.exports = {
  saveVoicemail,
  getVoicemailObject,
  getSignedVoicemailUrl,
};
