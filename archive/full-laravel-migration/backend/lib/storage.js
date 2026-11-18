// ---------------------------------------------------------------------
// App-owned object-storage helpers for payment proofs.
//
// The browser uploads through the API using a short-lived scoped grant. The
// API stores objects in the configured S3-compatible service and serves
// private files only after validating a separate download grant.
// ---------------------------------------------------------------------
const crypto = require('crypto');
const objectStorage = require('./objectStorage');
const { config } = require('./config');
const { uploadGrant, downloadUrl } = require('./fileGrants');

function uploadAuthorization(bucket, path, settings) {
  return {
    path,
    token: uploadGrant(bucket, path, {
      maxBytes: settings.maxBytes,
      allowedMimeTypes: settings.allowedMimeTypes,
      ttlSeconds: settings.uploadUrlTtlSeconds,
    }),
    signedUrl: null,
  };
}

function publicApiUrl(bucket, path) {
  const base = String(config.publicUrls.api || '').replace(/\/$/, '');
  const encoded = path.split('/').map(encodeURIComponent).join('/');
  return `${base}/api/files/public/${encodeURIComponent(bucket)}/${encoded}`;
}

// Build a unique, non-guessable object path for a booking's proof.
//   payment-proofs/SM-7K3PQ9TM/1718352000000-3f9a2c.jpg
function buildProofPath(bookingCode, originalName) {
  const safeCode = String(bookingCode).replace(/[^A-Za-z0-9-]/g, '');
  const ext = (originalName && originalName.includes('.'))
    ? originalName.slice(originalName.lastIndexOf('.')).toLowerCase().replace(/[^.a-z0-9]/g, '')
    : '';
  const rand = crypto.randomBytes(4).toString('hex');
  return `${safeCode}/${Date.now()}-${rand}${ext}`;
}

async function createProofUploadUrl(path) {
  return uploadAuthorization(config.proofs.bucket, path, config.proofs);
}

// Signed download URL for admin review.
async function createProofDownloadUrl(path) {
  return downloadUrl(config.proofs.bucket, path, config.proofs.downloadUrlTtlSeconds);
}

// --- Driver verification documents (same pattern, PRIVATE `driver-docs` bucket) ---

// Build a unique, non-guessable object path for a driver's document.
//   driver-docs/<driverId>/license-1718352000000-3f9a2c.jpg
function buildDriverDocPath(driverId, docType, originalName) {
  const safeId = String(driverId).replace(/[^A-Za-z0-9-]/g, '');
  const safeType = String(docType).replace(/[^a-z_]/g, '');
  const ext = (originalName && originalName.includes('.'))
    ? originalName.slice(originalName.lastIndexOf('.')).toLowerCase().replace(/[^.a-z0-9]/g, '')
    : '';
  const rand = crypto.randomBytes(4).toString('hex');
  return `${safeId}/${safeType}-${Date.now()}-${rand}${ext}`;
}

async function createDriverDocUploadUrl(path) {
  return uploadAuthorization(config.driverDocs.bucket, path, config.driverDocs);
}

async function createDriverDocDownloadUrl(path) {
  return downloadUrl(config.driverDocs.bucket, path, config.driverDocs.downloadUrlTtlSeconds);
}

// --- Merchant images (restaurant logos + menu photos, PUBLIC `merchant-images` bucket) ---
//
// Same signed-upload pattern as proofs/docs, but the bucket is PUBLIC: instead
// of issuing signed download URLs we hand back a stable public URL that is
// stored directly in merchants.logo_url / menu_items.image_url and served to
// customers via a plain <img src>.

// Build a unique object path for a merchant image.
//   merchant-images/<merchantId>/logo-1718352000000-3f9a2c.jpg
//   merchant-images/<merchantId>/item-1718352000000-3f9a2c.png
function buildMerchantImagePath(merchantId, kind, originalName) {
  const safeId = String(merchantId).replace(/[^A-Za-z0-9-]/g, '');
  const safeKind = String(kind).replace(/[^a-z]/g, '') || 'img';
  const ext = (originalName && originalName.includes('.'))
    ? originalName.slice(originalName.lastIndexOf('.')).toLowerCase().replace(/[^.a-z0-9]/g, '')
    : '';
  const rand = crypto.randomBytes(4).toString('hex');
  return `${safeId}/${safeKind}-${Date.now()}-${rand}${ext}`;
}

