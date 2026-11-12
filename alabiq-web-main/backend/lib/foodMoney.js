// ---------------------------------------------------------------------
// Food Delivery money math — the SINGLE source of truth (server-side).
//
// Every SAR amount on a food order is computed here from DB menu prices
// at checkout and stored as a snapshot. Client-sent totals are ignored
// everywhere. The hard rules (PRD §7 / §10):
//   * subtotal = Σ(unit_price × quantity), must be >= 30 SAR
//   * per-item platform margin: 5 SAR (meal_package),
//     3 SAR (drink_dessert_addon)
//   * delivery fee: flat 10 SAR within 15 km (3-month promo), plus
//     0.25 SAR per km beyond it; past 50 km checkout is rejected
//   * VAT: 15% charged ON TOP of the subtotal only. The delivery fee is
//     outside the taxable base — a customer paying 100 for food and 10 for
//     delivery is taxed on the 100.
//   * of the delivery fee, the driver keeps 90% and the platform 10%
//   * total = subtotal + delivery_fee + vat
//
// The margin is NOT a customer-facing line and is NOT billed to the merchant
// separately. It is collected once, at checkout: it already sits inside the
// list price, and the merchant is paid subtotal - margin. Accepting an order
// used to also charge it to merchants.credit_used, which billed it twice.
//
// The minimum-order test runs on the EX-VAT subtotal, and the merchant's
// payout/margin math never sees VAT — it is the platform's liability to
// the tax authority, not revenue to split.
// ---------------------------------------------------------------------
const { config } = require('./config');
const { vatFor } = require('./vat');
const { surchargeFor, exceedsMaxRadius, driverShareOf } = require('./deliveryPricing');

const { round2 } = require('./money');

// Margin the platform earns on one unit of an item, by menu_items.item_type.
// This is the FALLBACK now: only used when an item has no explicit net price.
function marginForItemType(itemType) {
  const margin = config.food.margins[itemType];
  if (margin == null) {
    throw new Error(`Unknown item_type "${itemType}" — no platform margin defined`);
  }
  return margin;
}

// Markup the platform keeps on ONE unit of an item.
//   * with a net price set: markup = list price − net price (Ka Inasal
//     "X SAR (Y)" pattern — varies per item, 0..10+ SAR)
//   * without one (net price null): the flat config.food.margins by
//     item_type (back-compat for legacy / single-price menu rows)
// The DB CHECK (migration 0018) guarantees net_price <= price, so the
// clamp below is only defence in depth.
function markupPerUnit({ unitPrice, netPrice, itemType }) {
  if (netPrice != null) {
    const markup = round2(Number(unitPrice) - Number(netPrice));
    return markup < 0 ? 0 : markup;
  }
  // Clamp the flat fallback to the unit price too. The net_price branch
  // above cannot go negative, but the fallback compared against nothing --
  // so an item priced below its own flat margin (live: BOTTLED WATER at
  // 1.99 against a 3.00 drink margin) charged the merchant MORE than the
  // line earned, driving `subtotal - markup` negative with nothing
  // downstream rejecting it.
  return Math.min(marginForItemType(itemType), round2(Number(unitPrice)));
}

// Price a whole order from trusted inputs (fresh DB menu rows + a distance
// the server computed itself).
//
//   items: [{ menuItemId, name, unitPrice, quantity, itemType }]
//   distanceKm: haversine merchant -> delivery point, or null when either
//               side has no coordinates (fee stays at the flat promo rate,
//               with no surcharge — a null distance is never guessed at).
//
// Returns { ok: true, subtotal, marginTotal, baseDeliveryFee,
//           deliverySurcharge, deliveryFee, vatRate, vatAmount, total, lines }
// or      { ok: false, failureReason: 'min_order' | 'outside_radius', ... }.
// maxRadiusKm: the admin-set limit from lib/settings.js, or null for no
// limit. Defaults to the env value so callers that have not resolved the
// setting (and the money tests) keep the pre-0043 behaviour.
function priceOrder({ items, distanceKm, maxRadiusKm = config.delivery.maxRadiusKm }) {
  const lines = items.map((item) => {
    const quantity = Math.trunc(Number(item.quantity));
    const unitPrice = round2(item.unitPrice);
    const marginPerItem = markupPerUnit({
      unitPrice,
      netPrice: item.netPrice ?? null,
      itemType: item.itemType,
    });
    return {
      menuItemId: item.menuItemId,
      name: item.name,
      size: item.size ?? null,
      sizeLabel: item.sizeLabel ?? null,
      unitPrice,
      quantity,
      lineTotal: round2(unitPrice * quantity),
      marginPerItem,
      marginTotal: round2(marginPerItem * quantity),
    };
  });

  const subtotal = round2(lines.reduce((sum, l) => sum + l.lineTotal, 0));
  const marginTotal = round2(lines.reduce((sum, l) => sum + l.marginTotal, 0));

  if (subtotal < config.food.minOrderSar) {
    return {
      ok: false,
      failureReason: 'min_order',
      subtotal,
      minOrder: config.food.minOrderSar,
      shortfall: round2(config.food.minOrderSar - subtotal),
    };
  }

  // The cut-off is the MAX radius, not the free one: past config.food.radiusKm
  // we still deliver, we just charge for the extra kilometres.
  if (exceedsMaxRadius(distanceKm, maxRadiusKm)) {
    return {
      ok: false,
      failureReason: 'outside_radius',
      distanceKm: round2(distanceKm),
      maxRadiusKm,
      // Kept for callers still reading the old field name.
      radiusKm: maxRadiusKm,
    };
  }

  const baseDeliveryFee = round2(config.food.deliveryFeeSar);
  const { surcharge: deliverySurcharge } = surchargeFor(distanceKm);
  const deliveryFee = round2(baseDeliveryFee + deliverySurcharge);

  // Delivery is outside the VAT base, so the surcharge is too — it lives
  // inside deliveryFee. Only the goods are taxed.
  const { vatRate, vatAmount } = vatFor(subtotal);
  const total = round2(subtotal + deliveryFee + vatAmount);

  // What the driver earns for this run. Snapshotted onto the order rather
  // than recomputed later: repricing the split must never restate a delivery
  // already made, nor a cash balance already owed against it.
  const { driverFee, driverFeeRate } = driverShareOf(deliveryFee);

  return {
    ok: true,
    subtotal,
    marginTotal,
    baseDeliveryFee,
    deliverySurcharge,
    deliveryFee,
    driverFee,
    driverFeeRate,
    vatRate,
    vatAmount,
    total,
    lines,
  };
}

// Credit state after (hypothetically) charging `marginTotal` to a merchant.
// Used by the accept flow to decide charge / 80% alert / suspension.
function creditAfterCharge(merchant, marginTotal) {
  const limit = Number(merchant.credit_limit) || config.food.merchantCreditLimit;
  const before = round2(Number(merchant.credit_used) || 0);
  const after = round2(before + marginTotal);
  const alertAt = round2(limit * config.food.creditAlertPct);
  return {
    limit,
    before,
    after,
    alertAt,
    canAccept: before < limit, // at/over the limit the merchant cannot accept
    crossesAlert: before < alertAt && after >= alertAt,
    exhausted: after >= limit,
  };
}

module.exports = { round2, marginForItemType, markupPerUnit, priceOrder, creditAfterCharge };
