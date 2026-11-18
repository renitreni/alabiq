// ---------------------------------------------------------------------
// Starting a card charge — one implementation, three verticals.
//
// The controllers stay thin: they load and authorize their own order, then
// call chargeForOrder and map the discriminated result onto HTTP. Which
// combination of Tap's save-card parameters applies is decided here, once.
//
// Tap's two scenarios, from their save-card matrix:
//
//   NEW CARD   save_card:<consent>  customer_initiated:true  threeDSecure:true
//              source.id 'src_all'  on_file:false   -> always a hosted redirect
//
//   SAVED CARD save_card:false      customer_initiated:true  threeDSecure:<see below>
//              source.id 'tok_...'  on_file:true    payment_agreement.id REQUIRED
//
// threeDSecure on a saved card is false ONLY when the account has Payment
// Agreements activated AND this card actually has an agreement id. Missing
// either, we send true — Tap rejects a non-3DS charge without a valid
// agreement, so guessing optimistically would turn a working payment into
// a gateway error.
// ---------------------------------------------------------------------
const crypto = require('crypto');
const { config } = require('./config');
const tap = require('./tap');
const savedCards = require('./savedCards');
const { logAudit } = require('./audit');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Tap dedupes on reference.idempotent, which protects against two of our
// instances racing. The client's Idempotency-Key is reused when it is a
// real UUID so a retried request maps to the same gateway charge.
function idempotencyKeyFrom(req) {
  const header = String(req.get('idempotency-key') || '');
  return UUID_RE.test(header) ? header : crypto.randomUUID();
}

// The customer only ever sees "please try again", so this line is the only
// place the real reason survives. detail is Tap's errors array or a network
// message, never card data.
function logFailure(stage, err, { vertical, code }) {
  console.error(`cardCharge: ${stage} failed`, {
    vertical,
    code,
    kind: (err && err.kind) || null,
    message: (err && err.message) || String(err),
    detail: (err && (err.detail || err.code)) || null,
  });
}

// Result shapes the controllers map onto HTTP:
//   { kind: 'redirect', url }              -> 201 { code, url }
//   { kind: 'paid', chargeId }             -> 201 { code, paymentStatus: 'paid' }
//   { kind: 'declined', message }          -> 422 { error, failure_reason }
//   { kind: 'error', status, error, ... }  -> that status
async function chargeForOrder({
  req,
  profile,
  vertical,
  code,
  amount,
  redirectPath,
  savedMethodId = null,
  saveCard = false,
}) {
  if (!tap.tapConfigured()) {
    return {
      kind: 'error',
      status: 503,
      error: 'Card payment is not available yet. Please pay with STC Pay.',
    };
  }

  const userId = profile.id;
  const idempotencyKey = idempotencyKeyFrom(req);

  // --- Saved card: the one-tap path ---------------------------------
  if (savedMethodId) {
    const method = await savedCards.loadOwnedMethod(userId, savedMethodId);
    // Null covers "does not exist" and "belongs to someone else" alike, and
    // both answer 404 — a 403 would confirm the id is real and owned by
    // another account.
    if (!method) {
      return { kind: 'error', status: 404, error: 'That payment method was not found' };
    }
    if (savedCards.isExpired(method)) {
      await savedCards.retireMethod(method.id, 'expired at charge time');
      return {
        kind: 'error',
        status: 409,
        error: 'That card has expired. Please pay with a different card.',
        failure_reason: 'card_expired',
      };
    }

    // Non-3DS needs BOTH the account-level activation and a real agreement.
    const canSkip3ds = config.tap.allowNon3dsOnFile && Boolean(method.payment_agreement_id);

    let token;
    try {
      token = await tap.mintSavedCardToken({
        cardId: method.gateway_card_id,
        customerId: method.gateway_customer_id,
        // Real client IP: app.js sets trust proxy for the Nginx hop.
        clientIp: req.ip,
      });
    } catch (err) {
      logFailure('saved card token', err, { vertical, code });
      // Tap refusing to tokenise a card we hold means the card is gone at
      // the issuer or was revoked. Retire it so it stops being offered.
      await savedCards.retireMethod(method.id, 'gateway refused to tokenise');
      return {
        kind: 'error',
        status: 422,
        error: 'That card is no longer usable. Please pay with another card.',
        failure_reason: 'card_unavailable',
      };
    }

    let charge;
    try {
      charge = await tap.createCharge({
        amount,
        code,
        vertical,
        customerId: method.gateway_customer_id,
        sourceId: token.id,
        onFile: true,
        paymentAgreementId: method.payment_agreement_id,
        threeDSecure: !canSkip3ds,
        saveCard: false,
        idempotencyKey,
        redirectPath,
      });
    } catch (err) {
      logFailure('saved card charge', err, { vertical, code });
      return {
        kind: 'error',
        status: 502,
        error: 'Could not start the card payment. Please try again.',
      };
    }

    await savedCards.markUsed(method.id);
    return interpretCharge(charge);
  }

  // --- New card (and Apple Pay): the hosted page --------------------
  let customerId;
  try {
    customerId = await savedCards.ensureCustomer(profile);
  } catch (err) {
    logFailure('customer', err, { vertical, code });
    return { kind: 'error', status: 502, error: 'Could not start the card payment. Please try again.' };
  }

  if (saveCard) {
    // Logged at charge time, not at save time: a dispute asks whether the
    // customer agreed, and they did so here even if the charge later fails.
    logAudit({
      actorId: userId,
      action: 'card_on_file_consent',
      resourceType: vertical === 'ride' ? 'booking' : 'order',
      resourceId: code,
      meta: { consent_version: 'v1' },
    });
  }

  let charge;
  try {
    charge = await tap.createCharge({
      amount,
      code,
      vertical,
      customerId,
      // Tap's hosted page, which is what keeps card entry out of our code.
      sourceId: 'src_all',
      onFile: false,
      threeDSecure: true,
      saveCard: Boolean(saveCard),
      idempotencyKey,
      redirectPath,
    });
  } catch (err) {
    logFailure('new card charge', err, { vertical, code });
    return { kind: 'error', status: 502, error: 'Could not start the card payment. Please try again.' };
  }
  return interpretCharge(charge);
}

