// ---------------------------------------------------------------------
// Presenting opening hours. The decision "is this merchant open" is the
// backend's (lib/storeHours.js, migration 0038) — it owns the platform
// timezone, and a browser in Manila must not reach a different answer from
// one in Riyadh. Everything here is formatting of what the API already sent:
//
//   isOpen, closedReason, hours[], todayWeekday, opensNext
//
// Shared by the food and shop storefronts, the marketing sections, and the
// merchant/admin hours editor, so a schedule reads the same everywhere.
// ---------------------------------------------------------------------

// weekday 0 = Sunday, matching Postgres extract(dow) and JS getDay().
export const DAYS = [
  { id: 0, label: 'Sunday', short: 'Sun' },
  { id: 1, label: 'Monday', short: 'Mon' },
  { id: 2, label: 'Tuesday', short: 'Tue' },
  { id: 3, label: 'Wednesday', short: 'Wed' },
  { id: 4, label: 'Thursday', short: 'Thu' },
  { id: 5, label: 'Friday', short: 'Fri' },
  { id: 6, label: 'Saturday', short: 'Sat' },
];

// Postgres times arrive as 'HH:MM:SS' from the merchant/admin endpoints.
// The public storefront ones are already trimmed; this is idempotent.
export const hhmm = (t) => String(t || '').slice(0, 5);

const windowText = (win) => `${hhmm(win.opens_at)} – ${hhmm(win.closes_at)}`;

// closes_at at or before opens_at means the window runs past midnight, the
// same rule backend/lib/storeHours.js decides open/closed by.
const crossesMidnight = (win) => hhmm(win.closes_at) <= hhmm(win.opens_at);

// Does this payload actually carry a schedule? An ABSENT hours array is not
// an empty one: it means a response that predates these fields, and claiming
// "Open 24/7" off the back of that would be a confident lie at exactly the
// moment we know least. Everything here returns null in that case so callers
// render nothing.
const hasSchedule = (merchant) => Array.isArray(merchant?.hours);

// No hours ROWS means always open — the backward-compatible default every
// merchant predating 0038 is still in. Say so rather than rendering a blank
// schedule that looks like a bug.
export const isAlwaysOpen = (merchant) => hasSchedule(merchant) && merchant.hours.length === 0;

export function windowsForDay(merchant, weekday) {
  return (merchant?.hours || [])
    .filter((w) => Number(w.weekday) === Number(weekday))
    .sort((a, b) => hhmm(a.opens_at).localeCompare(hhmm(b.opens_at)));
}

// The windows in force TODAY, which is not the same as the windows stored
// against today's weekday: an overnight window is stored on the day it
// STARTS, so at 00:30 the one actually keeping the shop open belongs to
// yesterday. Missing that is how a late-night restaurant reads
// "Closed today" while it is open and taking orders.
export function todayWindows(merchant) {
  const today = Number(merchant?.todayWeekday);
  if (!Number.isInteger(today)) return [];
  const yesterday = (today + 6) % 7;
  return [
    // Carry-over first: it is the one covering the current moment.
    ...windowsForDay(merchant, yesterday).filter(crossesMidnight),
    ...windowsForDay(merchant, today),
  ];
}

// The one-line "delivery hours" a discovery card shows, open or closed.
export function todayHoursLabel(merchant) {
  if (!hasSchedule(merchant)) return null;
  if (isAlwaysOpen(merchant)) return 'Open 24/7';
  const today = todayWindows(merchant);
  if (!today.length) return 'Closed today';
  return today.map(windowText).join(', ');
}

// What a CLOSED card says instead of a delivery ETA. Returns null when the
// merchant is open, so callers can branch on the value itself.
//
// A manual "closed now" override deliberately gets no reopening time: the
// schedule would say 09:00 while the owner has switched ordering off by
// hand, and that is a promise nobody has made.
export function reopensLabel(merchant) {
  if (!merchant || merchant.isOpen !== false) return null;
  const next = merchant.opensNext;
  if (!next) return 'Closed right now';
  if (next.daysAhead === 0) return `Opens today ${next.opensAt}`;
  if (next.daysAhead === 1) return `Opens tomorrow ${next.opensAt}`;
  const day = DAYS.find((d) => d.id === Number(next.weekday));
  const name = day ? day.short : '';
  // daysAhead 7 lands back on today's weekday — "Opens Sun 09:00" on a Sunday
  // reads as nine hours away when it is seven days.
  if (next.daysAhead === 7) return `Opens next ${name} ${next.opensAt}`.trim();
  return `Opens ${name} ${next.opensAt}`.trim();
}

// The full week, every day present, for a store/restaurant profile. Windows
// sit on the day they START, so an overnight one reads "20:00 – 02:00" on
// Saturday rather than being split across two rows.
// -> [{ id, label, text, isToday }]
export function weeklyHours(merchant) {
  const alwaysOpen = isAlwaysOpen(merchant);
  return DAYS.map((day) => {
    const windows = windowsForDay(merchant, day.id);
    return {
      id: day.id,
      label: day.label,
      text: alwaysOpen ? 'Open 24 hours' : windows.length ? windows.map(windowText).join(', ') : 'Closed',
      isToday: Number(merchant?.todayWeekday) === day.id,
    };
  });
}
