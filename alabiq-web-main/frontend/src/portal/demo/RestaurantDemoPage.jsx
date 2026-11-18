// ---------------------------------------------------------------------
// /demo/restaurant — the scoped one-restaurant customer app, rendered
// against invented data. Sales demo for the "one restaurant, one app"
// pitch: the menu below is the exact RestaurantPage a real /app/<hash>
// serves, so what is shown is what a restaurant owner would get.
//
// The banner is not decoration. The page is pixel-identical to a live
// restaurant app, and a visitor who lands here without it would read the
// dishes and prices as orderable.
//
// Data plumbing mirrors /admin/ferdz: lib/api.js answers /api/food calls
// from demoApi.js while this route is open. The fixture id is imported
// on demand so the fixtures never ship in the main bundle. The manifest
// fetch (<link rel="manifest">) goes straight to the browser, not through
// lib/api.js, so it 404s on the real backend and the install banner simply
// stays hidden — a demo limitation, not a bug.
// ---------------------------------------------------------------------
import { useEffect, useState } from 'react';
import { FlaskConical } from 'lucide-react';
import RestaurantPage from '../food/RestaurantPage';
import { Spinner } from '../components/ui';

export default function RestaurantDemoPage() {
  const [merchantId, setMerchantId] = useState(null);

  useEffect(() => {
    let live = true;
    import('./adminFixtures').then(({ store }) => {
      if (live) setMerchantId(store.restaurants[0].id);
    });
    return () => { live = false; };
  }, []);

  return (
    <div className="min-h-screen">
      <div className="sticky top-0 z-50 flex items-center justify-center gap-2 px-4 py-2 bg-amber-400 text-brand-black text-center">
        <FlaskConical className="w-4 h-4 shrink-0" />
        <p className="text-xs sm:text-sm font-bold">
          Demo data. Every dish and price on this page is made up — nothing here can be ordered.
        </p>
      </div>
      {merchantId ? (
        <RestaurantPage merchantId={merchantId} basePath="/demo/restaurant" />
      ) : (
        <div className="flex justify-center py-20">
          <Spinner className="!w-8 !h-8" />
        </div>
      )}
    </div>
  );
}
