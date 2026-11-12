// ---------------------------------------------------------------------
// Partners shown on the public marketing page — the logo marquee
// (sections/Logo.jsx), the restaurant grid (sections/Restaurants.jsx) and
// the store grid (sections/Shop.jsx).
//
// THE RULE, and the whole point of this file: the homepage shows exactly
// what is listed in admin, and nothing else. List a restaurant or store and
// it appears; delist it (is_active off, status away from 'active') and it is
// gone. There is no curated array to keep in step — an earlier version
// merged one in, which is why brands kept showing after being taken out and
// why newly onboarded ones did not show at all.
//
// data/restaurants.js is NOT that list any more. It is artwork for the hero
// phone animation and nothing else — see the warning at the top of it.
//
// is_featured is still honoured, as ORDERING rather than as a gate: the
// public endpoints already return featured merchants first, so an admin
// picks which partners lead the grid without deciding who is on it at all.
//
// A merchant needs is_active, status 'active' and its vertical set correctly
// to appear here; those are the backend's filters, not ours. A missing logo
// no longer hides a listing — the card falls back to its initial, because a
// listed merchant silently absent from the homepage is the bug this file
// exists to prevent.
// ---------------------------------------------------------------------
import { useEffect, useState } from 'react';
import { api } from '../portal/lib/api';
import { BADGE_LABELS, deliveryFeeFromLabel } from '../portal/lib/constants';

// Delivery ETA is not a per-merchant column, so the only place a figure like
// this belongs is the section's platform-wide stat strip. Cards show the
// merchant's real opening hours instead.
export const MARKETING_ETA_SHORT = '15 min';

// The grids are 4-wide at xl; 12 keeps them to three clean rows. Applied by
// MarketingListingGrid at render, NOT by the hook — the logo marquee consumes
// the same hook and must see every partner, or a wall of artwork can vanish
// because the first twelve listings happen to have no logo uploaded.
export const MAX_GRID_CARDS = 12;

// Re-exported, not redefined: the labels now live in portal/lib/constants.js
// so the storefront rows and the marketing cards read one map. The card's
// tagStyles in components/MarketingListingCard.jsx is keyed by these labels.
export { BADGE_LABELS };

// Map an API merchant onto the shape the marketing cards consume. Fields
// with no database source are either a platform-wide default or, where they
// would be a claim about this specific merchant (rating, review count), left
// null so the UI hides them. Never invent those.
//
// The open/closed fields pass through untouched: the backend owns that
// decision and the platform timezone with it (portal/lib/storeHours.js).
export function mapMerchantToCard(merchant, delivery) {
  return {
    id: merchant.id,
    name: merchant.name,
    rating: merchant.rating ?? null,
    reviews: merchant.reviewCount > 0 ? String(merchant.reviewCount) : null,
    // "From SAR 10", or NOTHING when we do not know. This used to fall back
    // to the literal string "Free delivery", which was both untrue and shown
    // most often when the request had failed and we knew nothing at all.
    // It is also a floor, not a price — a delivery past the free radius costs
    // more (backend lib/deliveryPricing.js).
    fee: deliveryFeeFromLabel(delivery),
    tag: BADGE_LABELS[merchant.badge] || null,
    logo: merchant.logo_url || null,
    tagline: merchant.description || merchant.cuisine_type || '',
    cuisine: merchant.cuisine_type || '',
    featured: !!merchant.is_featured,
    reviewCount: merchant.reviewCount > 0 ? merchant.reviewCount : null,
    hasMenu: merchant.hasMenu !== false,
    // Left undefined rather than defaulted when the response predates these
    // fields — portal/lib/storeHours.js reads an absent `hours` as "cannot
    // say" and shows nothing, which an empty array would defeat.
    isOpen: merchant.isOpen,
    hours: merchant.hours,
    todayWeekday: merchant.todayWeekday,
    opensNext: merchant.opensNext || null,
  };
}

