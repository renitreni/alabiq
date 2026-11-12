// ---------------------------------------------------------------------
// Food Delivery — checkout: /food/checkout?m=<merchantId>
// Step 1: delivery address (with device location for the 15 km rule) +
//         order summary. Placing the order calls the backend, which
//         recomputes all money and enforces the 30 SAR minimum (422).
// Step 2: payment (shared PaymentPanel) -> /food/track/:code.
// ---------------------------------------------------------------------
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { MapPin, AlertCircle, ArrowRight, Smartphone, Phone, CreditCard } from 'lucide-react';
import useCardAvailable from '../lib/useCardAvailable';
import { api } from '../lib/api';
import { useAuth } from '../lib/AuthProvider';
import { fmtSAR, vatLabel, FOOD_RADIUS_KM } from '../lib/constants';
import { PortalShell, Card, Spinner, inputClass, btnPrimary, btnGhost } from '../components/ui';
import LocationPicker from '../components/LocationPicker';
import PaymentPanel from './PaymentPanel';

// How the ORDER is created. Card is deliberately absent: the backend enum
// Card is chosen HERE now, not one screen later. The old rule - the route
// enum accepted stcpay only - existed so an order could never be created
// against a gateway that might be unconfigured. That still holds; the server
// checks tapConfigured() explicitly instead of refusing the method outright.
const PAY_METHODS = [
  { id: 'stcpay', label: 'STC Pay', hint: 'Transfer + upload the screenshot', icon: Smartphone },
];

// Card is offered here only when the gateway is actually live. The server
// checks the same thing again on create (tapConfigured), because a picker
// is a suggestion and a stale tab is not evidence.
const CARD_METHOD = {
  id: 'tap',
  label: 'Card',
  hint: 'Pay now with a card, Apple Pay or mada',
  icon: CreditCard,
};

