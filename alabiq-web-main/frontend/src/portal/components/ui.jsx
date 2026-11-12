// ---------------------------------------------------------------------
// Small shared UI atoms for the portals.
// ---------------------------------------------------------------------
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, LogOut, UserCircle, History, ChevronDown, CreditCard } from 'lucide-react';
import { TONE_CLASSES } from '../lib/constants';
import { useAuth } from '../lib/AuthProvider';
import NotificationBell from './NotificationBell';
import SoundToggle from './SoundToggle';

function initialsOf(name, email) {
  const source = (name || email || '?').trim();
  const parts = source.split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]).join('').toUpperCase();
}

// Avatar (or initials) + name with a dropdown: My Profile / Order History /
// Payment methods / Logout. Replaces the old raw-email + logout icon.
export function UserMenu() {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  if (!user) return null;

  const displayName = profile?.fullName || user.email?.split('@')[0] || 'Account';
  const firstName = displayName.split(/\s+/)[0];
  const avatarUrl = profile?.avatarUrl || null;

  const go = (to) => { setOpen(false); navigate(to); };

  const itemClass =
    'w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-bold text-brand-dark hover:bg-brand-surface cursor-pointer text-left';

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 pl-1.5 pr-2 py-1.5 rounded-full hover:bg-brand-surface cursor-pointer transition-colors"
        title={displayName}
      >
        <span className="w-8 h-8 rounded-full overflow-hidden bg-gradient-to-br from-brand-orange to-brand-red flex items-center justify-center shrink-0">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-white text-[11px] font-black">{initialsOf(profile?.fullName, user.email)}</span>
          )}
        </span>
        <span className="text-sm font-bold text-brand-dark max-w-[110px] truncate hidden md:block">{firstName}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-brand-grey hidden md:block transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-60 bg-white border border-brand-border rounded-2xl shadow-xl overflow-hidden z-50">
          <div className="px-4 py-3 border-b border-brand-border">
            <p className="font-black text-brand-black text-sm truncate">{displayName}</p>
            <p className="text-xs text-brand-grey truncate">{user.email}</p>
          </div>
          <button type="button" onClick={() => go('/profile')} className={itemClass}>
            <UserCircle className="w-4 h-4 text-brand-orange" /> My Profile
          </button>
          <button type="button" onClick={() => go('/transactions')} className={itemClass}>
            <History className="w-4 h-4 text-brand-orange" /> Order History
          </button>
          <button type="button" onClick={() => go('/payment-methods')} className={itemClass}>
            <CreditCard className="w-4 h-4 text-brand-orange" /> Payment methods
          </button>
          <button
            type="button"
            onClick={() => { setOpen(false); signOut(); }}
            className={itemClass + ' border-t border-brand-border !text-red-600'}
          >
            <LogOut className="w-4 h-4" /> Logout
          </button>
        </div>
      )}
    </div>
  );
}

export function PortalShell({ title, subtitle, right, onBack, children, wide = false, compact = false }) {
  const { user } = useAuth();
  return (
    <div className="min-h-screen bg-brand-muted">
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-brand-border">
        <div className={`${wide ? 'max-w-7xl' : 'max-w-5xl'} mx-auto px-4 md:px-6 h-14 sm:h-16 flex items-center justify-between gap-3`}>
          <div className="flex items-center gap-1 shrink-0">
            {onBack && (
              <button
                onClick={onBack}
                title="Back"
                className="p-2 -ml-1 rounded-lg hover:bg-brand-surface cursor-pointer text-brand-dark"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <Link to="/" className="flex items-center gap-2">
              <img src="/mappia-new-logo.png" alt="Alabiq" className="w-9 h-9 object-contain" />
              <span className="font-black tracking-tight text-brand-black hidden sm:block">
                Smart <span className="text-brand-orange">Mappia</span>
              </span>
            </Link>
          </div>
          <div className="text-center leading-tight min-w-0">
            <div className="font-black text-brand-black truncate">{title}</div>
            {subtitle && <div className="text-xs text-brand-grey truncate">{subtitle}</div>}
          </div>
          <div className="shrink-0 flex items-center gap-1">
            {right}
            {user && (
              <>
                <SoundToggle />
                <NotificationBell />
                <UserMenu />
              </>
            )}
          </div>
        </div>
      </header>
      <main className={`${wide ? 'max-w-7xl' : 'max-w-5xl'} mx-auto px-3 sm:px-4 md:px-6 ${compact ? 'py-3 md:py-6' : 'py-4 md:py-6'}`}>{children}</main>
    </div>
  );
}

export function Badge({ tone = 'grey', children, className = '' }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
        TONE_CLASSES[tone] || TONE_CLASSES.grey
      } ${className}`}
    >
      {children}
    </span>
  );
}

export function Spinner({ className = '' }) {
  return (
    <span
      className={`inline-block w-5 h-5 border-2 border-brand-orange/30 border-t-brand-orange rounded-full animate-spin ${className}`}
    />
  );
}

export function Card({ children, className = '' }) {
  return (
    <div className={`bg-white border border-brand-border rounded-2xl shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function Field({ label, children, error }) {
  return (
    <label className="block">
      <span className="text-xs font-bold text-brand-grey uppercase tracking-wider block mb-1.5">
        {label}
      </span>
      {children}
      {error && (
        <span className="block mt-1.5 text-sm font-semibold text-red-600" role="alert">
          {error}
        </span>
      )}
    </label>
  );
}

export const inputClass =
  'w-full bg-white border border-brand-border rounded-xl px-4 py-3 text-brand-dark text-sm ' +
  'focus:outline-none focus:border-brand-orange focus:ring-2 focus:ring-brand-dark/30 transition-colors';

// Styled <input type="file"> — orange "choose file" button + standard input look.
export const fileInputClass =
  inputClass +
  ' cursor-pointer file:mr-3 file:rounded-lg file:border-0 file:bg-brand-orange ' +
  'file:text-white file:px-3 file:py-1.5 file:font-bold';

export const btnPrimary =
  'inline-flex items-center justify-center gap-2 bg-brand-orange hover:bg-brand-orange/90 ' +
  'text-white font-black py-3 px-5 rounded-xl transition-all shadow-lg shadow-brand-orange/20 ' +
  'disabled:opacity-50 disabled:cursor-not-allowed text-sm cursor-pointer';

export const btnGhost =
  'inline-flex items-center justify-center gap-2 bg-white hover:bg-brand-surface ' +
  'text-brand-dark font-bold py-3 px-5 rounded-xl border border-brand-border transition-all ' +
  'disabled:opacity-50 disabled:cursor-not-allowed text-sm cursor-pointer';
