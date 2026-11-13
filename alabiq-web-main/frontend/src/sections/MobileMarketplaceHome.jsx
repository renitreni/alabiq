// Mobile landing storefront. Desktop keeps the marketing hero + phone
// mockup; below 2xl this *is* the entry point — Food first, then Pick & Drop.
// Tabs sit under search. Live listings only: empty/error states
// rather than invented catalogues.
//
// The Shop tab was removed along with the Shop vertical's storefront: it is
// feature-flagged off (SHOP_ENABLED) and renders an empty state when off, so
// there is nothing to surface here until the flag goes back on.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ChevronDown,
  MapPin,
  PlaneTakeoff,
  Search,
  UtensilsCrossed,
} from 'lucide-react';
import { useAuth } from '../portal/lib/AuthProvider';
import { notifyMenuUnavailable } from '../portal/lib/notify';
import { listingMatchesQuery } from '../pages/services/food/foodCategories';
import FoodRestaurantCard, {
  FoodRestaurantCardSkeleton,
} from '../pages/services/food/FoodRestaurantCard';
import { useMarketingPartners } from '../lib/useMarketingPartners';
import ShopHeroBanner from '../components/ShopHeroBanner';

const TABS = [
  { id: 'food', label: 'Food', Icon: UtensilsCrossed, to: '/services/food' },
  { id: 'ride', label: 'Pick & Drop', Icon: PlaneTakeoff, to: '/book' },
];

const easeOut = [0.22, 1, 0.36, 1];

