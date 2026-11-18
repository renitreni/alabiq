// ---------------------------------------------------------------------
// Driver verification documents controller (driver-facing).
//   - createDocUploadUrl : POST /api/driver/documents/signed-url
//   - recordDriverDocument: POST /api/driver/documents
//   - listMyDocuments    : GET  /api/driver/documents
//
// Mirrors the payment-proof flow: the browser uploads straight to a private
// S3-compatible bucket via a short-lived signed URL, then
// POSTs the path here. Files never pass through this server.
// ---------------------------------------------------------------------
const documentsRepository = require('../repositories/driverDocumentsRepository');
const { config } = require('../lib/config');
const { buildDriverDocPath, createDriverDocUploadUrl } = require('../lib/storage');
const { validateUploadFile } = require('../lib/uploadValidation');

// --- POST /api/driver/documents/signed-url ---------------------------
async function createDocUploadUrl(req, res) {
  try {
    const { doc_type, file_name, mime_type } = req.body || {};
    if (!config.driverDocs.allTypes.includes(doc_type)) {
      return res.status(400).json({
        error: `doc_type is required and must be one of: ${config.driverDocs.allTypes.join(', ')}`,
      });
    }
    const fileCheck = validateUploadFile({ fileName: file_name, mimeType: mime_type });
    if (!fileCheck.ok) {
      return res.status(400).json({ error: fileCheck.error });
    }

    const path = buildDriverDocPath(req.driverId, doc_type, file_name);
    const { token, signedUrl } = await createDriverDocUploadUrl(path);

    return res.status(201).json({
      bucket: config.driverDocs.bucket,
      path,
      token,
      signedUrl,
      maxBytes: config.driverDocs.maxBytes,
      next: '/api/driver/documents',
    });
  } catch (err) {
    console.error('createDocUploadUrl error:', err);
    return res.status(500).json({ error: 'Could not create upload URL' });
  }
}

// --- POST /api/driver/documents --------------------------------------
async function recordDriverDocument(req, res) {
  try {
    const b = req.body || {};
    const errors = [];
    if (!config.driverDocs.allTypes.includes(b.doc_type)) {
      errors.push(`doc_type must be one of: ${config.driverDocs.allTypes.join(', ')}`);
    }
    if (!b.path) errors.push('path is required (returned by the signed-url step)');
    if (b.path && !String(b.path).startsWith(`${req.driverId}/`)) {
      errors.push('path does not belong to you');
    }
    if (b.size_bytes != null && Number(b.size_bytes) > config.driverDocs.maxBytes) {
      errors.push(`file exceeds max size of ${config.driverDocs.maxBytes} bytes`);
    }
    const fileCheck = validateUploadFile({ fileName: b.file_name, mimeType: b.mime_type });
    if (!fileCheck.ok) errors.push(fileCheck.error);
    if (errors.length) {
      return res.status(400).json({ error: 'Validation failed', details: errors });
    }

    const doc = await documentsRepository.replace({ driverId: req.driverId, document: b });

    return res.status(201).json({ id: doc.id, docType: doc.doc_type, status: doc.status });
  } catch (err) {
    console.error('recordDriverDocument error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

// --- GET /api/driver/documents ---------------------------------------
async function listMyDocuments(req, res) {
  try {
    const [docs, profile] = await Promise.all([
      documentsRepository.listForDriver(req.driverId),
      documentsRepository.profileStatus(req.driverId),
    ]);

    const verifiedTypes = new Set(docs.filter((d) => d.status === 'verified').map((d) => d.doc_type));
    const missing = config.driverDocs.requiredTypes.filter((t) => !verifiedTypes.has(t));

    return res.json({
      verificationStatus: (profile && profile.driver_verification_status) || 'none',
      driverApproved: !!(profile && profile.driver_approved),
      requiredTypes: config.driverDocs.requiredTypes,
      allTypes: config.driverDocs.allTypes,
      documents: docs,
      missingRequired: missing,
      allRequiredVerified: missing.length === 0,
    });
  } catch (err) {
    console.error('listMyDocuments error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

module.exports = { createDocUploadUrl, recordDriverDocument, listMyDocuments };
