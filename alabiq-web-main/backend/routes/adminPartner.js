'use strict';

const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/auth');
const {
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
} = require('../controllers/adminPartnerController');
const { validateBody } = require('../lib/validate');

router.use(requireAdmin);

router.get('/partner/credentials', listCredentials);
router.post('/partner/credentials', validateBody({
  name: { type: 'string', required: true, maxLength: 100 },
  expires_at: { type: 'string', maxLength: 50, nullable: true },
}), createCredential);
router.post('/partner/credentials/:id/revoke', revokeCredential);
router.post('/partner/credentials/:id/rotate', rotateCredential);

router.get('/partner/webhook-endpoints', listWebhookEndpoints);
router.post('/partner/webhook-endpoints', validateBody({
  url: { type: 'string', required: true, maxLength: 500 },
  events: { type: 'array', items: { type: 'string' }, nullable: true },
  is_active: { type: 'boolean', nullable: true },
}), createWebhookEndpoint);
router.patch('/partner/webhook-endpoints/:id', validateBody({
  url: { type: 'string', maxLength: 500, nullable: true },
  events: { type: 'array', items: { type: 'string' }, nullable: true },
  is_active: { type: 'boolean', nullable: true },
}), updateWebhookEndpoint);
router.delete('/partner/webhook-endpoints/:id', deleteWebhookEndpoint);
router.get('/partner/webhook-endpoints/:id/deliveries', getWebhookDeliveries);
router.post('/partner/webhook-endpoints/:id/deliveries/:deliveryId/replay', replayWebhookDelivery);

module.exports = router;