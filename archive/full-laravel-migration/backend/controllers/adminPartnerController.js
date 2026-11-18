'use strict';

const partnerRepository = require('../repositories/partnerRepository');
const { logAudit } = require('../lib/audit');

async function listCredentials(req, res) {
  try {
    // Admin can filter by merchant_id, otherwise see all
    const { merchantId } = req.query;
    const credentials = await partnerRepository.listCredentialsByMerchant(merchantId);
    const safe = credentials.map(c => ({
      id: c.id,
      name: c.name,
      key_prefix: c.key_prefix,
      created_at: c.created_at,
      expires_at: c.expires_at,
      revoked_at: c.revoked_at,
      last_used_at: c.last_used_at,
      created_by: c.created_by,
      merchant_id: c.merchant_id,
    }));
    return res.json({ credentials: safe });
  } catch (err) {
    console.error('admin listCredentials error:', err);
    return res.status(500).json({ error: { code: 'service_unavailable', message: 'Unexpected server error', request_id: req.requestId } });
  }
}

async function createCredential(req, res) {
  try {
    const { name, expires_at } = req.body || {};
    if (!name || typeof name !== 'string' || name.length > 100) {
      return res.status(400).json({ error: { code: 'invalid_name', message: 'Credential name is required (max 100 chars)' } });
    }
    const crypto = require('crypto');
    const keyPrefix = 'ak_live_' + crypto.randomBytes(8).toString('hex');
    const secret = crypto.randomBytes(24).toString('base64url');
    const { hashPassword } = require('../lib/passwords');
    const secretHash = await hashPassword(secret);
    const expiresAt = expires_at ? new Date(expires_at) : null;
    if (expiresAt && isNaN(expiresAt.getTime())) {
      return res.status(400).json({ error: { code: 'invalid_expiry', message: 'expires_at must be a valid ISO 8601 timestamp' } });
    }
    const credential = await partnerRepository.createCredential({
      merchantId: req.merchantId,
      name,
      keyPrefix,
      secretHash,
      createdBy: req.userId,
    });
    return res.status(201).json({
      credential: {
        id: credential.id,
        name: credential.name,
        key_prefix: credential.key_prefix,
        created_at: credential.created_at,
        expires_at: credential.expires_at,
        revoked_at: credential.revoked_at,
        last_used_at: credential.last_used_at,
        created_by: credential.created_by,
      },
      secret,
    });
  } catch (err) {
    console.error('admin createCredential error:', err);
    return res.status(500).json({ error: { code: 'service_unavailable', message: 'Unexpected server error', request_id: req.requestId } });
  }
}

async function revokeCredential(req, res) {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: { code: 'missing_id', message: 'Credential ID is required' } });
    const creds = await partnerRepository.listCredentialsByMerchant(req.merchantId);
    const cred = creds.find(c => c.id === id);
    if (!cred) return res.status(404).json({ error: { code: 'not_found', message: 'Credential not found' } });
    await partnerRepository.revokeCredential(id);
    logAudit({
      actorId: req.userId,
      action: 'admin_partner_credential_revoked',
      resourceType: 'partner_credential',
      resourceId: id,
      meta: { merchant_id: req.merchantId, credential_name: cred.name },
    });
    return res.json({ revoked: true });
  } catch (err) {
    console.error('admin revokeCredential error:', err);
    return res.status(500).json({ error: { code: 'service_unavailable', message: 'Unexpected server error', request_id: req.requestId } });
  }
}