function buildMerchantLogoPath(merchantId, originalName) {
  return buildMerchantImagePath(merchantId, 'logo', originalName);
}

function buildMenuItemImagePath(merchantId, originalName) {
  return buildMerchantImagePath(merchantId, 'item', originalName);
}

async function createMerchantImageUploadUrl(path) {
  return uploadAuthorization(config.merchantImages.bucket, path, config.merchantImages);
}

// Bucket is public, so this is a stable URL, not a signed one.
function merchantImagePublicUrl(path) {
  return publicApiUrl(config.merchantImages.bucket, path);
}

// --- User avatars (profile pictures, PUBLIC `avatars` bucket) ---------------
//
// Same signed-upload pattern as merchant images. The bucket is created
// Bucket creation is automatic and object access stays behind the API.

// Create the bucket if it is missing, and either way make sure its size and
// MIME limits match what config says.
//
// The UPDATE half is the part that matters. createBucket is a no-op on a
// bucket that already exists, so the three buckets made by hand in the
// dashboard (payment-proofs, driver-docs, merchant-images) had no
// fileSizeLimit at all — and a bucket limit is the only enforcement point
// we have, because files never pass through this server. The browser PUTs
// straight to Storage with a signed URL, so an Express body limit would
// catch precisely nothing.
const ensureBucket = objectStorage.ensureBucket;

let avatarBucketReady = false;
async function ensureAvatarBucket() {
  if (avatarBucketReady) return;
  await ensureBucket(config.avatars.bucket, {
    maxBytes: config.avatars.maxBytes,
    allowedMimeTypes: config.avatars.allowedMimeTypes,
  });
  avatarBucketReady = true;
}

// avatars/<userId>/avatar-1718352000000-3f9a2c.jpg
function buildAvatarPath(userId, originalName) {
  const safeId = String(userId).replace(/[^A-Za-z0-9-]/g, '');
  const ext = (originalName && originalName.includes('.'))
    ? originalName.slice(originalName.lastIndexOf('.')).toLowerCase().replace(/[^.a-z0-9]/g, '')
    : '';
  const rand = crypto.randomBytes(4).toString('hex');
  return `${safeId}/avatar-${Date.now()}-${rand}${ext}`;
}

async function createAvatarUploadUrl(path) {
  await ensureAvatarBucket();
  return uploadAuthorization(config.avatars.bucket, path, config.avatars);
}

function avatarPublicUrl(path) {
  return publicApiUrl(config.avatars.bucket, path);
}

// Every avatar the user ever uploaded, not just the current one: replacing a
// picture leaves the old object behind (buildAvatarPath always makes a new
// name), so account deletion has to clear the whole folder.
async function deleteAvatarFolder(userId) {
  const safeId = String(userId).replace(/[^A-Za-z0-9-]/g, '');
  const files = await objectStorage.listObjects(config.avatars.bucket, safeId);
  const paths = files.map((file) => file.Key).filter(Boolean);
  await objectStorage.deleteObjects(config.avatars.bucket, paths);
  return paths.length;
}

module.exports = {
  ensureBucket,
  buildProofPath,
  createProofUploadUrl,
  createProofDownloadUrl,
  buildAvatarPath,
  createAvatarUploadUrl,
  avatarPublicUrl,
  deleteAvatarFolder,
  buildDriverDocPath,
  createDriverDocUploadUrl,
  createDriverDocDownloadUrl,
  buildMerchantImagePath,
  buildMerchantLogoPath,
  buildMenuItemImagePath,
  createMerchantImageUploadUrl,
  merchantImagePublicUrl,
  // Aliases used by the merchant portal controller (merchantController.js).
  createMerchantMediaUploadUrl: createMerchantImageUploadUrl,
  getMerchantMediaPublicUrl: merchantImagePublicUrl,
};
