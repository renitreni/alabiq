'use strict';

const database = require('../lib/database/pool');

async function create({ body, signatureVerified, payloadHash }) {
  const result = await database.query(
    `INSERT INTO public.webhook_events
      (provider,event_type,gateway_payment_id,signature_verified,payload,payload_sha256)
     VALUES ('tap',$1,$2,$3,$4,$5) RETURNING id`,
    [(body && body.status) || null, (body && body.id) || null,
      signatureVerified, body, payloadHash],
  );
  return result.rows[0]?.id || null;
}

const PATCH_COLUMNS = ['verified_by_fetch','event_type','booking_id','order_id','shop_order_id'];
async function finish(eventId, patch) {
  if (!eventId) return;
  const fields = Object.keys(patch).filter((field) => PATCH_COLUMNS.includes(field));
  const values = fields.map((field) => patch[field]);
  const assignments = fields.map((field, index) => `${field}=$${index + 1}`);
  assignments.push('processed_at=now()');
  values.push(eventId);
  await database.query(
    `UPDATE public.webhook_events SET ${assignments.join(',')} WHERE id=$${values.length}`,
    values,
  );
}

module.exports = { create, finish };
