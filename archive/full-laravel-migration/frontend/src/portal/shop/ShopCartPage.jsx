// ---------------------------------------------------------------------
// Ecommerce — cart: /shop/cart?s=<storeId>
//
// There is NO client-side cart store. Every mutation returns the whole
// recomputed cart from the server, which replaces local state — so the
// totals on screen are always the server's, never arithmetic done here.
// ---------------------------------------------------------------------
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Minus, Plus, Trash2, ShoppingBag, AlertTriangle } from 'lucide-react';
import { api } from '../lib/api';
import { fmtSAR, availabilityMeta, TONE_CLASSES } from '../lib/constants';
import { PortalShell, Card, Spinner, btnPrimary } from '../components/ui';

const MAX_QTY = 50;

function QtyControl({ value, onChange, disabled }) {
  const [draft, setDraft] = useState(String(value));
  const timer = useRef(null);

  useEffect(() => setDraft(String(value)), [value]);

  // Typing commits on a 700 ms pause so a customer can type "12" without
  // firing a request for "1" first.
  function type(next) {
    setDraft(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const n = Math.max(0, Math.min(MAX_QTY, parseInt(next, 10) || 0));
      if (n !== value) onChange(n);
    }, 700);
  }

  return (
    <div className="inline-flex items-center border border-brand-border rounded-lg overflow-hidden">
      <button
        onClick={() => onChange(Math.max(0, value - 1))}
        disabled={disabled}
        className="px-2 py-1.5 hover:bg-brand-surface disabled:opacity-40"
        aria-label="Decrease quantity"
      >
        <Minus className="w-3.5 h-3.5" />
      </button>
      <input
        value={draft}
        onChange={(e) => type(e.target.value.replace(/\D/g, ''))}
        disabled={disabled}
        className="w-10 text-center text-sm font-bold outline-none disabled:opacity-40"
        inputMode="numeric"
      />
      <button
        onClick={() => onChange(Math.min(MAX_QTY, value + 1))}
        disabled={disabled}
        className="px-2 py-1.5 hover:bg-brand-surface disabled:opacity-40"
        aria-label="Increase quantity"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export default function ShopCartPage() {
  const [params] = useSearchParams();
  const storeId = params.get('s') || '';
  const navigate = useNavigate();
  const [cart, setCart] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(() => {
    if (!storeId) {
      setLoading(false);
      return;
    }
    api
      .shopCart(storeId)
      .then((c) => {
        setCart(c);
        setError(null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [storeId]);

  useEffect(load, [load]);

  async function changeQty(line, quantity) {
    setBusyId(line.id);
    try {
      setCart(await api.shopCartUpdate(line.id, quantity));
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function removeLine(line) {
    setBusyId(line.id);
    try {
      setCart(await api.shopCartRemove(line.id));
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <PortalShell title="Your cart">
        <div className="flex justify-center py-16">
          <Spinner className="!w-8 !h-8" />
        </div>
      </PortalShell>
    );
  }

  const items = cart?.items || [];

  if (!storeId || items.length === 0) {
    return (
      <PortalShell title="Your cart" onBack={() => navigate('/shop')}>
        <Card className="p-8 text-center">
          <ShoppingBag className="w-8 h-8 text-brand-grey/40 mx-auto mb-3" />
          <p className="font-bold text-brand-black">Your cart is empty</p>
          <p className="text-sm text-brand-grey mt-1">Browse the stores and add something.</p>
          <Link to="/shop" className={btnPrimary + ' mt-4 inline-flex'}>
            Browse stores
          </Link>
        </Card>
      </PortalShell>
    );
  }

  return (
    <PortalShell title="Your cart" onBack={() => navigate(`/shop/s/${storeId}`)}>
      {error && (
        <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium">
          {error}
        </div>
      )}

      <div className="space-y-3 mb-5">
        {items.map((line) => {
          const meta = availabilityMeta(line.availability);
          const blocked = !line.isAvailable || line.availability === 'out';
          return (
            <Card key={line.id} className={`p-3 ${blocked ? 'border-red-200' : ''}`}>
              <div className="flex gap-3">
                <div className="w-14 h-14 shrink-0 rounded-lg bg-brand-surface overflow-hidden flex items-center justify-center">
                  {line.imageUrl ? (
                    <img src={line.imageUrl} alt={line.name} className="w-full h-full object-cover" />
                  ) : (
                    <ShoppingBag className="w-5 h-5 text-brand-grey/40" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-brand-black leading-tight truncate">{line.name}</p>
                  <p className="text-xs text-brand-grey mt-0.5">
                    {[line.variantLabel, line.brand, line.unit].filter(Boolean).join(' · ')}
                  </p>
                  <div className="flex items-center justify-between mt-2 gap-2">
                    <QtyControl
                      value={line.quantity}
                      onChange={(q) => changeQty(line, q)}
                      disabled={busyId === line.id}
                    />
                    <div className="flex items-center gap-2">
                      <span className="font-black text-brand-black">{fmtSAR(line.lineTotal)}</span>
                      <button
                        onClick={() => removeLine(line)}
                        disabled={busyId === line.id}
                        className="p-1.5 text-brand-grey hover:text-red-600 disabled:opacity-40"
                        aria-label="Remove"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {!line.isAvailable && (
                <p className="mt-2 text-xs font-bold text-red-700 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" /> No longer available — remove it to continue.
                </p>
              )}
              {line.isAvailable && line.availability === 'out' && (
                <p className="mt-2 text-xs font-bold text-red-700 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" /> Out of stock — remove it to continue.
                </p>
              )}
              {line.isAvailable && line.availability === 'low' && (
                <p className={`mt-2 inline-block px-2 py-0.5 rounded-full text-[11px] font-bold border ${TONE_CLASSES[meta.tone]}`}>
                  {meta.label}
                </p>
              )}
            </Card>
          );
        })}
      </div>

      <Card className="p-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-brand-grey">Subtotal</span>
          <span className="font-bold">{fmtSAR(cart.subtotal)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-brand-grey">Delivery</span>
          <span className="font-bold">{fmtSAR(cart.deliveryFee)}</span>
        </div>
        {cart.vatAmount != null && (
          <div className="flex justify-between">
            <span className="text-brand-grey">VAT ({Math.round((cart.vatRate || 0) * 100)}%)</span>
            <span className="font-bold">{fmtSAR(cart.vatAmount)}</span>
          </div>
        )}
        <div className="flex justify-between pt-2 border-t border-brand-border">
          <span className="font-black text-brand-black">Total</span>
          <span className="font-black text-brand-orange">{fmtSAR(cart.total)}</span>
        </div>
      </Card>

      {!cart.meetsMinimum && (
        <p className="mt-3 text-sm text-amber-700 font-medium text-center">
          Add {fmtSAR(cart.shortfall)} more to reach the {fmtSAR(cart.minOrder)} minimum.
        </p>
      )}

      <button
        onClick={() => navigate(`/shop/checkout?s=${storeId}`)}
        disabled={!cart.meetsMinimum || cart.hasBlockingLine}
        className={btnPrimary + ' w-full mt-4 disabled:opacity-50'}
      >
        Go to checkout
      </button>
    </PortalShell>
  );
}