export default function FoodCheckoutPage() {
  // Card is offered only when the gateway is live; the server re-checks on
  // create, because a picker is a suggestion and a stale tab is not evidence.
  const cardOn = useCardAvailable();
  const payMethods = cardOn ? [...PAY_METHODS, CARD_METHOD] : PAY_METHODS;
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const merchantId = params.get('m');
  const { profile } = useAuth();

  const [cart, setCart] = useState(null);
  const [loadErr, setLoadErr] = useState(null);
  const [address, setAddress] = useState('');
  const [coords, setCoords] = useState(null); // { lat, lng }
  const [street, setStreet] = useState('');
  const [buildingNumber, setBuildingNumber] = useState('');
  const [contactPhone, setContactPhone] = useState(profile?.mobile || '');
  const [method, setMethod] = useState('stcpay');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [placedCode, setPlacedCode] = useState(null); // set -> payment step
  // One key per checkout attempt set: a network retry can't double-order.
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);

  useEffect(() => {
    if (!merchantId) return;
    api.foodCart(merchantId).then(setCart).catch((e) => setLoadErr(e.message));
  }, [merchantId]);

  // Prefill the contact number from the profile once it loads.
  useEffect(() => {
    if (profile?.mobile) setContactPhone((v) => v || profile.mobile);
  }, [profile?.mobile]);

  async function placeOrder() {
    if (!address.trim()) return setError('Please enter your delivery address.');
    if (!coords) return setError('Please tap "Use my location" so we can check the delivery radius.');
    if (!street.trim() || !buildingNumber.trim()) {
      return setError('Please enter the street and building / house number so the rider can find you.');
    }
    if (!contactPhone.trim()) return setError('Please enter a contact number for the rider.');

    setError(null);
    setBusy(true);
    try {
      const order = await api.foodCheckout(
        {
          merchant_id: merchantId,
          delivery_address: address.trim(),
          delivery_lat: coords.lat,
          delivery_lng: coords.lng,
          delivery_street: street.trim(),
          delivery_building: buildingNumber.trim(),
          contact_phone: contactPhone.trim(),
          payment_method: method,
        },
        idempotencyKey
      );
      setPlacedCode(order.orderCode);
    } catch (err) {
      // The backend speaks in failure_reason for the designed error states.
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!merchantId) {
    return (
      <PortalShell title="Checkout" onBack={() => navigate('/food')}>
        <Card className="p-10 text-center max-w-md mx-auto">
          <p className="font-bold text-brand-dark">Nothing to check out</p>
          <p className="text-sm text-brand-grey mt-1 mb-4">Start from a restaurant menu.</p>
          <Link to="/food" className={btnPrimary}>Browse restaurants</Link>
        </Card>
      </PortalShell>
    );
  }

  // Step 2 — the order exists; collect the payment.
  if (placedCode) {
    return (
      <PortalShell title="Payment" subtitle={placedCode} onBack={() => navigate(`/food/track/${placedCode}`)}>
        <div className="max-w-xl mx-auto space-y-4">
          <PaymentPanel code={placedCode} onPaid={() => navigate(`/food/track/${placedCode}`)} />
          <button
            type="button"
            onClick={() => navigate(`/food/track/${placedCode}`)}
            className={btnGhost + ' w-full'}
          >
            Pay later — track my order <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </PortalShell>
    );
  }

  const items = cart?.items || [];

  return (
    <PortalShell title="Checkout" onBack={() => navigate(`/food/cart?m=${merchantId}`)}>
      <div className="max-w-xl mx-auto space-y-4">
        {loadErr && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium">{loadErr}</div>
        )}
        {!cart && !loadErr && (
          <div className="flex justify-center py-20"><Spinner className="!w-8 !h-8" /></div>
        )}

        {cart && items.length === 0 && (
          <Card className="p-10 text-center">
            <p className="font-bold text-brand-dark">Your cart is empty</p>
            <p className="text-sm text-brand-grey mt-1 mb-4">Add items before checking out.</p>
            <Link to={`/food/r/${merchantId}`} className={btnPrimary}>Back to the menu</Link>
          </Card>
        )}

        {cart && items.length > 0 && (
          <>
            {/* Guard rail: the cart page is the primary gate, but deep links land here too. */}
            {!cart.meetsMinimum && (
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-bold text-amber-800">
                    Add {fmtSAR(cart.shortfall)} more to reach the {fmtSAR(cart.minOrder)} minimum.
                  </p>
                  <Link to={`/food/r/${merchantId}`} className="text-amber-700 underline font-medium">
                    Back to the menu
                  </Link>
                </div>
              </div>
            )}

            {error && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium">{error}</div>
            )}

            <Card className="p-5 space-y-3">
              <p className="font-black text-brand-black flex items-center gap-2">
                <MapPin className="w-4 h-4 text-brand-orange" /> Delivery address
              </p>
              <LocationPicker
                label="Address"
                placeholder="Search nearby places, streets, or districts"
                address={address}
                coords={coords}
                street={street}
                buildingNumber={buildingNumber}
                requireStreetAndBuilding
                onChange={({ address: nextAddress, coords: nextCoords, street: nextStreet, buildingNumber: nextBuilding }) => {
                  setAddress(nextAddress);
                  setCoords(nextCoords);
                  setStreet(nextStreet || '');
                  setBuildingNumber(nextBuilding || '');
                }}
              />
              <p className="text-xs text-brand-grey">
                Your location confirms you are within the {FOOD_RADIUS_KM} km delivery radius
                ({fmtSAR(cart.deliveryFee)} flat delivery charge).
              </p>
            </Card>

            {/* Contact number — editable later while the order is in progress */}
            <Card className="p-5 space-y-2">
              <p className="font-black text-brand-black flex items-center gap-2">
                <Phone className="w-4 h-4 text-brand-orange" /> Contact number
              </p>
              <input
                type="tel"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                className={inputClass}
                placeholder="05XXXXXXXX"
                maxLength={40}
              />
              <p className="text-xs text-brand-grey">
                The rider calls this number at your door. You can still change it while the order
                is on its way.
              </p>
            </Card>

            <Card className="p-5">
              <p className="font-black text-brand-black mb-3">How would you like to pay?</p>
              <div className="space-y-2">
                {payMethods.map(({ id, label, hint, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setMethod(id)}
                    className={`w-full flex items-center gap-3 p-3.5 rounded-xl border-2 text-left transition-colors cursor-pointer ${
                      method === id
                        ? 'border-brand-orange bg-brand-warm'
                        : 'border-brand-border hover:border-brand-orange/40'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      method === id ? 'bg-brand-orange text-white' : 'bg-brand-surface text-brand-grey'
                    }`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-brand-dark text-sm">{label}</p>
                      <p className="text-xs text-brand-grey">{hint}</p>
                    </div>
                    <span className={`w-4 h-4 rounded-full border-2 shrink-0 ${
                      method === id ? 'border-brand-orange bg-brand-orange' : 'border-brand-border'
                    }`} />
                  </button>
                ))}
              </div>
            </Card>

            <Card className="p-5">
              <p className="font-black text-brand-black mb-3">Order summary</p>
              <div className="space-y-1.5 text-sm">
                {items.map((line) => (
                  <div key={line.id} className="flex justify-between gap-3">
                    <span className="text-brand-dark truncate">
                      {line.quantity} × {line.name}
                      {line.sizeLabel ? <span className="text-brand-grey"> ({line.sizeLabel})</span> : null}
                    </span>
                    <span className="tabular-nums font-medium shrink-0">{fmtSAR(line.lineTotal)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-3 border-t border-brand-border space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-brand-grey">Subtotal</span><span className="font-bold tabular-nums">{fmtSAR(cart.subtotal)}</span></div>
                <div className="flex justify-between"><span className="text-brand-grey">Delivery charge</span><span className="font-bold tabular-nums">{fmtSAR(cart.deliveryFee)}</span></div>
                <div className="flex justify-between"><span className="text-brand-grey">{vatLabel(cart.vatRate)}</span><span className="font-bold tabular-nums">{fmtSAR(cart.vatAmount)}</span></div>
                <div className="flex justify-between pt-1.5 border-t border-brand-border">
                  <span className="font-bold text-brand-dark">Total</span>
                  <span className="font-black text-brand-orange tabular-nums">{fmtSAR(cart.total)}</span>
                </div>
              </div>
            </Card>

            <button
              type="button"
              onClick={placeOrder}
              disabled={busy || !cart.meetsMinimum}
              className={btnPrimary + ' w-full !py-4'}
            >
              {busy ? (
                <Spinner className="!border-white/40 !border-t-white" />
              ) : (
                <>Place order & continue to payment <ArrowRight className="w-4 h-4" /></>
              )}
            </button>
          </>
        )}
      </div>
    </PortalShell>
  );
}