export default function MobileMarketplaceHome() {
  const navigate = useNavigate();
  const { session, profile } = useAuth();
  const food = useMarketingPartners();

  const [tab, setTab] = useState('food');
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [locOpen, setLocOpen] = useState(false);
  const locRef = useRef(null);
  const searchRef = useRef(null);

  const locationLabel = (profile?.address || '').trim() || 'Riyadh, Saudi Arabia';
  const locationShort = locationLabel.split(',')[0].trim() || locationLabel;

  useEffect(() => {
    if (!locOpen) return undefined;
    const close = (e) => {
      if (locRef.current && !locRef.current.contains(e.target)) setLocOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [locOpen]);

  useEffect(() => {
    if (!searchOpen) return undefined;
    const close = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) setSearchOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [searchOpen]);

  const visibleRestaurants = useMemo(() => {
    return food.partners.filter((listing) => listingMatchesQuery(listing, query)).slice(0, 8);
  }, [food.partners, query]);

  const suggestRestaurants = useMemo(
    () => food.partners.filter((listing) => listingMatchesQuery(listing, query)).slice(0, 8),
    [food.partners, query]
  );

  function submitSearch(e) {
    e.preventDefault();
    setSearchOpen(false);
    const q = query.trim();
    if (tab === 'food') {
      navigate(q ? `/services/food?q=${encodeURIComponent(q)}` : '/services/food');
      return;
    }
    navigate('/book');
  }

  function openRestaurant(listing) {
    setSearchOpen(false);
    if (listing.hasMenu) {
      navigate(`/food/r/${listing.id}`);
      return;
    }
    notifyMenuUnavailable(listing.name);
  }

  return (
    <motion.section
      id="home"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35, ease: easeOut }}
      className="relative w-full bg-brand-muted 2xl:hidden pb-8"
    >
      <div className="px-4 pt-3 pb-4">
        <div className="flex items-center gap-2">
          <div className="relative shrink-0" ref={locRef}>
            <button
              type="button"
              onClick={() => setLocOpen((open) => !open)}
              className="h-12 inline-flex items-center gap-1.5 bg-white border border-brand-border rounded-2xl pl-2.5 pr-2 shadow-sm cursor-pointer"
              aria-expanded={locOpen}
              aria-label={`Deliver to ${locationLabel}`}
            >
              <MapPin className="w-4 h-4 text-brand-orange shrink-0" strokeWidth={2.4} />
              <span className="min-w-0 text-left leading-tight">
                <span className="hidden sm:block text-[9px] font-bold text-brand-grey">Deliver to</span>
                <span className="block text-xs font-black text-brand-black truncate max-w-[5.5rem] sm:max-w-[8rem]">
                  {locationShort}
                </span>
              </span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-brand-grey shrink-0 transition-transform duration-300 ease-out ${
                  locOpen ? 'rotate-180' : ''
                }`}
              />
            </button>
            <AnimatePresence>
              {locOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.98 }}
                  transition={{ duration: 0.2, ease: easeOut }}
                  className="absolute left-0 top-full mt-2 w-72 origin-top-left bg-white border border-brand-border rounded-2xl shadow-xl p-4 z-40"
                >
                  <p className="text-sm font-black text-brand-black">Delivery area</p>
                  <p className="text-xs text-brand-grey mt-1 leading-relaxed">
                    Currently serving {locationLabel}. A saved address is used at checkout.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setLocOpen(false);
                      navigate(session ? '/profile' : `/login?next=${encodeURIComponent('/profile')}`);
                    }}
                    className="mt-3 w-full text-sm font-bold text-white bg-brand-orange hover:bg-brand-orange/90 rounded-xl py-2.5 cursor-pointer"
                  >
                    {session ? 'Update address' : 'Sign in to set address'}
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <form ref={searchRef} onSubmit={submitSearch} className="relative z-20 flex-1 min-w-0">
            <label className="relative block">
              <span className="sr-only">Search restaurants</span>
              <Search className="w-4 h-4 text-brand-grey absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSearchOpen(true);
                }}
                onFocus={() => {
                  if (tab !== 'ride') setSearchOpen(true);
                }}
                placeholder="Search restaurants..."
                className="w-full h-12 rounded-2xl bg-white border border-brand-border pl-11 pr-4 text-sm text-brand-dark placeholder:text-brand-grey shadow-sm outline-none focus:border-brand-orange/40 focus:ring-2 focus:ring-brand-orange/15 transition-[border-color,box-shadow] duration-300 ease-out"
                autoComplete="off"
              />
            </label>
            <AnimatePresence>
              {searchOpen && tab !== 'ride' && (
                <SearchSuggest
                  query={query}
                  restaurants={suggestRestaurants}
                  foodLoading={food.loading}
                  foodFailed={food.failed}
                  onOpenRestaurant={openRestaurant}
                />
              )}
            </AnimatePresence>
          </form>
        </div>

        <nav
          className="mt-3 bg-white border border-brand-border rounded-2xl shadow-sm p-1.5 flex items-center"
          aria-label="Services"
        >
          {TABS.map((item) => {
            const isActive = item.id === tab;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setTab(item.id);
                  setSearchOpen(false);
                }}
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 rounded-xl text-[11px] font-black cursor-pointer transition-all duration-300 ease-out ${
                  isActive ? 'bg-brand-orange text-white shadow-md shadow-brand-orange/25' : 'text-brand-grey'
                }`}
              >
                <item.Icon className="w-4 h-4" strokeWidth={2.3} />
                {item.id === 'ride' ? 'Ride' : item.label}
              </button>
            );
          })}
        </nav>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25, ease: easeOut }}
        >
          {tab === 'food' && (
            <FoodPane
              loading={food.loading}
              failed={food.failed}
              listings={visibleRestaurants}
              onOpen={openRestaurant}
            />
          )}

          {tab === 'ride' && <RidePane />}
        </motion.div>
      </AnimatePresence>
    </motion.section>
  );
}

