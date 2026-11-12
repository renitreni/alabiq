// Mobile landing storefront. Desktop keeps the marketing hero + phone
// mockup; below xl this *is* the marketplace — Food first, then Shop and
// Ride. Tabs sit under search. Live listings only: empty/error states
// rather than invented catalogues.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ChevronDown,
  MapPin,
  PlaneTakeoff,
  Plus,
  Search,
  ShoppingBag,
  UtensilsCrossed,
} from 'lucide-react';
import { useAuth } from '../portal/lib/AuthProvider';
import { api } from '../portal/lib/api';
import { fmtSAR, liveProductImage } from '../portal/lib/constants';
import { notifyMenuUnavailable } from '../portal/lib/notify';
import { listingMatchesQuery } from '../pages/services/food/foodCategories';
import FoodRestaurantCard, {
  FoodRestaurantCardSkeleton,
} from '../pages/services/food/FoodRestaurantCard';
import { useMarketingPartners, useMarketingStores } from '../lib/useMarketingPartners';
import ShopHeroBanner from '../components/ShopHeroBanner';

const TABS = [
  { id: 'food', label: 'Food', Icon: UtensilsCrossed, to: '/services/food' },
  { id: 'shop', label: 'Shop', Icon: ShoppingBag, to: '/shop' },
  { id: 'ride', label: 'Pick & Drop', Icon: PlaneTakeoff, to: '/book' },
];

const easeOut = [0.22, 1, 0.36, 1];

function priceLabel(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return null;
  return n % 1 === 0 ? `SAR ${n}` : fmtSAR(n);
}

function productPrice(product) {
  const variants = product.variants || [];
  if (variants.length > 0) {
    return Math.min(...variants.map((v) => Number(v.price)).filter(Number.isFinite));
  }
  return Number(product.price);
}

