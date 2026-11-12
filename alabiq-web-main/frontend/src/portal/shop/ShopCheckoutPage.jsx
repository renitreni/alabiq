// ---------------------------------------------------------------------
// Ecommerce — checkout: /shop/checkout?s=<storeId>
//
// Two steps in one component: address + contact + payment method, then
// (once the order exists) the shared PaymentPanel.
//
// The server recomputes every number and re-checks stock inside one
// transaction, so this page only collects input and renders the server's
// answer. Three failures it must handle specifically:
//   422 min_order / outside_radius  -> explain and send them back to the cart
//   409 out_of_stock                -> name the product, send them to the cart
// ---------------------------------------------------------------------
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Banknote, Smartphone, AlertTriangle, CreditCard } from 'lucide-react';
import useCardAvailable from '../lib/useCardAvailable';
import { api } from '../lib/api';
import { useAuth } from '../lib/AuthProvider';
import { fmtSAR } from '../lib/constants';
import { PortalShell, Card, Field, Spinner, inputClass, btnPrimary } from '../components/ui';
import LocationPicker from '../components/LocationPicker';
import PaymentPanel from '../food/PaymentPanel';

const PAY_METHODS = [
  {
    id: 'stcpay',
    label: 'STC Pay',
    hint: 'Transfer now and upload the receipt.',
    icon: Smartphone,
  },
  {
    id: 'cash',
    label: 'Cash on delivery',
    hint: 'Pay your rider when the order arrives.',
    icon: Banknote,
  },
];

// See the note in food/FoodCheckoutPage.jsx - same rule, same server check.
const CARD_METHOD = {
  id: 'tap',
  label: 'Card',
  hint: 'Pay now with a card, Apple Pay or mada',
  icon: CreditCard,
};

