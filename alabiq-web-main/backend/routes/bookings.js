const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { validateBody } = require('../lib/validate');
const { proofLimiter, lookupLimiter } = require('../middleware/rateLimiters');
const { rateRideDriver } = require('../controllers/ratingsController');
const {
  createBooking,
  listMyBookings,
  getBookingByCode,
  cancelBooking,
  updateBookingContact,
} = require('../controllers/bookingsController');
const {
  getPaymentInstructions,
  createProofUploadUrl,
  recordPaymentProof,
} = require('../controllers/paymentsController');

// POST /api/bookings              -> create a booking (requires sign-in)
router.post('/', requireAuth, createBooking);

// GET  /api/bookings              -> the signed-in passenger's booking history
router.get('/', requireAuth, listMyBookings);

// GET  /api/bookings/:bookingCode -> booking summary (public by code; rate-limited)
router.get('/:bookingCode', lookupLimiter, getBookingByCode);

// POST /api/bookings/:bookingCode/cancel -> owner cancels the trip
router.post('/:bookingCode/cancel', requireAuth, cancelBooking);

// PATCH /api/bookings/:bookingCode/contact -> owner edits their contact
// number while the trip is active (even in progress).
router.patch(
  '/:bookingCode/contact',
  requireAuth,
  validateBody({
    passenger_mobile: { type: 'string', maxLength: 40, nullable: true },
    passenger_whatsapp: { type: 'string', maxLength: 40 },
  }),
  updateBookingContact
);

// POST /api/bookings/:code/rate-driver -> 1-5 stars after a completed trip
router.post(
  '/:code/rate-driver',
  requireAuth,
  validateBody({
    stars: { type: 'integer', required: true, min: 1, max: 5 },
    comment: { type: 'string', maxLength: 500, nullable: true },
  }),
  rateRideDriver
);

// --- Payments (increments 1 & 2) ---
// GET  /api/bookings/:bookingCode/payment-instructions -> how to pay (STC Pay)
router.get('/:bookingCode/payment-instructions', getPaymentInstructions);

// POST /api/bookings/:bookingCode/payment-proof/signed-url -> signed upload URL
router.post('/:bookingCode/payment-proof/signed-url', proofLimiter, createProofUploadUrl);

// POST /api/bookings/:bookingCode/payment-proof -> record uploaded proof
router.post('/:bookingCode/payment-proof', proofLimiter, recordPaymentProof);

module.exports = router;
