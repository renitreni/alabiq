const express = require('express');
const multer = require('multer');
const objectStorage = require('../lib/objectStorage');
const { config } = require('../lib/config');
const { verifyGrant } = require('../lib/fileGrants');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 1, fileSize: 11 * 1024 * 1024 },
});

function detectedMime(buffer) {
  if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'image/jpeg';
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))) return 'image/png';
  if (buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  if (buffer.subarray(0, 5).toString() === '%PDF-') return 'application/pdf';
  return null;
}

function acceptUpload(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(413).json({ error: 'The file is too large or malformed.' });
    return next();
  });
}

router.post('/upload', acceptUpload, async (req, res) => {
  try {
    const grant = verifyGrant(req.body?.grant, 'upload');
    if (!req.file) return res.status(400).json({ error: 'file is required' });
    const mime = detectedMime(req.file.buffer);
    if (!mime || !grant.allowedMimeTypes.includes(mime) || req.file.size > grant.maxBytes) {
      return res.status(400).json({ error: 'The file type or size is not allowed.' });
    }
    await objectStorage.ensureBucket(grant.bucket);
    await objectStorage.putObject(grant.bucket, grant.path, req.file.buffer, mime);
    return res.status(201).json({ path: grant.path });
  } catch (err) {
    console.error('API file upload failed:', err.message || err);
    return res.status(400).json({ error: 'The upload authorization is invalid or expired.' });
  }
});

router.get('/private', async (req, res) => {
  try {
    const grant = verifyGrant(req.query.grant, 'download');
    const file = await objectStorage.getObject(grant.bucket, grant.path);
    res.set('Cache-Control', 'private, no-store');
    res.type(file.contentType || 'application/octet-stream');
    return res.send(file.body);
  } catch {
    return res.status(400).json({ error: 'The download authorization is invalid or expired.' });
  }
});

const publicBuckets = new Set([config.merchantImages.bucket, config.avatars.bucket]);
router.get('/public/:bucket/*', async (req, res) => {
  try {
    if (!publicBuckets.has(req.params.bucket)) return res.status(404).end();
    const path = req.params[0];
    if (!path || path.includes('..')) return res.status(400).end();
    const file = await objectStorage.getObject(req.params.bucket, path);
    res.set('Cache-Control', 'public, max-age=86400, immutable');
    res.type(file.contentType || 'application/octet-stream');
    return res.send(file.body);
  } catch {
    return res.status(404).end();
  }
});

module.exports = router;
