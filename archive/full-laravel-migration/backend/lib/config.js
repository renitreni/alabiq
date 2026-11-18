// ---------------------------------------------------------------------
// Centralized runtime configuration.
//
// All environment-driven knobs are parsed and defaulted in ONE place so
// controllers never read process.env directly. Keeps behavior consistent
// across local (server.js) and Vercel (api/index.js).
// ---------------------------------------------------------------------

function toBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value).toLowerCase() === 'true';
}

function toNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

const config = {
  database: {
    url: process.env.DATABASE_URL || '',
    poolMax: toNumber(process.env.DATABASE_POOL_MAX, 20),
    idleTimeoutMs: toNumber(process.env.DATABASE_IDLE_TIMEOUT_MS, 30000),
    connectionTimeoutMs: toNumber(process.env.DATABASE_CONNECTION_TIMEOUT_MS, 5000),
  },
  email: {
    smtpHost: process.env.SMTP_HOST || '',
    smtpPort: toNumber(process.env.SMTP_PORT, 587),
    smtpSecure: toBool(process.env.SMTP_SECURE, false),
    smtpUser: process.env.SMTP_USER || '',
    smtpPassword: process.env.SMTP_PASSWORD || '',
    from: process.env.MAIL_FROM || '',
  },
  objectStorage: {
    endpoint: process.env.OBJECT_STORAGE_ENDPOINT || '',
    region: process.env.OBJECT_STORAGE_REGION || 'us-east-1',
    accessKey: process.env.OBJECT_STORAGE_ACCESS_KEY || '',
    secretKey: process.env.OBJECT_STORAGE_SECRET_KEY || '',
    forcePathStyle: toBool(process.env.OBJECT_STORAGE_FORCE_PATH_STYLE, true),
  },
  // The platform's operating timezone. Merchant opening hours (0038) are
  // stored as wall-clock times and evaluated against this, so a store that
  // says it opens at 09:00 means 09:00 in Saudi regardless of where the
  // server or the customer happens to be. Saudi has no DST.
  platform: {
    timezone: process.env.PLATFORM_TIMEZONE || 'Asia/Riyadh',
  },

  // When true, uploading a proof auto-verifies the booking. TESTING ONLY.
  autoVerifyTestMode: toBool(process.env.AUTO_VERIFY_STCPAY_TEST_MODE, false),

  // Legacy knob, read by nothing. Kept so an existing PAYMENT_MODE in a
  // deployed .env stays harmless. Which methods are actually offered is
  // derived from config: STC Pay is always on, card follows tap.secretKey.
  paymentMode: process.env.PAYMENT_MODE || 'stcpay_manual',

  // STC Pay recipient details shown to the passenger (spec §6).
  stcPay: {
    number: process.env.SMART_ALABIQ_STCPAY_NUMBER || '',
    recipientName: process.env.SMART_ALABIQ_STCPAY_NAME || 'Alabiq',
  },

  // Supabase Storage bucket holding payment proof images (PRIVATE bucket).
  proofs: {
    bucket: process.env.PAYMENT_PROOF_BUCKET || 'payment-proofs',
    // How long signed upload/download URLs stay valid.
    uploadUrlTtlSeconds: toNumber(process.env.PAYMENT_PROOF_UPLOAD_TTL, 900),
    downloadUrlTtlSeconds: toNumber(process.env.PAYMENT_PROOF_DOWNLOAD_TTL, 3600),
    maxBytes: toNumber(process.env.PAYMENT_PROOF_MAX_BYTES, 10 * 1024 * 1024), // 10 MB
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
  },

  // Supabase Storage bucket holding customer-facing merchant images: restaurant
  // logos and menu-item photos (PUBLIC bucket — unlike proofs/docs these must be
  // readable by anyone so <img src> works directly on the storefront). The
  // browser uploads straight to Storage via a short-lived signed upload URL and
  // we persist the resulting PUBLIC url into merchants.logo_url / menu_items.image_url.
  merchantImages: {
    bucket: process.env.MERCHANT_IMAGES_BUCKET || 'merchant-images',
    uploadUrlTtlSeconds: toNumber(process.env.MERCHANT_IMAGES_UPLOAD_TTL, 900),
    maxBytes: toNumber(process.env.MERCHANT_IMAGES_MAX_BYTES, 5 * 1024 * 1024), // 5 MB
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    // logo = restaurant logo/cover, item = a menu item's photo.
    kinds: ['logo', 'item'],
  },

  // Supabase Storage bucket holding user profile pictures (PUBLIC bucket —
  // the avatar URL is stored on profiles.avatar_url and rendered with a
  // plain <img src> in the navbar/profile page). The bucket is created
  // lazily by the backend if it doesn't exist yet.
  avatars: {
    bucket: process.env.AVATARS_BUCKET || 'avatars',
    uploadUrlTtlSeconds: toNumber(process.env.AVATARS_UPLOAD_TTL, 900),
    maxBytes: toNumber(process.env.AVATARS_MAX_BYTES, 5 * 1024 * 1024), // 5 MB
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
  },

  // Supabase Storage bucket holding driver verification documents (PRIVATE bucket).
  driverDocs: {
    bucket: process.env.DRIVER_DOCS_BUCKET || 'driver-docs',
    uploadUrlTtlSeconds: toNumber(process.env.DRIVER_DOCS_UPLOAD_TTL, 900),
    downloadUrlTtlSeconds: toNumber(process.env.DRIVER_DOCS_DOWNLOAD_TTL, 3600),
    maxBytes: toNumber(process.env.DRIVER_DOCS_MAX_BYTES, 10 * 1024 * 1024), // 10 MB
    allowedMimeTypes: ['image/jpeg', 'image/png', 'application/pdf'],
    // Full doc vocabulary (must match the driver_doc_type enum in migration 0005).
    allTypes: [
      'national_id', 'license', 'vehicle_registration',
      'insurance', 'tga_permit', 'profile_photo', 'vehicle_photo',
    ],
    // Docs that MUST be 'verified' before a driver is auto-approved.
    // tga_permit is optional; adjust per TGA guidance.
    requiredTypes: [
      'national_id', 'license', 'vehicle_registration',
      'insurance', 'profile_photo', 'vehicle_photo',
    ],
  },

  // Auth: accounts whose email is listed here automatically become admins
  // on sign-in/sync (comma-separated, case-insensitive).
  adminEmails: (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),

  // Legacy shared-secret auth (kept for reference; routes now use Supabase JWT).
  adminApiKey: process.env.ADMIN_API_KEY || '',
  driverApiKey: process.env.DRIVER_API_KEY || '',

  // Ledger / payout math (spec §12). Rate is a fraction, e.g. 0.20 = 20%.
  ledger: {
    commissionRate: toNumber(process.env.PLATFORM_COMMISSION_RATE, 0.2),
    manualPaymentFee: toNumber(process.env.MANUAL_PAYMENT_FEE, 0),
    // Driver cash settlement (pick & drop cash rides): the driver collects
    // the fare and owes Alabiq the commission. Past this running-owed
    // cap they cannot accept new cash rides until an admin records a
    // settlement (weekly cadence). Keep cashOwedLimit in sync with the
    // profiles.cash_owed_limit column default in migration 0022.
    cashOwedLimit: toNumber(process.env.DRIVER_CASH_OWED_LIMIT, 500),
    cashOwedAlertPct: toNumber(process.env.DRIVER_CASH_ALERT_PCT, 0.8),
  },

  // Reconciling card charges Tap never told us about. See
  // lib/chargeReconcile.js for why this exists at all.
  //
  // The floor is a grace period, not a tuning knob: a customer is still on
  // the 3DS page for the first few minutes, and asking Tap about a charge
  // they have not finished only burns rate limit. The ceiling stops the
  // sweep re-reading a backlog forever — past it, a charge is a support
  // question, not a sweep.
  chargeSweep: {
    everyMs: toNumber(process.env.CHARGE_SWEEP_MS, 5 * 60 * 1000),
    minAgeMinutes: toNumber(process.env.CHARGE_SWEEP_MIN_AGE_MIN, 5),
    maxAgeMinutes: toNumber(process.env.CHARGE_SWEEP_MAX_AGE_MIN, 120),
    // Tap's API is rate limited and this runs unattended; a burst of stuck
    // orders must not turn into a burst of gateway calls.
    batchSize: toNumber(process.env.CHARGE_SWEEP_BATCH, 25),
  },

  // KSA VAT. Charged ON TOP of the pre-tax amounts on both services and
  // snapshotted onto every order/booking (migration 0025), so changing the
  // rate here never rewrites the tax on money already taken. Rate is a
  // fraction: 0.15 = 15%.
  vat: {
    rate: toNumber(process.env.VAT_RATE, 0.15),
  },

  // Distance pricing + ETA, SHARED by all three services (food, shop and
  // Pick & Drop rides). Vertical-neutral on purpose: one surcharge model on
  // the platform, so the three cannot drift the way three copies would.
  //
  //   first freeRadiusKm  -> the vertical's own flat fee, unchanged
  //   beyond it           -> + surchargePerKm per km
  //   beyond maxRadiusKm  -> food/shop refuse the order; RIDES HAVE NO CAP
  //                          (a long airport transfer is legitimate)
  //
  // On rides the surcharge is platform revenue, deliberately kept OUT of
  // bookings.fare_amount, which lib/ledger.js uses as the driver's commission
  // base — see lib/fare.js. On food/shop deliveries the surcharge rides
  // inside delivery_fee and is therefore split with the driver like the rest
  // of it: they drove the extra kilometres.
  delivery: {
    freeRadiusKm: toNumber(process.env.DELIVERY_FREE_RADIUS_KM, 15),
    surchargePerKm: toNumber(process.env.DELIVERY_SURCHARGE_PER_KM, 0.25),
    maxRadiusKm: toNumber(process.env.DELIVERY_MAX_RADIUS_KM, 50),

    // Our cut of a food/shop delivery fee; the driver keeps the rest. A
    // separate number from ledger.commissionRate (rides, 20%) because the two
    // are genuinely different deals — collapsing them into one constant would
    // silently move one when the other is repriced.
    platformSharePct: toNumber(process.env.DELIVERY_PLATFORM_SHARE, 0.1),
    // Customer-facing ETA floor for DELIVERIES only. A kitchen or a packing
    // bench sits between the order and the road, and Google only measures the
    // road half — an unfloored 18-minute drive would promise 18 minutes for
    // something that cannot arrive in under three quarters of an hour.
    // Rides have no such stage and are never floored.
    minEtaMinutes: toNumber(process.env.DELIVERY_MIN_ETA_MINUTES, 45),
    // Width of the displayed band: 45 -> "45 - 50 mins".
    etaBandMinutes: toNumber(process.env.DELIVERY_ETA_BAND_MINUTES, 5),
    // How long a Google Routes ETA is reused before asking again. Every
    // tracking page polls on an 8s timer, so without this each watching
    // customer bills a Routes call every 8 seconds.
    etaCacheMs: toNumber(process.env.DELIVERY_ETA_CACHE_MS, 60000),
  },

  // Food Delivery business rules (docs/food-delivery/FOOD_DELIVERY.md).
  // These are HARD rules enforced server-side in lib/foodMoney.js and the
  // merchant accept flow — never trust client-sent money.
  food: {
    minOrderSar: toNumber(process.env.FOOD_MIN_ORDER, 30),
    deliveryFeeSar: toNumber(process.env.FOOD_DELIVERY_FEE, 10), // promo: first 3 months
    // The FREE band, not the cut-off. Up to here the flat fee above is the
    // whole delivery charge; past it config.delivery.surchargePerKm applies
    // and config.delivery.maxRadiusKm is what actually refuses an order.
    radiusKm: toNumber(process.env.FOOD_RADIUS_KM, 15),
    // Per-item platform margin by menu_items.item_type.
    margins: {
      meal_package: toNumber(process.env.FOOD_MARGIN_MEAL, 5),
      drink_dessert_addon: toNumber(process.env.FOOD_MARGIN_DRINK, 3),
    },
    merchantCreditLimit: toNumber(process.env.MERCHANT_CREDIT_LIMIT, 300),
    creditAlertPct: toNumber(process.env.CREDIT_ALERT_PCT, 0.8), // 80% => 240 SAR
    // An order stuck at 'pending' or 'accepted' means the kitchen never
    // tapped "Start preparing" and the customer is waiting on nothing.
    // lib/foodPreparingReminder.js re-notifies the restaurant, the admins
    // and the customer this often, measured from created_at (so an order
    // that was never even accepted is chased too), until it reaches
    // 'preparing'. The cap stops a forgotten order nagging forever —
    // past it a human has to intervene.
    preparingReminderMinutes: toNumber(process.env.FOOD_PREPARING_REMINDER_MINUTES, 10),
    preparingReminderMaxCount: toNumber(process.env.FOOD_PREPARING_REMINDER_MAX, 6),
    preparingReminderSweepMs: toNumber(process.env.FOOD_PREPARING_REMINDER_SWEEP_MS, 60000),
  },

  // Ecommerce ("shop") business rules — docs/archive/ecommerce/ECOMMERCE_PLAN.md §2.
  // Same shape and same HARD-rule discipline as food above: enforced server-side
  // in lib/shopMoney.js and the store accept flow, never trusted from a client.
  //
  // The credit limit and the 80% alert are deliberately NOT duplicated here —
  // there is ONE credit model on the platform and both verticals charge the
  // same merchants.credit_limit / credit_used columns. Read them from
  // config.food.merchantCreditLimit / config.food.creditAlertPct.
  shop: {
    // Master switch for the whole vertical, DEFAULTING TO OFF.
    //
    // The customer half (browse, cart, checkout, pay) is built; the store,
    // admin and rider halves are not. With this on and those missing, a
    // real customer can pay for an order that nobody can accept, pack or
    // deliver — and because stock is reserved at checkout, that order also
    // holds inventory with no manual release path. Turn it on only once
    // the merchant portal, the admin queue and the rider claim endpoints
    // exist. Ungated routes are how a half-built vertical takes real money.
    enabled: toBool(process.env.SHOP_ENABLED, false),
    minOrderSar: toNumber(process.env.SHOP_MIN_ORDER, 50),
    deliveryFeeSar: toNumber(process.env.SHOP_DELIVERY_FEE, 15),
    // The FREE band, not the cut-off — same as config.food.radiusKm above.
    radiusKm: toNumber(process.env.SHOP_RADIUS_KM, 15),
    // Fallback markup per unit when a product has no net_price. Food splits
    // this by item_type; retail has no equivalent axis, so it is one number.
    defaultMargin: toNumber(process.env.SHOP_DEFAULT_MARGIN, 5),
    // Default "running low" line for new products. Keep in sync with the
    // products.low_stock_threshold column default in migration 0026.
    lowStockThreshold: toNumber(process.env.SHOP_LOW_STOCK, 5),
    // Stock is reserved at CHECKOUT, before payment, so an unpaid order
    // holds inventory. Without expiry that is a denial-of-inventory vector:
    // place large unpaid orders and freeze a store's catalogue at zero.
    // The sweeper cancels unpaid orders older than this and puts the stock
    // back. Cash is NOT exempt while still pending — payment_method is a free
    // client choice at checkout, so exempting it left no expiry at all. Must stay comfortably longer than the STC Pay manual
    // verification turnaround or genuine customers lose their basket while
    // an admin is still reviewing the proof.
    orderExpiryMinutes: toNumber(process.env.SHOP_ORDER_EXPIRY_MINUTES, 30),
    // A store may accept before an STC Pay proof is verified, which is
    // legitimate. But an accepted-and-never-paid order is no longer 'pending',
    // so the window above never reaches it and its stock stays reserved
    // forever. Longer, so a genuine proof still has time to be reviewed.
    acceptedExpiryMinutes: toNumber(process.env.SHOP_ACCEPTED_EXPIRY_MINUTES, 180),
    staleSweepMs: toNumber(process.env.SHOP_STALE_SWEEP_MS, 60000),
  },

  // Grab-style dispatch (shared by Pick & Drop rides and food deliveries):
  // the nearest online driver gets an exclusive offer for offerSeconds; on
  // decline/timeout it cascades to the next. Drivers count as "online" when
  // their last GPS ping is fresher than driverFreshMinutes.
  dispatch: {
    offerSeconds: toNumber(process.env.DISPATCH_OFFER_SECONDS, 30),
    driverFreshMinutes: toNumber(process.env.DISPATCH_DRIVER_FRESH_MINUTES, 3),
    sweepMs: toNumber(process.env.DISPATCH_SWEEP_MS, 5000),
    // A rider who accepted a delivery but whose GPS goes silent for longer than
    // this (before pickup) is treated as disconnected: the order is released and
    // re-offered to the next-nearest driver by the watchdog.
    abandonMinutes: toNumber(process.env.DISPATCH_ABANDON_MINUTES, 5),
  },

  // GPS-vicinity check before a driver can mark arrived/picked_up/delivered
  // (backend/lib/geofence.js). airportRadiusMeters is larger because a Pick
  // & Drop pickup point at an airport is a whole terminal building (King
  // Khalid's terminals span several hundred meters of curb/apron frontage,
  // and GPS multipath near large structures degrades accuracy further) —
  // the default radius would false-reject a driver legitimately waiting
  // there. enabled is a kill switch if field GPS accuracy causes issues.
  geofence: {
    enabled: toBool(process.env.GEOFENCE_ENABLED, true),
    defaultRadiusMeters: toNumber(process.env.GEOFENCE_RADIUS_METERS, 300),
    airportRadiusMeters: toNumber(process.env.GEOFENCE_AIRPORT_RADIUS_METERS, 800),
    // How old a fallback driver_locations row may be before it's untrusted
    // (the status-change request itself is expected to carry a fresh fix).
    maxFixAgeMinutes: toNumber(process.env.GEOFENCE_MAX_FIX_AGE_MINUTES, 3),
  },

  // Tap Payments — the online card gateway (cards, mada, Apple Pay, and
  // saved cards). Keep secretKey unset and every card endpoint answers 503
  // "not configured" while manual STC Pay stays the live path.
  tap: {
    secretKey: process.env.TAP_SECRET_KEY || '',
    // Public/publishable key. Safe in a browser; mirrored here only so the
    // API can hand it to the client alongside "card payment is available".
    publicKey: process.env.TAP_PUBLIC_KEY || '',
    merchantId: process.env.TAP_MERCHANT_ID || '',
    apiBase: process.env.TAP_API_BASE || 'https://api.tap.company',

    // There is deliberately NO webhookSecret. Tap's `hashstring` header is
    // an HMAC over a concatenation of named charge fields keyed with the
    // SECRET API KEY itself — there is no separate webhook credential. The
    // old TAP_WEBHOOK_SECRET was a wrong assumption and the verification
    // built on it could never have matched a real Tap webhook.
    // See lib/tap.js verifyWebhookHash().

    applePayEnabled: toBool(process.env.TAP_APPLE_PAY_ENABLED, false),

    // Charging a saved card without a 3DS redirect is only legal once Tap
    // has activated Payment Agreements on the account, and only for a card
    // that actually has an agreement id. Default OFF so the first live
    // charges are 3DS whatever else is true — turning this on is a
    // deliberate act taken after confirming the activation landed.
    allowNon3dsOnFile: toBool(process.env.TAP_ALLOW_NON_3DS_ON_FILE, false),

    // How many cards one customer may keep. Tap's list endpoint returns the
    // 10 most recent, so staying under that means reconciliation never has
    // to paginate.
    maxSavedCards: toNumber(process.env.TAP_MAX_SAVED_CARDS, 5),
  },

  // Absolute public URLs. Gateway redirect and webhook URLs need them, and
  // deriving the web origin from CORS_ORIGINS[0] (as the old Tap charge did)
  // made the ORDER of that env var silently load-bearing: reordering the
  // list would have redirected paying customers to the wrong host.
  publicUrls: {
    web: process.env.PUBLIC_WEB_URL || (process.env.CORS_ORIGINS || '').split(',')[0] || '',
    api: process.env.PUBLIC_API_BASE || '',
  },

  // Partner API (delivery-as-a-service) — feature-flagged, off by default
  partnerApi: {
    enabled: toBool(process.env.PARTNER_API_ENABLED, false),
    legacyMarketplaceEnabled: toBool(process.env.LEGACY_FOOD_MARKETPLACE_ENABLED, true),
    rateLimitPerMinute: toNumber(process.env.PARTNER_API_RATE_LIMIT_PER_MINUTE, 120),
    quoteTtlSeconds: toNumber(process.env.PARTNER_QUOTE_TTL_SECONDS, 600),
    idempotencyRetentionHours: toNumber(process.env.PARTNER_IDEMPOTENCY_RETENTION_HOURS, 24),
    webhookSecretKey: process.env.PARTNER_WEBHOOK_SECRET_KEY || '',
    webhookTimeoutMs: toNumber(process.env.PARTNER_WEBHOOK_TIMEOUT_MS, 5000),
    webhookRetryWindowHours: toNumber(process.env.PARTNER_WEBHOOK_RETRY_WINDOW_HOURS, 24),
  },

  // Worker (background job processor) — feature-flagged, off by default
  worker: {
    enabled: toBool(process.env.WORKER_ENABLED, false),
    dispatchConcurrency: toNumber(process.env.WORKER_DISPATCH_CONCURRENCY, 5),
    webhookConcurrency: toNumber(process.env.WORKER_WEBHOOK_CONCURRENCY, 3),
    gpsSamplingConcurrency: toNumber(process.env.WORKER_GPS_SAMPLING_CONCURRENCY, 2),
    jobLeaseSeconds: toNumber(process.env.WORKER_JOB_LEASE_SECONDS, 30),
    heartbeatIntervalMs: toNumber(process.env.WORKER_HEARTBEAT_INTERVAL_MS, 10000),
  },

  // Redis GPS hot path
  locationRedis: {
    ttlSeconds: toNumber(process.env.LOCATION_REDIS_TTL_SECONDS, 90),
    samplingIntervalSeconds: toNumber(process.env.LOCATION_SAMPLING_INTERVAL_SECONDS, 10),
    accuracyThresholdMeters: toNumber(process.env.LOCATION_ACCURACY_THRESHOLD_METERS, 100),
    maxPlausibleSpeedKmh: toNumber(process.env.LOCATION_MAX_PLAUSIBLE_SPEED_KMH, 120),
  },
};

module.exports = { config };