export default function MobileMarketplaceHome() {
  const navigate = useNavigate();
  const { session, profile } = useAuth();
  const shops = useMarketingStores();
  const food = useMarketingPartners();

  const [tab, setTab] = useState('food');
  const [query, setQuery] = useState('');
  const [storeFilter, setStoreFilter] = useState('all');
  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [locOpen, setLocOpen] = useState(false);
  const locRef = useRef(null);
  const searchRef = useRef(null);

  const locationLabel = (profile?.address || '').trim() || 'Riyadh, Saudi Arabia';
  const locationShort = locationLabel.split(',')[0].trim() || locationLabel;

  const stores = shops.partners;

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

  const storeIdsKey = stores.map((s) => s.id).join(',');

  useEffect(() => {
    if (shops.loading) return undefined;
    const ids = storeIdsKey ? storeIdsKey.split(',') : [];
    if (ids.length === 0) {
      setProducts([]);
      setProductsLoading(false);
      return undefined;
    }

    let alive = true;
    setProductsLoading(true);
    Promise.all(ids.map((id) => api.shopStore(id).catch(() => null))).then((results) => {
      if (!alive) return;
      const next = [];
      for (const result of results) {
        const store = result?.store;
        if (!store?.id) continue;
        for (const product of result.products || []) {
          if (!product?.name) continue;
          next.push({
            ...product,
            storeId: store.id,
            storeName: store.name,
          });
        }
      }
      setProducts(
        next.sort(
          (a, b) => Number(!!liveProductImage(b.imageUrl)) - Number(!!liveProductImage(a.imageUrl))
        )
      );
      setProductsLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [shops.loading, storeIdsKey]);

  const visibleStores = useMemo(() => {
    return stores.filter((store) => listingMatchesQuery(store, query));
  }, [stores, query]);

  const visibleProducts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((product) => {
      if (storeFilter !== 'all' && product.storeId !== storeFilter) return false;
      if (!q) return true;
      const hay = [product.name, product.brand, product.storeName].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [products, query, storeFilter]);

  const visibleRestaurants = useMemo(() => {
    return food.partners.filter((listing) => listingMatchesQuery(listing, query)).slice(0, 8);
  }, [food.partners, query]);

  const suggestRestaurants = useMemo(
    () => food.partners.filter((listing) => listingMatchesQuery(listing, query)).slice(0, 8),
    [food.partners, query]
  );

  const suggestStores = useMemo(
    () => stores.filter((store) => listingMatchesQuery(store, query)).slice(0, 8),
    [stores, query]
  );

  function submitSearch(e) {
    e.preventDefault();
    setSearchOpen(false);
    const q = query.trim();
    if (tab === 'food') {
      navigate(q ? `/services/food?q=${encodeURIComponent(q)}` : '/services/food');
      return;
    }
    if (tab === 'ride') {
      navigate('/book');
      return;
    }
    navigate(q ? `/shop?q=${encodeURIComponent(q)}` : '/shop');
  }

  function openRestaurant(listing) {
    setSearchOpen(false);
    if (listing.hasMenu) {
      navigate(`/food/r/${listing.id}`);
      return;
    }
    notifyMenuUnavailable(listing.name);
  }

  function openStore(store) {
    setSearchOpen(false);
    if (store.isOpen === false) return;
    navigate(`/shop/s/${store.id}`);
  }

  function openProduct(product) {
    navigate(`/shop/s/${product.storeId}`);
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
              <span className="sr-only">Search restaurants or stores</span>
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
                placeholder={tab === 'shop' ? 'Search stores...' : 'Search restaurants...'}
                className="w-full h-12 rounded-2xl bg-white border border-brand-border pl-11 pr-4 text-sm text-brand-dark placeholder:text-brand-grey shadow-sm outline-none focus:border-brand-orange/40 focus:ring-2 focus:ring-brand-orange/15 transition-[border-color,box-shadow] duration-300 ease-out"
                autoComplete="off"
              />
            </label>
            <AnimatePresence>
              {searchOpen && tab !== 'ride' && (
                <SearchSuggest
                  key={tab}
                  tab={tab}
                  query={query}
                  restaurants={suggestRestaurants}
                  stores={suggestStores}
                  foodLoading={food.loading}
                  foodFailed={food.failed}
                  shopsLoading={shops.loading}
                  shopsFailed={shops.failed}
                  onOpenRestaurant={openRestaurant}
                  onOpenStore={openStore}
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
                  setStoreFilter('all');
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
          {tab === 'shop' && (
            <ShopPane
              shops={shops}
              stores={visibleStores}
              storeFilter={storeFilter}
              onStoreFilter={setStoreFilter}
              products={visibleProducts}
              productsLoading={productsLoading || shops.loading}
              searching={!!query.trim()}
              onOpenProduct={openProduct}
            />
          )}

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

function ShopPane({
  shops,
  stores,
  storeFilter,
  onStoreFilter,
  products,
  productsLoading,
  searching,
  onOpenProduct,
}) {
  const empty = !shops.loading && stores.length === 0;

  return (
    <div className="px-4 space-y-5">
      <ShopHeroBanner compact />

      {stores.length > 0 && (
        <section>
          <div className="flex items-end justify-between gap-3 mb-3">
            <h2 className="text-base font-black text-brand-black tracking-tight">Partner stores</h2>
            <Link to="/shop" className="text-xs font-bold text-brand-orange">
              See all
            </Link>
          </div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">
            <FilterChip active={storeFilter === 'all'} onClick={() => onStoreFilter('all')}>
              All
            </FilterChip>
            {stores.map((store) => (
              <FilterChip
                key={store.id}
                active={storeFilter === store.id}
                onClick={() => onStoreFilter(store.id)}
              >
                {store.name.split(' ')[0]}
              </FilterChip>
            ))}
          </div>
        </section>
      )}

      <section id="best-orders" className="scroll-mt-24">
        {(productsLoading || products.length > 0) && (
          <div className="flex items-end justify-between gap-3 mb-3">
            <h2 className="text-base font-black text-brand-black tracking-tight">
              {searching ? 'Search results' : 'Products'}
            </h2>
            <Link to="/shop" className="text-xs font-bold text-brand-orange">
              Shop all
            </Link>
          </div>
        )}

        {productsLoading && (
          <div className="grid grid-cols-2 gap-2.5">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="bg-white border border-brand-border rounded-2xl overflow-hidden animate-pulse">
                <div className="h-28 bg-brand-surface" />
                <div className="p-2.5 space-y-2">
                  <div className="h-3 bg-brand-surface rounded w-3/4" />
                  <div className="h-3 bg-brand-surface rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!productsLoading && empty && (
          <EmptyCard
            title="We're still fixing this problem"
            body="Groceries are not available yet. Please check back soon."
          />
        )}

        {!productsLoading && searching && products.length === 0 && stores.length > 0 && (
          <EmptyCard title="No matching products" body="Try another name, or open a partner store above." />
        )}

        {!productsLoading && products.length > 0 && (
          <div className="grid grid-cols-2 gap-2.5">
            {products.slice(0, 16).map((product, index) => {
              const price = priceLabel(productPrice(product));
              return (
                <motion.button
                  key={`${product.storeId}-${product.id}`}
                  type="button"
                  onClick={() => onOpenProduct(product)}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.28, delay: Math.min(index, 7) * 0.04, ease: easeOut }}
                  className="bg-white border border-brand-border rounded-2xl overflow-hidden text-left shadow-sm cursor-pointer"
                >
                  <div className="h-28 bg-brand-surface overflow-hidden">
                    {liveProductImage(product.imageUrl) ? (
                      <img
                        src={liveProductImage(product.imageUrl)}
                        alt=""
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ShoppingBag className="w-8 h-8 text-brand-grey/30" />
                      </div>
                    )}
                  </div>
                  <div className="p-2.5">
                    <p className="text-xs font-bold text-brand-black truncate">{product.name}</p>
                    <p className="text-[10px] text-brand-grey truncate">{product.storeName}</p>
                    <div className="flex items-center justify-between mt-1.5">
                      <p className="text-sm font-black text-brand-orange">{price || 'View'}</p>
                      <span className="w-7 h-7 rounded-lg bg-brand-warm border border-brand-orange/20 flex items-center justify-center">
                        <Plus className="w-4 h-4 text-brand-orange" strokeWidth={2.5} />
                      </span>
                    </div>
                  </div>
                </motion.button>
              );
            })}
          </div>
        )}
      </section>
    </div>
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

        {!loading && listings.length > 0 && (
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

function SearchSuggest({
  tab,
  query,
  restaurants,
  stores,
  foodLoading,
  foodFailed,
  shopsLoading,
  shopsFailed,
  onOpenRestaurant,
  onOpenStore,
}) {
  const isFood = tab === 'food';
  const loading = isFood ? foodLoading : shopsLoading;
  const failed = isFood ? foodFailed : shopsFailed;
  const items = isFood ? restaurants : stores;
  const Icon = isFood ? UtensilsCrossed : ShoppingBag;
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
        {isFood ? 'Restaurants' : 'Stores'}
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
          {searching
            ? `No matching ${isFood ? 'restaurants' : 'stores'}.`
            : isFood
              ? 'No restaurants listed yet.'
              : "We're still fixing this problem"}
        </p>
      )}

      {!loading &&
        items.map((item) => (
          <button
            key={item.id}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => (isFood ? onOpenRestaurant(item) : onOpenStore(item))}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-brand-warm cursor-pointer"
          >
            <span className="w-10 h-10 rounded-xl bg-brand-surface overflow-hidden shrink-0 flex items-center justify-center">
              {item.logo ? (
                <img src={item.logo} alt="" className="w-full h-full object-contain p-1" />
              ) : (
                <Icon className="w-4 h-4 text-brand-grey/40" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-brand-black truncate">{item.name}</span>
              <span className="block text-[11px] text-brand-grey truncate">
                {item.cuisine || item.tagline || item.fee || (isFood ? 'Restaurant' : 'Store')}
              </span>
            </span>
          </button>
        ))}

      <button
        type="submit"
        className="w-full text-center text-xs font-bold text-brand-orange py-2.5 border-t border-brand-border cursor-pointer"
      >
        See all {isFood ? 'restaurants' : 'stores'}
      </button>
    </motion.div>
  );
}

function FilterChip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 text-xs font-bold px-3.5 py-1.5 rounded-full whitespace-nowrap cursor-pointer transition-all duration-300 ease-out ${
        active
          ? 'bg-brand-orange text-white shadow-md shadow-brand-orange/20'
          : 'text-brand-grey bg-white border border-brand-border'
      }`}
    >
      {children}
    </button>
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
