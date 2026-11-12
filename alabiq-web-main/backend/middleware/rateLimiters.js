// ---------------------------------------------------------------------
// Per-endpoint rate limiters (stricter than the global cap in app.js).
//
// These layer ON TOP of the global 120/min limiter, tightening specific
// high-risk endpoints (payment-proof upload, public code lookups, driver
// accept/location). All are IP-keyed (express-rate-limit default).
//
// PRODUCTION NOTE: behind a reverse proxy (Nginx on the VPS) set
//   app.set('trust proxy', 1)
// so the real client IP is used for keying — otherwise every request looks
// like it comes from the proxy and all users share a single bucket.
// ---------------------------------------------------------------------
const rateLimit = require('express-rate-limit');

const make = (max, message) =>
  rateLimit({
    windowMs: 60 * 1000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    // Return JSON (not the default plain text) so the frontend shows a real
    // message instead of the bare "Request failed (429)" — api.js reads `.error`.
    message: { error: message || 'Too many requests — please slow down and try again shortly.' },
  });

module.exports = {
  // Public account creation. A much longer window than the per-minute auth
  // limiter to blunt sustained mass-registration / disposable-account abuse
  // from a single IP — each call creates a real Supabase auth user.
  signupLimiter: rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many sign-up attempts from this network — please try again later.' },
  }),
  // Payment-proof endpoints (code-gated, unauthenticated) — stop upload spam.
  proofLimiter: make(10),
  // Public code lookups (booking summary + tracking) — slow enumeration.
  lookupLimiter: make(60),
  // Driver accepting a ride — limit race/retry amplification.
  driverAcceptLimiter: make(20),
  // Driver location pings (~5/min in normal use) — headroom, block floods.
  // Logged (unlike the other limiters): a driver hitting 30/min on a 12s
  // ping cadence means something's wrong (retry storm, clock issue, shared
  // IP) and the failure is otherwise invisible — the frontend ping is silent
  // on purpose so it doesn't nag the driver every interval.
  locationLimiter: rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res, _next, options) => {
      // Runs before requireApprovedDriver, so req.driverId isn't set yet.
      console.warn('[rate-limit] location ping blocked', { ip: req.ip });
      res.status(options.statusCode).json(options.message);
    },
    message: { error: 'Too many requests — please slow down and try again shortly.' },
  }),
  // Google Places/Geocoding proxies. Split into per-endpoint buckets (they used
  // to SHARE one 40/min bucket, which the chatty location picker exhausted ->
  // the 429). Search is typed; reverse/nearby fire on map moves. These buckets
  // also cap Google spend, so keep them.
  locationSearchLimiter: make(60, 'You are searching too fast — please wait a moment.'),
  locationReverseLimiter: make(90, 'Too many location lookups — please wait a moment.'),
  locationNearbyLimiter: make(60, 'Too many map updates — please wait a moment.'),
  // Google Routes proxy (map route lines). Generous — the client already only
  // refetches on ~100m movement; keeps routing off the location buckets.
  routeLimiter: make(120, 'The map is updating quickly — it will catch up shortly.'),

  // --- Food Delivery ---
  // Restaurant browse/search — generous, but stops scraping floods.
  foodSearchLimiter: make(60),
  // Checkout (order creation) — a human places at most a few orders/minute.
  foodCheckoutLimiter: make(10),
  // Payment proof/charge endpoints — same posture as proofLimiter.
  foodPayLimiter: make(10),
  // Merchant accept/reject/status — limit race/retry amplification.
  merchantOrderLimiter: make(30),
  // Client analytics events — cheap writes, but cap the firehose.
  foodEventsLimiter: make(60),

  // --- Ecommerce ("shop") ---
  // Store browse/search. Also the scrape ceiling on the public catalogue:
  // exact stock is already hidden by the 0029 grants, but this caps how fast
  // the banded availability could be sampled to infer sales velocity.
  shopSearchLimiter: make(60),
  // Checkout — each call reserves real inventory inside a transaction, so
  // this bucket is doing more than rate control: it caps how fast one caller
  // can lock up a store's stock before the expiry sweeper reclaims it.
  shopCheckoutLimiter: make(10),
  // Payment proof/charge endpoints — same posture as proofLimiter.
  shopPayLimiter: make(10),
  // Client analytics events.
  shopEventsLimiter: make(60),

  // --- Card payments (Tap: cards, mada, Apple Pay, saved cards) ---
  // Reading your own saved cards. The picker loads once per checkout and the
  // manage screen once per visit, so 30/min is far above human use — but low
  // enough that the endpoint is useless as an enumeration oracle if an auth
  // bug ever let it be called for someone else.
  paymentMethodsLimiter: make(30),
  // Delete / set-default. Each delete makes a live revoke call to Tap, so
  // this caps outbound gateway traffic as much as it caps requests.
  paymentMethodsWriteLimiter: make(10),
  // Starting a card charge. Deliberately tighter than foodPayLimiter (10):
  // a saved-card charge with a payment agreement skips 3DS, making this the
  // only endpoint on the platform that can move money with no human
  // interaction — which is exactly the shape of a card-testing probe. Five
  // per minute is more than any real customer needs.
  cardChargeLimiter: make(5, 'Too many payment attempts — please wait a minute and try again.'),
  // Gateway webhook. High because Tap retries on a non-2xx and a 429 would
  // turn a burst into a redelivery storm, but not unlimited — it is a public
  // unauthenticated endpoint. It is also exempt from the global limiter in
  // app.js for the same reason.
  webhookLimiter: make(300),
};
