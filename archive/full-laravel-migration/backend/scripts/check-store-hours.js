// ---------------------------------------------------------------------
// Assertions for lib/storeHours.js — the open/closed decision behind the
// storefront badge AND both checkout guards.
//
// Pure logic, no database: run it anywhere with `npm run check:hours`.
// The cross-midnight and midnight-boundary cases are the ones worth
// keeping — they are why this file exists rather than an inline ternary.
// ---------------------------------------------------------------------
const { isOpenNow, nextOpening, publicHoursState } = require('../lib/storeHours');

let failed = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed += 1;
  console.log(`${ok ? '[OK]  ' : '[FAIL]'} ${label}`);
  if (!ok) console.log(`   want ${JSON.stringify(want)}\n   got  ${JSON.stringify(got)}`);
}

const at = (iso) => new Date(iso);
const OPEN = { open: true, reason: null };
const BY_HOURS = { open: false, reason: 'hours' };

// 2026-08-16 is a Sunday. Riyadh is UTC+3 year round.
const sunday = [{ weekday: 0, opens_at: '09:00:00', closes_at: '23:00:00' }];
const overnight = [{ weekday: 0, opens_at: '22:00:00', closes_at: '02:00:00' }];
const split = [
  { weekday: 0, opens_at: '11:00:00', closes_at: '15:00:00' },
  { weekday: 0, opens_at: '18:00:00', closes_at: '23:00:00' },
];

// The backward-compatibility rule that stopped 0038 taking every existing
// merchant dark on deploy.
check('no hours at all = always open', isOpenNow({ hours: [] }, at('2026-08-16T00:00:00Z')), OPEN);
check('missing hours key = always open', isOpenNow({}, at('2026-08-16T00:00:00Z')), OPEN);

check(
  'manual override beats an open schedule',
  isOpenNow({ acceptingOrders: false, hours: sunday }, at('2026-08-16T10:00:00Z')),
  { open: false, reason: 'override' }
);

check('inside the window (13:00 Riyadh)', isOpenNow({ hours: sunday }, at('2026-08-16T10:00:00Z')), OPEN);
check('before opening (06:00 Riyadh)', isOpenNow({ hours: sunday }, at('2026-08-16T03:00:00Z')), BY_HOURS);
check('no window for that weekday', isOpenNow({ hours: sunday }, at('2026-08-17T10:00:00Z')), BY_HOURS);

// closes_at < opens_at means the window runs past midnight into the NEXT
// weekday. Getting this wrong shuts every late-night merchant at 00:00.
check('overnight, 23:00 Sunday', isOpenNow({ hours: overnight }, at('2026-08-16T20:00:00Z')), OPEN);
check('overnight, exactly 00:00 Monday', isOpenNow({ hours: overnight }, at('2026-08-16T21:00:00Z')), OPEN);
check('overnight, 01:00 Monday', isOpenNow({ hours: overnight }, at('2026-08-16T22:00:00Z')), OPEN);
check('overnight, 03:00 Monday (past close)', isOpenNow({ hours: overnight }, at('2026-08-17T00:00:00Z')), BY_HOURS);

check('split shift, inside the gap', isOpenNow({ hours: split }, at('2026-08-16T13:00:00Z')), BY_HOURS);
check('split shift, second window', isOpenNow({ hours: split }, at('2026-08-16T16:00:00Z')), OPEN);

// A window is half-open: closes_at is the first minute CLOSED, so a store
// closing at 23:00 does not accept an order timestamped 23:00.
check('closes_at is exclusive', isOpenNow({ hours: sunday }, at('2026-08-16T20:00:00Z')), BY_HOURS);
check('opens_at is inclusive', isOpenNow({ hours: sunday }, at('2026-08-16T06:00:00Z')), OPEN);

// --- nextOpening: the "come back at" the storefront shows on a closed card.

check('no hours = nothing to promise', nextOpening([], at('2026-08-16T03:00:00Z')), null);

check(
  'later today',
  nextOpening(sunday, at('2026-08-16T03:00:00Z')),
  { weekday: 0, opensAt: '09:00', daysAhead: 0 }
);
check(
  'today is over, so the next weekday with a window',
  nextOpening(sunday, at('2026-08-16T20:00:00Z')),
  { weekday: 0, opensAt: '09:00', daysAhead: 7 }
);
check(
  'the gap in a split shift points at the second window, not tomorrow',
  nextOpening(split, at('2026-08-16T13:00:00Z')),
  { weekday: 0, opensAt: '18:00', daysAhead: 0 }
);
check(
  'wraps onto the next weekday that actually opens',
  nextOpening(
    [{ weekday: 3, opens_at: '09:00:00', closes_at: '17:00:00' }],
    at('2026-08-16T10:00:00Z')
  ),
  { weekday: 3, opensAt: '09:00', daysAhead: 3 }
);

// --- publicHoursState: the block both storefronts render.

check(
  'closed by hours carries the reopening time',
  publicHoursState({ hours: sunday }, at('2026-08-16T03:00:00Z')),
  {
    isOpen: false,
    closedReason: 'hours',
    hours: [{ weekday: 0, opens_at: '09:00', closes_at: '23:00' }],
    todayWeekday: 0,
    opensNext: { weekday: 0, opensAt: '09:00', daysAhead: 0 },
  }
);

// The manual override is the owner deciding, not the schedule. Promising a
// reopening time here would be a promise nobody has made.
check(
  'manual override promises no reopening time',
  publicHoursState({ acceptingOrders: false, hours: sunday }, at('2026-08-16T03:00:00Z')).opensNext,
  null
);

check(
  'open right now needs no reopening time',
  publicHoursState({ hours: sunday }, at('2026-08-16T10:00:00Z')).opensNext,
  null
);

if (failed) {
  console.log(`\n${failed} store-hours assertion(s) failed.`);
  process.exit(1);
}
console.log('\nAll store-hours assertions passed.');
