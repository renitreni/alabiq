// ---------------------------------------------------------------------
// Ecommerce — store catalogue: /shop/s/:id
// Category tabs, product cards, a variant picker sheet for products with
// options, and a sticky "View cart" bar.
//
// Stock is shown as a BAND ('In stock' / 'Only a few left' / 'Out of
// stock'), never a number: the API withholds exact counts because polling
// them over time would reveal the store's sales velocity per SKU.
// ---------------------------------------------------------------------
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingBag, Plus, ShoppingCart, ArrowLeft } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/AuthProvider';
import { fmtSAR, availabilityMeta, TONE_CLASSES, liveProductImage } from '../lib/constants';
import { PortalShell, Card, Spinner, btnPrimary, btnGhost } from '../components/ui';
import OpeningHoursCard, { ClosedBanner } from '../components/OpeningHours';

function AvailabilityPill({ band }) {
  if (band === 'in_stock') return null; // the common case needs no shouting
  const meta = availabilityMeta(band);
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold border ${TONE_CLASSES[meta.tone]}`}
    >
      {meta.label}
    </span>
  );
}

function ProductCard({ product, onAdd, busy, closed = false }) {
  // Closed is a store-level state, sold out is a product one — both disable
  // the button, and the backend rejects either way if a client tries anyway.
  const soldOut = product.availability === 'out' || !product.isAvailable || closed;
  const hasVariants = (product.variants || []).length > 0;
  // With variants the card shows the cheapest option as a "from" price.
  const displayPrice = hasVariants
    ? Math.min(...product.variants.map((v) => v.price))
    : product.price;

  return (
    <div
      className={`flex gap-3 p-3 bg-white border border-brand-border rounded-2xl ${
        soldOut ? 'opacity-60' : ''
      }`}
    >
      <div className="w-20 h-20 shrink-0 rounded-xl bg-brand-surface overflow-hidden flex items-center justify-center">
        {liveProductImage(product.imageUrl) ? (
          <img src={liveProductImage(product.imageUrl)} alt={product.name} className="w-full h-full object-cover" />
        ) : (
          <ShoppingBag className="w-6 h-6 text-brand-grey/40" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-bold text-brand-black leading-tight truncate">{product.name}</p>
            {(product.brand || product.unit) && (
              <p className="text-xs text-brand-grey mt-0.5">
                {[product.brand, product.unit].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
          <AvailabilityPill band={soldOut ? 'out' : product.availability} />
        </div>

        {product.description && (
          <p className="text-xs text-brand-grey mt-1 line-clamp-2">{product.description}</p>
        )}

        <div className="flex items-center justify-between mt-2">
          <p className="font-black text-brand-orange">
            {hasVariants && <span className="text-xs font-bold text-brand-grey mr-1">from</span>}
            {fmtSAR(displayPrice)}
          </p>
          <button
            onClick={() => onAdd(product)}
            disabled={soldOut || busy}
            className={btnPrimary + ' !py-1.5 !px-3 text-sm disabled:opacity-50'}
          >
            {busy ? <Spinner className="!border-white/40 !border-t-white !w-4 !h-4" /> : <Plus className="w-4 h-4" />}
            {hasVariants ? 'Options' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Bottom sheet for products with variants. Mirrors the food SizePickerSheet
// shape so the two storefronts feel identical.
function VariantPickerSheet({ product, onClose, onConfirm, busy }) {
  const options = (product?.variants || []).filter((v) => v.availability !== 'out');
  const [selected, setSelected] = useState(options[0]?.id || null);

  useEffect(() => {
    setSelected(options[0]?.id || null);
  }, [product]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!product) return null;
  const chosen = options.find((o) => o.id === selected);

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 bg-black/40 z-40"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        className="fixed left-0 right-0 bottom-0 z-50 bg-white rounded-t-3xl p-5 max-h-[80vh] overflow-y-auto"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
      >
        <div className="w-10 h-1 bg-brand-border rounded-full mx-auto mb-4" />
        <p className="font-black text-brand-black">{product.name}</p>
        <p className="text-sm text-brand-grey mb-4">Choose an option</p>

        <div className="space-y-2">
          {options.map((o) => (
            <button
              key={o.id}
              onClick={() => setSelected(o.id)}
              className={`w-full flex items-center justify-between p-3 rounded-xl border text-left transition-colors ${
                selected === o.id
                  ? 'border-brand-orange bg-brand-warm'
                  : 'border-brand-border bg-white'
              }`}
            >
              <span className="min-w-0">
                <span className="font-bold text-brand-black block truncate">{o.label}</span>
                {o.sku && <span className="text-xs text-brand-grey font-mono">{o.sku}</span>}
              </span>
              <span className="flex items-center gap-2 shrink-0">
                <AvailabilityPill band={o.availability} />
                <span className="font-black text-brand-orange">{fmtSAR(o.price)}</span>
              </span>
            </button>
          ))}
          {options.length === 0 && (
            <p className="text-sm text-brand-grey text-center py-6">
              Every option is out of stock right now.
            </p>
          )}
        </div>

        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className={btnGhost + ' flex-1'}>
            Cancel
          </button>
          <button
            onClick={() => onConfirm(chosen)}
            disabled={!chosen || busy}
            className={btnPrimary + ' flex-1 disabled:opacity-50'}
          >
            {busy ? <Spinner className="!border-white/40 !border-t-white" /> : `Add ${chosen ? fmtSAR(chosen.price) : ''}`}
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

export default function StorePage() {
  const { id } = useParams();
  const { session } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeCat, setActiveCat] = useState('all');
  const [cart, setCart] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [sheetProduct, setSheetProduct] = useState(null);

  useEffect(() => {
    setLoading(true);
    api
      .shopStore(id)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  // The cart lives server-side. We fetch it once for the sticky bar; every
  // mutation below replaces this state with the freshly recomputed cart.
  useEffect(() => {
    if (!session) return;
    api.shopCart(id).then(setCart).catch(() => {});
  }, [id, session]);

  const visible = useMemo(() => {
    const products = data?.products || [];
    return activeCat === 'all' ? products : products.filter((p) => p.categoryId === activeCat);
  }, [data, activeCat]);

  function handleAdd(product) {
    if (!session) {
      // Bounce through login and come straight back to this store.
      navigate(`/login?next=${encodeURIComponent(`/shop/s/${id}`)}`);
      return;
    }
    if ((product.variants || []).length > 0) {
      setSheetProduct(product);
      return;
    }
    addToCart(product, null);
  }

  async function addToCart(product, variant) {
    setBusyId(product.id);
    try {
      const next = await api.shopCartAdd({
        product_id: product.id,
        quantity: 1,
        ...(variant ? { variant_id: variant.id } : {}),
      });
      setCart(next);
      setSheetProduct(null);
    } catch {
      /* api.js already surfaced the message */
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <PortalShell title="Store">
        <div className="flex justify-center py-16">
          <Spinner className="!w-8 !h-8" />
        </div>
      </PortalShell>
    );
  }

  if (error) {
    return (
      <PortalShell title="Store" onBack={() => navigate('/shop')}>
        <Card className="p-8 text-center">
          <p className="font-bold text-brand-black">{error}</p>
          <Link to="/shop" className={btnPrimary + ' mt-4 inline-flex'}>
            <ArrowLeft className="w-4 h-4" /> Back to stores
          </Link>
        </Card>
      </PortalShell>
    );
  }

  const store = data.store;
  const itemCount = (cart?.items || []).reduce((n, i) => n + i.quantity, 0);

  return (
    <PortalShell title={store.name} subtitle={store.cuisine_type} onBack={() => navigate('/shop')} wide>
      {store.address && <p className="text-sm text-brand-grey mb-4">{store.address}</p>}

      <ClosedBanner merchant={store} noun="store" />
      <OpeningHoursCard merchant={store} />

      <div className="flex gap-2 overflow-x-auto pb-3 mb-4 -mx-1 px-1 sticky top-0 bg-brand-muted/80 backdrop-blur z-10">
        <button
          onClick={() => setActiveCat('all')}
          className={`shrink-0 px-3.5 py-1.5 rounded-full text-sm font-bold border ${
            activeCat === 'all'
              ? 'bg-brand-orange text-white border-brand-orange'
              : 'bg-white text-brand-grey border-brand-border'
          }`}
        >
          All
        </button>
        {(data.categories || []).map((c) => (
          <button
            key={c.id}
            onClick={() => setActiveCat(c.id)}
            className={`shrink-0 px-3.5 py-1.5 rounded-full text-sm font-bold border ${
              activeCat === c.id
                ? 'bg-brand-orange text-white border-brand-orange'
                : 'bg-white text-brand-grey border-brand-border'
            }`}
          >
            {c.name}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="font-bold text-brand-black">Nothing here yet</p>
          <p className="text-sm text-brand-grey mt-1">This store has no products in that category.</p>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 pb-24">
          {visible.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              onAdd={handleAdd}
              busy={busyId === p.id}
              closed={store.isOpen === false}
            />
          ))}
        </div>
      )}

      {itemCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-brand-border z-20">
          <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-brand-grey">
                {itemCount} item{itemCount === 1 ? '' : 's'}
              </p>
              <p className="font-black text-brand-black">{fmtSAR(cart?.subtotal || 0)}</p>
            </div>
            <Link to={`/shop/cart?s=${id}`} className={btnPrimary}>
              <ShoppingCart className="w-4 h-4" /> View cart
            </Link>
          </div>
        </div>
      )}

      {sheetProduct && (
        <VariantPickerSheet
          product={sheetProduct}
          onClose={() => setSheetProduct(null)}
          onConfirm={(variant) => addToCart(sheetProduct, variant)}
          busy={busyId === sheetProduct.id}
        />
      )}
    </PortalShell>
  );
}
