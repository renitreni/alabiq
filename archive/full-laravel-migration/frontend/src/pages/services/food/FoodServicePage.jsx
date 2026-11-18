import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Bike,
  ChevronLeft,
  ChevronRight,
  Clock3,
  MapPin,
  Percent,
  ShoppingBag,
  Store,
} from 'lucide-react';
import Footer from '../../../sections/Footer';
import { notifyMenuUnavailable } from '../../../portal/lib/notify';
import { useAuth } from '../../../portal/lib/AuthProvider';
import { api } from '../../../portal/lib/api';
import {
  deliveryFeeFromLabel,
  fmtSAR,
  foodStatusMeta,
  FOOD_MIN_ORDER,
} from '../../../portal/lib/constants';
import { relativeTime } from '../../../portal/lib/notifications';
import { useMarketingPartners, useMarketingStores } from '../../../lib/useMarketingPartners';
import FoodMarketplaceHeader from './FoodMarketplaceHeader';
import FoodRestaurantCard, { FoodRestaurantCardSkeleton } from './FoodRestaurantCard';
import {
  HERO_FOOD_IMAGE,
  OFFER_FOOD_IMAGE,
  categoriesFromListings,
  listingMatchesQuery,
  listingsForDeals,
  listingsForTrending,
} from './foodCategories';

const FAVORITES_KEY = 'sm_food_favorites';
const CLOSED_COPY = 'We are sorry we are not yet open in this section yet';
const VALID_TABS = ['restaurants', 'groceries', 'shops', 'deals', 'trending'];

