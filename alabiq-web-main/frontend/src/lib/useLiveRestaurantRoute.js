import { useEffect, useState } from "react";
import { liveRestaurantPath } from "./restaurantLinks";
import { loadListedRestaurants } from "./useMarketingPartners";

export function useLiveRestaurantRoute(partnerName) {
  const [path, setPath] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!partnerName) {
      setPath(null);
      setLoading(false);
      return undefined;
    }

    let alive = true;

    // Shares the marketing page's one cached request rather than firing a
    // second identical GET /api/food/restaurants. It resolves to null on
    // failure instead of rejecting, so there is nothing left to catch.
    loadListedRestaurants()
      .then((data) => {
        if (!alive) return;
        setPath(liveRestaurantPath(partnerName, data?.restaurants || []));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [partnerName]);

  return { path, loading };
}
