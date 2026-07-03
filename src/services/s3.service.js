/**
 * AWS S3 storage — used for lead photo uploads and authenticated reads.
 */
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} = require('@aws-sdk/client-s3');
const config = require('../../config/env');

let client = null;

function getClient() {
  if (!client) {
    if (!config.aws.accessKeyId || !config.aws.secretAccessKey) {
      throw new Error('AWS credentials missing — set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in .env');
    }
    client = new S3Client({
      region: config.aws.region,
      credentials: {
        accessKeyId: config.aws.accessKeyId,
        secretAccessKey: config.aws.secretAccessKey,
      },
    });
  }
  return client;
}

function requireBucket() {
  if (!config.aws.s3Bucket) {
    throw new Error('S3 bucket missing — set S3_BUCKET in .env');
  }
  return config.aws.s3Bucket;
}

async function uploadObject({ key, body, contentType }) {
  await getClient().send(
    new PutObjectCommand({
      Bucket: requireBucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
  return { key, bucket: requireBucket() };
}

async function getObject(key) {
  const result = await getClient().send(
    new GetObjectCommand({ Bucket: requireBucket(), Key: key })
  );

  return {
    body: result.Body,
    contentType: result.ContentType,
    contentLength: result.ContentLength,
  };
}

async function deleteObject(key) {
  await getClient().send(
    new DeleteObjectCommand({ Bucket: requireBucket(), Key: key })
  );
}

module.exports = { uploadObject, getObject, deleteObject };
