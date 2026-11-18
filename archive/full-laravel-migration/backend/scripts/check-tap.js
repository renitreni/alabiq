// ---------------------------------------------------------------------
// Verify the Tap card payment path end to end:
//   npm run check:tap
//
// Answers the two questions that actually matter:
//   1. Will the frontend offer card payment at all, and if not, why not?
//   2. When a customer pays, does our system notice and settle the order?
//
// READ-ONLY. Every check is a SELECT or a GET. The gateway probe fetches a
// charge id that cannot exist, so it authenticates the key without creating,
// capturing or refunding anything. Nothing here posts to our own webhook
// either — that would write a webhook_events row and pollute the very
// evidence section E reads back.
//
// Run it against production by pointing PUBLIC_API_BASE at the live API, or
// just run it ON the VPS, which is simpler and needs no extra config.
// ---------------------------------------------------------------------
require('dotenv').config();
const { config } = require('../lib/config');
const database = require('../lib/database/pool');

let failed = 0;
let warned = 0;

function pass(id, msg) {
  console.log(`[PASS] ${id} ${msg}`);
}
function fail(id, msg, fix) {
  failed += 1;
  console.log(`[FAIL] ${id} ${msg}`);
  if (fix) console.log(`       -> ${fix}`);
}
function warn(id, msg, note) {
  warned += 1;
  console.log(`[WARN] ${id} ${msg}`);
  if (note) console.log(`       -> ${note}`);
}
function info(msg) {
  console.log(`       ${msg}`);
}

function keyMode(key) {
  if (!key) return 'unset';
  if (key.startsWith('sk_live_') || key.startsWith('pk_live_')) return 'live';
  if (key.startsWith('sk_test_') || key.startsWith('pk_test_')) return 'test';
  return 'unrecognised';
}

async function getJson(url, opts = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 15000);
  try {
    const res = await fetch(url, { ...opts, signal: ctl.signal });
    let body = null;
    try {
      body = await res.json();
    } catch {
      /* non-JSON is fine, status is what we check */
    }
    return { status: res.status, body };
  } finally {
    clearTimeout(t);
  }
}

// --- A. Configuration -------------------------------------------------

function checkConfig() {
  console.log('\nA. Configuration (this process\'s environment)\n');

  const secret = config.tap.secretKey;
  const sMode = keyMode(secret);
  const pMode = keyMode(config.tap.publicKey);

  if (!secret) {
    fail(
      'A1',
      'TAP_SECRET_KEY is not set — card payment is OFF',
      'Without it /api/payments is replaced by a 503 stub, GET /api/payments/config is unreachable, and every checkout screen hides the card option. This is the single switch.'
    );
  } else {
    pass('A1', `TAP_SECRET_KEY is set (${sMode} mode)`);
    if (sMode === 'unrecognised') {
      warn('A1', 'the key does not start with sk_live_ or sk_test_ — check it was pasted whole');
    }
  }

  if (!config.tap.publicKey) {
    warn('A2', 'TAP_PUBLIC_KEY is not set', 'Only needed by the Apple Pay Web SDK, which is not integrated. Harmless today.');
  } else if (sMode !== 'unset' && pMode !== sMode) {
    fail('A2', `key modes disagree: secret is ${sMode}, public is ${pMode}`, 'Use the matching pair from the same Tap environment.');
  } else {
    pass('A2', `TAP_PUBLIC_KEY is set (${pMode} mode)`);
  }

  // The two that fail silently.
  if (!process.env.PUBLIC_API_BASE) {
    fail(
      'A3',
      'PUBLIC_API_BASE is not set — THIS SILENTLY LOSES PAYMENTS',
      'It has no fallback. Unset, the webhook URL sent to Tap is built relative, Tap can never call back, and every charge stays unconfirmed with the customer already debited.'
    );
  } else {
    pass('A3', `PUBLIC_API_BASE = ${config.publicUrls.api}`);
    info(`webhook URL Tap will be given: ${config.publicUrls.api}/api/payments/webhooks/tap`);
  }

  if (!process.env.PUBLIC_WEB_URL) {
    fail(
      'A4',
      'PUBLIC_WEB_URL is not set — falling back to CORS_ORIGINS[0]',
      `That makes the ORDER of CORS_ORIGINS load-bearing. Right now customers would be returned to "${config.publicUrls.web}" after 3DS.`
    );
  } else {
    pass('A4', `PUBLIC_WEB_URL = ${config.publicUrls.web}`);
  }

  const origins = (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!origins.length) {
    warn('A5', 'CORS_ORIGINS is empty — every origin is allowed', 'Fine in local dev, must be set before launch.');
  } else {
    pass('A5', `CORS_ORIGINS has ${origins.length} entr${origins.length === 1 ? 'y' : 'ies'}`);
    for (const [origin, platform] of [['https://localhost', 'Android app'], ['capacitor://localhost', 'iOS app']]) {
      if (!origins.includes(origin)) {
        warn('A5', `${origin} missing (${platform} WebView origin)`, `That platform's app cannot reach the API at all. Append it — do not reorder.`);
      }
    }
  }

  console.log('');
  info(`3DS on saved cards: ${config.tap.allowNon3dsOnFile ? 'OPTIONAL (TAP_ALLOW_NON_3DS_ON_FILE=true)' : 'ALWAYS (safe default)'}`);
  info(`Apple Pay flag: ${config.tap.applePayEnabled ? 'on' : 'off'} (no frontend SDK either way)`);
  info(`Max saved cards per customer: ${config.tap.maxSavedCards}`);
}

