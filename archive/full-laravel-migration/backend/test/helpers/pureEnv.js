// ---------------------------------------------------------------------
// Require this FIRST in every backend test file, before anything that
// pulls in lib/config.
//
// Two jobs:
//
//   1. PIN THE MONEY KNOBS. config.js reads process.env at require time and
//      lib/config is a singleton, so a developer with FOOD_DELIVERY_FEE or
//      VAT_RATE exported in their shell would otherwise get a different
//      answer from the same test than CI does. Deleting the overrides makes
//      every test run against the DOCUMENTED defaults. money-defaults.test.js
//      pins those defaults themselves, so changing one is a deliberate act
//      that shows up as a failing assertion rather than as silent drift.
//
//   2. MAKE THE REAL DATABASE UNREACHABLE. These tests are pure and must
//      never open a socket: they mock lib/database/pool at the module
//      boundary, so no test ever reaches for PostgreSQL. Pointing DATABASE_URL
//      at a dead loopback address is belt-and-braces: even a test that
//      accidentally constructs the pool can only ever fail fast, never touch
//      a real database — even on a machine with production credentials
//      exported.
//
// The mutations are process-local: `node --test` runs each test FILE in its
// own child process, so nothing here leaks between files or into the app.
// ---------------------------------------------------------------------

// Every env var lib/config.js consults for money, distance or time.
const MONEY_ENV_KEYS = [
  'VAT_RATE',
  'DELIVERY_FREE_RADIUS_KM',
  'DELIVERY_SURCHARGE_PER_KM',
  'DELIVERY_MAX_RADIUS_KM',
  'DELIVERY_MIN_ETA_MINUTES',
  'DELIVERY_ETA_BAND_MINUTES',
  'DELIVERY_ETA_CACHE_MS',
  'FOOD_MIN_ORDER',
  'FOOD_DELIVERY_FEE',
  'FOOD_RADIUS_KM',
  'FOOD_MARGIN_MEAL',
  'FOOD_MARGIN_DRINK',
  'MERCHANT_CREDIT_LIMIT',
  'CREDIT_ALERT_PCT',
  'SHOP_MIN_ORDER',
  'SHOP_DELIVERY_FEE',
  'SHOP_RADIUS_KM',
  'SHOP_DEFAULT_MARGIN',
  'SHOP_LOW_STOCK',
  'PLATFORM_COMMISSION_RATE',
  'MANUAL_PAYMENT_FEE',
  'DRIVER_CASH_OWED_LIMIT',
  'DRIVER_CASH_ALERT_PCT',
  'PLATFORM_TIMEZONE',
];

for (const key of MONEY_ENV_KEYS) delete process.env[key];

// Syntactically valid, semantically dead: even a pool constructed by
// accident connects nowhere, and no test issues a query anyway.
process.env.DATABASE_URL = 'postgres://nobody:nopassword@127.0.0.1:1/never-used-by-tests';

module.exports = { MONEY_ENV_KEYS };
