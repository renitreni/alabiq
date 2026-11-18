// ---------------------------------------------------------------------
// The Express application.
//
// We DEFINE the app here and export it, but we do NOT call app.listen()
// here. That lets the same app run two ways:
//   - server.js   -> normal long-running server on your machine
//   - api/index.js -> serverless function on Vercel
// ---------------------------------------------------------------------
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const healthRoutes = require('./routes/health');
const authRoutes = require('./routes/auth');
const bookingRoutes = require('./routes/bookings');
const trackingRoutes = require('./routes/tracking');
const adminRoutes = require('./routes/admin');
const driverRoutes = require('./routes/driver');
const merchantRoutes = require('./routes/merchant');
const notificationRoutes = require('./routes/notifications');
const routeRoutes = require('./routes/route');
const foodRoutes = require('./routes/food');
const shopRoutes = require('./routes/shop');
const merchantShopRoutes = require('./routes/merchantShop');
const locationRoutes = require('./routes/locations');
const paymentRoutes = require('./routes/payments');
const paymentMethodRoutes = require('./routes/paymentMethods');
const fileRoutes = require('./routes/files');
const eventRoutes = require('./routes/events');
const partnerRoutes = require('./routes/partner');
const publicTrackingRoutes = require('./routes/publicTracking');
const { config } = require('./lib/config');
const { requestContext } = require('./lib/requestContext');
const { reportFatal } = require('./lib/errorLog');

const app = express();

// Behind the Nginx reverse proxy on the VPS: trust the first proxy hop so the
// real client IP (X-Forwarded-For) is used for rate limiting, not the proxy's.
app.set('trust proxy', 1);

// Security headers. cross-origin RP so the separate frontend origin can read
// API responses. HSTS + a strict referrer policy are set explicitly so the
// posture doesn't silently drift if helmet's defaults change.
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    hsts: { maxAge: 15552000, includeSubDomains: true }, // 180 days
    referrerPolicy: { policy: 'no-referrer' },
  })
);

// CORS: an allow-list from CORS_ORIGINS (comma-separated). Requests with no
// Origin header (native app webview, curl, server-to-server, same-origin) are
// always allowed. When the allow-list is set it is enforced strictly (fail
// closed for any other browser origin). When it is empty we log a loud warning
// and preserve the permissive pilot behavior — auth here is Bearer-token based
// (no cookies), so a reflected origin still cannot read a victim's token, but
// the list MUST be set before launch.
const corsOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
if (!corsOrigins.length) {
  console.warn(
    '[cors] CORS_ORIGINS is not set — every browser origin is currently allowed. ' +
      'Set CORS_ORIGINS to your production web + app origins before launch.'
  );
}
app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true); // non-browser / same-origin caller
      if (!corsOrigins.length) return cb(null, true); // pilot fallback (warned above)
      return cb(null, corsOrigins.includes(origin)); // enforce the allow-list
    },
  })
);

// Per-request context that lib/errorLog.js reads when it captures a
// console.error. Before the rate limiters and the body parser so a 429 or a
// malformed-JSON rejection is attributable too.
app.use(requestContext);

// Parse JSON bodies with an explicit size cap so an oversized payload can't be
// used to exhaust memory before validation ever runs.
app.use(express.json({ limit: '100kb' }));

// Rate limiting. Effective on a single server/VPS; on serverless it's best-effort
// per-instance. General cap on the whole API, stricter on auth to slow brute force.
// The general cap is 240/min because map-heavy screens (live tracking + the
// location picker) legitimately make many small read calls per minute; the
// sensitive endpoints keep their own tighter per-route limiters.
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 240,
  standardHeaders: true,
  legacyHeaders: false,
  // Gateway webhooks are exempt. Tap retries six times with backoff on any
  // non-2xx, so 429-ing it converts a burst into a redelivery storm — and a
  // dropped webhook means an order the customer paid for is never confirmed.
  // The webhook has its own limiter plus a signature check.
  //
  // Match the PATH exactly, not originalUrl with a substring test:
  // originalUrl carries the query string, so `?x=/webhooks/` on ANY endpoint
  // used to skip this limiter entirely. req.path is the remainder after the
  // '/api/' mount point, hence no /api prefix here.
  skip: (req) =>
    req.path === '/payments/webhooks/tap' || req.path.startsWith('/files/public/'),
  // JSON, not the library default plain text. api.js reads `.error` off the
  // parsed body; a text/plain body makes res.json() throw, and the client
  // falls back to 'Request failed (429)' -- the exact meaningless string
  // that once had our own limiter mistaken for a provider outage.
  message: { error: 'Too many requests. Please slow down and try again in a minute.' },
});
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Please wait a minute and try again.' },
});
app.use('/api/', generalLimiter);
app.use('/api/auth', authLimiter);

// --- Routes ---
app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/tracking', trackingRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/driver', driverRoutes);
// --- Ecommerce, feature-flagged OFF by default (config.shop.enabled) ---
// Mounted BEFORE /api/merchant on purpose: Express matches prefixes in order,
// and routes/merchant.js applies requireMerchant with router.use(), so a
// /api/merchant/shop/* request hitting it first would be authenticated twice.
//
// The gate exists because the vertical is not finished end to end. With it on
// before every half is built, a customer can pay for an order nobody can
// fulfil — and because stock is reserved at checkout, that order also holds
// inventory with no manual release path.
if (config.shop.enabled) {
  app.use('/api/shop', shopRoutes);
  app.use('/api/merchant/shop', merchantShopRoutes);
  console.log('Ecommerce (shop) routes ENABLED.');
} else {
  const shopClosed = (req, res) => res.status(503).json({ error: 'The shop is not open yet.' });
  app.use('/api/shop', shopClosed);
  app.use('/api/merchant/shop', shopClosed);
}
app.use('/api/merchant', merchantRoutes);
// --- Card payments (Tap), gated on the gateway secret ---
//
// Same posture as the shop gate above: with no key configured there is
// nothing to charge, nothing to list and nothing to revoke, so 503 is the
// truthful answer. An empty array from /payment-methods would read as "you
// have no saved cards", which is a different and wrong statement.
//
// /api/payment-methods and /api/payments do not collide — Express matches
// whole path segments, so the former is not "under" the latter and the
// mount order between them does not matter. (Unlike /api/merchant/shop
// before /api/merchant above, which genuinely does.)
if (config.tap.secretKey) {
  app.use('/api/payments', paymentRoutes);
  app.use('/api/payment-methods', paymentMethodRoutes);
  console.log('Card payments (Tap) ENABLED.');
} else {
  const cardsClosed = (req, res) =>
    res.status(503).json({ error: 'Card payment is not available yet.' });
  app.use('/api/payments', cardsClosed);
  app.use('/api/payment-methods', cardsClosed);
}
app.use('/api/notifications', notificationRoutes);
app.use('/api/route', routeRoutes);
app.use('/api/food', foodRoutes);
app.use('/api/partner', partnerRoutes);
app.use('/api/public', publicTrackingRoutes);
app.use('/api/locations', locationRoutes);

// Friendly root
app.get('/', (req, res) => {
  res.json({ name: 'Alabiq API', status: 'running' });
});

// 404 fallback for anything unmatched
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Central error handler — log the detail server-side, never leak stack traces
// or raw DB/internal errors to the client. A backstop, not the main capture
// path: every controller catches its own errors and responds directly (there
// is no next(err) anywhere in the app), so little reaches here. reportFatal
// rather than the console interception because only here is the status known.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || 500;
  reportFatal('unhandledExpressError', err, { statusCode: status });
  res.status(status).json({ error: 'Unexpected server error' });
});

module.exports = app;
