// ---------------------------------------------------------------------
// "Ask Tap what actually happened to this charge, and settle the order."
//
// ONE implementation, three callers, because the alternative is three
// subtly different opinions about when money has moved:
//
//   * the webhook            — Tap tells us
//   * verify-on-return       — the customer comes back with tap_id in the URL
//   * sweepUnconfirmedCharges — nobody told us and nobody came back
//
// Only the FIRST of those existed. Which meant a webhook that never arrived
// (dropped at the edge, blocked by a firewall rule, or simply never sent
// because PUBLIC_API_BASE was unset and post.url was a relative path) left
// the customer debited, the order stuck on 'awaiting' forever, and nothing
// in the logs — because from our side nothing had failed. The charge id was
// not even persisted, so there was nothing to reconcile against later.
//
// THE RULE THIS MODULE ENFORCES: the posted webhook body is never acted on.
// Tap's hashstring covers seven named fields and reference.order is not one
// of them, so on the body it is an unauthenticated field choosing which
// order to settle. Everything below reads the charge back from Tap's own
// API and works only from that.
// ---------------------------------------------------------------------
const tap = require('./tap');
const savedCards = require('./savedCards');
const paymentRepository = require('../repositories/gatewayPaymentRepository');
const { confirmGatewayPayment, isKnownVertical } = require('./gatewayPaid');

const FAILURE_STATUSES = ['FAILED', 'DECLINED', 'CANCELLED', 'ABANDONED'];

// Our own charges always carry metadata.vertical. The code prefix is the
// fallback, matching how driverDispatchController resolves the same thing.
function resolveVertical(charge) {
  const fromMetadata = charge && charge.metadata && charge.metadata.vertical;
  if (isKnownVertical(fromMetadata)) return fromMetadata;
  const code = String((charge && charge.reference && charge.reference.order) || '').toUpperCase();
  if (code.startsWith('FD-')) return 'food';
  if (code.startsWith('SH-')) return 'shop';
  return 'ride';
}

// A failed charge leaves the order payable so the customer can retry. It is
// never walked back from a settled state.
async function markFailed(vertical, code) {
  return paymentRepository.markFailed(vertical, code);
}

// Settle one charge against the order it names.
//
// Returns a discriminated result rather than throwing, so the webhook can
// choose its HTTP status (a fetch failure must be retried; a rejection must
// not be) and the sweeper can log and move on:
//
//   { ok: true,  outcome: 'paid' | 'already_paid', vertical, code, charge, record }
//   { ok: true,  outcome: 'failed' | 'ignored', status, vertical, code, charge }
//   { ok: false, reason: 'fetch_failed' | 'malformed' | 'refused', ... }
//
// `outcome: 'ignored'` covers INITIATED and AUTHORIZED — a charge still in
// flight. Authorised is a HOLD, not settled money; confirming on it would
// fulfil an order against funds that can still be voided.
async function settleCharge(chargeId) {
  if (!chargeId) return { ok: false, reason: 'malformed' };

  let charge;
  try {
    charge = await tap.fetchCharge(chargeId);
  } catch (err) {
    return { ok: false, reason: 'fetch_failed', error: err && err.message };
  }

  const code = charge && charge.reference && charge.reference.order;
  if (!code) return { ok: false, reason: 'malformed', charge };

  const status = String((charge && charge.status) || '').toUpperCase();
  const vertical = resolveVertical(charge);

  if (status !== 'CAPTURED') {
    if (FAILURE_STATUSES.includes(status)) {
      await markFailed(vertical, code);
      return { ok: true, outcome: 'failed', status, vertical, code, charge };
    }
    return { ok: true, outcome: 'ignored', status, vertical, code, charge };
  }

  const result = await confirmGatewayPayment({
    vertical,
    code,
    chargeId: charge.id,
    status,
    amountPaid: charge.amount,
    currency: charge.currency,
  });

  if (!result.ok) {
    return { ok: false, reason: 'refused', detail: result, vertical, code, charge };
  }

  // If the charge carried save_card, persist the references Tap minted.
  // This is the only place guaranteed to observe a COMPLETED 3DS charge —
  // the synchronous response for one is INITIATED and carries no card id,
  // and the customer may never return to the redirect URL at all.
  // userId comes from the ORDER, never from charge metadata.
  const ownerId = result.record && (result.record.customer_id || null);
  if (ownerId) {
    try {
      await savedCards.saveMethodFromCharge({ userId: ownerId, charge, consentReference: code });
    } catch (err) {
      // A failure to remember the card must not un-pay the order.
      console.error('settleCharge: could not save payment method', { code, error: err.message });
    }
  }

  return {
    ok: true,
    outcome: result.alreadyPaid ? 'already_paid' : 'paid',
    vertical,
    code,
    charge,
    record: result.record,
  };
}

module.exports = { settleCharge, resolveVertical, markFailed };
