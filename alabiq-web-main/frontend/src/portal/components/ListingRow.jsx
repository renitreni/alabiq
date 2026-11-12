// ---------------------------------------------------------------------
// One merchant on a storefront discovery page — /food and /shop share it.
//
// The two pages used to hand-roll their own card, and they had drifted: the
// shop card showed the address and the rating, the food card showed neither;
// the food card put the delivery fee on the image, the shop card put it in
// the body. One component so the next difference is a deliberate prop rather
// than an accident.
//
// Layout is a horizontal row (square logo, then the text column), which is
// what a customer scans on a phone — it fits four merchants where the old
// tall image cards fit one and a half.
//
// WHAT IS DELIBERATELY ABSENT: distance and ETA. These pages never ask for a
// delivery address, so both would be invented. A confident "25 mins" on
// every row is worse than no estimate, because it is the number the customer
// remembers when the order is late.
// ---------------------------------------------------------------------
import { Link } from 'react-router-dom';
import { Bike, Clock3, MapPin, Star } from 'lucide-react';
import { BADGE_LABELS } from '../lib/constants';
import { reopensLabel, todayHoursLabel } from '../lib/storeHours';

// A closed merchant stays on the grid — it is listed and will trade again —
// but nothing about it is actionable, and it carries its reopening time so
// "closed" is an answer rather than a dead end. Rendered without any
// navigable element at all, not merely a suppressed click, so keyboard and
// screen-reader users get the same answer the dimming gives everyone else.
function RowShell({ closed, to, onClick, children }) {
  const className = `block w-full text-left rounded-2xl border bg-white transition-all ${
    closed
      ? 'border-brand-border opacity-60 cursor-not-allowed'
      : 'border-brand-border hover:border-brand-orange/40 hover:shadow-md cursor-pointer'
  }`;

  if (closed) {
    return (
      <div aria-disabled="true" className={className}>
        {children}
      </div>
    );
  }
  if (to) {
    return (
      <Link to={to} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      {children}
    </button>
  );
}

export default function ListingRow({
  merchant,
  // "From SAR 10" — a floor, never the final fee. Null when unknown, and
  // then nothing renders: see deliveryFeeFromLabel in lib/constants.js.
  deliveryLabel,
  // Rendered when the merchant has no logo yet. A listed merchant with no
  // artwork still belongs on the grid.
  fallbackIcon: FallbackIcon,
  // Food passes a handler (it intercepts empty menus); shop passes a route.
  to,
  onClick,
  // Extra chip beside the name, e.g. food's "Menu soon".
  note,
}) {
  const closed = merchant.isOpen === false;
  const reopens = reopensLabel(merchant);
  const hours = todayHoursLabel(merchant);
  const badge = BADGE_LABELS[merchant.badge] || null;

  return (
    <RowShell closed={closed} to={to} onClick={onClick}>
      <div className="flex gap-3 p-3">
        <div className="relative w-20 h-20 sm:w-24 sm:h-24 shrink-0 rounded-xl overflow-hidden bg-gradient-to-br from-brand-orange/15 to-brand-red/10 flex items-center justify-center">
          {merchant.logo_url ? (
            <img
              src={merchant.logo_url}
              alt=""
              loading="lazy"
              className={`w-full h-full object-cover ${closed ? 'grayscale' : ''}`}
            />
          ) : (
            FallbackIcon && <FallbackIcon className="w-7 h-7 text-brand-orange/50" strokeWidth={1.6} />
          )}
          {closed && (
            <span className="absolute inset-0 flex items-center justify-center bg-black/45">
              <span className="px-2 py-0.5 rounded-full bg-white text-brand-dark text-[10px] font-black">
                Closed
              </span>
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1 py-0.5">
          <div className="flex items-start gap-2">
            <p className="font-black text-brand-black leading-tight truncate flex-1">
              {merchant.name}
            </p>
            {badge && !closed && (
              <span className="shrink-0 rounded-full bg-brand-orange/10 text-brand-orange px-2 py-0.5 text-[10px] font-black uppercase tracking-wider">
                {badge}
              </span>
            )}
          </div>

          {/* No rating until real customers have left one — never a
              placeholder. The category stands alone when there is none. */}
          <div className="flex items-center gap-1.5 mt-1 text-xs text-brand-grey min-w-0">
            {merchant.rating != null && (
              <span className="inline-flex items-center gap-1 font-bold text-brand-dark shrink-0">
                <Star className="w-3.5 h-3.5 text-brand-orange fill-brand-orange" strokeWidth={0} />
                {merchant.rating.toFixed(1)}
                {merchant.reviewCount > 0 && (
                  <span className="font-medium text-brand-grey">({merchant.reviewCount})</span>
                )}
              </span>
            )}
            {merchant.rating != null && merchant.cuisine_type && <span>·</span>}
            {merchant.cuisine_type && <span className="truncate">{merchant.cuisine_type}</span>}
          </div>

          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-1.5 text-xs text-brand-grey">
            {deliveryLabel && (
              <span className="inline-flex items-center gap-1">
                <Bike className="w-3.5 h-3.5 text-brand-orange" />
                {deliveryLabel}
              </span>
            )}
            {/* The merchant's own hours, not a guessed ETA. Absent entirely
                when the response carries no schedule — better a missing pill
                than an invented one. */}
            {(closed ? reopens : hours) && (
              <span className="inline-flex items-center gap-1">
                <Clock3 className="w-3.5 h-3.5 text-brand-orange" />
                {closed ? reopens : hours}
              </span>
            )}
            {note}
          </div>

          {merchant.address && (
            <p className="text-xs text-brand-grey mt-1.5 inline-flex items-center gap-1 min-w-0 max-w-full">
              <MapPin className="w-3 h-3 shrink-0 text-brand-orange" />
              <span className="truncate">{merchant.address}</span>
            </p>
          )}
        </div>
      </div>
    </RowShell>
  );
}

export function ListingRowSkeleton() {
  return (
    <div className="rounded-2xl border border-brand-border bg-white p-3 animate-pulse">
      <div className="flex gap-3">
        <div className="w-20 h-20 sm:w-24 sm:h-24 shrink-0 rounded-xl bg-brand-surface" />
        <div className="flex-1 space-y-2 py-1">
          <div className="h-4 bg-brand-surface rounded w-2/3" />
          <div className="h-3 bg-brand-surface rounded w-1/3" />
          <div className="h-3 bg-brand-surface rounded w-1/2" />
        </div>
      </div>
    </div>
  );
}
