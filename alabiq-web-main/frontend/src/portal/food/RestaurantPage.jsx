// ---------------------------------------------------------------------
// Food Delivery — restaurant menu: /food/r/:id
// A branded storefront: the page dresses itself in the restaurant's own
// color (sampled from its logo) with a cover banner, and every menu item
// is a discovery card that opens a Food Details / Customize sheet where the
// guest picks size + quantity before adding to the cart.
// ---------------------------------------------------------------------
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  UtensilsCrossed,
  Plus,
  Minus,
  ShoppingCart,
  RefreshCw,
  MapPin,
  CupSoda,
  Check,
  Bike,
  ChevronRight,
  Clock3,
  Heart,
  X,
  Truck,
  Navigation,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/AuthProvider';
import { fmtSAR } from '../lib/constants';
import { notifyMenuUnavailable } from '../lib/notify';
import { reopensLabel, todayHoursLabel } from '../lib/storeHours';
import { PortalShell, Spinner, btnPrimary } from '../components/ui';
import OpeningHoursCard from '../components/OpeningHours';
import { useBrandColor } from './useBrandColor';

const FAVORITES_KEY = 'sm_food_favorites';
const MOBILE_SECTION_PREVIEW = 5;
const MOBILE_PAGE_SIZE = 12;

function useMobile(breakpoint = 768) {
  const query = `(max-width: ${breakpoint - 1}px)`;
  const [mobile, setMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches
  );

  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMobile(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);

  return mobile;
}

export function enabledSizes(item) {
  return (item?.size_options || []).filter((s) => s && s.enabled !== false);
}

