// ---------------------------------------------------------------------
// Food Delivery — public restaurant discovery
//   - listRestaurants      : GET /api/food/restaurants?q=&cuisine=
//   - getRestaurant        : GET /api/food/restaurants/:id
//   - getRestaurantByHash  : GET /api/food/restaurants/hash/:hash
//   - getRestaurantManifest: GET /api/food/manifest/:hash (PWA manifest for
//     the scoped one-restaurant customer app at /app/<hash>)
//
// Public endpoints (no auth): they expose only active restaurants and
// safe display fields. The optional bearer token is used purely to tag
// the view_menu analytics event with a user id.
// ---------------------------------------------------------------------
const storefrontRepository = require('../../repositories/storefrontRepository');
const { config } = require('../../lib/config');
const { logFoodEvent } = require('../../lib/foodEvents');
const { publicHoursState, groupHoursByMerchant } = require('../../lib/storeHours');
const { deliveryTerms } = require('../../lib/deliveryPricing');
const { getMaxDistanceKm } = require('../../lib/settings');


// Real restaurant ratings, aggregated from the `ratings` table (food_rating).
// Returns Map(merchant_id -> { rating, reviewCount }); empty until customers
// actually review — the homepage simply hides stars when there are none.
async function ratingsForMerchants(merchantIds) {
  const out = new Map();
  if (!merchantIds.length) return out;
  for (const r of await storefrontRepository.ratings('food', merchantIds)) {
    out.set(r.merchant_id, { rating: Number(r.rating), reviewCount: Number(r.review_count) });
  }
  return out;
}

