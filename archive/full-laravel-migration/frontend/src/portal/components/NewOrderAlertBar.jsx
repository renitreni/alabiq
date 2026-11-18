// ---------------------------------------------------------------------
// "N new orders waiting" — the acknowledge affordance for the repeating
// new-order alert.
//
// Mounted in the always-rendered merchant shells and STICKY, because the
// point is to be readable on whatever screen the merchant is actually on.
// Without the sticky it scrolled away, and a merchant part-way down a
// product list heard a chime every six seconds with nothing on screen to
// explain it.
//
// SILENCE AND "VIEW ORDERS" ARE SEPARATE BUTTONS ON PURPOSE. They used to
// be one. Switching tab unmounts the shop dashboard's tab components, which
// hold their own form state (ProductsTab's draft product, InventoryTab's
// quantity drafts), so the only button that stopped the noise also threw
// away unsaved work with no warning. Silencing must never navigate.
//
// Silencing is also not the only route out — accepting an order, or an
// admin accepting it on the merchant's behalf, clears it too (see the
// reconciliation effects in MerchantOrders / ShopMerchantOrders). A
// merchant who just does the work should never have to dismiss a banner.
// ---------------------------------------------------------------------
import { useEffect, useState } from 'react';
import { BellRing, VolumeX } from 'lucide-react';
import {
  subscribeUrgentAlerts,
  acknowledgeAllUrgentAlerts,
  getSoundPrefs,
  setSoundPrefs,
  subscribeSoundPrefs,
} from '../lib/alertSound';

// Enough to recognise the order, short enough to keep the buttons on screen.
const SHOWN_CODES = 3;

export default function NewOrderAlertBar({ onOpenOrders }) {
  const [pending, setPending] = useState([]);
  const [muted, setMuted] = useState(() => getSoundPrefs().muted);

  useEffect(() => subscribeUrgentAlerts(setPending), []);
  useEffect(() => subscribeSoundPrefs((p) => setMuted(p.muted)), []);

  // A merchant must not be able to mute and then report missed orders as a
  // platform failure, so the warning stands even with nothing pending — and
  // it carries its own fix rather than sending them hunting for the header.
  if (!pending.length) {
    if (!muted) return null;
    return (
      <div
        role="status"
        aria-live="polite"
        className="sticky top-[116px] lg:top-[72px] z-20 flex flex-wrap items-center gap-2 p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-sm font-bold shadow-sm"
      >
        <VolumeX className="w-4 h-4 shrink-0" />
        Sound is off. You will not hear new orders.
        <button
          type="button"
          onClick={() => setSoundPrefs({ muted: false })}
          className="ml-auto px-3 py-1.5 rounded-lg bg-amber-900 text-white text-xs font-bold cursor-pointer hover:bg-amber-800 transition-colors"
        >
          Turn sound on
        </button>
      </div>
    );
  }

  const shown = pending.slice(0, SHOWN_CODES).join(', ');
  const extra = pending.length - SHOWN_CODES;

  return (
    <div
      // assertive, not polite: this is the one event where a delayed
      // announcement costs the merchant an order. It is also the only
      // non-audio channel a deaf merchant has.
      role="status"
      aria-live="assertive"
      aria-atomic="true"
      // brand-orange-deep, not brand-orange: this bar is the only non-audio
      // channel a deaf merchant has, so white-on-orange at 2.54:1 was a
      // functional failure, not a style opinion.
      className="sticky top-[116px] lg:top-[72px] z-20 flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-xl bg-brand-orange-deep text-white shadow-lg shadow-brand-orange/25"
    >
      <BellRing className="w-6 h-6 shrink-0 animate-pulse" />
      <div className="flex-1 min-w-0">
        <p className="font-black">
          {pending.length === 1 ? '1 new order waiting' : `${pending.length} new orders waiting`}
        </p>
        <p className="text-xs text-white truncate">
          {shown}
          {extra > 0 ? ` +${extra} more` : ''}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={acknowledgeAllUrgentAlerts}
          className="px-4 py-3 rounded-xl border border-white/50 text-white font-bold text-sm cursor-pointer hover:bg-white/10 transition-colors"
        >
          Silence
        </button>
        <button
          type="button"
          onClick={() => {
            acknowledgeAllUrgentAlerts();
            onOpenOrders?.();
          }}
          className="px-5 py-3 rounded-xl bg-white text-brand-orange-deep font-bold text-sm cursor-pointer hover:bg-white/90 transition-colors"
        >
          View orders
        </button>
      </div>
    </div>
  );
}
