'use strict';

const database = require('../lib/database/pool');

async function dueOrders({ cutoff, intervalMs, maxCount, limit }) {
  const result = await database.query(
    `SELECT o.id, o.order_code, o.status, o.payment_status, o.payment_method,
            o.customer_id, o.merchant_id, o.created_at, o.preparing_reminder_count,
            o.preparing_reminder_last_at, m.owner_id AS merchant_owner_id,
            m.name AS merchant_name
       FROM public.orders o
       LEFT JOIN public.merchants m ON m.id=o.merchant_id
      WHERE o.status IN ('pending','accepted')
        AND o.preparing_reminder_count < $1
        AND o.created_at <= $2::timestamptz
        AND (o.preparing_reminder_last_at IS NULL
             OR o.preparing_reminder_last_at <= $2::timestamptz)
      ORDER BY o.preparing_reminder_last_at ASC NULLS FIRST, o.created_at ASC
      LIMIT $3`,
    [maxCount, cutoff, limit],
  );
  return result.rows.map((row) => ({ ...row, interval_ms: intervalMs }));
}

async function claimReminder({ order, attempt, at }) {
  const result = await database.query(
    `UPDATE public.orders
        SET preparing_reminder_count=$1, preparing_reminder_last_at=$2
      WHERE id=$3 AND preparing_reminder_count=$4 AND status=$5
      RETURNING order_code`,
    [attempt, at, order.id, order.preparing_reminder_count, order.status],
  );
  return result.rows[0] || null;
}

module.exports = { dueOrders, claimReminder };