// --- B. Does the key actually authenticate against Tap? ---------------

async function checkGateway() {
  console.log('\nB. Gateway credential\n');

  if (!config.tap.secretKey) {
    warn('B1', 'skipped — no TAP_SECRET_KEY to test');
    return;
  }

  // A charge id that cannot exist. Tap answers 404/400 for a good key and
  // 401/403 for a bad one, so this separates "key is wrong" from "key is
  // fine, charge is missing" without creating anything.
  const url = `${config.tap.apiBase}/v2/charges/chg_DOES_NOT_EXIST_check_tap`;
  let res;
  try {
    res = await getJson(url, { headers: { Authorization: `Bearer ${config.tap.secretKey}` } });
  } catch (err) {
    fail('B1', `could not reach ${config.tap.apiBase}: ${err.message}`, 'Network/DNS/firewall problem from this machine, not necessarily a key problem.');
    return;
  }

  if (res.status === 401 || res.status === 403) {
    fail('B1', `Tap rejected the secret key (HTTP ${res.status})`, 'The key is wrong, revoked, or from the other environment. Card payment will fail for every customer.');
  } else if (res.status >= 500) {
    warn('B1', `Tap returned HTTP ${res.status} — gateway-side problem, key not proven either way`);
  } else {
    pass('B1', `Tap accepted the secret key (HTTP ${res.status} for a non-existent charge, as expected)`);
  }
}

// --- C. What the frontend will see ------------------------------------

async function checkLiveEndpoints() {
  console.log('\nC. What the frontend will see\n');

  const base = config.publicUrls.api;
  if (!base) {
    warn('C1', 'skipped — PUBLIC_API_BASE is unset, so there is no host to probe');
    return;
  }

  let res;
  try {
    res = await getJson(`${base}/api/payments/config`);
  } catch (err) {
    fail('C1', `could not reach ${base}: ${err.message}`, 'Is the API up, and is this URL right?');
    return;
  }

  if (res.status === 200 && res.body && res.body.cardAvailable) {
    pass('C1', `GET ${base}/api/payments/config -> 200 cardAvailable:true`);
    info('Checkout screens WILL offer card payment.');
  } else if (res.status === 503) {
    fail(
      'C1',
      `GET ${base}/api/payments/config -> 503 "not available"`,
      'That API host has no TAP_SECRET_KEY. This is exactly why the card option does not appear in the UI. Setting the key locally does not help — it must be set on the host the frontend talks to, followed by a restart.'
    );
  } else {
    fail('C1', `GET ${base}/api/payments/config -> HTTP ${res.status}`, 'useCardAvailable treats ANY non-200 as "no card".');
  }

  // GET on a POST-only route: Express answers 404. Anything else (403, 503,
  // an HTML challenge page) means something in front of us is intercepting,
  // which is how a Cloudflare WAF rule silently eats every confirmation.
  try {
    const hook = await getJson(`${base}/api/payments/webhooks/tap`);
    if (hook.status === 404) {
      pass('C2', 'webhook path reachable and not intercepted (404 to a GET, as expected for a POST-only route)');
    } else if (hook.status === 403 || hook.status === 503 || hook.status === 429) {
      fail(
        'C2',
        `webhook path answered HTTP ${hook.status} to a plain GET`,
        'Something in front of the app (Cloudflare WAF, rate limiting) is intercepting. Tap POSTs will be eaten the same way and confirmations will be lost. docs/CLOUDFLARE_SETUP.md requires a skip rule for this exact path.'
      );
    } else {
      warn('C2', `webhook path answered HTTP ${hook.status} to a GET — expected 404, worth a look`);
    }
  } catch (err) {
    fail('C2', `webhook path unreachable: ${err.message}`);
  }
}

// --- D. Schema --------------------------------------------------------

async function columnExists(table, column) {
  try {
    await database.query(`SELECT ${column} FROM public.${table} LIMIT 1`);
    return true;
  } catch (err) {
    if (err && err.code === '42703') return false;
    throw err;
  }
}

