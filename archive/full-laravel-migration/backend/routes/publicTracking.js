'use strict';

const express = require('express');
const router = express.Router();
const { getPublicTracking, getPublicTrackingSSE } = require('../controllers/publicTrackingController');
const { lookupLimiter } = require('../middleware/rateLimiters');

// Public tracking - token authorization required (no authentication)
// GET /api/public/deliveries/:trackingId?token=...
router.get('/:trackingId', lookupLimiter, getPublicTracking);

// SSE endpoint for live updates (optional optimization)
// GET /api/public/deliveries/:trackingId/stream?token=...
router.get('/:trackingId/stream', lookupLimiter, getPublicTrackingSSE);

module.exports = router;
