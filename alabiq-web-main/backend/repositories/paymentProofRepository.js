'use strict';

const database = require('../lib/database/pool');

async function bookingForPayment(code) {
  const result = await database.query(
    `SELECT id,booking_code,fare_amount,vat_amount,vat_rate,total_amount,currency,
            payment_method,payment_status,booking_status
       FROM public.bookings WHERE booking_code=$1`, [code],
  );
  return result.rows[0] || null;
}

async function record({ booking, proof }) {
  return database.transaction(async (client) => {
    const inserted = await client.query(
      `INSERT INTO public.payment_proofs
        (booking_id,file_url,file_name,file_mime_type,file_size_bytes,file_hash,status)
       VALUES ($1,$2,$3,$4,$5,$6,'uploaded') RETURNING id`,
      [booking.id, proof.path, proof.file_name ?? null, proof.mime_type ?? null,
        proof.size_bytes ?? null, proof.file_hash ?? null],
    );
    const updated = await client.query(
      `UPDATE public.bookings SET payment_status='proof_uploaded',booking_status='payment_under_review'
        WHERE id=$1 AND payment_status=ANY($2::text[])
        RETURNING id`,
      [booking.id, ['awaiting_proof','proof_uploaded','under_review','rejected']],
    );
    if (!updated.rowCount) throw new Error('Booking payment status changed before proof was recorded');
    return { id: inserted.rows[0].id };
  });
}

module.exports = { bookingForPayment, record };
