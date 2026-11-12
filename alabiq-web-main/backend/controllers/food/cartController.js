// ---------------------------------------------------------------------
// Food Delivery — persistent cart (one per customer + merchant)
//   - getCart        : GET    /api/food/cart?merchant_id=
//   - addCartItem    : POST   /api/food/cart/items { menu_item_id, quantity }
//   - updateCartItem : PATCH  /api/food/cart/items/:id { quantity }
//   - removeCartItem : DELETE /api/food/cart/items/:id
//
// The server reads prices from menu_items itself — the client never
// sends money. The subtotal/minimum returned here is a DISPLAY HINT for
// the cart screen; checkout recomputes everything from scratch.
// ---------------------------------------------------------------------
const database = require('../../lib/database/pool');
const { config } = require('../../lib/config');
const { round2 } = require('../../lib/foodMoney');
const { vatFor } = require('../../lib/vat');
const { merchantOpenState, CLOSED_RESPONSE } = require('../../lib/storeHours');
const { logFoodEvent } = require('../../lib/foodEvents');
const { hasEnabledSizes, findSizeOption } = require('../../lib/foodSizes');

const MAX_QTY = 50;

// Joins the LIVE menu, not a snapshot — prices can move between add-to-cart and checkout.
async function buildCartSummary(cart) {
  const { rows: lines } = await database.query(
    `SELECT ci.id,ci.quantity,ci.unit_price,ci.size,ci.menu_item_id,to_jsonb(mi) AS menu_items
     FROM public.cart_items ci LEFT JOIN public.menu_items mi ON mi.id=ci.menu_item_id
     WHERE ci.cart_id=$1 ORDER BY ci.created_at`, [cart.id]);

  const items = (lines || []).map((line) => {
    const menu = line.menu_items;
    // A sized line prices from its (still enabled) size option; if the admin
    // disabled that size since, the line shows as unavailable.
    const sizeOption = menu && line.size ? findSizeOption(menu.size_options, line.size) : null;
    const unitPrice = sizeOption
      ? Number(sizeOption.price)
      : menu ? Number(menu.price) : Number(line.unit_price);
    const sizeStillValid = !line.size || !!sizeOption;
    return {
      id: line.id,
      menuItemId: line.menu_item_id,
      name: menu ? menu.name : 'Removed item',
      imageUrl: menu ? menu.image_url : null,
      unitPrice,
      quantity: line.quantity,
      size: line.size || null,
      sizeLabel: sizeOption ? sizeOption.label : null,
      isAvailable: (menu ? menu.is_available : false) && sizeStillValid,
      lineTotal: round2(unitPrice * line.quantity),
    };
  });

  const subtotal = round2(items.reduce((sum, i) => sum + i.lineTotal, 0));
  const minOrder = config.food.minOrderSar;
  // Mirrors priceOrder() in lib/foodMoney.js: VAT on the goods only, the
  // delivery fee sits outside the taxable base. The minimum-order gate stays
  // on the EX-VAT subtotal.
  const deliveryFee = round2(config.food.deliveryFeeSar);
  const { vatRate, vatAmount } = vatFor(subtotal);
  return {
    cartId: cart.id,
    merchantId: cart.merchant_id,
    items,
    subtotal,
    minOrder,
    meetsMinimum: subtotal >= minOrder,
    shortfall: subtotal >= minOrder ? 0 : round2(minOrder - subtotal),
    deliveryFee,
    vatRate,
    vatAmount,
    total: round2(subtotal + deliveryFee + vatAmount),
  };
}

