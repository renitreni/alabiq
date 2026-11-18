// ---------------------------------------------------------------------
// Ecommerce — discovery / home: /shop
// Search stores and products in real time, filter by category, browse
// listed stores. Public page (ordering itself requires sign-in).
// ---------------------------------------------------------------------
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Search, ShoppingBag, ReceiptText, RefreshCw } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/AuthProvider';
import { deliveryFeeFromLabel, deliveryFeeNote, fmtSAR, liveProductImage } from '../lib/constants';
import ListingRow, { ListingRowSkeleton } from '../components/ListingRow';
import { PortalShell, Card, btnPrimary, inputClass } from '../components/ui';
import ShopHeroBanner from '../../components/ShopHeroBanner';

function shopErrorCopy(error) {
  const msg = (error || '').toString();
  if (/not open yet/i.test(msg) || /503/.test(msg)) {
    return {
      title: "We're still fixing this problem",
      body: 'Groceries are not available yet. Please check back soon.',
    };
  }
  return {
    title: "We're still fixing this problem",
    body: msg || 'Stores could not be loaded right now.',
  };
}

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

function productMatches(product, q) {
  if (!q) return true;
  const hay = [product.name, product.brand, product.storeName, product.description]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
}

export default function StoreHomePage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retry, setRetry] = useState(0);
  const [q, setQ] = useState(params.get('q') || '');
  const [category, setCategory] = useState(params.get('category') || '');
  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const debounce = useRef(null);
  const urlDebounce = useRef(null);

  const listQuery = useMemo(() => {
    const p = new URLSearchParams();
    if (category) p.set('category', category);
    const s = p.toString();
    return s ? `?${s}` : '';
  }, [category]);

  useEffect(() => {
    setLoading(true);
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      api
        .shopStores(listQuery)
        .then((d) => {
          setData(d);
          setError(null);
        })
        .catch((e) => {
          setData(null);
          setError(e.message);
        })
        .finally(() => setLoading(false));
    }, retry === 0 ? 0 : 150);
    return () => clearTimeout(debounce.current);
  }, [listQuery, retry]);

  useEffect(() => {
    clearTimeout(urlDebounce.current);
    urlDebounce.current = setTimeout(() => {
      const next = new URLSearchParams();
      if (q.trim()) next.set('q', q.trim());
      if (category) next.set('category', category);
      const current = params.toString();
      const upcoming = next.toString();
      if (current !== upcoming) setParams(next, { replace: true });
    }, 250);
    return () => clearTimeout(urlDebounce.current);
  }, [q, category, params, setParams]);

  const stores = [...(data?.stores || [])].sort(
    (a, b) => (a.isOpen === false ? 1 : 0) - (b.isOpen === false ? 1 : 0)
  );

  const storeIdsKey = stores.map((s) => s.id).join(',');

  useEffect(() => {
    if (loading) return undefined;
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
      setProducts(next);
      setProductsLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [loading, storeIdsKey]);

  const needle = q.trim().toLowerCase();

  const matchingProducts = useMemo(() => {
    const list = products
      .filter((p) => productMatches(p, needle))
      .sort((a, b) => Number(!!liveProductImage(b.imageUrl)) - Number(!!liveProductImage(a.imageUrl)));
    return needle ? list.slice(0, 12) : list.slice(0, 8);
  }, [products, needle]);

  const visibleStores = useMemo(() => {
    if (!needle) return stores;
    const matchingStoreIds = new Set(
      products.filter((p) => productMatches(p, needle)).map((p) => p.storeId)
    );
    return stores.filter((s) => {
      const nameHit = (s.name || '').toLowerCase().includes(needle);
      const cuisineHit = (s.cuisine_type || '').toLowerCase().includes(needle);
      return nameHit || cuisineHit || matchingStoreIds.has(s.id);
    });
  }, [stores, products, needle]);

  const deliveryTerms = data?.delivery ?? data?.deliveryFee ?? null;
  const deliveryLabel = deliveryFeeFromLabel(deliveryTerms);
  const deliveryNote = deliveryFeeNote(deliveryTerms);
  const errorCopy = shopErrorCopy(error);
  const searching = !!needle;

  return (
    <PortalShell
      title="Shop"
      subtitle="Groceries, household and everyday essentials, delivered."
      onBack={() => navigate('/')}
      right={
        session && (
          <button onClick={() => navigate('/shop/orders')} className="text-sm font-bold text-brand-orange">
            <ReceiptText className="w-4 h-4 inline mr-1 -mt-0.5" /> My orders
          </button>
        )
      }
      wide
    >
      <div className="mb-4">
        <ShopHeroBanner />
      </div>

      <div className="relative mb-4">
        <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-grey" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search products or stores"
          className={inputClass + ' pl-10'}
          autoComplete="off"
        />
      </div>

      {(data?.categories || []).length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-3 mb-2 -mx-1 px-1">
          <button
            onClick={() => setCategory('')}
            className={`shrink-0 px-3.5 py-1.5 rounded-full text-sm font-bold border transition-colors ${
              category === ''
                ? 'bg-brand-orange text-white border-brand-orange'
                : 'bg-white text-brand-grey border-brand-border'
            }`}
          >
            All
          </button>
          {data.categories.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c === category ? '' : c)}
              className={`shrink-0 px-3.5 py-1.5 rounded-full text-sm font-bold border transition-colors ${
                category === c
                  ? 'bg-brand-orange text-white border-brand-orange'
                  : 'bg-white text-brand-grey border-brand-border'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {deliveryNote && <p className="text-xs text-brand-grey mb-4">{deliveryNote}</p>}

      {error && (
        <Card className="p-5 text-center mb-4">
          <p className="font-bold text-brand-black mb-1">{errorCopy.title}</p>
          <p className="text-sm text-brand-grey mb-3">{errorCopy.body}</p>
          <button onClick={() => setRetry((n) => n + 1)} className={btnPrimary}>
            <RefreshCw className="w-4 h-4" /> Try again
          </button>
        </Card>
      )}

      {!error && (productsLoading || matchingProducts.length > 0) && (
        <section className="mb-6">
          <div className="flex items-end justify-between gap-3 mb-3">
            <h2 className="text-base font-black text-brand-black tracking-tight">
              {searching ? 'Matching products' : 'Products'}
            </h2>
          </div>
          {productsLoading && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
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
          {!productsLoading && matchingProducts.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {matchingProducts.map((product) => {
                const price = priceLabel(productPrice(product));
                return (
                  <button
                    key={`${product.storeId}-${product.id}`}
                    type="button"
                    onClick={() => navigate(`/shop/s/${product.storeId}`)}
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
                  </button>
                );
              })}
            </div>
          )}
        </section>
      )}

      {loading && !error && (
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <ListingRowSkeleton key={i} />
          ))}
        </div>
      )}

      {!loading && !error && visibleStores.length === 0 && (
        <Card className="p-8 text-center">
          <ShoppingBag className="w-8 h-8 text-brand-grey/40 mx-auto mb-3" />
          <p className="font-bold text-brand-black">
            {searching ? 'No matching stores or products' : "We're still fixing this problem"}
          </p>
          <p className="text-sm text-brand-grey mt-1">
            {searching
              ? 'Try a different search or category.'
              : 'Groceries are not available yet. Please check back soon.'}
          </p>
        </Card>
      )}

      {!loading && !error && visibleStores.length > 0 && (
        <section>
          <h2 className="text-base font-black text-brand-black tracking-tight mb-3">
            {searching ? 'Stores' : 'Partner stores'}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {visibleStores.map((s) => (
              <ListingRow
                key={s.id}
                merchant={s}
                deliveryLabel={deliveryLabel}
                fallbackIcon={ShoppingBag}
                to={`/shop/s/${s.id}`}
              />
            ))}
          </div>
        </section>
      )}
    </PortalShell>
  );
}
