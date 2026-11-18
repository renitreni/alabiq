export const HERO_FOOD_IMAGE =
  'https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?auto=format&fit=crop&w=900&q=80';

export const OFFER_FOOD_IMAGE =
  'https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=600&q=80';

const photo = (id) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=240&q=80`;

const TILE_BG = [
  'bg-[#FFF4E8]',
  'bg-[#FFF0EA]',
  'bg-[#FFF3E6]',
  'bg-[#F3F7FF]',
  'bg-[#F6EFE8]',
  'bg-[#FFF0F5]',
  'bg-[#EEF8F0]',
];

// Generic dishes — never a merchant logo. Matched against live cuisine_type
// strings so Filipino/Chinese/Meat Products still look like food, not brands.
const CUISINE_ART = [
  { test: /chinese|cantonese|szechuan|sichuan|dim\s*sum/i, image: photo('1582878826629-29b7ad1cdc43'), bg: 'bg-[#FFF0EA]' },
  { test: /filipino|pinoy|inasal/i, image: photo('1604908176997-125f25cc6f3d'), bg: 'bg-[#FFF4E8]' },
  { test: /pizza|italian/i, image: photo('1565299624946-b28f40a0ae38'), bg: 'bg-[#FFF3E6]' },
  { test: /burger|american/i, image: photo('1568901346375-23c9450c58cd'), bg: 'bg-[#FFF4E8]' },
  { test: /chicken/i, image: photo('1598103442097-8b74394b95c2'), bg: 'bg-[#FFF0EA]' },
  { test: /coffee|cafe|café/i, image: photo('1509042239860-f550ce710b93'), bg: 'bg-[#F6EFE8]' },
  { test: /dessert|cake|sweet|pastry|ice\s*cream/i, image: photo('1551024506-0bccd828d307'), bg: 'bg-[#FFF0F5]' },
  { test: /meat|bbq|grill|steak|product/i, image: photo('1529692236671-f1f6cf9683ba'), bg: 'bg-[#FFF0EA]' },
  { test: /healthy|salad|vegan|veg/i, image: photo('1512621776951-a57141f2eefd'), bg: 'bg-[#EEF8F0]' },
  { test: /seafood|fish|shrimp/i, image: photo('1559339352-11d035aa6de6'), bg: 'bg-[#F3F7FF]' },
  { test: /indian|curry|tandoori/i, image: photo('1585937421612-70a008356fbe'), bg: 'bg-[#FFF4E8]' },
  { test: /mexican|taco|burrito/i, image: photo('1565299585323-38d6b0865b47'), bg: 'bg-[#FFF3E6]' },
  { test: /arabic|lebanese|shawarma|middle|kebab/i, image: photo('1529006557810-274b9f2ae4bb'), bg: 'bg-[#FFF4E8]' },
  { test: /japanese|sushi|ramen/i, image: photo('1579871494447-9811cf80d66c'), bg: 'bg-[#F3F7FF]' },
  { test: /korean/i, image: photo('1590301157890-4810ed352733'), bg: 'bg-[#FFF0EA]' },
  { test: /thai|vietnamese|asian|noodle/i, image: photo('1559314809-0d155014e29e'), bg: 'bg-[#F3F7FF]' },
];

const GENERIC_FOOD = [
  photo('1504674901340-63845d7ae2bc'),
  photo('1546069901-ba9599a7e63c'),
  photo('1414235077428-338989a2e8c0'),
];

export function visualForCuisine(label, index = 0) {
  const hit = CUISINE_ART.find((c) => c.test.test(String(label || '')));
  if (hit) return { image: hit.image, bg: hit.bg };
  return {
    image: GENERIC_FOOD[index % GENERIC_FOOD.length],
    bg: TILE_BG[index % TILE_BG.length],
  };
}

// Categories are the live cuisine_type values from listed restaurants —
// never a canned Burgers/Pizza row that can outlive the catalogue.
export function categoriesFromListings(partners, cuisines) {
  const names = (cuisines || []).filter(Boolean);
  const fromPartners = [...new Set((partners || []).map((p) => p.cuisine).filter(Boolean))];
  const labels = names.length ? names : fromPartners;
  return labels.map((label, i) => {
    const art = visualForCuisine(label, i);
    return {
      id: label,
      label,
      image: art.image,
      bg: art.bg,
    };
  });
}

export function listingMatchesQuery(listing, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [listing.name, listing.cuisine, listing.tagline].filter(Boolean).join(' ').toLowerCase();
  return hay.includes(q);
}

export function cuisineTokens(cuisine) {
  return String(cuisine || '')
    .split(/[,/•|&]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function listingsForDeals(partners) {
  const tagged = (partners || []).filter(
    (p) => p.featured || p.tag === 'Popular' || p.tag === 'Trending' || p.tag === 'Top Rated'
  );
  return tagged.length ? tagged : partners || [];
}

export function listingsForTrending(partners) {
  const tagged = (partners || []).filter((p) => p.tag === 'New' || p.tag === 'Trending');
  return tagged.length ? tagged : partners || [];
}
