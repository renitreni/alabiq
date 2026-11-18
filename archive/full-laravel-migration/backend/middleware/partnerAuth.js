'use strict';

const { config } = require('../lib/config');
const partnerRepository = require('../repositories/partnerRepository');
const crypto = require('crypto');

// Parse Authorization: Bearer ak_live_<credential-id>.<secret>
function parsePartnerAuth(header) {
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  // Format: ak_live_<prefix>.<secret>
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const prefix = parts[0]; // ak_live_...
  const secret = parts[1];
  if (!prefix.startsWith('ak_live_') || secret.length < 32) return null;
  return { prefix, secret };
}

// Verify secret against stored hash (scrypt)
async function verifySecret(secret, secretHash) {
  // secretHash format: scrypt$N$r$p$salt$hash (hex)
  const parts = secretHash.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const N = parseInt(parts[1], 10);
  const r = parseInt(parts[2], 10);
  const p = parseInt(parts[3], 10);
  const salt = Buffer.from(parts[4], 'hex');
  const expectedHash = Buffer.from(parts[5], 'hex');
  return new Promise((resolve) => {
    crypto.scrypt(secret, salt, expectedHash.length, { N, r, p }, (err, derived) => {
      if (err) return resolve(false);
      resolve(crypto.timingSafeEqual(derived, expectedHash));
    });
  });
}

async function partnerAuth(req, res, next) {
  // Check feature flag
  if (!config.partnerApi.enabled) {
    return res.status(503).json({
      error: { code: 'service_unavailable', message: 'Partner API is not enabled', request_id: req.requestId }
    });
  }

  const auth = parsePartnerAuth(req.headers.authorization);
  if (!auth) {
    return res.status(401).json({
      error: { code: 'unauthorized', message: 'Invalid or missing API credential', request_id: req.requestId }
    });
  }

  const credential = await partnerRepository.getActiveCredentialByPrefix(auth.prefix);
  if (!credential) {
    return res.status(401).json({
      error: { code: 'unauthorized', message: 'Invalid or revoked API credential', request_id: req.requestId }
    });
  }

  const valid = await verifySecret(auth.secret, credential.secret_hash);
  if (!valid) {
    return res.status(401).json({
      error: { code: 'unauthorized', message: 'Invalid API credential', request_id: req.requestId }
    });
  }

  // Check merchant suspension
  // We need to load the merchant to check status
  const { loadMerchantById } = require('../lib/merchantOwner');
  const merchant = await loadMerchantById(credential.merchant_id);
  if (!merchant || merchant.status === 'suspended') {
    return res.status(403).json({
      error: { code: 'restaurant_suspended', message: 'Restaurant is suspended', request_id: req.requestId }
    });
  }

  // Attach credential info to request
  req.partnerCredential = {
    id: credential.id,
    merchantId: credential.merchant_id,
    name: credential.name,
  };

  // Update last_used_at (async, don't await)
  partnerRepository.updateCredentialLastUsed(credential.id).catch(() => {});

  next();
}

module.exports = { partnerAuth, parsePartnerAuth, verifySecret };