export default function ShopCheckoutPage() {
  // Card is offered only when the gateway is live; the server re-checks on
  // create, because a picker is a suggestion and a stale tab is not evidence.
  const cardOn = useCardAvailable();
  const payMethods = cardOn ? [...PAY_METHODS, CARD_METHOD] : PAY_METHODS;
  const [params] = useSearchParams();
  const storeId = params.get('s') || '';
  const navigate = useNavigate();
  const { profile } = useAuth();

  const [cart, setCart] = useState(null);
  const [loading, setLoading] = useState(true);
  const [address, setAddress] = useState('');
  const [point, setPoint] = useState(null);
  const [street, setStreet] = useState('');
  const [buildingNumber, setBuildingNumber] = useState('');
  const [phone, setPhone] = useState(profile?.mobile || '');
  const [method, setMethod] = useState('stcpay');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [placedCode, setPlacedCode] = useState(null);

  // One key per mounted checkout: a double-tap or a network retry can never
  // create two orders — which for this vertical also means it can never
  // reserve the same stock twice.
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);

  useEffect(() => {
    if (!storeId) {
      setLoading(false);
      return;
    }
    api
      .shopCart(storeId)
      .then(setCart)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [storeId]);

  useEffect(() => {
    if (profile?.mobile && !phone) setPhone(profile.mobile);
  }, [profile]); // eslint-disable-line react-hooks/exhaustive-deps

  async function placeOrder() {
    if (!address.trim()) return setError('Please set your delivery address.');
    if (!point) return setError('Please drop a pin on your delivery location.');
    if (!street.trim() || !buildingNumber.trim()) {
      return setError('Please enter the street and building / house number so the rider can find you.');
    }

    setError(null);
    setBusy(true);
    try {
      const order = await api.shopCheckout(
        {
          merchant_id: storeId,
          delivery_address: address.trim(),
          delivery_lat: point.lat,
          delivery_lng: point.lng,
          delivery_street: street.trim(),
          delivery_building: buildingNumber.trim(),
          contact_phone: phone || null,
          payment_method: method,
        },
        idempotencyKey
      );
      // Cash orders are done here — nothing to pay online.
      if (method === 'cash') {
        navigate(`/shop/track/${order.orderCode}`);
        return;
      }
      setPlacedCode(order.orderCode);
    } catch (err) {
      // The server sends a human sentence for every one of these; show it
      // as-is rather than inventing our own copy.
      setError(err.message);
      if (err.status === 409 || err.status === 422) {
        setTimeout(() => navigate(`/shop/cart?s=${storeId}`), 2500);
      }
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <PortalShell title="Checkout">
        <div className="flex justify-center py-16">
          <Spinner className="!w-8 !h-8" />
        </div>
      </PortalShell>
    );
  }

  // Step 2 — the order exists, collect payment.
  if (placedCode) {
    return (
      <PortalShell title="Payment" subtitle={`Order ${placedCode}`}>
        <PaymentPanel
          code={placedCode}
          vertical="shop"
          onPaid={() => navigate(`/shop/track/${placedCode}`)}
        />
        <button
          onClick={() => navigate(`/shop/track/${placedCode}`)}
          className="w-full mt-3 text-sm font-bold text-brand-grey"
        >
          Pay later — track my order
        </button>
      </PortalShell>
    );
  }

  return (
    <PortalShell title="Checkout" onBack={() => navigate(`/shop/cart?s=${storeId}`)}>
      {error && (
        <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <Card className="p-4 mb-4">
        <LocationPicker
          label="Delivery address"
          placeholder="Search nearby places, streets, or districts"
          address={address}
          coords={point}
          street={street}
          buildingNumber={buildingNumber}
          requireStreetAndBuilding
          onChange={({ address: nextAddress, coords: nextCoords, street: nextStreet, buildingNumber: nextBuilding }) => {
            setAddress(nextAddress || '');
            setPoint(nextCoords || null);
            setStreet(nextStreet || '');
            setBuildingNumber(nextBuilding || '');
          }}
        />
      </Card>

      <Card className="p-4 mb-4">
        <Field label="Contact number">
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="05XXXXXXXX"
            className={inputClass}
            inputMode="tel"
          />
        </Field>
      </Card>

      <p className="font-bold text-brand-black mb-2">Payment method</p>
      <div className="space-y-2 mb-4">
        {payMethods.map((m) => {
          const Icon = m.icon;
          return (
            <button
              key={m.id}
              onClick={() => setMethod(m.id)}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-colors ${
                method === m.id ? 'border-brand-orange bg-brand-warm' : 'border-brand-border bg-white'
              }`}
            >
              <span className="w-9 h-9 rounded-lg bg-brand-surface flex items-center justify-center shrink-0">
                <Icon className="w-4 h-4 text-brand-dark" />
              </span>
              <span className="flex-1 min-w-0">
                <span className="font-bold text-brand-black block">{m.label}</span>
                <span className="text-xs text-brand-grey">{m.hint}</span>
              </span>
              <span
                className={`w-4 h-4 rounded-full border-2 shrink-0 ${
                  method === m.id ? 'border-brand-orange bg-brand-orange' : 'border-brand-border'
                }`}
              />
            </button>
          );
        })}
      </div>

      {cart && (
        <Card className="p-4 space-y-2 text-sm mb-4">
          <div className="flex justify-between">
            <span className="text-brand-grey">
              Subtotal ({(cart.items || []).reduce((n, i) => n + i.quantity, 0)} items)
            </span>
            <span className="font-bold">{fmtSAR(cart.subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-brand-grey">Delivery</span>
            <span className="font-bold">{fmtSAR(cart.deliveryFee)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-brand-grey">VAT ({Math.round((cart.vatRate || 0) * 100)}%)</span>
            <span className="font-bold">{fmtSAR(cart.vatAmount)}</span>
          </div>
          <div className="flex justify-between pt-2 border-t border-brand-border">
            <span className="font-black text-brand-black">Total</span>
            <span className="font-black text-brand-orange">{fmtSAR(cart.total)}</span>
          </div>
        </Card>
      )}

      <button onClick={placeOrder} disabled={busy} className={btnPrimary + ' w-full disabled:opacity-50'}>
        {busy ? <Spinner className="!border-white/40 !border-t-white" /> : 'Place order'}
      </button>
    </PortalShell>
  );
}
