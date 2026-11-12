// ---------------------------------------------------------------------
// Food Delivery — discovery / home: /food
// Search, cuisine filters, modern restaurant cards. Restaurants without
// a menu show a SweetAlert instead of opening an empty menu page.
// ---------------------------------------------------------------------
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Search, UtensilsCrossed, ReceiptText, RefreshCw, Sparkles } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/AuthProvider';
import { deliveryFeeFromLabel, deliveryFeeNote } from '../lib/constants';
import { notifyMenuUnavailable } from '../lib/notify';
import ListingRow, { ListingRowSkeleton } from '../components/ListingRow';
import { PortalShell, Card, btnPrimary, inputClass } from '../components/ui';

export default function FoodHomePage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { session } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(params.get('q') || '');
  const [cuisine, setCuisine] = useState('');

  async function load(q = search, c = cuisine) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      if (c) params.set('cuisine', c);
      const query = params.toString() ? `?${params.toString()}` : '';
      setData(await api.foodRestaurants(query));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const firstRender = useRef(true);
  useEffect(() => {
    // Seeded, not empty: the landing hero hands a term over as ?q=, and the
    // debounced effect below deliberately skips the first render.
    load(search, cuisine);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return undefined;
    }
    const t = setTimeout(() => load(search, cuisine), 350);
    return () => clearTimeout(t);
  }, [search, cuisine]); // eslint-disable-line react-hooks/exhaustive-deps

  // Closed restaurants stay on the grid but sink below the ones that can
  // actually take an order, preserving the backend order within each group.
  const restaurants = useMemo(
    () =>
      [...(data?.restaurants || [])].sort(
        (a, b) => (a.isOpen === false ? 1 : 0) - (b.isOpen === false ? 1 : 0)
      ),
    [data]
  );

  // `?? data?.deliveryFee` keeps a cached bundle working against an API that
  // predates the terms object; both helpers accept either shape.
  const deliveryTerms = data?.delivery ?? data?.deliveryFee ?? null;
  const deliveryLabel = deliveryFeeFromLabel(deliveryTerms);
  const deliveryNote = deliveryFeeNote(deliveryTerms);

  function openRestaurant(restaurant) {
    if (restaurant.hasMenu === false) {
      notifyMenuUnavailable(restaurant.name);
      return;
    }
    navigate(`/food/r/${restaurant.id}`);
  }

  return (
    <PortalShell
      wide
      title="Food Delivery"
      // No minimum-order subtitle. It is a rule you meet in the cart, which
      // states it with a live shortfall — up here it was a barrier printed
      // before anyone had seen a single dish.
      onBack={() => navigate('/')}
      right={
        session && (
          <Link
            to="/food/orders"
            title="My orders"
            className="p-2 rounded-lg hover:bg-brand-surface text-brand-grey"
          >
            <ReceiptText className="w-4 h-4" />
          </Link>
        )
      }
    >
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6 rounded-3xl border border-brand-border bg-white p-4 sm:p-5 shadow-sm overflow-hidden relative"
      >
        <div className="absolute inset-y-0 right-0 w-1/3 bg-gradient-to-l from-brand-orange/8 to-transparent pointer-events-none" />
        <p className="text-[11px] font-black uppercase tracking-widest text-brand-orange mb-1">
          Order nearby
        </p>
        <h2 className="font-black text-brand-black text-xl sm:text-2xl tracking-tight">
          Restaurants near you
        </h2>
        <p className="text-sm text-brand-grey mt-1 max-w-xl">
          Browse partner kitchens, pick your favorites, and track delivery live.
        </p>
        <div className="relative mt-4">
          <Search className="w-4 h-4 text-brand-grey absolute left-4 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search restaurants by name"
            className={inputClass + ' !pl-10 !rounded-2xl !py-3'}
          />
        </div>
        {(data?.cuisines || []).length > 0 && (
          <div className="flex gap-2 overflow-x-auto pt-3 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <button
              type="button"
              onClick={() => setCuisine('')}
              className={`shrink-0 px-4 py-2 rounded-full text-xs font-black border whitespace-nowrap cursor-pointer transition-colors ${
                !cuisine
                  ? 'bg-brand-black text-white border-brand-black'
                  : 'bg-white text-brand-grey border-brand-border hover:border-brand-orange/40'
              }`}
            >
              All cuisines
            </button>
            {data.cuisines.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCuisine(c === cuisine ? '' : c)}
                className={`shrink-0 px-4 py-2 rounded-full text-xs font-black border whitespace-nowrap cursor-pointer transition-colors ${
                  cuisine === c
                    ? 'bg-brand-black text-white border-brand-black'
                    : 'bg-white text-brand-grey border-brand-border hover:border-brand-orange/40'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        )}
      </motion.div>

      {/* The delivery rule in one line, so the "From" on every row below has
          something to point at. Absent until the terms arrive. */}
      {deliveryNote && <p className="text-xs text-brand-grey mb-4">{deliveryNote}</p>}

      {error && (
        <Card className="p-6 text-center rounded-3xl">
          <p className="text-brand-dark font-bold mb-1">Could not load restaurants</p>
          <p className="text-sm text-brand-grey mb-4">{error}</p>
          <button type="button" onClick={() => load()} className={btnPrimary}>
            <RefreshCw className="w-4 h-4" /> Try again
          </button>
        </Card>
      )}

      {loading && !error && (
        <div className="grid gap-3 sm:grid-cols-2">
          {[...Array(6)].map((_, i) => (
            <ListingRowSkeleton key={i} />
          ))}
        </div>
      )}

      {!loading && !error && restaurants.length === 0 && (
        <Card className="p-10 text-center rounded-3xl">
          <UtensilsCrossed className="w-10 h-10 text-brand-grey/40 mx-auto mb-3" />
          <p className="font-bold text-brand-dark">No restaurants found</p>
          <p className="text-sm text-brand-grey mt-1">
            {search || cuisine
              ? 'Try a different name or cuisine.'
              : 'Restaurants are coming soon to your area.'}
          </p>
        </Card>
      )}

      {!loading && !error && restaurants.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {restaurants.map((r) => (
            <ListingRow
              key={r.id}
              merchant={r}
              deliveryLabel={deliveryLabel}
              fallbackIcon={UtensilsCrossed}
              onClick={() => openRestaurant(r)}
              // A restaurant with an empty menu stays listed and stays
              // openable — openRestaurant explains rather than opening a
              // blank page — but it says so up front.
              note={
                r.hasMenu === false ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-brand-black/85 text-white px-2 py-0.5 text-[10px] font-black uppercase tracking-wider">
                    <Sparkles className="w-3 h-3 text-brand-orange" />
                    Menu soon
                  </span>
                ) : null
              }
            />
          ))}
        </div>
      )}
    </PortalShell>
  );
}
