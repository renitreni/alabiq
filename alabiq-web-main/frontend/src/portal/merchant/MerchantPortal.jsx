// ---------------------------------------------------------------------
// /merchant — picks the right dashboard for this owner's vertical.
//
// merchants.owner_id is UNIQUE (migration 0009), so an owner maps to
// exactly one merchant and the choice is never ambiguous. The vertical
// comes from the SERVER (GET /api/merchant/me) rather than from
// anything the client could influence.
//
// Both dashboards are heavy, so each is lazy-loaded: a restaurant owner
// never downloads the store bundle and vice versa.
//
// Admins see a vertical selector to switch between Food and Shop portals.
// ---------------------------------------------------------------------
import { Suspense, lazy, useEffect, useState, useRef } from 'react';
import { ChevronDown, UtensilsCrossed, ShoppingBag, Building2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../lib/AuthProvider';
import { api } from '../lib/api';
import { PortalShell, Card, Spinner, btnPrimary } from '../components/ui';

const MerchantDashboard = lazy(() => import('./MerchantDashboard'));
const ShopMerchantDashboard = lazy(() => import('./ShopMerchantDashboard'));

function FullScreenSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#eef1f6]">
      <Spinner className="!w-8 !h-8" />
    </div>
  );
}

const VERTICAL_OPTIONS = [
  { value: 'food', label: 'Food Delivery', icon: UtensilsCrossed, description: 'Restaurant dashboard — menu, orders, kitchen' },
  { value: 'shop', label: 'Shop / Ecommerce', icon: ShoppingBag, description: 'Store dashboard — products, inventory, orders' },
];

function VerticalSelector({ selectedVertical, onChange, merchantName, isLoading }) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentOption = VERTICAL_OPTIONS.find((o) => o.value === selectedVertical) || VERTICAL_OPTIONS[0];

  return (
    <div ref={dropdownRef} className="relative">
      <button
        type="button"
        onClick={() => !isLoading && setOpen(!open)}
        disabled={isLoading}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-black/5 hover:border-brand-orange/40 text-left transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <currentOption.icon className="w-5 h-5 text-brand-orange" />
        <span className="flex-1 text-sm font-semibold text-brand-black truncate">{currentOption.label}</span>
        <ChevronDown className={`w-4 h-4 text-brand-grey transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <AnimatePresence>
          <motion.ul
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="absolute top-full left-0 right-0 mt-1 z-50 bg-white border border-black/5 rounded-xl shadow-lg overflow-hidden"
            role="listbox"
          >
            {VERTICAL_OPTIONS.map((option) => (
              <li key={option.value} role="option" aria-selected={option.value === selectedVertical}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  disabled={isLoading}
                  className={`w-full flex items-center gap-3 px-3 py-3 text-left transition-colors ${
                    option.value === selectedVertical
                      ? 'bg-brand-orange/5 text-brand-orange'
                      : 'text-brand-black hover:bg-brand-grey/5'
                  }`}
                >
                  <option.icon className={`w-5 h-5 ${option.value === selectedVertical ? 'text-brand-orange' : 'text-brand-grey'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{option.label}</p>
                    <p className="text-xs text-brand-grey truncate">{option.description}</p>
                  </div>
                  {option.value === selectedVertical && (
                    <Building2 className="w-4 h-4 text-brand-orange" />
                  )}
                </button>
              </li>
            ))}
          </motion.ul>
        </AnimatePresence>
      )}
    </div>
  );
}

export default function MerchantPortal() {
  const { role } = useAuth();
  const isAdmin = role === 'admin';

  const [vertical, setVertical] = useState(null);
  const [merchant, setMerchant] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showSelector, setShowSelector] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .merchantMe()
      .then((d) => {
        if (cancelled) return;
        const m = d?.merchant;
        if (m) {
          setMerchant(m);
          setVertical(m.vertical || 'food');
          if (isAdmin) {
            setShowSelector(true);
          }
        } else if (isAdmin) {
          setVertical('food');
          setShowSelector(true);
        } else {
          setError('No business profile is linked to this account');
        }
      })
      .catch((err) => {
        if (!cancelled) {
          if (isAdmin && (err.message?.includes('403') || err.message?.includes('404') || err.message?.includes('linked'))) {
            setVertical('food');
            setShowSelector(true);
          } else {
            setError(err.message);
          }
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  if (loading) return <FullScreenSpinner />;

  if (error) {
    return (
      <PortalShell title="Business portal">
        <Card className="p-8 text-center">
          <p className="font-bold text-brand-black">{error}</p>
          <p className="text-sm text-brand-grey mt-1">
            If you have just been given access, sign out and back in.
          </p>
          <button onClick={() => window.location.reload()} className={btnPrimary + ' mt-4'}>
            Try again
          </button>
        </Card>
      </PortalShell>
    );
  }

  if (!vertical) return <FullScreenSpinner />;

  return (
    <PortalShell title="Business portal">
      {isAdmin && showSelector && (
        <div className="mb-4">
          <label className="block text-sm font-medium text-brand-grey mb-2">
            Merchant Portal Vertical
            {merchant && <span className="ml-2 text-sm font-normal text-brand-black">— {merchant.name}</span>}
          </label>
          <VerticalSelector
            selectedVertical={vertical}
            onChange={setVertical}
            merchantName={merchant?.name}
            isLoading={loading}
          />
        </div>
      )}

      <Suspense fallback={<FullScreenSpinner />}>
        {vertical === 'shop' ? <ShopMerchantDashboard /> : <MerchantDashboard />}
      </Suspense>
    </PortalShell>
  );
}
