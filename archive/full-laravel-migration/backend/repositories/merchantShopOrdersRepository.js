'use strict';

const database = require('../lib/database/pool');

async function ownedOrder(storeId, code) {
  const result = await database.query(
    'SELECT id,merchant_id FROM public.shop_orders WHERE order_code=$1 AND merchant_id=$2', [code, storeId],
  );
  return result.rows[0] || null;
}

async function listForStore(storeId, limit = 100) {
  const result = await database.query(
    `SELECT o.id,o.order_code,o.status,o.subtotal,o.delivery_fee,o.vat_amount,o.vat_rate,o.total,
        o.delivery_address,o.delivery_street,o.delivery_building,o.contact_phone,o.payment_status,
        o.payment_method,o.reject_reason,o.created_at,o.accepted_at,o.packed_at,o.ready_at,o.delivered_at,
        c.full_name AS customer_name,c.mobile_number AS customer_mobile,c.whatsapp_number AS customer_whatsapp,
        d.status AS delivery_status,d.driver_id,d.pickup_photo_path,d.delivery_photo_path,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('id',i.id,'name_snapshot',i.name_snapshot,
          'variant_label_snapshot',i.variant_label_snapshot,'sku_snapshot',i.sku_snapshot,
          'unit_price',i.unit_price,'quantity',i.quantity,'line_total',i.line_total) ORDER BY i.created_at)
          FROM public.shop_order_items i WHERE i.order_id=o.id),'[]'::jsonb) AS items
       FROM public.shop_orders o
       LEFT JOIN public.profiles c ON c.id=o.customer_id
       LEFT JOIN public.shop_deliveries d ON d.order_id=o.id
      WHERE o.merchant_id=$1 ORDER BY o.created_at DESC LIMIT $2`, [storeId, limit],
  );
  return result.rows;
}

module.exports = { ownedOrder, listForStore };
