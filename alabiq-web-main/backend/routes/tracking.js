const express = require('express');
const router = express.Router();
const { getTracking } = require('../controllers/trackingController');
const { lookupLimiter } = require('../middleware/rateLimiters');

// GET /api/tracking/:bookingCode -> public timeline + ETAs (no internal ids)
router.get('/:bookingCode', lookupLimiter, getTracking);

module.exports = router;
