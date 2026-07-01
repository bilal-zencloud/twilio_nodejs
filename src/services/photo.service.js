/**
 * Photo service — download Twilio MMS media and store on disk (tenant-scoped paths).
 */
const fs = require('fs');
const path = require('path');
const config = require('../../config/env');

const MIME_EXTENSIONS = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
};

function getPhotosRoot() {
  return path.resolve(config.photosPath);
}

function resolvePhotoPath(relativePath) {
  const fullPath = path.join(getPhotosRoot(), relativePath);
  const root = getPhotosRoot();
  if (!fullPath.startsWith(root)) {
    throw new Error('Invalid photo path');
  }
  return fullPath;
}

function extensionForMime(mimeType) {
  if (!mimeType) return '.jpg';
  const normalized = mimeType.toLowerCase().split(';')[0].trim();
  return MIME_EXTENSIONS[normalized] || '.jpg';
}

/** Download media from Twilio (requires Basic auth). */
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

/**
 * Save an inbound MMS image for a lead.
 * @returns {{ relativePath: string, mimeType: string }}
 */
async function saveLeadPhoto({ accountId, leadId, mediaUrl, mimeType }) {
  const { buffer, contentType } = await downloadTwilioMedia(mediaUrl);
  const resolvedMime = mimeType || contentType || 'image/jpeg';
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${extensionForMime(resolvedMime)}`;
  const relativePath = path.join(accountId, String(leadId), filename);
  const dir = path.dirname(resolvePhotoPath(relativePath));

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(resolvePhotoPath(relativePath), buffer);

  return { relativePath, mimeType: resolvedMime };
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
  getPhotosRoot,
  resolvePhotoPath,
  saveLeadPhoto,
  parseInboundMedia,
};