function FoodPane({ loading, failed, listings, onOpen }) {
  return (
    <div className="px-4 space-y-5">
      <ShopHeroBanner compact variant="food" />

      <section id="popular-near-you" className="scroll-mt-24">
        <div className="flex items-end justify-between gap-3 mb-3">
          <h2 className="text-base font-black text-brand-black tracking-tight">Popular near you</h2>
          <Link to="/services/food" className="text-xs font-bold text-brand-orange">
            See all
          </Link>
        </div>

        {loading && (
          <div className="grid grid-cols-2 gap-2.5">
            {[0, 1, 2, 3].map((i) => (
              <FoodRestaurantCardSkeleton key={i} />
            ))}
          </div>
        )}

        {!loading && failed && (
          <EmptyCard title="Listings could not be loaded right now" body="Please try again shortly." />
        )}

        {!loading && !failed && listings.length === 0 && (
          <EmptyCard title="No restaurants listed yet" body="Partners appear here when they go live." />
        )}

        {!loading && !failed && listings.length > 0 && (
          <div className="grid grid-cols-2 gap-2.5">
            {listings.map((listing, index) => (
              <motion.div
                key={listing.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28, delay: Math.min(index, 7) * 0.04, ease: easeOut }}
              >
                <FoodRestaurantCard
                  listing={listing}
                  favorite={false}
                  onToggleFavorite={() => {}}
                  onOpen={onOpen}
                />
              </motion.div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function RidePane() {
  return (
    <div className="px-4">
      <div className="rounded-3xl bg-white border border-brand-border p-5 shadow-sm">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-brand-orange">
          <PlaneTakeoff className="w-3.5 h-3.5" strokeWidth={2.4} />
          Airport rides
        </span>
        <h2 className="text-xl font-black text-brand-black tracking-tight mt-2 leading-tight">
          House to terminal, tracked live.
        </h2>
        <p className="text-sm text-brand-grey font-medium mt-2 leading-relaxed">
          Book a pick & drop to or from Riyadh airports. Fixed rates, no surprise extras.
        </p>
        <Link
          to="/book"
          className="mt-4 inline-flex items-center justify-center w-full h-12 rounded-xl bg-brand-orange text-white text-sm font-black shadow-md shadow-brand-orange/20"
        >
          Book a ride
        </Link>
      </div>
    </div>
  );
}

function SearchSuggest({ query, restaurants, foodLoading, foodFailed, onOpenRestaurant }) {
  const loading = foodLoading;
  const failed = foodFailed;
  const items = restaurants;
  const searching = !!query.trim();

  return (
    <motion.div
      initial={{ opacity: 0, y: -6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.98 }}
      transition={{ duration: 0.2, ease: easeOut }}
      className="absolute left-0 right-0 top-full mt-1.5 origin-top bg-white border border-brand-border rounded-2xl shadow-xl z-30 overflow-hidden max-h-80 overflow-y-auto"
    >
      <p className="px-3 pt-2.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-brand-grey">
        Restaurants
      </p>

      {loading && (
        <div className="px-3 py-2 space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3 animate-pulse">
              <div className="w-10 h-10 rounded-xl bg-brand-surface" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 bg-brand-surface rounded w-2/3" />
                <div className="h-2.5 bg-brand-surface rounded w-1/3" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && failed && (
        <p className="px-3 py-4 text-sm font-bold text-brand-black">We're still fixing this problem</p>
      )}

      {!loading && !failed && items.length === 0 && (
        <p className="px-3 py-4 text-sm text-brand-grey">
          {searching ? 'No matching restaurants.' : 'No restaurants listed yet.'}
        </p>
      )}

      {!loading &&
        items.map((item) => (
          <button
            key={item.id}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onOpenRestaurant(item)}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-brand-warm cursor-pointer"
          >
            <span className="w-10 h-10 rounded-xl bg-brand-surface overflow-hidden shrink-0 flex items-center justify-center">
              {item.logo ? (
                <img src={item.logo} alt="" className="w-full h-full object-contain p-1" />
              ) : (
                <UtensilsCrossed className="w-4 h-4 text-brand-grey/40" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-brand-black truncate">{item.name}</span>
              <span className="block text-[11px] text-brand-grey truncate">
                {item.cuisine || item.tagline || item.fee || 'Restaurant'}
              </span>
            </span>
          </button>
        ))}

      <button
        type="submit"
        className="w-full text-center text-xs font-bold text-brand-orange py-2.5 border-t border-brand-border cursor-pointer"
      >
        See all restaurants
      </button>
    </motion.div>
  );
}

function EmptyCard({ title, body }) {
  return (
    <div className="rounded-2xl border border-dashed border-brand-border bg-white px-5 py-10 text-center">
      <p className="text-sm font-bold text-brand-black">{title}</p>
      <p className="text-xs text-brand-grey font-medium mt-1">{body}</p>
    </div>
  );
}