function readFavorites() {
  try {
    const raw = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function compactSar(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return null;
  return n % 1 === 0 ? `SAR ${n}` : fmtSAR(n);
}

function ScooterArt() {
  return (
    <svg viewBox="0 0 120 72" className="w-[110px] h-auto drop-shadow-sm" aria-hidden="true">
      <path
        d="M8 58 C28 40, 48 62, 72 44"
        fill="none"
        stroke="#FDBA74"
        strokeWidth="2"
        strokeDasharray="4 5"
        strokeLinecap="round"
      />
      <circle cx="28" cy="58" r="8" fill="#1F2937" />
      <circle cx="28" cy="58" r="3.2" fill="#F3F4F6" />
      <circle cx="86" cy="58" r="8" fill="#1F2937" />
      <circle cx="86" cy="58" r="3.2" fill="#F3F4F6" />
      <path d="M34 56 h36 c3 0 6-3 7-7 l4-14 h12" stroke="#111827" strokeWidth="3.2" fill="none" strokeLinecap="round" />
      <rect x="52" y="28" width="22" height="16" rx="3" fill="#E62B25" />
      <rect x="54" y="22" width="18" height="8" rx="2" fill="#F97316" />
      <circle cx="48" cy="30" r="7" fill="#111827" />
      <circle cx="48" cy="30" r="5" fill="#FDBA74" />
      <path d="M48 22 c4-8 14-8 16-1" stroke="#111827" strokeWidth="2.4" fill="none" />
    </svg>
  );
}

function SlideRail({ title, children, count = 0 }) {
  const railRef = useRef(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const sync = () => {
    const el = railRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(max > 4 && el.scrollLeft < max - 4);
  };

  useLayoutEffect(() => {
    const el = railRef.current;
    if (!el) return undefined;
    sync();
    el.addEventListener('scroll', sync, { passive: true });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(sync) : null;
    ro?.observe(el);
    return () => {
      el.removeEventListener('scroll', sync);
      ro?.disconnect();
    };
  }, [count]);

  const go = (dir) => {
    const el = railRef.current;
    if (!el) return;
    const step = Math.max(220, Math.round(el.clientWidth * 0.75));
    el.scrollBy({ left: dir * step, behavior: 'smooth' });
  };

  const arrowClass = (on) =>
    `w-9 h-9 rounded-full border bg-white flex items-center justify-center transition-colors ${
      on
        ? 'border-brand-border text-brand-dark hover:border-brand-orange/40 hover:text-brand-orange cursor-pointer'
        : 'border-brand-border/60 text-brand-grey/30 cursor-not-allowed'
    }`;

  return (
    <div>
      {title && (
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="text-lg sm:text-xl font-black text-brand-black tracking-tight">{title}</h2>
          <div className="flex items-center gap-2">
            <button type="button" aria-label="Slide back" disabled={!canLeft} onClick={() => go(-1)} className={arrowClass(canLeft)}>
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button type="button" aria-label="Slide forward" disabled={!canRight} onClick={() => go(1)} className={arrowClass(canRight)}>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
      <div
        ref={railRef}
        className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-1 overscroll-x-contain no-scrollbar"
      >
        {children}
      </div>
    </div>
  );
}

function ClosedSection({ title, headline, body }) {
  return (
    <section className="mt-8">
      {title && <h2 className="text-lg sm:text-xl font-black text-brand-black tracking-tight mb-4">{title}</h2>}
      <div className="rounded-3xl border border-dashed border-brand-border bg-white px-6 py-14 text-center">
        <p className="text-brand-dark text-sm font-black">{headline || CLOSED_COPY}</p>
        <p className="text-brand-grey text-sm font-medium mt-1">
          {body || 'Check back soon — this service is not taking orders yet.'}
        </p>
      </div>
    </section>
  );
}

const FoodServicePage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { session, profile } = useAuth();
  const food = useMarketingPartners();
  const shop = useMarketingStores();
  const { partners, loading, failed, delivery, cuisines, minOrder } = food;

  const [search, setSearch] = useState(() => searchParams.get('q') || '');
  const [activeTab, setActiveTab] = useState(() => {
    const tab = searchParams.get('tab');
    return VALID_TABS.includes(tab) ? tab : 'restaurants';
  });
  const [cuisineFilter, setCuisineFilter] = useState('');
  const [favorites, setFavorites] = useState(readFavorites);
  const [recentOrders, setRecentOrders] = useState([]);

  const locationLabel = (profile?.address || '').trim() || 'Riyadh, Saudi Arabia';
  const etaLabel = '15–25 min';
  const feeFloor = deliveryFeeFromLabel(delivery);
  const feeShort = compactSar(
    delivery && typeof delivery === 'object' ? delivery.baseFee : delivery
  );
  const minOrderAmount = Number.isFinite(Number(minOrder)) ? Number(minOrder) : FOOD_MIN_ORDER;
  const minOrderLabel = `Min. ${compactSar(minOrderAmount)}`;
  const featured = partners.find((p) => p.isOpen !== false) || partners[0] || null;
  const categoryTiles = useMemo(
    () => categoriesFromListings(partners, cuisines),
    [partners, cuisines]
  );
  const foodTabs = activeTab === 'restaurants' || activeTab === 'deals' || activeTab === 'trending';

  useEffect(() => {
    if (!session) {
      setRecentOrders([]);
      return undefined;
    }
    let alive = true;
    api
      .foodOrders({ silent: true })
      .then((data) => {
        if (alive) setRecentOrders((data.orders || []).slice(0, 2));
      })
      .catch(() => {
        if (alive) setRecentOrders([]);
      });
    return () => {
      alive = false;
    };
  }, [session]);

  const filtered = useMemo(() => {
    let list = partners;
    if (activeTab === 'deals') list = listingsForDeals(partners);
    else if (activeTab === 'trending') list = listingsForTrending(partners);
    return list.filter((listing) => {
      if (!listingMatchesQuery(listing, search)) return false;
      if (cuisineFilter && listing.cuisine !== cuisineFilter) return false;
      return true;
    });
  }, [partners, search, cuisineFilter, activeTab]);

  function openRestaurant(listing) {
    if (listing.hasMenu) {
      navigate(`/food/r/${listing.id}`);
      return;
    }
    notifyMenuUnavailable(listing.name);
  }

  function openStore(listing) {
    navigate(`/shop/s/${listing.id}`);
  }

  function toggleFavorite(id) {
    setFavorites((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
      return next;
    });
  }

  function handleSearchSubmit(e) {
    e.preventDefault();
    setActiveTab('restaurants');
    document.getElementById('popular-near-you')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const nearTitle =
    activeTab === 'deals' ? 'Deals near you' : activeTab === 'trending' ? 'New & trending' : cuisineFilter || 'Popular Near You';

  const shopReady = !shop.loading && !shop.failed && shop.partners.length > 0;
  const shopClosed = !shop.loading && !shop.failed && shop.partners.length === 0;

  return (
    <div className="min-h-screen bg-[#FAFAFA] text-brand-dark">
      <FoodMarketplaceHeader
        search={search}
        onSearchChange={setSearch}
        onSearchSubmit={handleSearchSubmit}
        locationLabel={locationLabel}
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab);
          setCuisineFilter('');
        }}
      />

      <main className="max-w-[1440px] mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-6 lg:gap-8 items-start">
          <div className="min-w-0">
            {foodTabs && (
              <motion.section
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="relative overflow-hidden rounded-[22px] sm:rounded-[28px] bg-[#FFF1E6] min-h-[150px] sm:min-h-[260px]"
              >
                <div className="relative z-10 max-w-xl p-4 sm:p-8 lg:p-10">
                  <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-brand-black leading-[1.1]">
                    Your favorites, delivered fast.
                  </h1>
                  <p className="text-xs sm:text-[15px] text-brand-grey font-medium mt-2 sm:mt-3 max-w-md leading-relaxed line-clamp-2 sm:line-clamp-none">
                    Discover top restaurants with live tracking and exclusive partner picks, all in one tap.
                  </p>
                  <div className="flex flex-wrap gap-1.5 sm:gap-2 mt-4 sm:mt-6">
                    <span className="inline-flex items-center gap-1.5 bg-white rounded-full px-3 py-1.5 text-[11px] font-bold text-brand-dark shadow-sm">
                      <Clock3 className="w-3.5 h-3.5 text-brand-orange" />
                      {etaLabel} Avg. Delivery
                    </span>
                    {feeShort && (
                      <span className="inline-flex items-center gap-1.5 bg-white rounded-full px-3 py-1.5 text-[11px] font-bold text-brand-dark shadow-sm">
                        <Bike className="w-3.5 h-3.5 text-brand-orange" />
                        From {feeShort} Delivery Fee
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1.5 bg-white rounded-full px-3 py-1.5 text-[11px] font-bold text-brand-dark shadow-sm">
                      <MapPin className="w-3.5 h-3.5 text-brand-orange" />
                      Live Tracking
                    </span>
                  </div>
                </div>

                <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-[46%] hidden md:block">
                  <div className="absolute inset-y-0 right-0 w-full bg-brand-orange rounded-l-[140px]" />
                  <div className="absolute left-[-18px] bottom-8">
                    <ScooterArt />
                  </div>
                  <img
                    src={HERO_FOOD_IMAGE}
                    alt=""
                    className="absolute right-4 top-1/2 -translate-y-1/2 w-[78%] max-w-[340px] h-[78%] object-cover rounded-[28px] shadow-2xl shadow-orange-900/20"
                  />
                </div>
              </motion.section>
            )}

            {foodTabs && categoryTiles.length > 0 && (
              <section className="mt-5 sm:mt-8">
                <SlideRail title="Popular Categories" count={categoryTiles.length}>
                  {categoryTiles.map((tile) => {
                    const active = cuisineFilter === tile.id;
                    return (
                      <button
                        key={tile.id}
                        type="button"
                        onClick={() => {
                          setCuisineFilter((cur) => (cur === tile.id ? '' : tile.id));
                          setActiveTab('restaurants');
                        }}
                        className="shrink-0 snap-start w-[92px] sm:w-[116px] cursor-pointer"
                      >
                        <span
                          className={`flex flex-col items-center rounded-[22px] border px-2 pt-3 pb-3 min-h-[132px] transition-all ${
                            active
                              ? 'border-brand-orange bg-orange-50 shadow-md shadow-brand-orange/10'
                              : 'border-transparent bg-white shadow-[0_8px_24px_rgba(17,24,39,0.06)] hover:-translate-y-0.5'
                          }`}
                        >
                          <span className={`w-14 h-14 rounded-2xl ${tile.bg} overflow-hidden flex items-center justify-center`}>
                            <img src={tile.image} alt="" className="w-full h-full object-cover" />
                          </span>
                          <span className="mt-2 text-[11px] font-bold text-brand-dark text-center leading-tight line-clamp-2 w-full px-0.5">
                            {tile.label}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </SlideRail>
              </section>
            )}

            {foodTabs && (
              <section id="popular-near-you" className="mt-5 sm:mt-8 scroll-mt-24 sm:scroll-mt-28">
                {failed && (
                  <div className="rounded-3xl border border-dashed border-brand-border bg-brand-muted/60 px-6 py-14 text-center">
                    <p className="text-brand-dark text-sm font-bold">Listings could not be loaded right now</p>
                    <p className="text-brand-grey text-sm font-medium mt-1">
                      This is a problem on our side, not an empty catalogue. Please try again shortly.
                    </p>
                  </div>
                )}

                {loading && !failed && (
                  <SlideRail title={nearTitle} count={4}>
                    {[0, 1, 2, 3].map((i) => (
                      <div key={i} className="shrink-0 snap-start w-[min(68vw,210px)] sm:w-[min(78vw,250px)]">
                        <FoodRestaurantCardSkeleton />
                      </div>
                    ))}
                  </SlideRail>
                )}

                {!loading && !failed && filtered.length === 0 && (
                  <>
                    <h2 className="text-lg sm:text-xl font-black text-brand-black tracking-tight mb-4">{nearTitle}</h2>
                    <div className="rounded-3xl border border-dashed border-brand-border bg-brand-muted/60 px-6 py-14 text-center">
                      <p className="text-brand-dark text-sm font-bold">No restaurants match this filter</p>
                      <p className="text-brand-grey text-sm font-medium mt-1">
                        Try another category, or browse every partner nearby.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab('restaurants');
                          setCuisineFilter('');
                        }}
                        className="mt-4 text-sm font-bold text-brand-orange cursor-pointer"
                      >
                        Show all restaurants
                      </button>
                    </div>
                  </>
                )}

                {!loading && !failed && filtered.length > 0 && (
                  <SlideRail title={nearTitle} count={filtered.length}>
                    {filtered.map((listing) => (
                      <div key={listing.id} className="shrink-0 snap-start w-[min(68vw,210px)] sm:w-[min(78vw,250px)]">
                        <FoodRestaurantCard
                          listing={{
                            ...listing,
                            fee: listing.fee ? `${listing.fee} delivery` : listing.fee,
                          }}
                          minOrderLabel={minOrderLabel}
                          favorite={favorites.includes(listing.id)}
                          onToggleFavorite={toggleFavorite}
                          onOpen={openRestaurant}
                        />
                      </div>
                    ))}
                  </SlideRail>
                )}
              </section>
            )}

            {activeTab === 'groceries' && shop.loading && (
              <section className="mt-2">
                <SlideRail title="Groceries" count={3}>
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="shrink-0 snap-start w-[min(68vw,210px)] sm:w-[min(78vw,250px)]">
                      <FoodRestaurantCardSkeleton />
                    </div>
                  ))}
                </SlideRail>
              </section>
            )}
            {activeTab === 'groceries' && shop.failed && (
              <ClosedSection
                title="Groceries"
                headline="We're still fixing this problem"
                body="Groceries could not be loaded right now. Please check back soon."
              />
            )}
            {activeTab === 'groceries' && shopClosed && (
              <ClosedSection
                title="Groceries"
                headline="We're still fixing this problem"
                body="Groceries are not available yet. Please check back soon."
              />
            )}
            {activeTab === 'groceries' && shopReady && (
              <section className="mt-2">
                <SlideRail title="Groceries" count={shop.partners.length}>
                    {shop.partners.map((listing) => (
                      <div key={listing.id} className="shrink-0 snap-start w-[min(68vw,210px)] sm:w-[min(78vw,250px)]">
                        <FoodRestaurantCard
                          listing={{
                            ...listing,
                            fee: listing.fee ? `${listing.fee} delivery` : listing.fee,
                          }}
                          minOrderLabel={minOrderLabel}
                          favorite={favorites.includes(listing.id)}
                          onToggleFavorite={toggleFavorite}
                          onOpen={openStore}
                        />
                      </div>
                    ))}
                  </SlideRail>
              </section>
            )}

            {activeTab === 'shops' && shop.loading && (
              <section className="mt-2">
                <SlideRail title="Shops" count={3}>
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="shrink-0 snap-start w-[min(68vw,210px)] sm:w-[min(78vw,250px)]">
                      <FoodRestaurantCardSkeleton />
                    </div>
                  ))}
                </SlideRail>
              </section>
            )}
            {activeTab === 'shops' && shop.failed && (
              <ClosedSection
                title="Shops"
                headline="We're still fixing this problem"
                body="This shop section could not be loaded right now. Please check back soon."
              />
            )}
            {activeTab === 'shops' && shopClosed && (
              <ClosedSection
                title="Shops"
                headline="We're still fixing this problem"
                body="This shop section is not taking orders yet. Please check back soon."
              />
            )}
            {activeTab === 'shops' && shopReady && (
              <section className="mt-2">
                <SlideRail title="Shops" count={shop.partners.length}>
                    {shop.partners.map((listing) => (
                      <div key={listing.id} className="shrink-0 snap-start w-[min(68vw,210px)] sm:w-[min(78vw,250px)]">
                        <FoodRestaurantCard
                          listing={{
                            ...listing,
                            fee: listing.fee ? `${listing.fee} delivery` : listing.fee,
                          }}
                          minOrderLabel={minOrderLabel}
                          favorite={favorites.includes(listing.id)}
                          onToggleFavorite={toggleFavorite}
                          onOpen={openStore}
                        />
                      </div>
                    ))}
                  </SlideRail>
              </section>
            )}
          </div>

          <aside className="hidden xl:block space-y-4">
            <div className="relative overflow-hidden rounded-[24px] bg-[#FFE8D6] min-h-[200px] p-5">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-brand-orange">Exclusive offer</p>
              <h3 className="text-2xl font-black text-brand-black leading-tight mt-1 max-w-[11rem]">
                {featured ? featured.name : 'Partner picks, delivered fast.'}
              </h3>
              {featured?.tag && (
                <p className="text-xs font-bold text-brand-grey mt-1">{featured.tag}</p>
              )}
              <button
                type="button"
                onClick={() => (featured ? openRestaurant(featured) : setActiveTab('deals'))}
                className="mt-4 inline-flex items-center gap-1 bg-brand-orange hover:bg-brand-orange/90 text-white text-sm font-black px-4 py-2 rounded-full cursor-pointer shadow-md shadow-brand-orange/25"
              >
                Order Now <ArrowRight className="w-4 h-4" />
              </button>
              <img
                src={featured?.logo || OFFER_FOOD_IMAGE}
                alt=""
                className="absolute right-[-8px] bottom-[-12px] w-32 h-32 object-contain drop-shadow-lg pointer-events-none"
              />
            </div>

            {feeFloor && (
              <div className="flex items-center gap-3 rounded-[20px] bg-emerald-50 border border-emerald-100 px-4 py-3">
                <span className="w-10 h-10 rounded-2xl bg-white flex items-center justify-center shrink-0">
                  <Bike className="w-5 h-5 text-emerald-600" />
                </span>
                <p className="text-sm font-bold text-emerald-900 leading-snug">
                  {Number.isFinite(Number(delivery?.freeRadiusKm))
                    ? `${feeFloor} within ${delivery.freeRadiusKm} km`
                    : feeFloor}
                </p>
              </div>
            )}

            <div className="rounded-[24px] bg-white border border-brand-border p-4 shadow-[0_8px_24px_rgba(17,24,39,0.04)]">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-black text-brand-black">Your Recent Orders</h3>
                {session && (
                  <Link to="/food/orders" className="text-xs font-bold text-brand-orange">
                    See all
                  </Link>
                )}
              </div>
              {!session && (
                <p className="text-sm text-brand-grey">
                  <Link to={`/login?next=${encodeURIComponent('/services/food')}`} className="font-bold text-brand-orange">
                    Sign in
                  </Link>{' '}
                  to reorder from your last meals.
                </p>
              )}
              {session && recentOrders.length === 0 && (
                <p className="text-sm text-brand-grey">No orders yet. Your first one is a tap away.</p>
              )}
              <div className="space-y-3">
                {recentOrders.map((order) => {
                  const status = foodStatusMeta(order.status);
                  const merchant = order.merchants || {};
                  return (
                    <div key={order.order_code} className="flex items-center gap-3">
                      <span className="w-12 h-12 rounded-2xl bg-brand-muted overflow-hidden flex items-center justify-center shrink-0">
                        {merchant.logo_url ? (
                          <img src={merchant.logo_url} alt="" className="w-full h-full object-contain p-1" />
                        ) : (
                          <span className="text-sm font-black text-brand-orange">
                            {(merchant.name || '?').charAt(0)}
                          </span>
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-black text-brand-black truncate">{merchant.name || 'Restaurant'}</p>
                        <p className="text-[11px] text-brand-grey truncate">
                          {fmtSAR(order.total)} · {status.label} · {relativeTime(order.created_at)}
                        </p>
                      </div>
                      {merchant.id && (
                        <Link
                          to={`/food/r/${merchant.id}`}
                          className="shrink-0 text-[11px] font-bold text-brand-orange bg-white border border-brand-orange/30 rounded-full px-2.5 py-1.5 hover:bg-orange-50"
                        >
                          Order Again
                        </Link>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <h3 className="font-black text-brand-black mb-3">Explore More</h3>
              <div className="grid grid-cols-3 gap-3">
                {[
                    {
                      id: 'groceries',
                      label: 'Groceries',
                      Icon: ShoppingBag,
                      bg: 'bg-emerald-50',
                      color: 'text-emerald-600',
                    },
                    {
                      id: 'shops',
                      label: 'Shops',
                      Icon: Store,
                      bg: 'bg-violet-50',
                      color: 'text-violet-600',
                    },
                    {
                      id: 'deals',
                      label: 'Deals',
                      Icon: Percent,
                      bg: 'bg-rose-50',
                      color: 'text-rose-600',
                    },
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setActiveTab(item.id);
                        setCuisineFilter('');
                      }}
                      className="flex flex-col items-center justify-center rounded-[22px] bg-white border border-brand-border py-4 hover:border-brand-orange/30 hover:shadow-md transition-all cursor-pointer"
                    >
                      <span className={`w-12 h-12 rounded-2xl ${item.bg} ${item.color} flex items-center justify-center`}>
                        <item.Icon className="w-5 h-5" />
                      </span>
                      <span className="mt-2 text-sm font-black text-brand-black">{item.label}</span>
                    </button>
                  ))}
              </div>
            </div>
          </aside>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default FoodServicePage;
