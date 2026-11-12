// ---------------------------------------------------------------------
// Admin shell — icon rail on tablet, full sidebar on desktop, drawer on phone.
// ---------------------------------------------------------------------
import { Link, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  ClipboardList,
  Users,
  ChefHat,
  UtensilsCrossed,
  ShoppingBag,
  AlertTriangle,
  BarChart3,
  ShieldCheck,
  SlidersHorizontal,
  RefreshCw,
  LogOut,
  Menu,
  X,
  ExternalLink,
  ChevronDown,
  Eye,
  User,
  Car,
  ArrowLeft,
  IdCard,
} from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from '../lib/AuthProvider';
import { useViewMode } from '../lib/ViewModeProvider';
import NotificationBell from '../components/NotificationBell';
import SoundToggle from '../components/SoundToggle';

function ViewSwitchMenu({ onRefresh }) {
  const navigate = useNavigate();
  const { previewRole, setPreviewRole } = useViewMode();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function onClickAway(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClickAway);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClickAway);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function run(fn) {
    setOpen(false);
    fn();
  }

  const items = [
    { key: 'refresh', label: 'Refresh', icon: RefreshCw, action: () => onRefresh && onRefresh() },
    { key: 'user', label: 'Switch to User View', icon: User, action: () => { setPreviewRole('passenger'); navigate('/book'); } },
    { key: 'driver', label: 'Switch to Driver View', icon: Car, action: () => { setPreviewRole('driver'); navigate('/driver'); } },
  ];
  if (previewRole) {
    items.push({ key: 'back', label: 'Back to Admin View', icon: ArrowLeft, action: () => { setPreviewRole(null); navigate('/admin'); } });
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 p-2.5 sm:px-3 sm:py-2 rounded-xl bg-white border text-brand-grey hover:text-brand-dark cursor-pointer shadow-sm transition-colors ${
          open ? 'border-brand-orange/40 text-brand-dark' : 'border-black/5'
        }`}
        title="View options"
      >
        <Eye className="w-4 h-4" />
        <span className="hidden sm:inline text-xs font-bold">View</span>
        <ChevronDown className={`hidden sm:block w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="absolute right-0 top-[calc(100%+6px)] z-50 w-56"
            role="menu"
          >
            <ul className="bg-white border border-brand-border rounded-2xl shadow-xl shadow-brand-orange/10 py-1.5 overflow-hidden">
              {items.map(({ key, label, icon: Icon, action }) => (
                <li key={key} role="none">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => run(action)}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-left text-brand-dark hover:bg-brand-warm hover:text-brand-orange transition-colors cursor-pointer"
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="font-medium">{label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export const ADMIN_NAV = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'bookings', label: 'Bookings', icon: ClipboardList },
  { id: 'drivers', label: 'Drivers', icon: Users },
  { id: 'restaurant', label: 'Restaurant Orders', icon: ChefHat },
  { id: 'food', label: 'Food', icon: UtensilsCrossed },
  { id: 'shop', label: 'Shop', icon: ShoppingBag },
  { id: 'reports', label: 'Reports', icon: BarChart3 },
  { id: 'errors', label: 'Errors', icon: AlertTriangle },
  { id: 'admins', label: 'Admins', icon: ShieldCheck },
  { id: 'accounts', label: 'Accounts', icon: IdCard },
  { id: 'settings', label: 'Settings', icon: SlidersHorizontal },
];

// Every tab is visible to every admin (the backend super-admin tier was
// removed); kept as a function so AdminPage's ?tab= validation has a stable
// API to call.
export function adminNavFor() {
  return ADMIN_NAV;
}

const PAGE_COPY = {
  overview: {
    title: 'Dashboard',
    subtitle: 'Monitor bookings, payments, and drivers at a glance.',
  },
  bookings: {
    title: 'Bookings',
    subtitle: 'Review payment proofs and manage ride requests.',
  },
  drivers: {
    title: 'Drivers',
    subtitle: 'Approve new drivers and manage fleet access.',
  },
  restaurant: {
    title: 'Restaurant Orders',
    subtitle: 'Live orders per restaurant, and who has not started cooking yet.',
  },
  food: {
    title: 'Food Delivery',
    subtitle: 'Merchants, credit limits, order payments, and riders.',
  },
  shop: {
    title: 'Ecommerce',
    subtitle: 'Stores, catalogue and markup, orders, inventory and settlement.',
  },
  reports: {
    title: 'Reports',
    subtitle: 'Bookings and revenue over time — export to CSV.',
  },
  errors: {
    title: 'Errors',
    subtitle: 'Backend errors, who hit them, and when.',
  },
  admins: {
    title: 'Admins',
    subtitle: 'Who has the portal, and who has been signing in.',
  },
  accounts: {
    title: 'Accounts',
    subtitle: 'All user accounts — passengers, drivers, merchants, and admins.',
  },
  settings: {
    title: 'Settings',
    subtitle: 'Platform-wide rules that apply without a deploy.',
  },
};

function NavButton({ id, label, icon: Icon, active, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      title={label}
      className={`w-full flex items-center justify-center lg:justify-start gap-3 rounded-2xl text-left transition-all cursor-pointer px-0 py-2.5 lg:px-3 lg:py-2.5 ${
        active
          ? 'bg-white/10 text-white'
          : 'text-white/50 hover:text-white hover:bg-white/5'
      }`}
    >
      <span
        className={`flex items-center justify-center w-10 h-10 lg:w-9 lg:h-9 rounded-xl shrink-0 ${
          active ? 'bg-linear-to-br from-brand-orange to-brand-red text-white shadow-md shadow-brand-orange/30' : 'bg-white/5 text-white/70'
        }`}
      >
        <Icon className="w-[18px] h-[18px]" />
      </span>
      <span className="hidden lg:inline text-sm font-semibold tracking-tight">{label}</span>
      {active && (
        <span className="hidden lg:block ml-auto w-1.5 h-1.5 rounded-full bg-brand-orange shrink-0" />
      )}
    </button>
  );
}

function SidebarBrand({ expanded = false }) {
  return (
    <Link
      to="/"
      className={`flex items-center gap-3 min-w-0 group ${
        expanded ? 'justify-start px-0' : 'justify-center lg:justify-start px-2 lg:px-0'
      }`}
    >
      <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0 group-hover:bg-white/15 transition-colors">
        <img src="/mappia-new-logo.png" alt="" className="w-7 h-7 object-contain" />
      </div>
      <div className={`min-w-0 ${expanded ? 'block' : 'hidden lg:block'}`}>
        <div className="font-black text-white text-sm tracking-tight leading-none">
          Smart <span className="text-brand-orange">Mappia</span>
        </div>
        <div className="text-[10px] font-semibold text-white/40 uppercase tracking-[0.14em] mt-1">
          Control center
        </div>
      </div>
    </Link>
  );
}

export default function AdminLayout({ activeTab, onTabChange, onRefresh, children }) {
  const { user, signOut } = useAuth();
  const [mobileNav, setMobileNav] = useState(false);
  const copy = PAGE_COPY[activeTab] || PAGE_COPY.overview;
  const initial = (user?.email || 'A')[0].toUpperCase();

  function selectTab(id) {
    onTabChange(id);
    setMobileNav(false);
  }

  const visibleNav = adminNavFor();

  const nav = visibleNav.map(({ id, label, icon }) => (
    <NavButton
      key={id}
      id={id}
      label={label}
      icon={icon}
      active={activeTab === id}
      onSelect={selectTab}
    />
  ));

  return (
    <div className="min-h-screen flex bg-[#0c1018] overflow-x-hidden">
      <aside className="hidden md:flex w-[76px] lg:w-[260px] shrink-0 flex-col border-r border-white/5">
        <div className="h-16 lg:h-[72px] px-3 lg:px-5 flex items-center">
          <SidebarBrand />
        </div>

        <div className="px-2 lg:px-4 mb-2 flex-1 overflow-y-auto">
          <p className="hidden lg:block px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-white/30 mb-2">
            Menu
          </p>
          <nav className="space-y-1">{nav}</nav>
        </div>

        <div className="p-2 lg:p-4 flex-shrink-0">
          <div className="rounded-2xl bg-white/[0.08] border border-white/10 p-2 lg:p-3 min-h-[80px] lg:min-h-[100px]">
            <div className="flex items-center justify-center lg:justify-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-linear-to-br from-brand-orange to-brand-red text-white flex items-center justify-center font-black text-sm shrink-0">
                {initial}
              </div>
              <div className="min-w-0 flex-1 hidden lg:block">
                <div className="text-xs font-semibold text-white truncate">{user?.email}</div>
                <div className="text-[10px] text-white/45 font-medium mt-0.5">Administrator</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => signOut()}
              title="Sign out"
              className="mt-2 lg:mt-3 w-full flex items-center justify-center gap-2 text-xs font-semibold text-white/60 hover:text-white py-2 rounded-lg hover:bg-white/5 cursor-pointer transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">Sign out</span>
            </button>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 admin-shell-bg">
        <header className="sticky top-0 z-30 bg-[#eef1f6]/90 backdrop-blur-xl border-b border-black/5">
          <div className="min-h-16 lg:min-h-[72px] px-3 sm:px-5 md:px-6 lg:px-8 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setMobileNav(true)}
                className="md:hidden p-2.5 rounded-xl bg-white shadow-sm border border-black/5 cursor-pointer"
                aria-label="Open menu"
              >
                <Menu className="w-5 h-5 text-brand-dark" />
              </button>
              <div className="min-w-0">
                <h1 className="text-lg sm:text-xl md:text-2xl font-black text-brand-black tracking-tight truncate">
                  {copy.title}
                </h1>
                <p className="hidden sm:block text-xs sm:text-sm text-brand-grey truncate">
                  {copy.subtitle}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <SoundToggle />
              <div className="rounded-xl bg-white border border-black/5 shadow-sm">
                <NotificationBell />
              </div>
              <ViewSwitchMenu onRefresh={onRefresh} />
              <Link
                to="/"
                className="hidden sm:inline-flex items-center gap-1.5 text-xs font-bold text-brand-dark bg-white border border-black/5 px-3 py-2.5 rounded-xl shadow-sm hover:border-brand-orange/30 hover:text-brand-orange transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span className="hidden md:inline">View site</span>
              </Link>
            </div>
          </div>
        </header>

        <main className="flex-1 px-3 sm:px-5 md:px-6 lg:px-8 py-5 md:py-7 w-full max-w-[1400px] pb-[max(2rem,env(safe-area-inset-bottom))]">
          {children}
        </main>
      </div>

      <AnimatePresence>
        {mobileNav && (
          <div className="fixed inset-0 z-50 md:hidden">
            <motion.button
              type="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/50 cursor-pointer backdrop-blur-sm"
              aria-label="Close menu"
              onClick={() => setMobileNav(false)}
            />
            <motion.div
              initial={{ x: -20, opacity: 0.6 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -20, opacity: 0 }}
              transition={{ type: 'tween', duration: 0.2 }}
              className="absolute left-0 top-0 bottom-0 w-[min(20rem,86vw)] bg-[#0c1018] shadow-2xl flex flex-col"
            >
              <div className="h-16 px-4 flex items-center justify-between border-b border-white/5">
                <SidebarBrand expanded />
                <button
                  type="button"
                  onClick={() => setMobileNav(false)}
                  className="p-2 rounded-lg hover:bg-white/5 cursor-pointer text-white/70"
                  aria-label="Close menu"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
                {visibleNav.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => selectTab(id)}
                    className={`w-full flex items-center gap-3 rounded-2xl px-3 py-3 text-left cursor-pointer ${
                      activeTab === id
                        ? 'bg-white/10 text-white'
                        : 'text-white/55 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <span
                      className={`flex items-center justify-center w-9 h-9 rounded-xl ${
                        activeTab === id
                          ? 'bg-linear-to-br from-brand-orange to-brand-red text-white'
                          : 'bg-white/5'
                      }`}
                    >
                      <Icon className="w-[18px] h-[18px]" />
                    </span>
                    <span className="text-sm font-semibold">{label}</span>
                  </button>
                ))}
              </nav>
              <div className="p-4 border-t border-white/5">
                <div className="text-xs text-white/45 truncate mb-3">{user?.email}</div>
                <button
                  type="button"
                  onClick={() => signOut()}
                  className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-white/70 py-2.5 rounded-xl border border-white/10 cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  Sign out
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
