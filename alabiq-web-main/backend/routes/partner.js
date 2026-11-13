'use strict';

const express = require('express');
const router = express.Router();
const { partnerAuth } = require('../middleware/partnerAuth');
const { validateBody } = require('../lib/validate');
const {
  createQuote,
  createDelivery,
  getDelivery,
  cancelDelivery,
  updatePreparation,
  rotateTrackingToken,
  // Credentials
  listCredentials,
  createCredential,
  revokeCredential,
  rotateCredential,
  // Webhook endpoints
  listWebhookEndpoints,
  createWebhookEndpoint,
  updateWebhookEndpoint,
  deleteWebhookEndpoint,
  getWebhookDeliveries,
  replayWebhookDelivery,
} = require('../controllers/partner/deliveriesController');

// Rate limiter for partner API
const { partnerApiLimiter } = require('../middleware/rateLimiters');

// All partner routes require authentication
router.use(partnerAuth);

// Apply rate limiter
router.use(partnerApiLimiter);

// --- Quote ---
router.post(
  '/delivery-quotes',
  validateBody({
    external_order_id: { type: 'string', required: true, maxLength: 100 },
    dropoff: {
      type: 'object',
      required: true,
      properties: {
        lat: { type: 'number', required: true, min: -90, max: 90 },
        lng: { type: 'number', required: true, min: -180, max: 180 },
        address: { type: 'string', required: true, maxLength: 500 },
        instructions: { type: 'string', maxLength: 500, nullable: true },
      },
    },
  }),
  createQuote
);

// --- Deliveries ---
router.post(
  '/deliveries',
  validateBody({
    external_order_id: { type: 'string', required: true, maxLength: 100 },
    quote_id: { type: 'string', required: true, format: 'uuid' },
    customer: {
      type: 'object',
      required: true,
      properties: {
        name: { type: 'string', required: true, maxLength: 120 },
        phone: { type: 'string', required: true, pattern: '^\\+9665\\d{8}$' },
      },
    },
    dropoff: {
      type: 'object',
      required: true,
      properties: {
        lat: { type: 'number', required: true, min: -90, max: 90 },
        lng: { type: 'number', required: true, min: -180, max: 180 },
        address: { type: 'string', required: true, maxLength: 500 },
        instructions: { type: 'string', maxLength: 500, nullable: true },
      },
    },
    items: {
      type: 'array',
      required: true,
      minItems: 1,
      maxItems: 50,
      items: {
        type: 'object',
        required: true,
        properties: {
          name: { type: 'string', required: true, maxLength: 200 },
          quantity: { type: 'integer', required: true, min: 1, max: 100 },
        },
      },
    },
    merchandise_total: {
      type: 'object',
      required: true,
      properties: {
        amount_minor: { type: 'integer', required: true, min: 0 },
        currency: { type: 'string', required: true, enum: ['SAR'] },
      },
    },
    external_payment: {
      type: 'object',
      required: true,
      properties: {
        status: { type: 'string', required: true, enum: ['paid'] },
        reference: { type: 'string', maxLength: 120, nullable: true },
      },
    },
    preparation_status: { type: 'string', required: true, enum: ['accepted'] },
  }),
  createDelivery
);

router.get('/deliveries/:id', getDelivery);

router.post(
  '/deliveries/:id/cancel',
  validateBody({
    reason: { type: 'string', required: true, maxLength: 300 },
  }),
  cancelDelivery
);

router.post(
  '/deliveries/:id/preparation',
  validateBody({
    status: { type: 'string', required: true, enum: ['preparing', 'ready'] },
  }),
  updatePreparation
);

router.post('/deliveries/:id/tracking-token/rotate', rotateTrackingToken);

// --- Credentials ---
router.get('/credentials', listCredentials);
router.post('/credentials', validateBody({
  name: { type: 'string', required: true, maxLength: 100 },
  expires_at: { type: 'string', maxLength: 50, nullable: true },
}), createCredential);
router.post('/credentials/:id/revoke', revokeCredential);
router.post('/credentials/:id/rotate', rotateCredential);

// --- Webhook Endpoints ---
router.get('/webhook-endpoints', listWebhookEndpoints);
router.post('/webhook-endpoints', validateBody({
  url: { type: 'string', required: true, maxLength: 500 },
  events: { type: 'array', items: { type: 'string' }, nullable: true },
  is_active: { type: 'boolean', nullable: true },
}), createWebhookEndpoint);
router.patch('/webhook-endpoints/:id', validateBody({
  url: { type: 'string', maxLength: 500, nullable: true },
  events: { type: 'array', items: { type: 'string' }, nullable: true },
  is_active: { type: 'boolean', nullable: true },
}), updateWebhookEndpoint);
router.delete('/webhook-endpoints/:id', deleteWebhookEndpoint);
router.get('/webhook-endpoints/:id/deliveries', getWebhookDeliveries);
router.post('/webhook-endpoints/:id/deliveries/:deliveryId/replay', replayWebhookDelivery);

module.exports = router;
