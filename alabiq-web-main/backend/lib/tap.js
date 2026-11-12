// ---------------------------------------------------------------------
// Tap Payments gateway client — the ONLY module that talks to Tap.
//
// Transport and encoding only. Ownership rules live in lib/savedCards.js
// and the charge decision tree lives in lib/cardCharge.js.
//
// Fails closed: with config.tap.secretKey unset every call throws
// TapError('not_configured') and the callers turn that into a 503, so a
// half-configured gateway can never move money.
//
// HOW A SAVED CARD WORKS HERE, because it is not obvious and gets it wrong
// in every other integration: Tap has no single "saved card" object. The
// first successful charge with save_card:true mints THREE references —
// a customer id, a card id, and a payment agreement id. A saved card id is
// NOT chargeable on its own; each later charge mints a fresh single-use
// token (5 minute lifetime) from the card + customer pair. Tokens are never
// stored.
// ---------------------------------------------------------------------
const crypto = require('crypto');
const { config } = require('./config');
const { fetchWithTimeout } = require('./httpTimeout');

// Minor units per ISO 4217, for the webhook hash only. Tap sends and takes
// amounts as DECIMALS (100.5 means 100.50), so this is about formatting the
// string that gets hashed, not about converting anything.
const CURRENCY_DECIMALS = { SAR: 2, KWD: 3, BHD: 3, OMR: 3, JOD: 3 };

class TapError extends Error {
  // kind: 'not_configured' | 'gateway' | 'declined'
  constructor(kind, message, detail = null) {
    super(message);
    this.name = 'TapError';
    this.kind = kind;
    this.detail = detail;
  }
}

function tapConfigured() {
  return Boolean(config.tap.secretKey);
}

// The amount as Tap formats it: fixed to the currency's decimal places.
// Load-bearing for verifyWebhookHash — "123.4" and "123.40" hash to
// different values, so an unpadded amount silently 401s every webhook.
function formatAmount(amount, currency = 'SAR') {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '';
  const decimals = CURRENCY_DECIMALS[String(currency).toUpperCase()] ?? 2;
  return n.toFixed(decimals);
}

// Strip a Tap response down to what is safe to log or persist. Everything
// not named here is dropped, including `card` and `source`, which carry the
// masked PAN and (on a save_card charge) the saved card id.
function redactCharge(charge) {
  if (!charge || typeof charge !== 'object') return null;
  return {
    id: charge.id || null,
    status: charge.status || null,
    amount: charge.amount ?? null,
    currency: charge.currency || null,
    // Tap puts decline reasons here; useful and non-sensitive.
    message: (charge.response && charge.response.message) || charge.message || null,
  };
}

// The display-only subset of a Tap card object. Deliberately drops `bin` /
// `first_six` (with last4 it narrows the PAN) and `fingerprint` (correlates
// a card across accounts) — see migration 0039's header.
function safeCardDetails(card) {
  if (!card || typeof card !== 'object') return {};
  return {
    brand: card.brand ? String(card.brand).toLowerCase() : null,
    funding: card.funding ? String(card.funding).toLowerCase() : null,
    last4: card.last_four || card.last4 || null,
    expMonth: card.exp_month != null ? Number(card.exp_month) : null,
    expYear: card.exp_year != null ? Number(card.exp_year) : null,
  };
}