async function rotateCredential(req, res) {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: { code: 'missing_id', message: 'Credential ID is required' } });
    const creds = await partnerRepository.listCredentialsByMerchant(req.merchantId);
    const cred = creds.find(c => c.id === id);
    if (!cred) return res.status(404).json({ error: { code: 'not_found', message: 'Credential not found' } });
    await partnerRepository.revokeCredential(id);
    const crypto = require('crypto');
    const keyPrefix = 'ak_live_' + crypto.randomBytes(8).toString('hex');
    const secret = crypto.randomBytes(24).toString('base64url');
    const { hashPassword } = require('../lib/passwords');
    const secretHash = await hashPassword(secret);
    const newCred = await partnerRepository.createCredential({
      merchantId: req.merchantId,
      name: cred.name + ' (rotated)',
      keyPrefix,
      secretHash,
      createdBy: req.userId,
    });
    logAudit({
      actorId: req.userId,
      action: 'admin_partner_credential_rotated',
      resourceType: 'partner_credential',
      resourceId: newCred.id,
      meta: { merchant_id: req.merchantId, old_credential_id: id, old_credential_name: cred.name },
    });
    return res.status(201).json({
      credential: {
        id: newCred.id,
        name: newCred.name,
        key_prefix: newCred.key_prefix,
        created_at: newCred.created_at,
        expires_at: newCred.expires_at,
        revoked_at: newCred.revoked_at,
        last_used_at: newCred.last_used_at,
        created_by: newCred.created_by,
      },
      secret,
    });
  } catch (err) {
    console.error('admin rotateCredential error:', err);
    return res.status(500).json({ error: { code: 'service_unavailable', message: 'Unexpected server error', request_id: req.requestId } });
  }
}

async function listWebhookEndpoints(req, res) {
  try {
    const { merchantId } = req.query;
    const endpoints = await partnerRepository.getWebhookEndpoints(merchantId);
    return res.json({ endpoints });
  } catch (err) {
    console.error('admin listWebhookEndpoints error:', err);
    return res.status(500).json({ error: { code: 'service_unavailable', message: 'Unexpected server error', request_id: req.requestId } });
  }
}

async function createWebhookEndpoint(req, res) {
  try {
    const { url, events, is_active, merchantId } = req.body || {};
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: { code: 'invalid_url', message: 'Webhook URL is required' } });
    }
    const { isValidWebhookUrl } = require('../worker');
    const urlValidation = isValidWebhookUrl(url);
    if (!urlValidation.valid) {
      return res.status(400).json({ error: { code: 'invalid_url', message: urlValidation.reason } });
    }
    const eventList = Array.isArray(events) && events.length > 0 ? events : [
      'delivery.searching', 'delivery.rider_assigned', 'delivery.picked_up',
      'delivery.delivered', 'delivery.cancelled', 'delivery.search_exhausted'
    ];
    const endpoint = await partnerRepository.createWebhookEndpoint({
      merchantId: merchantId || req.merchantId,
      url,
      events: eventList,
      isActive: is_active !== false,
    });
    logAudit({
      actorId: req.userId,
      action: 'admin_partner_webhook_created',
      resourceType: 'partner_webhook_endpoint',
      resourceId: endpoint.id,
      meta: { merchant_id: merchantId || req.merchantId, url, events: eventList },
    });
    return res.status(201).json({ endpoint });
  } catch (err) {
    console.error('admin createWebhookEndpoint error:', err);
    return res.status(500).json({ error: { code: 'service_unavailable', message: 'Unexpected server error', request_id: req.requestId } });
  }
}

async function updateWebhookEndpoint(req, res) {
  try {
    const { id } = req.params;
    const { url, events, is_active, merchantId } = req.body || {};
    if (!id) return res.status(400).json({ error: { code: 'missing_id', message: 'Endpoint ID is required' } });
    if (url) {
      const { isValidWebhookUrl } = require('../worker');
      const urlValidation = isValidWebhookUrl(url);
      if (!urlValidation.valid) {
        return res.status(400).json({ error: { code: 'invalid_url', message: urlValidation.reason } });
      }
    }
    const updates = {};
    if (url !== undefined) updates.url = url;
    if (events !== undefined) updates.events = events;
    if (is_active !== undefined) updates.is_active = is_active;
    const endpoint = await partnerRepository.updateWebhookEndpoint(id, merchantId || req.merchantId, updates);
    if (!endpoint) return res.status(404).json({ error: { code: 'not_found', message: 'Webhook endpoint not found' } });
    logAudit({
      actorId: req.userId,
      action: 'admin_partner_webhook_updated',
      resourceType: 'partner_webhook_endpoint',
      resourceId: id,
      meta: { merchant_id: merchantId || req.merchantId, updates },
    });
    return res.json({ endpoint });
  } catch (err) {
    console.error('admin updateWebhookEndpoint error:', err);
    return res.status(500).json({ error: { code: 'service_unavailable', message: 'Unexpected server error', request_id: req.requestId } });
  }
}

