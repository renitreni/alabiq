'use strict';

const database = require('../lib/database/pool');

async function createForBooking({ bookingId, driverId, amounts, payoutStatus }) {
  const result = await database.query(
    `INSERT INTO public.ledger_entries
       (booking_id, driver_id, gross_fare, platform_commission, manual_payment_fee,
        driver_gross, driver_net, platform_net, payout_status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (booking_id) DO NOTHING
     RETURNING *`,
    [bookingId, driverId, amounts.gross_fare, amounts.platform_commission,
      amounts.manual_payment_fee, amounts.driver_gross, amounts.driver_net,
      amounts.platform_net, payoutStatus],
  );
  if (result.rows[0]) return { ledger: result.rows[0], skipped: false };
  const existing = await database.query(
    'SELECT * FROM public.ledger_entries WHERE booking_id=$1', [bookingId],
  );
  return { ledger: existing.rows[0] || null, skipped: true };
}

module.exports = { createForBooking };