async function listRestaurants(req, res) {
  try {
    const q = (req.query.q || '').toString().trim();
    const cuisine = (req.query.cuisine || '').toString().trim();
    const featuredOnly = String(req.query.featured || '') === 'true';

    const data = await storefrontRepository.listMerchants('food', {
      q, category: cuisine, featured: featuredOnly, limit: 100,
    });

    // Distinct cuisines drive the filter chips on the discovery screen.
    const cuisines = await storefrontRepository.cuisines('food');

    const ratingMap = await ratingsForMerchants((data || []).map((m) => m.id));

    // Menu readiness: discovery cards need to know which restaurants still
    // have an empty menu so the UI can warn instead of opening a blank page.
    const merchantIds = (data || []).map((m) => m.id);
    const itemCountByMerchant = new Map((await storefrontRepository.menuCounts(merchantIds))
      .map((row) => [row.merchant_id, Number(row.item_count)]));

    // Opening hours for the whole page in one round trip. A closed
    // restaurant still ships — it stays on the grid, greyed out, showing
    // when it reopens — so this deliberately filters nothing out.
    const hourRows = await storefrontRepository.hours(merchantIds);
    const hoursByMerchant = groupHoursByMerchant(hourRows);

    return res.json({
      restaurants: (data || []).map((m) => {
        const r = ratingMap.get(m.id);
        const itemCount = itemCountByMerchant.get(m.id) || 0;
        return {
          ...m,
          rating: r ? r.rating : null,
          reviewCount: r ? r.reviewCount : 0,
          itemCount,
          hasMenu: itemCount > 0,
          ...publicHoursState({
            acceptingOrders: m.accepting_orders,
            hours: hoursByMerchant.get(m.id) || [],
          }),
        };
      }),
      cuisines: [...new Set((cuisines || []).map((c) => c.cuisine_type).filter(Boolean))].sort(),
      // deliveryFee is the BASE, and stays for older bundles. `delivery`
      // carries the surcharge terms so the card can say "from" rather than
      // presenting a floor as the final price.
      deliveryFee: config.food.deliveryFeeSar,
      delivery: deliveryTerms(config.food.deliveryFeeSar, await getMaxDistanceKm()),
      minOrder: config.food.minOrderSar,
    });
  } catch (err) {
    console.error('listRestaurants error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

// Shared payload for both id and hash lookups: opening hours merged in,
// full menu attached, and the view_menu analytics event fired. `merchant`
// must already be vetted (vertical/active/status) by the caller.
async function loadRestaurantDetail(req, merchant) {
  const merchantHours = await storefrontRepository.hours([merchant.id]);
  Object.assign(
    merchant,
    publicHoursState({
      acceptingOrders: merchant.accepting_orders,
      hours: merchantHours || [],
    })
  );

  const [categories, items] = await Promise.all([
    storefrontRepository.menuCategories(merchant.id), storefrontRepository.menuItems(merchant.id),
  ]);

  // PRD analytics: view_menu fires when a restaurant profile is opened.
  logFoodEvent({
    eventName: 'view_menu',
    userId: req.userId || null,
    merchantId: merchant.id,
    params: { restaurant_id: merchant.id, cuisine_type: merchant.cuisine_type },
  });

  const { vertical, is_active, status, ...publicMerchant } = merchant;
  return {
    restaurant: publicMerchant,
    categories: categories || [],
    items: items || [],
    deliveryFee: config.food.deliveryFeeSar,
    delivery: deliveryTerms(config.food.deliveryFeeSar, await getMaxDistanceKm()),
    minOrder: config.food.minOrderSar,
  };
}

// A shop merchant or a delisted one is a 404 — the storefront must not
// confirm that some other kind of merchant sits at this reference.
function isFoodListed(merchant) {
  return merchant && merchant.vertical === 'food' && merchant.is_active && merchant.status === 'active';
}

async function getRestaurant(req, res) {
  try {
    const { id } = req.params;
    const merchant = await storefrontRepository.merchantById('food', id);
    // A shop merchant reached by id is a 404 here, not a partial render — the
    // food storefront must not confirm that some other kind of merchant sits
    // at that id, and its catalogue lives in different tables anyway.
    // Note a CLOSED restaurant is still a 200: the page renders with a banner
    // and a disabled cart, which is a different thing from being delisted.
    if (!isFoodListed(merchant)) {
      return res.status(404).json({ error: 'Restaurant not found or no longer listed' });
    }

    return res.json(await loadRestaurantDetail(req, merchant));
  } catch (err) {
    console.error('getRestaurant error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

// Same storefront as getRestaurant, reached by the unguessable public hash
// that identifies the scoped one-restaurant customer app (/app/<hash>).
async function getRestaurantByHash(req, res) {
  try {
    const hash = (req.params.hash || '').toString().trim();
    if (!/^[a-z0-9]{12}$/.test(hash)) {
      return res.status(404).json({ error: 'Restaurant not found or no longer listed' });
    }
    const merchant = await storefrontRepository.merchantByPublicHash('food', hash);
    if (!isFoodListed(merchant)) {
      return res.status(404).json({ error: 'Restaurant not found or no longer listed' });
    }

    return res.json(await loadRestaurantDetail(req, merchant));
  } catch (err) {
    console.error('getRestaurantByHash error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

// --- PWA manifest for the scoped customer app -----------------------------
// Pure builder (exported for tests): same-origin JSON the browser consumes
// via <link rel="manifest"> on /app/<hash>. start_url/scope pin the install
// to this restaurant's subtree, so the installed home-screen app can never
// navigate into the platform-wide storefront.

const APP_URL_PREFIX = '/app';
const FALLBACK_THEME = '#f97316';
const FALLBACK_BACKGROUND = '#fff7ed';
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function buildManifest(merchant) {
  const hash = merchant.public_hash;
  const startUrl = `${APP_URL_PREFIX}/${hash}`;
  const theme = HEX_COLOR.test(merchant.brand_color || '') ? merchant.brand_color : FALLBACK_THEME;
  const name = (merchant.name || 'Restaurant').toString();

  // The restaurant logo becomes the primary icon only when it is a PNG we
  // can size-declare honestly; anything else falls back to the platform
  // icons so installability never depends on merchant image hygiene.
  const icons = [];
  if (/^https?:\/\/.+\.png(\?|#|$)/i.test(merchant.logo_url || '')) {
    icons.push({ src: merchant.logo_url, sizes: '512x512', type: 'image/png', purpose: 'any' });
  }
  icons.push(
    { src: '/alabiq-icon.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/alabiq-icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  );

  return {
    name: name.slice(0, 45),
    short_name: name.slice(0, 12),
    description: `Order from ${name} for delivery.`,
    start_url: startUrl,
    scope: startUrl,
    display: 'standalone',
    background_color: FALLBACK_BACKGROUND,
    theme_color: theme,
    icons,
  };
}

async function getRestaurantManifest(req, res) {
  try {
    const hash = (req.params.hash || '').toString().trim();
    if (!/^[a-z0-9]{12}$/.test(hash)) {
      return res.status(404).json({ error: 'Restaurant not found' });
    }
    const merchant = await storefrontRepository.merchantByPublicHash('food', hash);
    // A suspended/delisted restaurant must not be installable: the app shell
    // 404s anyway, and an installed copy degrades to the same empty state.
    if (!isFoodListed(merchant)) {
      return res.status(404).json({ error: 'Restaurant not found' });
    }

    return res
      .set('Content-Type', 'application/manifest+json; charset=utf-8')
      .set('Cache-Control', 'public, max-age=3600')
      .json(buildManifest(merchant));
  } catch (err) {
    console.error('getRestaurantManifest error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

module.exports = {
  listRestaurants,
  getRestaurant,
  getRestaurantByHash,
  getRestaurantManifest,
  buildManifest,
};
