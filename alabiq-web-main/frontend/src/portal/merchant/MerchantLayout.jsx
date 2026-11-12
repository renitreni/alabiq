// ---------------------------------------------------------------------
// Business owner shell — same sidebar pattern as AdminLayout.
// ---------------------------------------------------------------------
import { Link } from 'react-router-dom';
import {
  LayoutDashboard,
  ClipboardList,
  UtensilsCrossed,
  LayoutList,
  Store,
  Package,
  Boxes,
  LogOut,
  Menu,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../lib/AuthProvider';
import NotificationBell from '../components/NotificationBell';
import SoundToggle from '../components/SoundToggle';

export const MERCHANT_NAV = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'orders', label: 'Orders', icon: ClipboardList },
  { id: 'menu', label: 'Menu', icon: UtensilsCrossed },
  { id: 'categories', label: 'Categories', icon: LayoutList },
  { id: 'business', label: 'Business', icon: Store },
];

// The store (ecommerce) nav. Same shell, different tabs: a store manages
// products rather than a menu, and gets an Inventory tab because it tracks
// stock counts — something the food vertical has no concept of.
export const SHOP_NAV = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'orders', label: 'Orders', icon: ClipboardList },
  { id: 'products', label: 'Products', icon: Package },
  { id: 'categories', label: 'Categories', icon: LayoutList },
  { id: 'inventory', label: 'Inventory', icon: Boxes },
  { id: 'business', label: 'Business', icon: Store },
];

const PAGE_COPY = {
  overview: {
    title: 'Overview',
    subtitle: 'Analytics and restaurant performance at a glance.',
  },
  orders: {
    title: 'Orders',
    subtitle: 'Incoming orders, live — accept, cook, and hand off to your rider.',
  },
  menu: {
    title: 'Menu',
    subtitle: 'Add, edit, and manage your menu items and prices.',
  },
  categories: {
    title: 'Categories',
    subtitle: 'Organize your menu into sections for customers.',
  },
  business: {
    title: 'Business profile',
    subtitle: 'Update your restaurant details and location.',
  },
};

// Store wording. Only the entries that differ from PAGE_COPY are listed;
// the rest fall through, so the two verticals cannot drift on shared tabs.
const SHOP_PAGE_COPY = {
  overview: {
    title: 'Overview',
    subtitle: 'Analytics and store performance at a glance.',
  },
  orders: {
    title: 'Orders',
    subtitle: 'Incoming orders, live — accept, pack, and hand off to your rider.',
  },
  products: {
    title: 'Products',
    subtitle: 'Add, edit, and manage your products, options and prices.',
  },
  categories: {
    title: 'Categories',
    subtitle: 'Organize your products into sections for customers.',
  },
  inventory: {
    title: 'Inventory',
    subtitle: 'Stock levels, low-stock warnings, and restocking.',
  },
  business: {
    title: 'Business profile',
    subtitle: 'Update your store details and location.',
  },
};

// Hoisted OUT of MerchantLayout on purpose. Declared inside the component
// body it was a new component type on every render, so React unmounted and
// remounted all six nav buttons whenever the dashboard re-rendered -- which
// now happens on every order broadcast -- dropping keyboard focus to <body>.
// AdminLayout already declares its equivalent at module scope.
function NavButton({ id, label, icon: Icon, compact = false, isActive, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      className={`w-full flex items-center gap-3 rounded-xl text-left transition-all cursor-pointer ${
        compact ? 'px-3 py-2.5' : 'px-3 py-3'
      } ${
        isActive
          ? 'bg-white/10 text-white shadow-inner shadow-black/10'
          : 'text-white/55 hover:text-white hover:bg-white/5'
      }`}
    >
      <span
        className={`flex items-center justify-center w-9 h-9 rounded-lg shrink-0 ${
          isActive ? 'bg-brand-orange text-white' : 'bg-white/5 text-white/70'
        }`}
      >
        <Icon className="w-[18px] h-[18px]" />
      </span>
      <span className="text-sm font-semibold tracking-tight">{label}</span>
      {isActive && !compact && (
        <span className="ml-auto w-1.5 h-1.5 rounded-full bg-brand-orange shrink-0" />
      )}
    </button>
  );
}

