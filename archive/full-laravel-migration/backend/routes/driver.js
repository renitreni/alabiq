const express = require('express');
const router = express.Router();
const { requireDriver, requireApprovedDriver } = require('../middleware/auth');
const { driverAcceptLimiter, locationLimiter } = require('../middleware/rateLimiters');
const {
  listAvailableRides,
  acceptRide,
  updateDriverLocation,
  listMyRides,
  updateRideStatus,
  getMyCash,
  updateServiceTypes,
} = require('../controllers/driverController');
const { SERVICE_TYPES } = require('../lib/serviceTypes');
const {
  createDocUploadUrl,
  recordDriverDocument,
  listMyDocuments,
} = require('../controllers/driverDocsController');
const {
  listOffers,
  acceptOffer,
  declineOffer,
  listMyDeliveries,
  listOpenDeliveries,
  claimOpenDelivery,
  cancelDelivery,
  cancelRide,
  createDeliveryPhotoUrl,
  updateDeliveryStatus,
} = require('../controllers/driverDispatchController');
const { validateBody } = require('../lib/validate');

// Seeing the open feed, accepting, and broadcasting location all require an
// APPROVED driver. Viewing/advancing already-assigned rides only needs a
// signed-in driver.
router.get('/available', requireApprovedDriver, listAvailableRides);
router.post(
  '/location',
  locationLimiter,
  requireApprovedDriver,
  validateBody({
    lat: { type: 'number', required: true, min: -90, max: 90 },
    lng: { type: 'number', required: true, min: -180, max: 180 },
    accuracy: { type: 'number', min: 0, max: 100000, nullable: true },
    // Device compass + speedometer (migration 0033). Nullable because a
    // desktop has neither and a phone reports no heading while stopped —
    // omitting them must stay a valid ping, not a 400.
    heading: { type: 'number', min: 0, max: 360, nullable: true },
    speed_kmh: { type: 'number', min: 0, max: 400, nullable: true },
  }),
  updateDriverLocation
);
router.post('/rides/:bookingCode/accept', driverAcceptLimiter, requireApprovedDriver, acceptRide);

// Which verticals this driver works (pick_drop / food / shop). requireDriver,
// not approved — a pending driver may set preferences; dispatch gates on approval.
router.patch(
  '/services',
  requireDriver,
  validateBody({
    service_types: { type: 'array', required: true, itemEnum: SERVICE_TYPES, maxItems: 3 },
  }),
  updateServiceTypes
);

router.get('/rides', requireDriver, listMyRides);
router.post(
  '/rides/:bookingCode/status',
  requireDriver,
  validateBody({
    status: { type: 'string', required: true, maxLength: 40 },
    lat: { type: 'number', min: -90, max: 90, nullable: true },
    lng: { type: 'number', min: -180, max: 180, nullable: true },
  }),
  updateRideStatus
);
// What the driver owes Alabiq from cash rides (+ recent movements).
router.get('/cash', requireDriver, getMyCash);
// Give up an accepted ride (pre-start only) -> released + re-offered.
router.post(
  '/rides/:code/cancel',
  requireDriver,
  validateBody({ reason: { type: 'string', maxLength: 300, nullable: true } }),
  cancelRide
);

// --- Grab-style dispatch: exclusive 30s offers, then the open pool ---
router.get('/offers', requireApprovedDriver, listOffers);
router.post('/offers/:id/accept', driverAcceptLimiter, requireApprovedDriver, acceptOffer);
router.post('/offers/:id/decline', driverAcceptLimiter, requireApprovedDriver, declineOffer);

// --- Food deliveries (rider leg) ---
router.get('/deliveries', requireDriver, listMyDeliveries);
router.get('/deliveries/available', requireApprovedDriver, listOpenDeliveries);
router.post('/deliveries/:code/claim', driverAcceptLimiter, requireApprovedDriver, claimOpenDelivery);
// Give up an accepted delivery (pre-pickup only) -> released + re-offered.
router.post(
  '/deliveries/:code/cancel',
  requireDriver,
  validateBody({ reason: { type: 'string', maxLength: 300, nullable: true } }),
  cancelDelivery
);
// Mandatory photo proof: signed upload URL, then the status change carries
// the uploaded path (rejected without it).
router.post(
  '/deliveries/:code/photo-url',
  requireDriver,
  validateBody({
    kind: { type: 'string', required: true, enum: ['pickup', 'delivery'] },
    file_name: { type: 'string', maxLength: 255 },
    mime_type: { type: 'string', required: true, maxLength: 100 },
  }),
  createDeliveryPhotoUrl
);
router.post(
  '/deliveries/:code/status',
  requireDriver,
  validateBody({
    status: { type: 'string', required: true, enum: ['picked_up', 'delivered'] },
    photo_path: { type: 'string', required: true, maxLength: 400 },
    lat: { type: 'number', min: -90, max: 90, nullable: true },
    lng: { type: 'number', min: -180, max: 180, nullable: true },
  }),
  updateDeliveryStatus
);

// Verification documents — a signed-in (not-yet-approved) driver can upload,
// view status, and re-upload rejected docs.
router.post('/documents/signed-url', requireDriver, createDocUploadUrl);
router.post('/documents', requireDriver, recordDriverDocument);
router.get('/documents', requireDriver, listMyDocuments);

module.exports = router;
