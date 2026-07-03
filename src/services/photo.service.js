/**
 * Photo service — download Twilio MMS media and store in S3 (tenant-scoped keys).
 * Dashboard viewing is proxied through an authenticated API route; direct S3
 * object URLs are never returned to the browser.
 */
const config = require('../../config/env');
const s3 = require('./s3.service');

const MIME_EXTENSIONS = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
};

function extensionForMime(mimeType) {
  if (!mimeType) return '.jpg';
  const normalized = mimeType.toLowerCase().split(';')[0].trim();
  return MIME_EXTENSIONS[normalized] || '.jpg';
}

/** Download media from Twilio (requires Basic auth against the MediaUrl). */
async function downloadTwilioMedia(mediaUrl) {
  const auth = Buffer.from(
    `${config.twilio.accountSid}:${config.twilio.authToken}`
  ).toString('base64');

  const response = await fetch(mediaUrl, {
    headers: { Authorization: `Basic ${auth}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to download MMS media (${response.status})`);
  }

  const contentType = response.headers.get('content-type');
  const buffer = Buffer.from(await response.arrayBuffer());
  return { buffer, contentType };
}

function buildStorageKey({ accountId, leadId, mimeType }) {
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${extensionForMime(mimeType)}`;
  return `accounts/${accountId}/leads/${leadId}/${filename}`;
}

/**
 * Save an inbound MMS image for a lead: download from Twilio, upload to S3.
 * @returns {{ storageKey: string, mimeType: string, storage: 's3' }}
 */
async function saveLeadPhoto({ accountId, leadId, mediaUrl, mimeType }) {
  const { buffer, contentType } = await downloadTwilioMedia(mediaUrl);
  const resolvedMime = mimeType || contentType || 'image/jpeg';
  const storageKey = buildStorageKey({ accountId, leadId, mimeType: resolvedMime });

  await s3.uploadObject({
    key: storageKey,
    body: buffer,
    contentType: resolvedMime,
  });

  return { storageKey, mimeType: resolvedMime, storage: 's3' };
}

/** Load a stored photo object for an authenticated API response. */
async function getPhotoObject(photo) {
  if (photo.storage === 's3') {
    return s3.getObject(photo.file_path);
  }

  // Legacy local files are no longer served.
  return null;
}

/** Parse Twilio inbound MMS fields from webhook body. */
function parseInboundMedia(body) {
  const numMedia = parseInt(body.NumMedia || '0', 10);
  const items = [];

  for (let i = 0; i < numMedia; i++) {
    const url = body[`MediaUrl${i}`];
    const contentType = body[`MediaContentType${i}`];
    if (url && contentType && contentType.startsWith('image/')) {
      items.push({ url, contentType });
    }
  }

  return items;
}

module.exports = {
  saveLeadPhoto,
  getPhotoObject,
  parseInboundMedia,
};