export default function MerchantLayout({ activeTab, onTabChange, children, vertical = 'food' }) {
  const { user, signOut } = useAuth();
  const [mobileNav, setMobileNav] = useState(false);
  const isShop = vertical === 'shop';
  const navItems = isShop ? SHOP_NAV : MERCHANT_NAV;
  const pageCopy = isShop ? { ...PAGE_COPY, ...SHOP_PAGE_COPY } : PAGE_COPY;
  const copy = pageCopy[activeTab] || pageCopy.overview;
  const initial = (user?.email || 'B')[0].toUpperCase();

  function selectTab(id) {
    onTabChange(id);
    setMobileNav(false);
  }


  return (
    <div className="min-h-screen flex bg-[#0c1018]">
      <aside className="hidden lg:flex w-[260px] shrink-0 flex-col border-r border-white/5">
        <div className="h-[72px] px-5 flex items-center gap-3">
          <Link to="/" className="flex items-center gap-3 min-w-0 group">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0 group-hover:bg-white/15 transition-colors">
              <img src="/mappia-new-logo.png" alt="" className="w-7 h-7 object-contain" />
            </div>
            <div className="min-w-0">
              <div className="font-black text-white text-sm tracking-tight leading-none">
                Smart <span className="text-brand-orange">Mappia</span>
              </div>
              <div className="text-[10px] font-semibold text-white/40 uppercase tracking-[0.14em] mt-1">
                {isShop ? 'Store portal' : 'Restaurant portal'}
              </div>
            </div>
          </Link>
        </div>

        <div className="px-4 mb-2">
          <p className="px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-white/30 mb-2">
            Navigation
          </p>
          <nav className="space-y-1">
            {navItems.map(({ id, label, icon }) => (
              <NavButton key={id} id={id} label={label} icon={icon} isActive={activeTab === id} onSelect={selectTab} />
            ))}
          </nav>
        </div>

        <div className="mt-auto p-4 flex-shrink-0">
          <div className="rounded-2xl bg-white/[0.08] border border-white/10 p-3 min-h-[80px]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-orange to-brand-red text-white flex items-center justify-center font-black text-sm shrink-0">
                {initial}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-white truncate">{user?.email}</div>
                <div className="text-[10px] text-white/45 font-medium mt-0.5">Business owner</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => signOut()}
              className="mt-3 w-full flex items-center justify-center gap-2 text-xs font-semibold text-white/60 hover:text-white py-2 rounded-lg hover:bg-white/5 cursor-pointer transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign out
            </button>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 admin-shell-bg">
        <header className="sticky top-0 z-30 bg-[#eef1f6]/80 backdrop-blur-xl border-b border-black/5">
          <div className="h-[72px] px-4 md:px-8 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setMobileNav(true)}
                className="lg:hidden p-2.5 rounded-xl bg-white shadow-sm border border-black/5 cursor-pointer"
                aria-label="Open menu"
              >
                <Menu className="w-5 h-5 text-brand-dark" />
              </button>
              <div className="min-w-0">
                <h1 className="text-xl md:text-2xl font-black text-brand-black tracking-tight truncate">
                  {copy.title}
                </h1>
                <p className="text-sm text-brand-grey truncate hidden sm:block">{copy.subtitle}</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <SoundToggle />
              <div className="rounded-xl bg-white border border-black/5 shadow-sm">
                <NotificationBell />
              </div>
            </div>
          </div>

          <div className="lg:hidden flex gap-2 px-4 pb-3 overflow-x-auto">
            {navItems.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => selectTab(id)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap cursor-pointer transition-all ${
                  activeTab === id
                    ? 'bg-brand-black text-white shadow-md'
                    : 'bg-white text-brand-grey border border-black/5'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>
        </header>

        <main className="flex-1 px-4 md:px-8 py-6 md:py-8 w-full">
          {children}
        </main>
      </div>

      {mobileNav && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/50 cursor-pointer backdrop-blur-sm"
            aria-label="Close menu"
            onClick={() => setMobileNav(false)}
          />
          <div className="absolute left-0 top-0 bottom-0 w-[280px] bg-[#0c1018] shadow-2xl flex flex-col">
            <div className="h-[72px] px-4 flex items-center justify-between border-b border-white/5">
              <span className="font-black text-white text-sm">Alabiq</span>
              <button
                type="button"
                onClick={() => setMobileNav(false)}
                className="p-2 rounded-lg hover:bg-white/5 cursor-pointer text-white/70"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-1">
              {navItems.map(({ id, label, icon }) => (
                <NavButton key={id} id={id} label={label} icon={icon} compact isActive={activeTab === id} onSelect={selectTab} />
              ))}
            </nav>
            <div className="p-4 border-t border-white/5">
              <button
                type="button"
                onClick={() => signOut()}
                className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-white/60 py-2.5 rounded-xl border border-white/10 cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
