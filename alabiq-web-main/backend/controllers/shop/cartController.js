// ---------------------------------------------------------------------
// Ecommerce — persistent cart (one per customer + store)
//   - getCart        : GET    /api/shop/cart?merchant_id=
//   - addCartItem    : POST   /api/shop/cart/items { product_id, variant_id, quantity }
//   - updateCartItem : PATCH  /api/shop/cart/items/:id { quantity }
//   - removeCartItem : DELETE /api/shop/cart/items/:id
//
// The server reads prices from products/product_variants itself — the
// client never sends money. The subtotal/minimum returned here is a
// DISPLAY HINT for the cart screen; checkout recomputes everything from
// scratch and re-checks stock atomically.
//
// Stock is NOT reserved by adding to a cart. Reservation happens once, at
// checkout, inside shop_place_order(). A cart line therefore shows a
// banded availability that can go stale, which is why checkout can still
// return 409 out_of_stock and the cart screen must handle it.
// ---------------------------------------------------------------------
const database = require('../../lib/database/pool');
const { config } = require('../../lib/config');
const { vatFor } = require('../../lib/vat');
const { logShopEvent } = require('../../lib/foodEvents');
const { round2, resolveUnitPricing, availabilityBand, availableUnits } = require('../../lib/shopMoney');
const { merchantOpenState, CLOSED_RESPONSE } = require('../../lib/storeHours');

const MAX_QTY = 50;

const CART_LINE_SELECT =
  'id, quantity, unit_price, product_id, variant_id, ' +
  'products ( id, name, price, net_price, image_url, is_available, unit, brand, ' +
  'track_stock, stock_quantity, low_stock_threshold ), ' +
  'product_variants ( id, label, sku, price, net_price, stock_quantity, is_available )';

// Joins the LIVE catalogue, not a snapshot — prices can move between add-to-cart and checkout.
async function buildCartSummary(cart) {
  const { rows: lines } = await database.query(
    `SELECT ci.id,ci.quantity,ci.unit_price,ci.product_id,ci.variant_id,
     to_jsonb(p) AS products,to_jsonb(pv) AS product_variants
     FROM public.shop_cart_items ci LEFT JOIN public.products p ON p.id=ci.product_id
     LEFT JOIN public.product_variants pv ON pv.id=ci.variant_id
     WHERE ci.cart_id=$1 ORDER BY ci.created_at`, [cart.id]);

  const items = (lines || []).map((line) => {
    const product = line.products;
    const variant = line.product_variants;
    if (!product) {
      return {
        id: line.id,
        productId: line.product_id,
        name: 'Removed product',
        unitPrice: Number(line.unit_price),
        quantity: line.quantity,
        isAvailable: false,
        availability: 'out',
        lineTotal: round2(Number(line.unit_price) * line.quantity),
      };
    }

    const { unitPrice } = resolveUnitPricing(product, variant);
    // A variant the store disabled since it went in the cart makes the line
    // unavailable rather than silently repricing to the base product.
    const variantStillValid = !line.variant_id || (variant && variant.is_available);
    const stockRow = variant
      ? { stock_quantity: variant.stock_quantity, low_stock_threshold: product.low_stock_threshold }
      : product;

    return {
      id: line.id,
      productId: line.product_id,
      variantId: line.variant_id || null,
      name: product.name,
      brand: product.brand,
      unit: product.unit,
      variantLabel: variant ? variant.label : null,
      sku: variant ? variant.sku : null,
      imageUrl: product.image_url,
      unitPrice,
      quantity: line.quantity,
      // Exact counts stay server-side. An earlier version also returned an
      // `exceedsStock` boolean, which was a free oracle: a client could
      // binary-search the exact stock level by PATCHing quantities and
      // watching the flag flip. That is precisely the sales-velocity
      // disclosure the 0029 column grants exist to prevent, handed back
      // through the API instead. The band is all the cart needs; checkout
      // is the authority and fails with a named 409 if a line is short.
      availability: availabilityBand(stockRow, product.track_stock),
      isAvailable: product.is_available && variantStillValid,
      lineTotal: round2(unitPrice * line.quantity),
    };
  });

  const subtotal = round2(items.reduce((sum, i) => sum + i.lineTotal, 0));
  const minOrder = config.shop.minOrderSar;
  // Mirrors priceShopOrder() in lib/shopMoney.js: VAT on the goods only, the
  // delivery fee sits outside the taxable base. The minimum-order gate stays
  // on the EX-VAT subtotal.
  const deliveryFee = round2(config.shop.deliveryFeeSar);
  const { vatRate, vatAmount } = vatFor(subtotal);

  return {
    cartId: cart.id,
    merchantId: cart.merchant_id,
    items,
    subtotal,
    minOrder,
    meetsMinimum: subtotal >= minOrder,
    shortfall: subtotal >= minOrder ? 0 : round2(minOrder - subtotal),
    // Blocks checkout client-side; the server re-checks atomically anyway.
    // Only 'out' and unavailability are surfaced — a 'low' line is still
    // orderable, and reporting anything finer would leak the count.
    hasBlockingLine: items.some((i) => !i.isAvailable || i.availability === 'out'),
    deliveryFee,
    vatRate,
    vatAmount,
    total: round2(subtotal + deliveryFee + vatAmount),
  };
}