async function loadOwnCart(userId, merchantId) {
  const { rows } = await database.query(
    'SELECT id,merchant_id FROM public.carts WHERE customer_id=$1 AND merchant_id=$2 LIMIT 1',
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
        minOrder: config.food.minOrderSar,
        meetsMinimum: false,
        shortfall: config.food.minOrderSar,
        deliveryFee: config.food.deliveryFeeSar,
      });
    }
    return res.json(await buildCartSummary(cart));
  } catch (err) {
    console.error('getCart error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

async function addCartItem(req, res) {
  try {
    const { menu_item_id, quantity = 1 } = req.body;
    const size = req.body.size || null;

    // Server reads the item + restaurant state itself.
    const { rows: itemRows } = await database.query(
      `SELECT mi.id,mi.merchant_id,mi.name,mi.price,mi.is_available,mi.size_options,
       to_jsonb(m) AS merchants FROM public.menu_items mi
       LEFT JOIN public.merchants m ON m.id=mi.merchant_id WHERE mi.id=$1 LIMIT 1`, [menu_item_id]);
    const item = itemRows[0];
    if (!item) return res.status(404).json({ error: 'Menu item not found' });
    if (!item.is_available) {
      return res.status(409).json({ error: 'This item is currently unavailable' });
    }
    if (!item.merchants || !item.merchants.is_active || item.merchants.status !== 'active') {
      return res.status(409).json({ error: 'This restaurant is not accepting orders right now' });
    }
    // Closed is separate from unavailable: the restaurant is listed and will
    // trade again later. Enforced here as well as at checkout so a cart
    // cannot be built against a closed restaurant.
    const openState = await merchantOpenState(item.merchant_id, item.merchants.accepting_orders);
    if (!openState.open) {
      return res.status(409).json({ ...CLOSED_RESPONSE, error: 'This restaurant is closed right now' });
    }

    // Size handling: a sized item requires a valid ENABLED size; a size-less
    // item rejects any size the client sends. The size price becomes the
    // line's unit price (still only a display snapshot — checkout re-reads).
    let sizeOption = null;
    if (hasEnabledSizes(item.size_options)) {
      sizeOption = findSizeOption(item.size_options, size);
      if (!sizeOption) {
        return res.status(400).json({ error: 'Please pick a size for this item' });
      }
    } else if (size) {
      return res.status(400).json({ error: 'This item does not have size options' });
    }
    const unitPrice = sizeOption ? sizeOption.price : item.price;

    let cart = await loadOwnCart(req.userId, item.merchant_id);
    if (!cart) {
      const { rows } = await database.query(
        `INSERT INTO public.carts(customer_id,merchant_id) VALUES($1,$2)
         ON CONFLICT(customer_id,merchant_id) DO UPDATE SET merchant_id=EXCLUDED.merchant_id
         RETURNING id,merchant_id`, [req.userId,item.merchant_id]);
      cart = rows[0];
    }

    // Same item + same size again = bump the quantity (capped). A different
    // size is a separate line (unique index covers cart+item+size).
    const { rows: existingRows } = await database.query(
      'SELECT id,quantity FROM public.cart_items WHERE cart_id=$1 AND menu_item_id=$2 AND size IS NOT DISTINCT FROM $3 LIMIT 1',
      [cart.id,item.id,sizeOption ? sizeOption.id : null]);
    const existing = existingRows[0];

    if (existing) {
      const nextQty = Math.min(existing.quantity + quantity, MAX_QTY);
      await database.query('UPDATE public.cart_items SET quantity=$2,unit_price=$3 WHERE id=$1',
        [existing.id,nextQty,unitPrice]);
    } else {
      await database.query(
        'INSERT INTO public.cart_items(cart_id,menu_item_id,quantity,size,unit_price) VALUES($1,$2,$3,$4,$5)',
        [cart.id,item.id,Math.min(quantity,MAX_QTY),sizeOption ? sizeOption.id : null,unitPrice]);
    }

    logFoodEvent({
      eventName: 'add_to_cart',
      userId: req.userId,
      merchantId: item.merchant_id,
      params: { item_id: item.id, price: Number(unitPrice), quantity, size: sizeOption ? sizeOption.id : null },
    });

    return res.status(201).json(await buildCartSummary(cart));
  } catch (err) {
    console.error('addCartItem error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

// null if the line isn't the caller's — never let one customer touch another's cart.
async function loadOwnCartLine(userId, lineId) {
  const { rows } = await database.query(
    `SELECT ci.id,ci.cart_id,to_jsonb(c) AS carts FROM public.cart_items ci
     JOIN public.carts c ON c.id=ci.cart_id WHERE ci.id=$1 AND c.customer_id=$2 LIMIT 1`, [lineId,userId]);
  return rows[0] || null;
}

async function updateCartItem(req, res) {
  try {
    const { quantity } = req.body;
    const line = await loadOwnCartLine(req.userId, req.params.id);
    if (!line) return res.status(404).json({ error: 'Cart item not found' });

    if (quantity === 0) {
      await database.query('DELETE FROM public.cart_items WHERE id=$1', [line.id]);
    } else {
      await database.query('UPDATE public.cart_items SET quantity=$2 WHERE id=$1',
        [line.id,Math.min(quantity,MAX_QTY)]);
    }
    return res.json(await buildCartSummary({ id: line.cart_id, merchant_id: line.carts.merchant_id }));
  } catch (err) {
    console.error('updateCartItem error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

async function removeCartItem(req, res) {
  try {
    const line = await loadOwnCartLine(req.userId, req.params.id);
    if (!line) return res.status(404).json({ error: 'Cart item not found' });

    await database.query('DELETE FROM public.cart_items WHERE id=$1', [line.id]);
    return res.json(await buildCartSummary({ id: line.cart_id, merchant_id: line.carts.merchant_id }));
  } catch (err) {
    console.error('removeCartItem error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

module.exports = { getCart, addCartItem, updateCartItem, removeCartItem, buildCartSummary };