async function tapRequest(path, { method = 'GET', body = null } = {}) {
  if (!tapConfigured()) {
    throw new TapError('not_configured', 'Tap Payments is not configured');
  }
  let response;
  let payload;
  try {
    // 15s: generous enough for the gateway hop, bounded so a slow Tap
    // cannot pin every in-flight checkout open indefinitely.
    response = await fetchWithTimeout(15000)(`${config.tap.apiBase}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.tap.secretKey}`,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    payload = await response.json().catch(() => null);
  } catch (err) {
    throw new TapError('gateway', 'Could not reach the payment gateway', err.message);
  }
  if (!response.ok) {
    // Log the redacted shape only. The raw body of a charge response holds
    // the card object; of a token response, a chargeable token.
    const errors = payload && payload.errors;
    // Stringified so the whole reason stays on one log line. pm2 splits an
    // inspected array across lines, and a grep for this prefix then shows
    // only "[".
    console.error(
      'Tap request failed:',
      method,
      path,
      response.status,
      JSON.stringify(errors || redactCharge(payload))
    );
    throw new TapError('gateway', 'The payment gateway rejected the request', errors || null);
  }
  return payload;
}

// ---------------------------------------------------------------------
// Webhook verification.
//
// Tap does NOT sign the request body. It signs a concatenation of seven
// named fields, keyed with the SECRET API KEY. Hashing JSON.stringify(body)
// — which is what this codebase did before — can never match.
//
//   x_id{id}x_amount{amount}x_currency{currency}
//   x_gateway_reference{reference.gateway}x_payment_reference{reference.payment}
//   x_status{status}x_created{transaction.created}
//
// Because the hash covers named fields rather than literal bytes, the
// global express.json() parser is irrelevant here and no raw-body capture
// is needed. Do not add one.
// ---------------------------------------------------------------------
function buildHashString(body) {
  const b = body || {};
  const reference = b.reference || {};
  const transaction = b.transaction || {};
  return (
    `x_id${b.id || ''}` +
    `x_amount${formatAmount(b.amount, b.currency)}` +
    `x_currency${b.currency || ''}` +
    // Absent gateway reference hashes as an empty string, per Tap's docs.
    `x_gateway_reference${reference.gateway || ''}` +
    `x_payment_reference${reference.payment || ''}` +
    `x_status${b.status || ''}` +
    `x_created${transaction.created || ''}`
  );
}

function verifyWebhookHash(body, postedHashString) {
  if (!tapConfigured()) return false; // fail closed
  const expected = crypto
    .createHmac('sha256', config.tap.secretKey)
    .update(buildHashString(body))
    .digest('hex');
  const posted = Buffer.from(String(postedHashString || ''), 'utf8');
  const mine = Buffer.from(expected, 'utf8');
  // timingSafeEqual throws on a length mismatch, so length is compared
  // first. That leaks the digest's length and nothing else — it is fixed
  // at 64 hex chars anyway.
  return posted.length === mine.length && crypto.timingSafeEqual(posted, mine);
}

// ---------------------------------------------------------------------
// Customers, cards, tokens, charges.
// ---------------------------------------------------------------------

// Create a Tap customer. Callers should go through savedCards.ensureCustomer,
// which caches the id in payment_customers so this runs once per person.
async function createCustomer(profile) {
  const [first, ...rest] = String(profile.full_name || '').trim().split(/\s+/);
  const phone = String(profile.mobile_number || profile.whatsapp_number || '').replace(/\D/g, '');
  return tapRequest('/v2/customers', {
    method: 'POST',
    body: {
      first_name: first || 'Customer',
      ...(rest.length ? { last_name: rest.join(' ') } : {}),
      ...(profile.email ? { email: profile.email } : {}),
      // Saudi numbers arrive as 05xxxxxxxx or 9665xxxxxxxx; Tap wants the
      // country code split out and the national part without its leading 0.
      ...(phone
        ? { phone: { country_code: '966', number: phone.replace(/^966/, '').replace(/^0/, '') } }
        : {}),
    },
  });
}

// Mint the single-use token that a saved-card charge needs.
// One use only, expires after 5 minutes — mint immediately before charging
// and never persist the result.
async function mintSavedCardToken({ cardId, customerId, clientIp }) {
  return tapRequest('/v2/tokens', {
    method: 'POST',
    body: {
      saved_card: { card_id: cardId, customer_id: customerId },
      ...(clientIp ? { client_ip: clientIp } : {}),
    },
  });
}

async function listCards(customerId) {
  const data = await tapRequest(`/v2/card/${encodeURIComponent(customerId)}`);
  return (data && Array.isArray(data.data) ? data.data : []);
}

async function deleteCard(customerId, cardId) {
  return tapRequest(`/v2/card/${encodeURIComponent(customerId)}/${encodeURIComponent(cardId)}`, {
    method: 'DELETE',
  });
}

// The source of truth for whether money actually moved. The webhook body
// proves who sent it; this proves what happened.
async function fetchCharge(chargeId) {
  return tapRequest(`/v2/charges/${encodeURIComponent(chargeId)}`);
}

// One charge builder for every path: new card, saved card, and Apple Pay.
//
// sourceId is 'src_all' for the hosted page, 'tok_...' for a saved card or
// an Apple Pay token. onFile/paymentAgreementId/threeDSecure encode which of
// Tap's save-card scenarios this is; the caller decides, not this function.
async function createCharge({
  amount,
  currency = 'SAR',
  code,
  vertical,
  customerId,
  sourceId,
  onFile = false,
  paymentAgreementId = null,
  threeDSecure = true,
  saveCard = false,
  idempotencyKey = null,
  redirectPath,
}) {
  const body = {
    amount: Number(Number(amount).toFixed(CURRENCY_DECIMALS[currency] ?? 2)),
    currency,
    // Required by Tap on every charge. Omitting it — as the old code did —
    // is a flat 400 from the gateway.
    customer: { id: customerId },
    source: { id: sourceId, on_file: Boolean(onFile) },
    threeDSecure: Boolean(threeDSecure),
    save_card: Boolean(saveCard),
    customer_initiated: true,
    ...(paymentAgreementId ? { payment_agreement: { id: paymentAgreementId } } : {}),
    reference: {
      order: code,
      ...(idempotencyKey ? { idempotent: idempotencyKey } : {}),
    },
    // Our own dispatch hint on the webhook. The order code alone would do,
    // but carrying the vertical means the webhook never has to guess from a
    // code prefix.
    metadata: { vertical },
    redirect: { url: `${config.publicUrls.web}${redirectPath}` },
    post: { url: `${config.publicUrls.api}/api/payments/webhooks/tap` },
  };
  return tapRequest('/v2/charges', { method: 'POST', body });
}

module.exports = {
  TapError,
  tapConfigured,
  formatAmount,
  buildHashString,
  verifyWebhookHash,
  redactCharge,
  safeCardDetails,
  createCustomer,
  mintSavedCardToken,
  listCards,
  deleteCard,
  fetchCharge,
  createCharge,
};