async function loadOwnCart(userId, merchantId) {
  const { rows } = await database.query(
    'SELECT id,merchant_id FROM public.shop_carts WHERE customer_id=$1 AND merchant_id=$2 LIMIT 1',
    [userId,merchantId]);
  return rows[0] || null;
}

async function getCart(req, res) {
  try {
    const merchantId = (req.query.merchant_id || '').toString();
    if (!merchantId) {
      return res.status(400).json({ error: 'merchant_id query parameter is required' });
    }
    const cart = await loadOwnCart(req.userId, merchantId);
    if (!cart) {
      return res.json({
        cartId: null,
        merchantId,
        items: [],
        subtotal: 0,
        minOrder: config.shop.minOrderSar,
        meetsMinimum: false,
        shortfall: config.shop.minOrderSar,
        hasBlockingLine: false,
        deliveryFee: config.shop.deliveryFeeSar,
      });
    }
    return res.json(await buildCartSummary(cart));
  } catch (err) {
    console.error('shop getCart error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

async function addCartItem(req, res) {
  try {
    const { product_id, quantity = 1 } = req.body;
    const variantId = req.body.variant_id || null;

    // Server reads the product + store state itself.
    const { rows: productRows } = await database.query(
      `SELECT p.id,p.merchant_id,p.name,p.price,p.net_price,p.is_available,p.track_stock,p.stock_quantity,
       to_jsonb(m) AS merchants FROM public.products p
       LEFT JOIN public.merchants m ON m.id=p.merchant_id WHERE p.id=$1 LIMIT 1`, [product_id]);
    const product = productRows[0];
    if (!product) return res.status(404).json({ error: 'Product not found' });
    if (!product.is_available) {
      return res.status(409).json({ error: 'This product is currently unavailable' });
    }
    const store = product.merchants;
    if (!store || store.vertical !== 'shop' || !store.is_active || store.status !== 'active') {
      return res.status(409).json({ error: 'This store is not accepting orders right now' });
    }
    // Closed is separate from unavailable: the store is listed and will trade
    // again later. Enforced here as well as at checkout so a cart cannot be
    // built up against a closed store and pushed through the moment it opens
    // at prices that moved.
    const openState = await merchantOpenState(product.merchant_id, store.accepting_orders);
    if (!openState.open) return res.status(409).json(CLOSED_RESPONSE);

    // Variant handling: a product WITH available variants requires one; a
    // product without them rejects any variant the client sends. Belongs to
    // this product only — a variant id from another product is a 400, not a
    // silent cross-product add.
    const { rows: variants } = await database.query(
      `SELECT id,label,price,net_price,stock_quantity,is_available FROM public.product_variants
       WHERE product_id=$1 AND is_available=true`, [product.id]);

    let variant = null;
    if (variants.length > 0) {
      if (!variantId) return res.status(400).json({ error: 'Please pick an option for this product' });
      variant = variants.find((v) => v.id === variantId) || null;
      if (!variant) return res.status(400).json({ error: 'That option is no longer available' });
    } else if (variantId) {
      return res.status(400).json({ error: 'This product does not have options' });
    }

    const { unitPrice } = resolveUnitPricing(product, variant);

    // Fail early on an obviously impossible quantity so the customer finds
    // out here rather than at checkout. This is a courtesy check only —
    // shop_place_order() is the authority and re-checks under a row lock.
    const available = availableUnits(product, variant);
    if (available != null && available <= 0) {
      logShopEvent({
        eventName: 'out_of_stock_block',
        userId: req.userId,
        merchantId: product.merchant_id,
        params: { product_id: product.id, requested: quantity, available: 0 },
      });
      return res.status(409).json({ error: 'This product is out of stock' });
    }

    let cart = await loadOwnCart(req.userId, product.merchant_id);
    if (!cart) {
      const { rows } = await database.query(
        `INSERT INTO public.shop_carts(customer_id,merchant_id) VALUES($1,$2)
         ON CONFLICT(customer_id,merchant_id) DO UPDATE SET merchant_id=EXCLUDED.merchant_id
         RETURNING id,merchant_id`, [req.userId,product.merchant_id]);
      cart = rows[0];
    }

    // Same product + same variant again bumps the quantity (capped at
    // MAX_QTY). A different variant is a separate line — the unique index
    // covers cart + product + variant.
    const { rows: existingRows } = await database.query(
      `SELECT id,quantity FROM public.shop_cart_items WHERE cart_id=$1 AND product_id=$2
       AND variant_id IS NOT DISTINCT FROM $3 LIMIT 1`, [cart.id,product.id,variant ? variant.id : null]);
    const existing = existingRows[0];

    // Cap at MAX_QTY only — deliberately NOT at `available`. Clamping to the
    // stock level would echo the exact count straight back in the response
    // (`quantity` in the returned cart), which is the same disclosure the
    // 0029 grants close off at the database. An over-quantity line is caught
    // at checkout by the RPC, which is the authority anyway.
    const cap = (n) => Math.max(1, Math.min(n, MAX_QTY));

    if (existing) {
      await database.query('UPDATE public.shop_cart_items SET quantity=$2,unit_price=$3 WHERE id=$1',
        [existing.id,cap(existing.quantity + quantity),unitPrice]);
    } else {
      await database.query(
        `INSERT INTO public.shop_cart_items(cart_id,product_id,variant_id,quantity,unit_price)
         VALUES($1,$2,$3,$4,$5)`,
        [cart.id,product.id,variant ? variant.id : null,cap(quantity),unitPrice]);
    }

    logShopEvent({
      eventName: 'add_to_cart',
      userId: req.userId,
      merchantId: product.merchant_id,
      params: {
        product_id: product.id,
        variant_id: variant ? variant.id : null,
        price: Number(unitPrice),
        quantity,
      },
    });

    return res.status(201).json(await buildCartSummary(cart));
  } catch (err) {
    console.error('shop addCartItem error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

// null if the line isn't the caller's — never let one customer touch another's cart.
async function loadOwnCartLine(userId, lineId) {
  const { rows } = await database.query(
    `SELECT ci.id,ci.cart_id,to_jsonb(c) AS shop_carts FROM public.shop_cart_items ci
     JOIN public.shop_carts c ON c.id=ci.cart_id WHERE ci.id=$1 AND c.customer_id=$2 LIMIT 1`,
    [lineId,userId]);
  return rows[0] || null;
}

async function updateCartItem(req, res) {
  try {
    const { quantity } = req.body;
    const line = await loadOwnCartLine(req.userId, req.params.id);
    if (!line) return res.status(404).json({ error: 'Cart item not found' });

    if (quantity === 0) {
      await database.query('DELETE FROM public.shop_cart_items WHERE id=$1', [line.id]);
    } else {
      await database.query('UPDATE public.shop_cart_items SET quantity=$2 WHERE id=$1',
        [line.id,Math.min(quantity,MAX_QTY)]);
    }
    return res.json(
      await buildCartSummary({ id: line.cart_id, merchant_id: line.shop_carts.merchant_id })
    );
  } catch (err) {
    console.error('shop updateCartItem error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

async function removeCartItem(req, res) {
  try {
    const line = await loadOwnCartLine(req.userId, req.params.id);
    if (!line) return res.status(404).json({ error: 'Cart item not found' });

    await database.query('DELETE FROM public.shop_cart_items WHERE id=$1', [line.id]);
    return res.json(
      await buildCartSummary({ id: line.cart_id, merchant_id: line.shop_carts.merchant_id })
    );
  } catch (err) {
    console.error('shop removeCartItem error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

module.exports = { getCart, addCartItem, updateCartItem, removeCartItem, buildCartSummary, CART_LINE_SELECT };
