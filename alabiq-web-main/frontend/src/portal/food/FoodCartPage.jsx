// ---------------------------------------------------------------------
// Food Delivery — cart: /food/cart?m=<merchantId>
// Quantity steppers + totals, and THE 30 SAR minimum gate: below the
// minimum the checkout button is disabled and an inline message shows
// exactly how much more to add. (The backend re-enforces this at
// checkout — this is the friendly first line.)
// ---------------------------------------------------------------------
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Minus, Plus, Trash2, ShoppingCart, AlertCircle, ArrowRight } from 'lucide-react';
import { api } from '../lib/api';
import { fmtSAR, vatLabel } from '../lib/constants';
import { PortalShell, Card, Badge, Spinner, btnPrimary, btnGhost } from '../components/ui';

const MAX_QTY = 50;

// Editable quantity: +/- steppers AND a manually typeable number. Typing is
// debounced so each keystroke doesn't fire a PATCH; blur/Enter commits
// immediately. Empty or 0 falls back to the server value (delete via trash).
function QtyControl({ line, busy, onChange }) {
  const [text, setText] = useState(String(line.quantity));
  const timer = useRef(null);

  // Server value changed (another stepper press, refresh) -> resync the input.
  useEffect(() => { setText(String(line.quantity)); }, [line.quantity]);

  function commit(raw) {
    const n = Math.min(Math.max(parseInt(raw, 10) || 0, 0), MAX_QTY);
    if (!n) { setText(String(line.quantity)); return; }
    if (n !== line.quantity) onChange(line, n);
    setText(String(n));
  }

  function handleType(value) {
    if (!/^\d{0,2}$/.test(value)) return;
    setText(value);
    clearTimeout(timer.current);
    if (value !== '') timer.current = setTimeout(() => commit(value), 700);
  }

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        disabled={busy}
        onClick={() => { clearTimeout(timer.current); onChange(line, line.quantity - 1); }}
        className="w-8 h-8 rounded-lg border border-brand-border flex items-center justify-center text-brand-dark hover:bg-brand-surface cursor-pointer disabled:opacity-50"
        title="Decrease"
      >
        <Minus className="w-3.5 h-3.5" />
      </button>
      {busy ? (
        <span className="w-11 flex justify-center"><Spinner className="!w-4 !h-4" /></span>
      ) : (
        <input
          type="text"
          inputMode="numeric"
          value={text}
          onChange={(e) => handleType(e.target.value)}
          onBlur={() => { clearTimeout(timer.current); commit(text); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { clearTimeout(timer.current); commit(text); e.target.blur(); } }}
          className="w-11 h-8 text-center font-black text-brand-dark tabular-nums rounded-lg border border-brand-border focus:border-brand-orange focus:ring-2 focus:ring-brand-orange/20 outline-none"
          aria-label="Quantity"
        />
      )}
      <button
        type="button"
        disabled={busy || !line.isAvailable || line.quantity >= MAX_QTY}
        onClick={() => { clearTimeout(timer.current); onChange(line, line.quantity + 1); }}
        className="w-8 h-8 rounded-lg border border-brand-border flex items-center justify-center text-brand-dark hover:bg-brand-surface cursor-pointer disabled:opacity-50"
        title="Increase"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export default function FoodCartPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const merchantId = params.get('m');
  const [cart, setCart] = useState(null);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    if (!merchantId) return;
    api.foodCart(merchantId).then(setCart).catch((e) => setError(e.message));
  }, [merchantId]);

  async function changeQty(line, quantity) {
    setBusyId(line.id);
    setError(null);
    try {
      setCart(await api.foodCartUpdate(line.id, quantity));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function removeLine(line) {
    setBusyId(line.id);
    setError(null);
    try {
      setCart(await api.foodCartRemove(line.id));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  // No merchant in the URL -> nothing to show but a path back to browsing.
  if (!merchantId) {
    return (
      <PortalShell title="Your cart" onBack={() => navigate('/food')}>
        <Card className="p-10 text-center max-w-md mx-auto">
          <ShoppingCart className="w-10 h-10 text-brand-grey/40 mx-auto mb-3" />
          <p className="font-bold text-brand-dark">Your cart is empty</p>
          <p className="text-sm text-brand-grey mt-1 mb-4">Pick a restaurant to start an order.</p>
          <Link to="/food" className={btnPrimary}>Browse restaurants</Link>
        </Card>
      </PortalShell>
    );
  }

  const items = cart?.items || [];
  const hasUnavailable = items.some((i) => !i.isAvailable);
  const meetsMin = !!cart?.meetsMinimum;

  return (
    <PortalShell title="Your cart" onBack={() => navigate(`/food/r/${merchantId}`)}>
      <div className="max-w-2xl mx-auto pb-28">
        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium">
            {error}
          </div>
        )}

        {!cart && !error && (
          <div className="flex justify-center py-20"><Spinner className="!w-8 !h-8" /></div>
        )}

        {cart && items.length === 0 && (
          <Card className="p-10 text-center">
            <ShoppingCart className="w-10 h-10 text-brand-grey/40 mx-auto mb-3" />
            <p className="font-bold text-brand-dark">Your cart is empty</p>
            <p className="text-sm text-brand-grey mt-1 mb-4">Add some items from the menu first.</p>
            <Link to={`/food/r/${merchantId}`} className={btnPrimary}>Back to the menu</Link>
          </Card>
        )}

        {cart && items.length > 0 && (
          <>
            <Card className="divide-y divide-brand-border mb-4">
              {items.map((line) => (
                <div key={line.id} className="p-4 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-brand-dark truncate">{line.name}</p>
                    <p className="text-xs text-brand-grey">
                      {line.sizeLabel && (
                        <span className="inline-block mr-1.5 px-1.5 py-0.5 rounded-md bg-brand-orange/10 text-brand-orange font-bold text-[10px] uppercase tracking-wide">
                          {line.sizeLabel}
                        </span>
                      )}
                      {fmtSAR(line.unitPrice)} each
                    </p>
                    {!line.isAvailable && (
                      <Badge tone="red" className="mt-1">No longer available</Badge>
                    )}
                  </div>
                  <QtyControl line={line} busy={busyId === line.id} onChange={changeQty} />
                  <div className="w-20 text-right font-bold text-brand-dark tabular-nums">
                    {fmtSAR(line.lineTotal)}
                  </div>
                  <button
                    type="button"
                    disabled={busyId === line.id}
                    onClick={() => removeLine(line)}
                    className="p-2 rounded-lg text-brand-grey hover:text-red-600 hover:bg-red-50 cursor-pointer"
                    title="Remove"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </Card>

            {hasUnavailable && (
              <div className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-sm font-medium flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                Some items became unavailable. Remove them to continue to checkout.
              </div>
            )}

            <Card className="p-5 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-brand-grey">Subtotal</span>
                <span className="font-bold tabular-nums">{fmtSAR(cart.subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-brand-grey">Delivery charge (within 15 km)</span>
                <span className="font-bold tabular-nums">{fmtSAR(cart.deliveryFee)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-brand-grey">{vatLabel(cart.vatRate)}</span>
                <span className="font-bold tabular-nums">{fmtSAR(cart.vatAmount)}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-brand-border">
                <span className="font-bold text-brand-dark">Total</span>
                <span className="font-black text-brand-orange tabular-nums">
                  {fmtSAR(cart.total)}
                </span>
              </div>
            </Card>

            {/* THE 30 SAR minimum gate */}
            {!meetsMin && (
              <div className="mt-4 p-4 rounded-xl bg-amber-50 border border-amber-300 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-amber-800 text-sm">
                    Add {fmtSAR(cart.shortfall)} more to reach the {fmtSAR(cart.minOrder)} minimum
                  </p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    Orders below {fmtSAR(cart.minOrder)} cannot be checked out.
                  </p>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Sticky checkout bar: disabled below the minimum or with dead items */}
      {cart && items.length > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-40 p-3 bg-white/95 backdrop-blur border-t border-brand-border">
          <div className="max-w-2xl mx-auto flex gap-2">
            <Link to={`/food/r/${merchantId}`} className={btnGhost + ' shrink-0'}>
              Add more
            </Link>
            <button
              type="button"
              disabled={!meetsMin || hasUnavailable}
              onClick={() => navigate(`/food/checkout?m=${merchantId}`)}
              className={btnPrimary + ' flex-1'}
              title={!meetsMin ? `Minimum order is ${fmtSAR(cart.minOrder)}` : undefined}
            >
              {meetsMin ? (
                <>Checkout · {fmtSAR(cart.total)} <ArrowRight className="w-4 h-4" /></>
              ) : (
                <>Add {fmtSAR(cart.shortfall)} more to checkout</>
              )}
            </button>
          </div>
        </div>
      )}
    </PortalShell>
  );
}