export function toMarketingCards(list, delivery) {
  return (list || [])
    .filter((m) => m && m.name)
    .map((m) => mapMerchantToCard(m, delivery))
    // Closed listings sink below the ones that can actually take an order,
    // matching both storefront grids. Without this, a homepage loaded at
    // 02:00 can be twelve non-clickable cards while open partners sit below
    // the cut. The backend's featured/name order survives within each group.
    .sort((a, b) => (a.isOpen === false ? 1 : 0) - (b.isOpen === false ? 1 : 0));
}

// One request per vertical per page load however many components call the
// hook, which also makes React StrictMode's double-effect harmless. Successful
// responses stay cached for the session. Failed fetches are not pinned, so
// turning the shop flag on (or a brief outage) can recover on the next mount
// without a retry storm from a single page.
const cachedRequests = new Map();
function loadOnce(key, fetcher) {
  if (!cachedRequests.has(key)) {
    cachedRequests.set(
      key,
      fetcher()
        .then((data) => {
          // Do not pin a failed or empty-network response — shop 503 while
          // SHOP_ENABLED is off would otherwise stick for the whole session.
          if (!data) cachedRequests.delete(key);
          return data;
        })
        .catch(() => {
          cachedRequests.delete(key);
          return null;
        })
    );
  }
  return cachedRequests.get(key);
}

// The same cached food response, for the one consumer that needs the raw
// merchants rather than cards (useLiveRestaurantRoute, which matches a
// sponsored banner's brand name to a live listing). Sharing the promise
// keeps the landing page to one GET /api/food/restaurants — the endpoints
// share a rate-limit bucket, so a second identical call is not free.
export function loadListedRestaurants() {
  return loadOnce('food', () => api.foodRestaurants());
}

function loadListedStores() {
  return loadOnce('shop', () => api.shopStores());
}

// `loading` matters now that nothing is seeded from the bundle: a section
// that rendered its empty state during the first paint would tell a visitor
// there are no partners a moment before showing eight of them.
function useListedMerchants(load, pick) {
  const [state, setState] = useState({
    partners: [],
    // Every listing, not just the dozen the grid shows — the section's
    // headline count has to be the real number of partners.
    total: 0,
    loading: true,
    // `failed` is the difference between "no partners" and "we could not
    // ask". It used to be set here and read nowhere, so a shop vertical
    // switched off at the API (SHOP_ENABLED) rendered as an empty grid
    // saying no stores were listed — indistinguishable from the truth, and
    // the reason that took so long to diagnose.
    failed: false,
    // The surcharge terms, not a bare number: the card needs to say "from".
    delivery: null,
    cuisines: [],
    minOrder: null,
  });

  useEffect(() => {
    let alive = true;
    load().then((data) => {
      if (!alive) return;
      if (!data) {
        setState((s) => ({ ...s, loading: false, failed: true }));
        return;
      }
      const listed = (pick(data) || []).filter((m) => m && m.name);
      // `?? data.deliveryFee` keeps a cached bundle working against an API
      // that predates the terms object; deliveryFeeFromLabel takes either.
      const delivery = data.delivery ?? data.deliveryFee ?? null;
      setState({
        partners: toMarketingCards(listed, delivery),
        total: listed.length,
        loading: false,
        failed: false,
        delivery,
        cuisines: data.cuisines || data.categories || [],
        minOrder: Number.isFinite(Number(data.minOrder)) ? Number(data.minOrder) : null,
      });
    });
    return () => {
      alive = false;
    };
    // load/pick are module-level constants per hook below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return state;
}

const pickRestaurants = (d) => d.restaurants;
const pickStores = (d) => d.stores;

export function useMarketingPartners() {
  return useListedMerchants(loadListedRestaurants, pickRestaurants);
}

export function useMarketingStores() {
  return useListedMerchants(loadListedStores, pickStores);
}
