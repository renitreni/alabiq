// ---------------------------------------------------------------------
// Driver cash-owed settlement (pick & drop cash rides). Mirrors
// lib/foodMoney.js + lib/ledger.js, inverted: instead of the platform
// holding money it owes a partner, the driver holds fare money they owe
// the platform.
//
//   * a completed cash ride adds its platform_net (commission) to cash_owed
//   * at/over cash_owed_limit the driver cannot accept new cash rides
//   * an admin 'settlement' reduces cash_owed back down (weekly cadence)
//
// The cashAfterCharge / driverCashView / isBlockedFromCash functions are
// pure; chargeDriverCashOwed / settleDriverCash write the running balance
// (profiles.cash_owed) and the audit trail (driver_cash_ledger).
// ---------------------------------------------------------------------
const database = require('./database/pool');
const { config } = require('./config');

const { round2 } = require('./money');

function limitFor(driver) {
  const raw = Number(driver.cash_owed_limit);
  return Number.isFinite(raw) && raw > 0 ? raw : config.ledger.cashOwedLimit;
}

// State after (hypothetically) charging `amount` to a driver's cash_owed.
function cashAfterCharge(driver, amount) {
  const limit = limitFor(driver);
  const before = round2(Number(driver.cash_owed) || 0);
  const after = round2(before + round2(amount));
  const alertAt = round2(limit * config.ledger.cashOwedAlertPct);
  return {
    limit,
    before,
    after,
    alertAt,
    // At/over the cap the driver cannot accept new cash rides.
    canAcceptCash: before < limit,
    crossesAlert: before < alertAt && after >= alertAt,
    exhausted: after >= limit,
  };
}

// A driver is blocked from cash rides once their running balance reaches
// the cap (before any new charge).
function isBlockedFromCash(driver) {
  return round2(Number(driver.cash_owed) || 0) >= limitFor(driver);
}

// API-facing shape for the driver app + admin settlement screen.
function driverCashView(driver) {
  const limit = limitFor(driver);
  const owed = round2(Number(driver.cash_owed) || 0);
  const alertAt = round2(limit * config.ledger.cashOwedAlertPct);
  return {
    cashOwed: owed,
    cashOwedLimit: limit,
    cashRemaining: round2(Math.max(0, limit - owed)),
    alertAt,
    warning: owed >= alertAt && owed < limit,
    blocked: owed >= limit,
  };
}

// --- Balance writers (profiles.cash_owed + driver_cash_ledger) ------------

// Add `amount` (a ride's platform commission) to a driver's cash_owed and
// append a 'charge' ledger row. CAS on the previous balance so two writes
// can't both slip past. Best-effort by design — callers log and move on.
async function chargeDriverCashOwed({ driverId, bookingId = null, amount, note = null }) {
  const charge = round2(amount);
  if (!(charge > 0)) return { ok: true, skipped: true };

  try {
    return await database.transaction(async (client) => {
      const { rows } = await client.query('SELECT cash_owed FROM public.profiles WHERE id=$1 FOR UPDATE', [driverId]);
      if (!rows[0]) return { error: new Error('driver not found') };
      const before = round2(Number(rows[0].cash_owed) || 0);
      const after = round2(before + charge);
      await client.query('UPDATE public.profiles SET cash_owed=$2,updated_at=now() WHERE id=$1', [driverId, after]);
      await client.query(
        `INSERT INTO public.driver_cash_ledger(driver_id,booking_id,type,amount,balance_after,note)
         VALUES ($1,$2,'charge',$3,$4,$5)`, [driverId, bookingId, charge, after, note],
      );
      return { ok: true, balanceAfter: after };
    });
  } catch (error) {
    console.error('chargeDriverCashOwed transaction failed:', error);
    return { error };
  }
}

// Record that a driver paid Alabiq `amount` toward what they owe:
// reduce cash_owed (never below 0) and append a 'settlement' ledger row.
async function settleDriverCash({ driverId, amount, adminId = null, note = null }) {
  const paid = round2(amount);
  if (!(paid > 0)) return { error: new Error('amount must be > 0') };

  try {
    return await database.transaction(async (client) => {
      const { rows } = await client.query('SELECT cash_owed FROM public.profiles WHERE id=$1 FOR UPDATE', [driverId]);
      if (!rows[0]) return { error: new Error('driver not found') };
      const after = round2(Math.max(0, round2(Number(rows[0].cash_owed) || 0) - paid));
      await client.query('UPDATE public.profiles SET cash_owed=$2,updated_at=now() WHERE id=$1', [driverId, after]);
      await client.query(
        `INSERT INTO public.driver_cash_ledger(driver_id,type,amount,balance_after,note,created_by)
         VALUES ($1,'settlement',$2,$3,$4,$5)`, [driverId, paid, after, note, adminId],
      );
      return { ok: true, balanceAfter: after };
    });
  } catch (error) {
    return { error };
  }
}

module.exports = {
  round2,
  cashAfterCharge,
  isBlockedFromCash,
  driverCashView,
  limitFor,
  chargeDriverCashOwed,
  settleDriverCash,
};
