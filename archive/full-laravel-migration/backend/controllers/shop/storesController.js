// ---------------------------------------------------------------------
// Ecommerce — public store discovery
//   - listStores : GET /api/shop/stores?q=&category=
//   - getStore   : GET /api/shop/stores/:id
//
// Public endpoints (no auth): they expose only listed, active stores and
// safe display fields. The optional bearer token is used purely to tag the
// view_store analytics event with a user id.
//
// TWO THINGS THE FOOD EQUIVALENT DOES NOT HAVE TO DO:
//   1. Every merchants query filters vertical = 'shop'. The table is shared
//      with Food Delivery; without the filter a restaurant would appear in
//      the storefront.
//   2. Nothing here may return net_price or stock_quantity. The backend
//      reads with the service role, so it CAN see both — the column grants
//      in 0029 only stop the anon key. Exact stock is sales velocity, so
//      the response carries a banded availability instead.
// ---------------------------------------------------------------------
const storefrontRepository = require('../../repositories/storefrontRepository');
const { config } = require('../../lib/config');
const { logShopEvent } = require('../../lib/foodEvents');
const { availabilityBand } = require('../../lib/shopMoney');
const { publicHoursState, groupHoursByMerchant } = require('../../lib/storeHours');
const { deliveryTerms } = require('../../lib/deliveryPricing');
const { getMaxDistanceKm } = require('../../lib/settings');


// Whitelist a catalogue row for public consumption. This function is the
// single place a product becomes customer-visible; net_price and
// stock_quantity are dropped here, deliberately, by omission from the
// returned object rather than by deleting keys.
function publicProduct(p) {
  return {
    id: p.id,
    categoryId: p.category_id,
    name: p.name,
    description: p.description,
    brand: p.brand,
    unit: p.unit,
    weightGrams: p.weight_grams,
    price: Number(p.price),
    imageUrl: p.image_url,
    isAvailable: p.is_available,
    availability: availabilityBand(p, p.track_stock),
    variants: (p.product_variants || [])
      .filter((v) => v.is_available)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((v) => ({
        id: v.id,
        label: v.label,
        sku: v.sku,
        price: v.price != null ? Number(v.price) : Number(p.price),
        availability: availabilityBand(
          { stock_quantity: v.stock_quantity, low_stock_threshold: p.low_stock_threshold },
          p.track_stock
        ),
      })),
  };
}

// Real store ratings, aggregated from shop_ratings (product_rating).
// Returns Map(merchant_id -> { rating, reviewCount }); empty until customers
// actually review, and the storefront simply hides stars when there are none.
async function ratingsForStores(merchantIds) {
  const out = new Map();
  if (!merchantIds.length) return out;
  for (const r of await storefrontRepository.ratings('shop', merchantIds)) {
    out.set(r.merchant_id, { rating: Number(r.rating), reviewCount: Number(r.review_count) });
  }
  return out;
}

async function listStores(req, res) {
  try {
    const q = (req.query.q || '').toString().trim();
    const category = (req.query.category || '').toString().trim();
    const featuredOnly = String(req.query.featured || '') === 'true';

    const data = await storefrontRepository.listMerchants('shop', {
      q, category, featured: featuredOnly, limit: 100,
    });

    // Distinct store categories drive the filter chips on discovery.
    const categories = await storefrontRepository.cuisines('shop');

    const ratingMap = await ratingsForStores((data || []).map((m) => m.id));

    // Hours for the whole page in one round trip rather than per store.
    // A closed store still ships — it stays on the grid, greyed out, showing
    // when it reopens — so this deliberately does NOT filter anything out.
    const storeIds = (data || []).map((m) => m.id);
    const hourRows = await storefrontRepository.hours(storeIds);
    const hoursByMerchant = groupHoursByMerchant(hourRows);

    return res.json({
      stores: (data || []).map((m) => {
        const r = ratingMap.get(m.id);
        return {
          ...m,
          rating: r ? r.rating : null,
          reviewCount: r ? r.reviewCount : 0,
          ...publicHoursState({
            acceptingOrders: m.accepting_orders,
            hours: hoursByMerchant.get(m.id) || [],
          }),
        };
      }),
      categories: [...new Set((categories || []).map((c) => c.cuisine_type).filter(Boolean))].sort(),
      // deliveryFee is the BASE, and stays for older bundles. `delivery`
      // carries the surcharge terms so the card can say "from" rather than
      // presenting a floor as the final price.
      deliveryFee: config.shop.deliveryFeeSar,
      delivery: deliveryTerms(config.shop.deliveryFeeSar, await getMaxDistanceKm()),
      minOrder: config.shop.minOrderSar,
    });
  } catch (err) {
    console.error('listStores error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

async function getStore(req, res) {
  try {
    const { id } = req.params;
    const store = await storefrontRepository.merchantById('shop', id);
    // A food merchant reached by id is a 404 here, not a 403 — the storefront
    // must not confirm that some other kind of merchant exists at that id.
    // Note a CLOSED store is still a 200: the page renders with a banner and
    // a disabled cart, which is a different thing from being delisted.
    if (!store || store.vertical !== 'shop' || !store.is_active || store.status !== 'active') {
      return res.status(404).json({ error: 'Store not found or no longer listed' });
    }

    const storeHourRows = await storefrontRepository.hours([store.id]);
    Object.assign(
      store,
      publicHoursState({
        acceptingOrders: store.accepting_orders,
        hours: storeHourRows || [],
      })
    );

    const [categories, products] = await Promise.all([
      storefrontRepository.menuCategories(id), storefrontRepository.products(id),
    ]);

    logShopEvent({
      eventName: 'view_store',
      userId: req.userId || null,
      merchantId: id,
      params: { store_id: id, category: store.cuisine_type },
    });

    const { vertical, is_active, status, ...publicStore } = store;
    return res.json({
      store: publicStore,
      categories,
      products: products.map(publicProduct),
      deliveryFee: config.shop.deliveryFeeSar,
      delivery: deliveryTerms(config.shop.deliveryFeeSar, await getMaxDistanceKm()),
      minOrder: config.shop.minOrderSar,
    });
  } catch (err) {
    console.error('getStore error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

module.exports = { listStores, getStore, publicProduct };