async function checkSchema() {
  console.log('\nD. Schema\n');

  if (await columnExists('webhook_events', 'signature_verified')) {
    pass('D1', 'webhook_events.signature_verified exists');
  } else {
    fail('D1', 'webhook_events.signature_verified missing', 'Apply migration 0039. Without it nothing records whether a callback was genuine.');
  }

  for (const [table, label] of [['bookings', 'rides'], ['orders', 'food'], ['shop_orders', 'shop']]) {
    if (await columnExists(table, 'gateway_charge_id')) {
      pass('D2', `${table}.gateway_charge_id exists (${label})`);
    } else {
      fail(
        'D2',
        `${table}.gateway_charge_id missing (${label})`,
        'The charge id is written before the customer is redirected. Without the column there is nothing to reconcile against if the webhook never arrives.'
      );
    }
  }
}

// --- E. Did it actually work? ----------------------------------------

const VERTICALS = [
  { table: 'bookings', code: 'booking_code', settled: 'verified', label: 'rides' },
  { table: 'orders', code: 'order_code', settled: 'paid', label: 'food' },
  { table: 'shop_orders', code: 'order_code', settled: 'paid', label: 'shop' },
];

async function checkEvidence() {
  console.log('\nE. Evidence — has a real payment been confirmed?\n');

  const { rows: events } = await database.query(
    `SELECT id, provider, event_type, gateway_payment_id, signature_verified, processed_at, created_at
       FROM public.webhook_events
      WHERE provider='tap'
      ORDER BY created_at DESC LIMIT 20`,
  );

  if (!events.length) {
    warn(
      'E1',
      'no Tap webhook has EVER been received',
      'Expected before the first live charge. After one, this is the alarm: it means Tap cannot reach the webhook URL (check A3 and C2).'
    );
  } else {
    const verified = events.filter((e) => e.signature_verified === true).length;
    const rejected = events.filter((e) => e.signature_verified === false).length;
    pass('E1', `${events.length} recent Tap webhook(s): ${verified} signature-verified, ${rejected} rejected`);
    info(`most recent: ${events[0].created_at} (${events[0].event_type || 'no event type'})`);
    if (verified === 0) {
      fail(
        'E1',
        'none of them passed signature verification',
        'The hash is keyed with TAP_SECRET_KEY itself. Every one failing means the key here differs from the one that created the charges.'
      );
    }
    if (rejected > 0) {
      warn('E1', `${rejected} callback(s) failed verification — investigate before dismissing`);
    }
  }

  // The operational question: money taken, order not settled.
  console.log('');
  let stuckTotal = 0;
  for (const v of VERTICALS) {
    let data;
    try {
      ({ rows: data } = await database.query(
        `SELECT ${v.code}, payment_status, gateway_charge_id, created_at
           FROM public.${v.table}
          WHERE gateway_charge_id IS NOT NULL AND payment_status <> $1
          ORDER BY created_at DESC LIMIT 10`,
        [v.settled],
      ));
    } catch (err) {
      warn('E2', `could not read ${v.table}: ${err.message}`);
      continue;
    }
    if (!data.length) {
      pass('E2', `${v.label}: no charges started but unsettled`);
      continue;
    }
    // A charge started minutes ago is simply in flight; the sweeper has its
    // own age threshold for the same reason.
    const cutoff = Date.now() - 30 * 60 * 1000;
    const stale = data.filter((r) => new Date(r.created_at).getTime() < cutoff);
    if (stale.length) {
      stuckTotal += stale.length;
      fail(
        'E2',
        `${v.label}: ${stale.length} charge(s) started over 30 min ago and still not ${v.settled}`,
        'The customer may have been debited with nothing to show for it. Check each against the Tap dashboard.'
      );
      for (const r of stale.slice(0, 5)) {
        info(`${r[v.code]}  status=${r.payment_status}  charge=${r.gateway_charge_id}  started=${r.created_at}`);
      }
    } else {
      pass('E2', `${v.label}: ${data.length} charge(s) in flight, all under 30 min old`);
    }
  }

  console.log('');
  for (const v of VERTICALS) {
    const { rows } = await database.query(
      `SELECT count(*)::int AS count FROM public.${v.table}
        WHERE payment_status=$1 AND gateway_charge_id IS NOT NULL`,
      [v.settled],
    );
    info(`${v.label}: ${rows[0].count || 0} order(s) settled via the gateway to date`);
  }

  return stuckTotal;
}

async function main() {
  console.log('Tap card payment check');
  console.log('======================');

  checkConfig();
  await checkGateway();
  await checkLiveEndpoints();
  await checkSchema();
  await checkEvidence();

  console.log('');
  if (warned) console.log(`${warned} warning(s) — see [WARN] above.`);
  if (failed) {
    console.log(`\n${failed} check(s) FAILED. Card payment is not safe to rely on yet.`);
    process.exit(1);
  }
  console.log('\nAll Tap checks look good.');
}

main().catch((err) => {
  console.error('check-tap failed:', err.message || err);
  process.exit(1);
});
