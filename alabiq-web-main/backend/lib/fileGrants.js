const crypto = require('crypto');

function key() {
  const secret = process.env.APP_SIGNING_KEY;
  if (!secret) throw new Error('APP_SIGNING_KEY is required');
  return crypto.createHash('sha256')
    .update(secret)
    .digest();
}

function signGrant(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', key()).update(body).digest('base64url');
  return `${body}.${signature}`;
}

function verifyGrant(grant, operation) {
  const [body, signature] = String(grant || '').split('.');
  if (!body || !signature) throw new Error('Invalid file grant');
  const expected = crypto.createHmac('sha256', key()).update(body).digest();
  const actual = Buffer.from(signature, 'base64url');
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    throw new Error('Invalid file grant');
  }
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  if (payload.op !== operation || !payload.bucket || !payload.path || payload.exp < Date.now()) {
    throw new Error('Expired file grant');
  }
  return payload;
}

function uploadGrant(bucket, path, { maxBytes, allowedMimeTypes, ttlSeconds = 900 }) {
  return signGrant({
    op: 'upload', bucket, path, maxBytes, allowedMimeTypes,
    exp: Date.now() + ttlSeconds * 1000,
  });
}

function downloadUrl(bucket, path, ttlSeconds) {
  const grant = signGrant({ op: 'download', bucket, path, exp: Date.now() + ttlSeconds * 1000 });
  const base = String(process.env.PUBLIC_API_BASE || '').replace(/\/$/, '');
  return `${base}/api/files/private?grant=${encodeURIComponent(grant)}`;
}

module.exports = { uploadGrant, downloadUrl, verifyGrant };
