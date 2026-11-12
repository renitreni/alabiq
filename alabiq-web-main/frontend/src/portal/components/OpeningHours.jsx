// ---------------------------------------------------------------------
// The "when can I order from here" block on a store or restaurant profile.
// Shared by portal/shop/StorePage and portal/food/RestaurantPage, which
// differ only in the noun.
//
// The closed banner never invents a reopening time: reopensLabel returns a
// plain "Closed right now" when the merchant has switched ordering off by
// hand, because the schedule is not what closed them.
// ---------------------------------------------------------------------
import { Clock } from 'lucide-react';
import { Card } from './ui';
import { isAlwaysOpen, reopensLabel, weeklyHours } from '../lib/storeHours';

export function ClosedBanner({ merchant, noun }) {
  if (!merchant || merchant.isOpen !== false) return null;
  const reopens = reopensLabel(merchant);

  return (
    <Card className="p-4 mb-4 border-amber-300 bg-amber-50">
      <p className="font-bold text-brand-dark text-sm">This {noun} is closed right now</p>
      <p className="text-xs text-brand-grey mt-0.5">
        You can browse, but ordering reopens when the {noun} does.
      </p>
      {merchant.opensNext && (
        <p className="text-xs font-bold text-brand-dark mt-2">{reopens}</p>
      )}
    </Card>
  );
}

export default function OpeningHoursCard({ merchant }) {
  // A response that predates the hours fields gets no panel at all, rather
  // than a panel confidently claiming 24/7.
  if (!merchant || !Array.isArray(merchant.hours)) return null;

  return (
    <Card className="p-4 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <Clock className="w-4 h-4 text-brand-grey" />
        <p className="font-bold text-brand-dark text-sm">Opening hours</p>
      </div>

      {isAlwaysOpen(merchant) ? (
        <p className="text-sm text-brand-grey">Open 24/7.</p>
      ) : (
        <ul className="space-y-1">
          {weeklyHours(merchant).map((day) => (
            <li
              key={day.id}
              className={`flex items-center justify-between gap-4 text-sm ${
                day.isToday ? 'font-bold text-brand-dark' : 'text-brand-grey'
              }`}
            >
              <span>
                {day.label}
                {day.isToday && <span className="text-brand-orange ml-1.5 text-xs">Today</span>}
              </span>
              <span>{day.text}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
