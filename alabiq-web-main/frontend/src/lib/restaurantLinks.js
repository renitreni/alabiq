export function normalizeRestaurantName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

// Match a marketing partner name to a live merchant from the food API.
export function findLiveRestaurantMatch(partnerName, liveList) {
  const partnerKey = normalizeRestaurantName(partnerName);
  if (!partnerKey) return null;

  return (
    liveList.find((restaurant) => {
      const liveKey = normalizeRestaurantName(restaurant.name);
      return (
        liveKey === partnerKey ||
        liveKey.includes(partnerKey) ||
        partnerKey.includes(liveKey)
      );
    }) || null
  );
}

// A closed restaurant is not linkable from the marketing page, the same rule
// the listing grids enforce — a CTA that lands on a page you cannot order
// from is worse than no CTA. The caller falls back to its own notice.
export function liveRestaurantPath(partnerName, liveList) {
  const match = findLiveRestaurantMatch(partnerName, liveList);
  if (!match?.id || match.hasMenu === false || match.isOpen === false) return null;
  return `/food/r/${match.id}`;
}