function readFavorites() {
  try {
    const raw = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function cuisineTags(cuisine) {
  return String(cuisine || '')
    .split(/[,/•|]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3);
}

// -------------------- category chips --------------------
function CategoryScroller({ categories, activeCat, onSelect, brand }) {
  const scrollerRef = useRef(null);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const active = el.querySelector(
      `[data-cat-id="${String(activeCat).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`
    );
    if (active && typeof active.scrollIntoView === 'function') {
      active.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, [activeCat]);

  return (
    <div className="sticky top-14 sm:top-16 z-20 -mx-3 sm:-mx-4 md:-mx-6 mb-4 sm:mb-5 py-2 bg-brand-muted/95 backdrop-blur-md border-b border-brand-border/60">
      <div className="px-3 sm:px-4 md:px-6 flex items-center gap-2">
        <div
          ref={scrollerRef}
          className="flex-1 flex gap-2 overflow-x-auto overscroll-x-contain touch-pan-x pb-1 scroll-smooth no-scrollbar"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {categories.map((cat) => {
            const active = activeCat === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                data-cat-id={cat.id}
                onClick={() => onSelect(cat.id)}
                className={`relative shrink-0 px-4 py-2 rounded-full text-xs font-black whitespace-nowrap cursor-pointer transition-colors ${
                  active
                    ? 'text-white'
                    : 'text-brand-grey bg-white border border-brand-border hover:text-brand-dark'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="menu-cat-pill"
                    className="absolute inset-0 rounded-full shadow-sm"
                    style={{ backgroundColor: brand.color }}
                    transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                  />
                )}
                <span className="relative z-10" style={active ? { color: brand.textOn } : undefined}>
                  {cat.name}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const listVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.04, delayChildren: 0.03 } },
};

const cardVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 420, damping: 30 } },
};

// -------------------- discovery card --------------------
// The card is now a browsing surface only. Tapping anywhere (including the
// pill) opens the customize sheet — it never adds straight to the cart, so
// sized meals and rice/no-rice style choices are made deliberately.
function ItemCard({ item, onOpen, brand, closed = false }) {
  const unavailable = !item.is_available || closed;
  const sizes = enabledSizes(item);
  const hasSizes = sizes.length > 0;
  const isDrink = hasSizes || item.item_type === 'drink_dessert_addon';
  const fromPrice = hasSizes ? Number(sizes[0]?.price) : Number(item.price);

  return (
    <motion.article
      variants={cardVariants}
      layout
      role="button"
      tabIndex={unavailable ? -1 : 0}
      onClick={() => !unavailable && onOpen(item)}
      onKeyDown={(e) => {
        if (unavailable) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(item);
        }
      }}
      className={`group relative flex gap-2.5 sm:gap-4 rounded-2xl border bg-white p-2.5 sm:p-3.5 transition-all duration-300 ${
        unavailable
          ? 'opacity-50 border-brand-border cursor-not-allowed'
          : 'border-brand-border hover:shadow-[0_12px_34px_-14px_rgba(17,24,39,0.35)] hover:-translate-y-0.5 cursor-pointer'
      }`}
    >
      <div className="min-w-0 flex-1 flex flex-col order-1">
        <h3 className="font-black text-brand-black text-[12px] sm:text-[15px] leading-snug tracking-tight line-clamp-2">
          {item.name}
        </h3>
        {item.description && (
          <p className="hidden sm:block text-[11px] sm:text-xs text-brand-grey mt-1 line-clamp-2 leading-relaxed">
            {item.description}
          </p>
        )}

        <div className="mt-auto pt-2 sm:pt-3 flex items-center justify-between gap-3">
          <p className="font-black text-[13px] sm:text-lg tabular-nums tracking-tight" style={{ color: brand.color }}>
            {hasSizes ? `From ${fmtSAR(fromPrice)}` : fmtSAR(fromPrice)}
          </p>
        </div>
      </div>

      <div className="relative w-[4.5rem] h-[4.5rem] sm:w-28 sm:h-28 rounded-xl sm:rounded-2xl overflow-hidden shrink-0 bg-brand-warm order-2">
        {item.image_url ? (
          <img
            src={item.image_url}
            alt=""
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: brand.softer }}>
            {isDrink ? (
              <CupSoda className="w-9 h-9" strokeWidth={1.6} style={{ color: brand.color, opacity: 0.55 }} />
            ) : (
              <UtensilsCrossed className="w-9 h-9" strokeWidth={1.6} style={{ color: brand.color, opacity: 0.55 }} />
            )}
          </div>
        )}
        {unavailable ? (
          <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
            <span className="text-[10px] font-black uppercase tracking-wider text-brand-grey bg-white px-2 py-1 rounded-full shadow-sm">
              {closed ? 'Closed' : 'Sold out'}
            </span>
          </div>
        ) : (
          <span
            aria-hidden="true"
            className="absolute bottom-1 right-1 sm:bottom-1.5 sm:right-1.5 w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center shadow-md transition-transform duration-200 group-hover:scale-110"
            style={{ backgroundColor: brand.color, color: brand.textOn }}
          >
            <Plus className="w-4 h-4" strokeWidth={3} />
          </span>
        )}
      </div>
    </motion.article>
  );
}

// -------------------- customize sheet --------------------
function QtyStepper({ qty, setQty, brand }) {
  const btn =
    'w-9 h-9 rounded-full border border-brand-border flex items-center justify-center text-brand-dark disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors hover:border-brand-grey';
  return (
    <div className="inline-flex items-center gap-3">
      <button type="button" className={btn} disabled={qty <= 1} onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Decrease quantity">
        <Minus className="w-4 h-4" strokeWidth={3} />
      </button>
      <span className="min-w-[1.5rem] text-center font-black text-brand-black tabular-nums" style={{ color: brand.color }}>
        {qty}
      </span>
      <button type="button" className={btn} disabled={qty >= 50} onClick={() => setQty((q) => Math.min(50, q + 1))} aria-label="Increase quantity">
        <Plus className="w-4 h-4" strokeWidth={3} />
      </button>
    </div>
  );
}

function ItemDetailSheet({ item, brand, closed, busy, onClose, onAdd }) {
  const sizes = enabledSizes(item);
  const hasSizes = sizes.length > 0;
  const isDrink = hasSizes || item.item_type === 'drink_dessert_addon';
  const [sizeId, setSizeId] = useState(sizes[0]?.id || null);
  const [qty, setQty] = useState(1);

  const unavailable = !item.is_available || closed;
  const selected = sizes.find((s) => s.id === sizeId) || null;
  const unitPrice = hasSizes ? Number(selected?.price ?? sizes[0]?.price) : Number(item.price);
  const total = unitPrice * qty;

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/50 backdrop-blur-[2px] cursor-pointer" />
      <motion.div
        initial={{ y: 40, opacity: 0, scale: 0.98 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 40, opacity: 0, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 360, damping: 30 }}
        className="relative w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col"
      >
        <div className="relative shrink-0 bg-[#F7F7F7] border-b border-brand-border/50">
          <div className="relative w-full aspect-[5/3] sm:aspect-[16/9] flex items-center justify-center px-6 py-5 sm:px-8 sm:py-6">
            {item.image_url ? (
              <img
                src={item.image_url}
                alt=""
                className="max-h-full max-w-full w-auto h-auto object-contain"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: brand.softer }}>
                {isDrink ? (
                  <CupSoda className="w-16 h-16" style={{ color: brand.color, opacity: 0.5 }} strokeWidth={1.4} />
                ) : (
                  <UtensilsCrossed className="w-16 h-16" style={{ color: brand.color, opacity: 0.5 }} strokeWidth={1.4} />
                )}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute top-3 right-3 w-9 h-9 rounded-full bg-white/95 shadow-md flex items-center justify-center text-brand-dark hover:bg-white cursor-pointer"
          >
            <X className="w-4 h-4" strokeWidth={2.5} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pt-4 pb-3">
          <div className="flex items-start justify-between gap-3">
            <h2 className="font-black text-brand-black text-xl tracking-tight">{item.name}</h2>
            <p className="font-black text-lg tabular-nums shrink-0" style={{ color: brand.color }}>
              {fmtSAR(unitPrice)}
            </p>
          </div>
          {item.description && (
            <p className="text-sm text-brand-grey mt-1.5 leading-relaxed">{item.description}</p>
          )}

          {hasSizes && (
            <div className="mt-5">
              <p className="text-xs font-black uppercase tracking-wider text-brand-grey mb-2">Choose a size</p>
              <div className="space-y-2">
                {sizes.map((s) => {
                  const active = sizeId === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSizeId(s.id)}
                      className="w-full flex items-center justify-between gap-3 rounded-2xl border p-3 text-left transition-all cursor-pointer"
                      style={{
                        borderColor: active ? brand.color : 'rgb(229,231,235)',
                        backgroundColor: active ? brand.softer : '#fff',
                      }}
                    >
                      <span className="inline-flex items-center gap-2.5">
                        <span
                          className="w-5 h-5 rounded-full border-2 flex items-center justify-center"
                          style={{ borderColor: active ? brand.color : 'rgb(203,213,225)' }}
                        >
                          {active && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: brand.color }} />}
                        </span>
                        <span className="text-sm font-bold text-brand-dark inline-flex items-center gap-1.5">
                          <CupSoda className="w-3.5 h-3.5" style={{ color: brand.color }} />
                          {s.label}
                        </span>
                      </span>
                      <span className="text-sm font-black text-brand-dark tabular-nums">{fmtSAR(s.price)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mt-5 flex items-center justify-between">
            <p className="text-xs font-black uppercase tracking-wider text-brand-grey">Quantity</p>
            <QtyStepper qty={qty} setQty={setQty} brand={brand} />
          </div>
        </div>

        <div className="shrink-0 border-t border-brand-border p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {unavailable ? (
            <div className="rounded-2xl bg-brand-surface px-4 py-3 text-center text-sm font-bold text-brand-grey">
              {closed ? 'This restaurant is closed right now' : 'This item is currently unavailable'}
            </div>
          ) : (
            <button
              type="button"
              disabled={busy || (hasSizes && !sizeId)}
              onClick={() => onAdd(item, { size: hasSizes ? sizeId : null, quantity: qty })}
              className="w-full flex items-center justify-center gap-2 rounded-2xl px-5 py-3.5 font-black shadow-lg cursor-pointer transition-transform active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: brand.color, color: brand.textOn }}
            >
              {busy ? (
                <Spinner className="!w-4 !h-4 !border-white/40 !border-t-white" />
              ) : (
                <>
                  <ShoppingCart className="w-4 h-4" />
                  Add {qty > 1 ? `${qty} ` : ''}to cart
                  <span className="opacity-70">·</span>
                  <span className="tabular-nums">{fmtSAR(total)}</span>
                </>
              )}
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function AddedToast({ itemName, brand, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 1600);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 12, scale: 0.96 }}
      className="fixed left-1/2 -translate-x-1/2 bottom-24 z-[60] max-w-[min(92vw,22rem)]"
    >
      <div className="flex items-center gap-2.5 rounded-2xl bg-brand-black text-white px-4 py-3 shadow-2xl">
        <span className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: brand.color, color: brand.textOn }}>
          <Check className="w-3.5 h-3.5" strokeWidth={3} />
        </span>
        <p className="text-sm font-bold leading-snug min-w-0">
          Added <span style={{ color: brand.color }}>{itemName}</span> to your cart
        </p>
      </div>
    </motion.div>
  );
}

// -------------------- info bar cell --------------------
function InfoCell({ Icon, label, value, brand }) {
  return (
    <div className="flex items-center gap-2.5 min-w-0 shrink-0">
      <span className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: brand.softer, color: brand.color }}>
        <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-wider text-brand-grey leading-tight">{label}</p>
        <p className="text-[12px] sm:text-[13px] font-black text-brand-black leading-tight truncate">{value}</p>
      </div>
    </div>
  );
}

function MenuGrid({ items, brand, closed, onOpen, className = '' }) {
  return (
    <motion.div
      variants={listVariants}
      initial="hidden"
      animate="show"
      className={`grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 sm:gap-3.5 ${className}`}
    >
      {items.map((item) => (
        <ItemCard key={item.id} item={item} onOpen={onOpen} brand={brand} closed={closed} />
      ))}
    </motion.div>
  );
}

function GroupedMenuSections({ allItems, categories, brand, closed, onOpen, onSelectCategory }) {
  const sections = categories.filter((c) => c.id !== 'all');

  return (
    <div className="space-y-6">
      {sections.map((cat) => {
        const catItems =
          cat.id === 'other'
            ? allItems.filter((i) => !i.category_id)
            : allItems.filter((i) => i.category_id === cat.id);
        if (!catItems.length) return null;

        const preview = catItems.slice(0, MOBILE_SECTION_PREVIEW);
        const hasMore = catItems.length > preview.length;

        return (
          <section key={cat.id}>
            <div className="flex items-center justify-between gap-3 mb-2.5">
              <h3 className="font-black text-brand-black text-[15px] tracking-tight truncate">{cat.name}</h3>
              {hasMore && (
                <button
                  type="button"
                  onClick={() => onSelectCategory(cat.id)}
                  className="shrink-0 text-[11px] font-black cursor-pointer"
                  style={{ color: brand.color }}
                >
                  View all ({catItems.length})
                </button>
              )}
            </div>
            <MenuGrid items={preview} brand={brand} closed={closed} onOpen={onOpen} />
          </section>
        );
      })}
    </div>
  );
}

export default function RestaurantPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { session } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [cart, setCart] = useState(null);
  const [activeCat, setActiveCat] = useState('all');
  const [addingId, setAddingId] = useState(null);
  const [addError, setAddError] = useState(null);
  const [toast, setToast] = useState(null);
  const [detailItem, setDetailItem] = useState(null);
  const [favorite, setFavorite] = useState(false);
  const [visibleCount, setVisibleCount] = useState(MOBILE_PAGE_SIZE);
  const isMobile = useMobile();

  const brand = useBrandColor(data?.restaurant?.logo_url || null);

  useEffect(() => {
    setVisibleCount(MOBILE_PAGE_SIZE);
  }, [activeCat]);

  useEffect(() => {
    setFavorite(readFavorites().includes(id));
  }, [id]);

  function toggleFavorite() {
    const list = readFavorites();
    const next = list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
    setFavorite(next.includes(id));
  }

  async function load() {
    setError(null);
    try {
      const payload = await api.foodRestaurant(id);
      if (!(payload?.items || []).length) {
        await notifyMenuUnavailable(payload?.restaurant?.name);
        if (location.key !== 'default') navigate(-1);
        else navigate('/food');
        return;
      }
      setData(payload);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!session) return;
    api.foodCart(id).then(setCart).catch(() => {});
  }, [id, session]);

  async function addToCart(item, { size = null, quantity = 1 } = {}) {
    if (!session) {
      navigate(`/login?next=${encodeURIComponent(`/food/r/${id}`)}`);
      return;
    }
    if (enabledSizes(item).length > 0 && !size) return;

    setAddingId(item.id);
    setAddError(null);
    try {
      setCart(await api.foodCartAdd({ menu_item_id: item.id, quantity, ...(size ? { size } : {}) }));
      setToast({ id: Date.now(), name: item.name });
      setDetailItem(null);
    } catch (err) {
      setAddError(err.message);
    } finally {
      setAddingId(null);
    }
  }

  const items = useMemo(() => {
    const all = data?.items || [];
    if (activeCat === 'all') return all;
    if (activeCat === 'other') return all.filter((i) => !i.category_id);
    return all.filter((i) => i.category_id === activeCat);
  }, [data, activeCat]);

  const hasUncategorized = (data?.items || []).some((i) => !i.category_id);
  const cartCount = (cart?.items || []).reduce((n, i) => n + i.quantity, 0);
  const categories = useMemo(() => {
    if (!data) return [];
    return [
      { id: 'all', name: 'All' },
      ...data.categories,
      ...(hasUncategorized && data.categories.length ? [{ id: 'other', name: 'Other' }] : []),
    ];
  }, [data, hasUncategorized]);

  const restaurant = data?.restaurant;
  const closed = restaurant?.isOpen === false;
  const tags = cuisineTags(restaurant?.cuisine_type);
  const freeRadius = data?.delivery?.freeRadiusKm;
  const showGroupedMobile = isMobile && activeCat === 'all' && categories.length > 1;
  const pagedItems = isMobile && !showGroupedMobile ? items.slice(0, visibleCount) : items;
  const hasMoreItems = isMobile && !showGroupedMobile && visibleCount < items.length;

  return (
    <PortalShell
      wide
      compact
      title={restaurant?.name || 'Restaurant'}
      subtitle={restaurant?.cuisine_type || undefined}
      onBack={() => {
        if (location.key !== 'default') navigate(-1);
        else navigate('/');
      }}
    >
      {error && (
        <div className="bg-white border border-brand-border rounded-2xl shadow-sm p-6 text-center">
          <p className="text-brand-dark font-bold mb-1">Could not load this restaurant</p>
          <p className="text-sm text-brand-grey mb-4">{error}</p>
          <button type="button" onClick={load} className={btnPrimary}>
            <RefreshCw className="w-4 h-4" /> Try again
          </button>
        </div>
      )}

      {!data && !error && (
        <div className="flex justify-center py-20">
          <Spinner className="!w-8 !h-8" />
        </div>
      )}

      {data && !error && (
        <div className="pb-28">
          {/* Cover banner in the restaurant's own color */}
          <motion.section
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 340, damping: 28 }}
            className="overflow-hidden rounded-3xl shadow-sm"
          >
            <div
              className="relative h-32 sm:h-52"
              style={{ background: `linear-gradient(120deg, ${brand.color} 0%, ${brand.dark} 100%)` }}
            >
              <div className="absolute inset-0 opacity-25 bg-[radial-gradient(circle_at_18%_25%,white,transparent_42%),radial-gradient(circle_at_88%_10%,white,transparent_38%)]" />
              {restaurant.logo_url && (
                <img
                  src={restaurant.logo_url}
                  alt=""
                  aria-hidden="true"
                  className="absolute -right-6 -bottom-8 w-48 h-48 sm:w-60 sm:h-60 object-contain opacity-20 rotate-6 select-none pointer-events-none"
                />
              )}
              <div className="relative h-full flex items-end gap-3 sm:gap-4 px-3 sm:px-6 pb-3 sm:pb-4">
                <div className="w-16 h-16 sm:w-24 sm:h-24 rounded-xl sm:rounded-2xl bg-white p-1 sm:p-1.5 shadow-lg ring-1 ring-black/5 shrink-0">
                  <div className="w-full h-full rounded-xl overflow-hidden bg-white flex items-center justify-center">
                    {restaurant.logo_url ? (
                      <img src={restaurant.logo_url} alt="" className="w-full h-full object-contain" />
                    ) : (
                      <UtensilsCrossed className="w-9 h-9" style={{ color: brand.color }} />
                    )}
                  </div>
                </div>
                <div className="min-w-0 flex-1 pb-1">
                  <h2 className="font-black text-xl sm:text-3xl tracking-tight truncate" style={{ color: brand.textOn }}>
                    {restaurant.name}
                  </h2>
                  {tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {tags.map((t) => (
                        <span
                          key={t}
                          className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-black backdrop-blur-sm"
                          style={{
                            backgroundColor: brand.isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.22)',
                            color: brand.textOn,
                          }}
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Facts strip */}
            <div className="bg-white border-x border-b border-brand-border rounded-b-3xl px-3 sm:px-5 py-3 sm:py-4">
              <div className="flex items-center gap-4 overflow-x-auto no-scrollbar pb-0.5 sm:flex-wrap sm:overflow-visible">
                <InfoCell Icon={Bike} label="Delivery Fee" value={`From ${fmtSAR(data.deliveryFee)}`} brand={brand} />
                {freeRadius && (
                  <InfoCell Icon={Truck} label="Free Delivery" value={`Within ${freeRadius} km`} brand={brand} />
                )}
                {restaurant.service_radius_km && (
                  <InfoCell Icon={Navigation} label="Service Area" value={`${restaurant.service_radius_km} km`} brand={brand} />
                )}
                <InfoCell
                  Icon={Clock3}
                  label="Hours"
                  value={todayHoursLabel(restaurant) || (closed ? 'Closed now' : 'Open now')}
                  brand={brand}
                />
                {restaurant.address && (
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: brand.softer, color: brand.color }}>
                      <MapPin className="w-4 h-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-brand-grey leading-tight">Location</p>
                      <p className="text-[13px] font-black text-brand-black leading-tight truncate">{restaurant.address}</p>
                    </div>
                  </div>
                )}
                <button
                  type="button"
                  onClick={toggleFavorite}
                  aria-pressed={favorite}
                  className="shrink-0 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 sm:px-3.5 sm:py-2 text-[11px] sm:text-xs font-black cursor-pointer transition-colors"
                  style={{
                    borderColor: favorite ? brand.color : 'rgb(229,231,235)',
                    color: favorite ? brand.color : 'rgb(107,114,128)',
                    backgroundColor: favorite ? brand.softer : '#fff',
                  }}
                >
                  <Heart className="w-3.5 h-3.5" fill={favorite ? brand.color : 'none'} />
                  {favorite ? 'Favorited' : 'Favorite'}
                </button>
              </div>
            </div>
          </motion.section>

          {/* Delivery terms + tracking strip (real numbers, no invented promo codes) */}
          <div className="mt-3 sm:mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
            <div className="flex items-center gap-3 rounded-2xl border px-3 sm:px-4 py-2.5 sm:py-3" style={{ backgroundColor: brand.softer, borderColor: brand.ring }}>
              <span className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: brand.color, color: brand.textOn }}>
                <Truck className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <p className="text-[13px] font-black text-brand-black leading-tight">
                  {freeRadius ? `Free delivery within ${freeRadius} km` : `Delivery from ${fmtSAR(data.deliveryFee)}`}
                </p>
                <p className="text-[11px] font-medium text-brand-grey leading-tight">
                  {data?.delivery?.surchargePerKm
                    ? `Then ${fmtSAR(data.delivery.surchargePerKm)}/km beyond`
                    : 'Fees shown at checkout'}
                </p>
              </div>
            </div>
            <div className="hidden sm:flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <span className="w-9 h-9 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0">
                <Bike className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <p className="text-[13px] font-black text-emerald-800 leading-tight">Live Tracking Available</p>
                <p className="text-[11px] font-medium text-emerald-700/80 leading-tight">Follow your rider in real time</p>
              </div>
            </div>
          </div>

          <div className="mt-3 sm:mt-4 hidden md:block">
            <OpeningHoursCard merchant={restaurant} />
          </div>

          {addError && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 p-3 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium"
            >
              {addError}
            </motion.div>
          )}

          {categories.length > 1 && (
            <CategoryScroller categories={categories} activeCat={activeCat} onSelect={setActiveCat} brand={brand} />
          )}

          <div className="flex items-center gap-2 mb-4">
            <h3 className="font-black text-brand-black text-lg tracking-tight">
              {activeCat === 'all' ? 'Popular Items' : categories.find((c) => c.id === activeCat)?.name || 'Menu'}
            </h3>
            <span className="text-xs font-bold text-brand-grey">· {items.length}</span>
          </div>

          {items.length === 0 ? (
            <div className="bg-white border border-brand-border rounded-3xl shadow-sm p-10 text-center">
              <UtensilsCrossed className="w-10 h-10 text-brand-grey/40 mx-auto mb-3" />
              <p className="font-bold text-brand-dark">No items here yet</p>
              <p className="text-sm text-brand-grey mt-1">This restaurant has not added items to this section.</p>
            </div>
          ) : showGroupedMobile ? (
            <GroupedMenuSections
              allItems={data.items || []}
              categories={categories}
              brand={brand}
              closed={closed}
              onOpen={setDetailItem}
              onSelectCategory={setActiveCat}
            />
          ) : (
            <>
              <MenuGrid
                key={activeCat}
                items={pagedItems}
                brand={brand}
                closed={closed}
                onOpen={setDetailItem}
              />
              {hasMoreItems && (
                <button
                  type="button"
                  onClick={() => setVisibleCount((n) => n + MOBILE_PAGE_SIZE)}
                  className="mt-4 w-full rounded-2xl border border-brand-border bg-white py-3 text-sm font-black text-brand-dark cursor-pointer hover:border-brand-orange/40 hover:text-brand-orange transition-colors"
                >
                  Load more ({items.length - visibleCount} remaining)
                </button>
              )}
            </>
          )}
        </div>
      )}

      <AnimatePresence>
        {detailItem && (
          <ItemDetailSheet
            key={detailItem.id}
            item={detailItem}
            brand={brand}
            closed={closed}
            busy={addingId === detailItem.id}
            onClose={() => setDetailItem(null)}
            onAdd={addToCart}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && <AddedToast key={toast.id} itemName={toast.name} brand={brand} onDone={() => setToast(null)} />}
      </AnimatePresence>

      <AnimatePresence>
        {cartCount > 0 && (
          <motion.div
            initial={{ y: 90, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 90, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            className="fixed bottom-0 inset-x-0 z-40 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
          >
            <div className="max-w-7xl mx-auto">
              <motion.button
                type="button"
                onClick={() => navigate(`/food/cart?m=${id}`)}
                whileTap={{ scale: 0.985 }}
                className="w-full flex items-center justify-between gap-3 rounded-2xl bg-brand-black text-white px-5 py-3.5 shadow-2xl shadow-black/25 cursor-pointer"
              >
                <span className="inline-flex items-center gap-2.5 min-w-0">
                  <span className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: brand.color, color: brand.textOn }}>
                    <ShoppingCart className="w-4 h-4" />
                  </span>
                  <span className="text-left min-w-0">
                    <span className="block text-[11px] font-bold text-white/60 uppercase tracking-wider">Your cart</span>
                    <span className="block text-sm font-black truncate">
                      {cartCount} {cartCount === 1 ? 'item' : 'items'} ready
                    </span>
                  </span>
                </span>
                <span className="inline-flex items-center gap-1.5 font-black tabular-nums shrink-0">
                  {fmtSAR(cart.subtotal)}
                  <ChevronRight className="w-4 h-4" style={{ color: brand.color }} />
                </span>
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </PortalShell>
  );
}