// Tap answers one of three ways and the difference matters to the UI:
// a redirect (3DS, or the hosted page), an immediate capture (saved card
// with an agreement), or a refusal.
function interpretCharge(charge) {
  const status = String((charge && charge.status) || '').toUpperCase();

  if (charge && charge.transaction && charge.transaction.url) {
    return { kind: 'redirect', url: charge.transaction.url, chargeId: charge.id };
  }
  // CAPTURED only. AUTHORIZED is a HOLD, not settled money — confirming on it
  // would dispatch and fulfil an order against funds that can still be voided
  // or left to expire. The webhook path has always required CAPTURED
  // (cardPaymentsController); this is the synchronous path catching up.
  if (status === 'CAPTURED') {
    return { kind: 'paid', chargeId: charge.id, charge };
  }
  if (status === 'AUTHORIZED') {
    // Only reachable if the Tap account is switched to auth-then-capture.
    // Treat it as unfinished rather than silently settling it.
    console.error('cardCharge: AUTHORIZED but not captured — check the Tap account capture mode', {
      chargeId: charge && charge.id,
    });
    return {
      kind: 'error',
      status: 502,
      error: 'That payment was authorised but not captured. Please contact support.',
    };
  }
  if (['FAILED', 'DECLINED', 'CANCELLED', 'ABANDONED'].includes(status)) {
    return {
      kind: 'declined',
      message:
        (charge.response && charge.response.message) ||
        'That card was declined. Try another card or pay with STC Pay.',
      chargeId: charge.id,
    };
  }
  // INITIATED with no redirect url is Tap telling us nothing useful.
  console.error('cardCharge: unexpected gateway response', tap.redactCharge(charge));
  return { kind: 'error', status: 502, error: 'Could not start the card payment. Please try again.' };
}

// Shared mapping from a charge result onto HTTP, so a decline looks
// identical in all three verticals. onPaid runs only for a charge that
// captured without a 3DS step — the caller passes the vertical's confirm.
//
// `vertical` is optional only so an old call site cannot break; every one of
// them passes it, and without it the charge id is not recorded and the
// order loses its webhook backstop.
async function respondToCharge(res, result, code, onPaid, vertical) {
  if (result.kind === 'redirect') {
    // Before the customer leaves for the hosted page — this is the only
    // moment we hold the charge id and can still write it down.
    if (vertical) {
      const { recordChargeStart } = require('./gatewayPaid');
      await recordChargeStart({ vertical, code, chargeId: result.chargeId });
    }
    return res.status(201).json({ code, url: result.url });
  }
  if (result.kind === 'paid') {
    // Confirm now rather than leaving the customer on a spinner until the
    // webhook lands. The webhook arrives shortly after and dedupes on the
    // gateway charge id, so confirming twice is a no-op.
    if (onPaid) await onPaid();
    return res.status(201).json({ code, paymentStatus: 'paid' });
  }
  if (result.kind === 'declined') {
    // 422, not 502 (that means our call to the gateway broke) and not 402
    // (unused in this codebase). failure_reason matches the idiom the food
    // checkout already uses for min_order / outside_radius / empty_cart.
    return res.status(422).json({ error: result.message, failure_reason: 'card_declined' });
  }
  return res.status(result.status || 502).json({
    error: result.error,
    ...(result.failure_reason ? { failure_reason: result.failure_reason } : {}),
  });
}

module.exports = { chargeForOrder, idempotencyKeyFrom, interpretCharge, respondToCharge };