async function deleteWebhookEndpoint(req, res) {
  try {
    const { id } = req.params;
    const { merchantId } = req.query;
    if (!id) return res.status(400).json({ error: { code: 'missing_id', message: 'Endpoint ID is required' } });
    const deleted = await partnerRepository.deleteWebhookEndpoint(id, merchantId || req.merchantId);
    if (!deleted) return res.status(404).json({ error: { code: 'not_found', message: 'Webhook endpoint not found' } });
    logAudit({
      actorId: req.userId,
      action: 'admin_partner_webhook_deleted',
      resourceType: 'partner_webhook_endpoint',
      resourceId: id,
      meta: { merchant_id: merchantId || req.merchantId },
    });
    return res.json({ deleted: true });
  } catch (err) {
    console.error('admin deleteWebhookEndpoint error:', err);
    return res.status(500).json({ error: { code: 'service_unavailable', message: 'Unexpected server error', request_id: req.requestId } });
  }
}

async function getWebhookDeliveries(req, res) {
  try {
    const { id } = req.params;
    const { merchantId } = req.query;
    if (!id) return res.status(400).json({ error: { code: 'missing_id', message: 'Endpoint ID is required' } });
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;
    const deliveries = await partnerRepository.getWebhookDeliveries(id, merchantId || req.merchantId, limit, offset);
    return res.json({ deliveries });
  } catch (err) {
    console.error('admin getWebhookDeliveries error:', err);
    return res.status(500).json({ error: { code: 'service_unavailable', message: 'Unexpected server error', request_id: req.requestId } });
  }
}

async function replayWebhookDelivery(req, res) {
  try {
    const { id, deliveryId } = req.params;
    const { merchantId } = req.query;
    if (!id || !deliveryId) return res.status(400).json({ error: { code: 'missing_id', message: 'Endpoint ID and Delivery ID are required' } });
    const deliveries = await partnerRepository.getWebhookDeliveries(id, merchantId || req.merchantId, 1, 0);
    const delivery = deliveries.find(d => d.id === deliveryId);
    if (!delivery) return res.status(404).json({ error: { code: 'not_found', message: 'Webhook delivery not found' } });
    await partnerRepository.enqueueWebhookDelivery({
      endpointId: id,
      eventType: delivery.event_type,
      deliveryId: delivery.delivery_id,
      payload: delivery.payload,
      sequence: delivery.sequence,
    });
    logAudit({
      actorId: req.userId,
      action: 'admin_partner_webhook_replayed',
      resourceType: 'partner_webhook_delivery',
      resourceId: deliveryId,
      meta: { endpoint_id: id, delivery_id: delivery.delivery_id },
    });
    return res.json({ replay_queued: true });
  } catch (err) {
    console.error('admin replayWebhookDelivery error:', err);
    return res.status(500).json({ error: { code: 'service_unavailable', message: 'Unexpected server error', request_id: req.requestId } });
  }
}

module.exports = {
  listCredentials,
  createCredential,
  revokeCredential,
  rotateCredential,
  listWebhookEndpoints,
  createWebhookEndpoint,
  updateWebhookEndpoint,
  deleteWebhookEndpoint,
  getWebhookDeliveries,
  replayWebhookDelivery,
};
