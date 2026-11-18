'use strict';

const database = require('../lib/database/pool');

async function listForMerchant({ merchantId, status, limit = 100 }) {
  const values = [merchantId];
  let statusClause = '';
  if (status) {
    values.push(status);
    statusClause = 'AND o.status=$2';
  }
  values.push(limit);
  const limitParam = values.length;
  const result = await database.query(
    `SELECT o.id,o.order_code,o.status,o.payment_status,o.payment_method,o.subtotal,
            o.delivery_fee,o.total,o.delivery_address,o.delivery_street,o.delivery_building,
            o.created_at,o.delivered_at,c.full_name AS customer_name,c.mobile_number AS customer_mobile,
            d.status AS delivery_status,d.driver_id,d.pickup_photo_path,d.delivery_photo_path,
            rider.full_name AS rider_name,rider.whatsapp_number AS rider_whatsapp,
            rider.mobile_number AS rider_mobile,
            COALESCE((SELECT jsonb_agg(jsonb_build_object('name_snapshot',i.name_snapshot,
              'quantity',i.quantity,'line_total',i.line_total) ORDER BY i.created_at)
              FROM public.order_items i WHERE i.order_id=o.id),'[]'::jsonb) AS items
       FROM public.orders o
       LEFT JOIN public.profiles c ON c.id=o.customer_id
       LEFT JOIN public.deliveries d ON d.order_id=o.id
       LEFT JOIN public.profiles rider ON rider.id=d.driver_id
      WHERE o.merchant_id=$1 ${statusClause}
      ORDER BY o.created_at DESC LIMIT $${limitParam}`,
    values,
  );
  return result.rows;
}

module.exports = { listForMerchant };
