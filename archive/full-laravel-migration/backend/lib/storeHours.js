// ---------------------------------------------------------------------
// "Is this merchant open right now?" — the single answer, shared by the
// food and shop verticals and by both the storefront and the order guards.
//
// Two inputs (migration 0038):
//   * accepting_orders — the manual override. false always wins.
//   * merchant_hours   — weekly open windows. NO ROWS = ALWAYS OPEN, so
//                        that adding the schema did not take every existing
//                        merchant dark before anyone had entered hours.
//
// Local time is resolved through Intl against config.platform.timezone.
// Saudi has no DST so a fixed +03:00 would work today, but the offset is
// not the kind of thing that should be hardcoded in three call sites.
// ---------------------------------------------------------------------
const { config } = require('./config');

// Minutes since local midnight, and the local weekday (0 = Sunday) — both
// derived from one formatter pass so they cannot disagree across a midnight
// boundary.
function localNow(at, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(at);

  const get = (type) => (parts.find((p) => p.type === type) || {}).value;
  const WEEKDAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  // hour12:false yields '24' rather than '00' at midnight in some ICU
  // versions — normalise or every midnight-crossing window breaks.
  const hour = Number(get('hour')) % 24;
  return {
    weekday: WEEKDAYS[get('weekday')],
    minutes: hour * 60 + Number(get('minute')),
  };
}

// 'HH:MM' or 'HH:MM:SS' (Postgres time) -> minutes since midnight.
function toMinutes(value) {
  const [h, m] = String(value).split(':');
  return Number(h) * 60 + Number(m);
}

// Postgres hands back 'HH:MM:SS'; storefronts show 'HH:MM'. Trimmed here so
// no caller has to remember to slice.
function toHHMM(value) {
  return String(value || '').slice(0, 5);
}

// Does `window` cover this weekday+time? A window whose closes_at is at or
// before its opens_at crosses midnight, so it covers the tail of its own
// weekday AND the head of the next one.
function windowCovers(win, weekday, minutes) {
  const opens = toMinutes(win.opens_at);
  const closes = toMinutes(win.closes_at);

  if (closes > opens) {
    return win.weekday === weekday && minutes >= opens && minutes < closes;
  }
  // Crosses midnight.
  if (win.weekday === weekday && minutes >= opens) return true;
  const previousDay = (weekday + 6) % 7;
  return win.weekday === previousDay && minutes < closes;
}

// -> { open: boolean, reason: null | 'override' | 'hours' }
function isOpenNow({ acceptingOrders = true, hours = [] } = {}, at = new Date()) {
  if (acceptingOrders === false) return { open: false, reason: 'override' };
  if (!hours || hours.length === 0) return { open: true, reason: null };

  const { weekday, minutes } = localNow(at, config.platform.timezone);
  const open = hours.some((win) => windowCovers(win, weekday, minutes));
  return open ? { open: true, reason: null } : { open: false, reason: 'hours' };
}

// When does this schedule next let the merchant trade? Searched a week
// forward from `at`, so a customer looking at a closed listing is told when
// to come back instead of just "closed".
//
// -> { weekday, opensAt, daysAhead } | null. null means there is nothing to
// say: no hours at all (always open), or a schedule with no windows.
function nextOpening(hours, at = new Date()) {
  if (!hours || hours.length === 0) return null;
  const { weekday, minutes } = localNow(at, config.platform.timezone);

  // 8 rather than 7: the last pass wraps back onto today, which is how a
  // merchant whose only window has already passed gets "opens Sunday 09:00"
  // instead of nothing at all.
  for (let daysAhead = 0; daysAhead < 8; daysAhead += 1) {
    const day = (weekday + daysAhead) % 7;
    const opensToday = hours
      .filter((win) => Number(win.weekday) === day)
      .map((win) => toMinutes(win.opens_at))
      // Today only counts openings still to come; later days count all.
      .filter((opens) => daysAhead > 0 || opens > minutes)
      .sort((a, b) => a - b);

    if (opensToday.length) {
      const opens = opensToday[0];
      const hh = String(Math.floor(opens / 60)).padStart(2, '0');
      const mm = String(opens % 60).padStart(2, '0');
      return { weekday: day, opensAt: `${hh}:${mm}`, daysAhead };
    }
  }
  return null;
}

// The whole open/closed block a storefront renders for one merchant, built
// once here so the food and shop controllers cannot drift apart on it.
//
// `opensNext` is deliberately null when the merchant is closed by the manual
// override: the schedule would happily claim "opens at 09:00" while the
// owner has switched ordering off by hand, and that is a promise we cannot
// keep. `todayWeekday` ships so the client can pick today's windows out of
// `hours` without having to know the platform timezone.
function publicHoursState({ acceptingOrders = true, hours = [] } = {}, at = new Date()) {
  const sorted = [...(hours || [])]
    .map((win) => ({
      weekday: Number(win.weekday),
      opens_at: toHHMM(win.opens_at),
      closes_at: toHHMM(win.closes_at),
    }))
    .sort((a, b) => a.weekday - b.weekday || a.opens_at.localeCompare(b.opens_at));

  const state = isOpenNow({ acceptingOrders, hours: sorted }, at);
  return {
    isOpen: state.open,
    closedReason: state.reason,
    hours: sorted,
    todayWeekday: localNow(at, config.platform.timezone).weekday,
    opensNext: state.reason === 'hours' ? nextOpening(sorted, at) : null,
  };
}

// Group rows from one merchant_hours query into { merchantId: [rows] } so a
// list endpoint can fetch every merchant's hours in a single round trip.
function groupHoursByMerchant(rows) {
  const byMerchant = new Map();
  for (const row of rows || []) {
    if (!byMerchant.has(row.merchant_id)) byMerchant.set(row.merchant_id, []);
    byMerchant.get(row.merchant_id).push(row);
  }
  return byMerchant;
}

// The open state for ONE merchant, hours read on demand. Used by the order
// guards, where a greyed-out card in the UI is not a control.
//
// The database adapter is required lazily so this module stays importable with no
// environment at all — scripts/check-store-hours.js exercises the logic
// above without a database.
async function merchantOpenState(merchantId, acceptingOrders) {
  const database = require('./database/pool');
  let data;
  try {
    ({ rows: data } = await database.query(
      'SELECT weekday,opens_at,closes_at FROM public.merchant_hours WHERE merchant_id=$1', [merchantId]));
  } catch (error) {
    // Fail OPEN. Hours are a convenience; a lookup blip must not stop a
    // merchant trading. is_active/status still gate availability.
    console.error('merchantOpenState hours load error:', error.message || error);
    return { open: true, reason: null };
  }
  return isOpenNow({ acceptingOrders, hours: data || [] });
}

// The 409 both checkout paths and add-to-cart return, so the customer sees
// one wording and the client can branch on failure_reason.
const CLOSED_RESPONSE = {
  error: 'This store is closed right now',
  failure_reason: 'store_closed',
};

module.exports = {
  isOpenNow,
  nextOpening,
  publicHoursState,
  groupHoursByMerchant,
  merchantOpenState,
  CLOSED_RESPONSE,
};
