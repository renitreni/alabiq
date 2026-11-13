'use strict';

// Partner delivery request validation (cross-field rules the schema can't express).
//
// why: partner-supplied items are a trust boundary. A restaurant integration must
// not be able to declare a merchandise_total that disagrees with its own line
// items, and every item must carry a real price so financial snapshots on
// order_items are complete.

// Returns null when valid, or { code, message } describing the first problem.
function validatePartnerItems(items, merchandiseTotal) {
  if (!Array.isArray(items) || items.length === 0) {
    return { code: 'invalid_items', message: 'items must be a non-empty array' };
  }

  let sumMinor = 0;
  for (const item of items) {
    if (!item || typeof item.name !== 'string' || !item.name.trim()) {
      return { code: 'invalid_items', message: 'each item needs a non-empty name' };
    }
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99) {
      return { code: 'invalid_items', message: 'item quantity must be an integer between 1 and 99' };
    }
    if (!Number.isInteger(item.unit_price_minor) || item.unit_price_minor < 0) {
      return { code: 'invalid_items', message: 'each item needs an integer unit_price_minor >= 0' };
    }
    sumMinor += item.unit_price_minor * item.quantity;
  }

  const declared = merchandiseTotal && Number.isInteger(merchandiseTotal.amount_minor)
    ? merchandiseTotal.amount_minor
    : null;
  if (declared === null || declared < 0) {
    return { code: 'invalid_merchandise_total', message: 'merchandise_total.amount_minor must be a non-negative integer' };
  }

  // Tolerance of 1 minor unit: protects against single-halala rounding drift
  // while still catching grossly mismatched totals.
  if (Math.abs(sumMinor - declared) > 1) {
    return {
      code: 'item_totals_mismatch',
      message: `items sum to ${sumMinor} minor units but merchandise_total declares ${declared}`,
    };
  }

  return null;
}

module.exports = { validatePartnerItems };
