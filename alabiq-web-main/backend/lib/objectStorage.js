'use strict';

const {
  S3Client, CreateBucketCommand, HeadBucketCommand, PutObjectCommand,
  GetObjectCommand, ListObjectsV2Command, DeleteObjectsCommand,
} = require('@aws-sdk/client-s3');
const { config } = require('./config');

let client;
function getClient() {
  const storage = config.objectStorage;
  if (!storage.accessKey || !storage.secretKey) throw new Error('Object storage credentials are required');
  if (!client) {
    client = new S3Client({
      region: storage.region,
      ...(storage.endpoint ? { endpoint: storage.endpoint } : {}),
      forcePathStyle: storage.forcePathStyle,
      credentials: { accessKeyId: storage.accessKey, secretAccessKey: storage.secretKey },
    });
  }
  return client;
}

async function ensureBucket(name, { maxBytes, allowedMimeTypes } = {}) {
  const s3 = getClient();
  try {
    await s3.send(new HeadBucketCommand({ Bucket: name }));
    return { bucket: name, action: 'exists', maxBytes, allowedMimeTypes };
  } catch (error) {
    if (error.$metadata?.httpStatusCode !== 404 && error.name !== 'NotFound') throw error;
  }
  try {
    await s3.send(new CreateBucketCommand({ Bucket: name }));
  } catch (error) {
    if (error.name !== 'BucketAlreadyOwnedByYou' && error.name !== 'BucketAlreadyExists') throw error;
  }
  return { bucket: name, action: 'created', maxBytes, allowedMimeTypes };
}

async function putObject(bucket, path, body, contentType) {
  await getClient().send(new PutObjectCommand({ Bucket: bucket, Key: path, Body: body, ContentType: contentType }));
}

async function getObject(bucket, path) {
  const result = await getClient().send(new GetObjectCommand({ Bucket: bucket, Key: path }));
  return { body: Buffer.from(await result.Body.transformToByteArray()), contentType: result.ContentType };
}

async function listObjects(bucket, prefix) {
  const objects = [];
  let continuationToken;
  do {
    const result = await getClient().send(new ListObjectsV2Command({
      Bucket: bucket, Prefix: `${prefix}/`, ContinuationToken: continuationToken,
    }));
    objects.push(...(result.Contents || []));
    continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
  } while (continuationToken);
  return objects;
}

async function deleteObjects(bucket, keys) {
  if (!keys.length) return;
  await getClient().send(new DeleteObjectsCommand({
    Bucket: bucket,
    Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
  }));
}

function resetClientForTests() {
  client?.destroy();
  client = null;
}

module.exports = { ensureBucket, putObject, getObject, listObjects, deleteObjects, resetClientForTests };
