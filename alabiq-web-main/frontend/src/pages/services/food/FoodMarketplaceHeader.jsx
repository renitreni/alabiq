import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ChevronDown,
  ClipboardList,
  MapPin,
  Search,
  ShoppingCart,
} from 'lucide-react';
import { useAuth } from '../../../portal/lib/AuthProvider';
import { UserMenu } from '../../../portal/components/ui';

const SERVICE_TABS = [
  { id: 'home', label: 'Home', to: '/' },
  { id: 'restaurants', label: 'Restaurants', tab: 'restaurants' },
  { id: 'groceries', label: 'Groceries', tab: 'groceries' },
  { id: 'shops', label: 'Shops', tab: 'shops' },
  { id: 'deals', label: 'Deals', tab: 'deals' },
  { id: 'trending', label: 'New & Trending', tab: 'trending' },
];

function TabIcon({ id, active }) {
  const stroke = active ? '#E62B25' : '#6B7280';
  const fill = active ? '#E62B25' : 'none';
  if (id === 'home') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 11.5 12 5l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-8.5Z" stroke={stroke} strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    );
  }
  if (id === 'restaurants') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 10h16v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9Z" stroke={stroke} strokeWidth="1.8" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke={stroke} strokeWidth="1.8" />
        <path d="M12 14v3" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (id === 'groceries') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M6 7h12l-1 13H7L6 7Z" stroke={stroke} strokeWidth="1.8" />
        <path d="M9 7V6a3 3 0 0 1 6 0v1" stroke={stroke} strokeWidth="1.8" />
      </svg>
    );
  }
  if (id === 'shops') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 9h16l-1.2 11H5.2L4 9Z" stroke={stroke} strokeWidth="1.8" />
        <path d="M8 9V7a4 4 0 0 1 8 0v2" stroke={stroke} strokeWidth="1.8" />
      </svg>
    );
  }
  if (id === 'deals') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 3 4 7v6c0 5 3.6 7.7 8 9 4.4-1.3 8-4 8-9V7l-8-4Z" stroke={stroke} strokeWidth="1.8" />
        <path d="M9 12h6M12 9v6" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3.5 13.6 9h5.6l-4.5 3.4 1.7 5.6L12 14.8 7.6 18l1.7-5.6L4.8 9h5.6L12 3.5Z"
        stroke={stroke}
        fill={fill}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function FoodMarketplaceHeader({
  search,
  onSearchChange,
  onSearchSubmit,
  locationLabel,
  activeTab,
  onTabChange,
}) {
  const { session, user } = useAuth();
  const navigate = useNavigate();
  const [locOpen, setLocOpen] = useState(false);
  const locRef = useRef(null);

  useEffect(() => {
    if (!locOpen) return undefined;
    const close = (e) => {
      if (locRef.current && !locRef.current.contains(e.target)) setLocOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [locOpen]);

  const ordersTo = session ? '/food/orders' : `/login?next=${encodeURIComponent('/food/orders')}`;
  const cartTo = session ? '/food' : `/login?next=${encodeURIComponent('/food')}`;

  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-brand-border">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-wrap lg:flex-nowrap items-center gap-3 lg:gap-5 py-3">
          <Link to="/" className="flex items-center gap-2.5 shrink-0" aria-label="Back to Alabiq home" title="Back to homepage">
            <img
              src="/mappia-icon-transparent.png"
              alt=""
              aria-hidden="true"
              className="w-10 h-10 object-contain"
            />
            <span className="leading-tight">
              <span className="block text-[15px] font-black tracking-tight text-brand-black">
                Alabiq
              </span>
              <span className="hidden sm:block text-[10px] font-semibold text-brand-grey tracking-wide">
                Food. Groceries. Delivered.
              </span>
            </span>
          </Link>

          <div className="relative shrink-0" ref={locRef}>
            <button
              type="button"
              onClick={() => setLocOpen((o) => !o)}
              className="flex items-center gap-2 max-w-[220px] sm:max-w-[260px] bg-brand-muted hover:bg-brand-surface rounded-full pl-3 pr-2.5 py-2 cursor-pointer transition-colors"
            >
              <MapPin className="w-4 h-4 text-brand-orange shrink-0" strokeWidth={2.4} />
              <span className="min-w-0 text-left">
                <span className="block text-[10px] font-bold text-brand-grey leading-none">Deliver to</span>
                <span className="block text-xs font-bold text-brand-black truncate">{locationLabel}</span>
              </span>
              <ChevronDown className={`w-3.5 h-3.5 text-brand-grey shrink-0 transition-transform ${locOpen ? 'rotate-180' : ''}`} />
            </button>
            {locOpen && (
              <div className="absolute left-0 top-full mt-2 w-72 bg-white border border-brand-border rounded-2xl shadow-xl p-4 z-50">
                <p className="text-sm font-black text-brand-black">Delivery area</p>
                <p className="text-xs text-brand-grey mt-1 leading-relaxed">
                  Partner restaurants currently serve Riyadh. A saved address is used at checkout.
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
              </div>
            )}
          </div>

          <form
            onSubmit={onSearchSubmit}
            className="order-last lg:order-none w-full lg:flex-1"
          >
            <label className="relative block">
              <span className="sr-only">Search restaurants, dishes, groceries and more</span>
              <input
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search restaurants, dishes, groceries and more..."
                className="w-full h-11 rounded-full bg-brand-muted border border-transparent focus:border-brand-orange/40 focus:bg-white focus:ring-2 focus:ring-brand-orange/15 outline-none pl-4 pr-12 text-sm text-brand-dark placeholder:text-brand-grey/80"
              />
              <Search className="w-4 h-4 text-brand-grey absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
            </label>
          </form>

          <div className="ml-auto lg:ml-0 flex items-center gap-1 sm:gap-2 shrink-0">
            <Link
              to={ordersTo}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-bold text-brand-dark hover:bg-brand-muted transition-colors"
            >
              <ClipboardList className="w-4 h-4 text-brand-grey" />
              Orders
            </Link>
            <Link
              to={cartTo}
              className="relative inline-flex items-center justify-center w-10 h-10 rounded-full bg-brand-orange text-white shadow-md shadow-brand-orange/25 hover:bg-brand-orange/90 transition-colors"
              aria-label="Cart"
              title="Browse restaurants to add items"
            >
              <ShoppingCart className="w-4 h-4" />
            </Link>
            {user ? (
              <UserMenu />
            ) : (
              <Link
                to="/login"
                className="text-sm font-bold px-3 py-2 rounded-full text-brand-dark hover:text-brand-orange transition-colors"
              >
                Log in
              </Link>
            )}
          </div>
        </div>

        <nav className="flex items-center gap-1 overflow-x-auto no-scrollbar -mx-1 px-1" aria-label="Services">
          {SERVICE_TABS.map((tab) => {
            const active = tab.id === activeTab;
            const className = `relative shrink-0 inline-flex items-center gap-2 px-3 sm:px-4 py-3 text-[13px] font-bold transition-colors ${
              active ? 'text-brand-black' : 'text-brand-grey hover:text-brand-dark'
            }`;
            const body = (
              <>
                <TabIcon id={tab.id} active={active} />
                {tab.label}
                {active && (
                  <span className="absolute left-3 right-3 -bottom-px h-[3px] rounded-full bg-brand-orange" />
                )}
              </>
            );
            if (tab.to && !tab.tab) {
              return (
                <Link key={tab.id} to={tab.to} className={className}>
                  {body}
                </Link>
              );
            }
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onTabChange(tab.tab || tab.id)}
                className={`${className} cursor-pointer`}
              >
                {body}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
