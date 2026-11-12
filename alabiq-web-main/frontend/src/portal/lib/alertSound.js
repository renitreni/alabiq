// ---------------------------------------------------------------------
// The app's one alert sound.
//
// Was orderAlert.js, for the merchant new-order chime only. It now serves
// rides, deliveries, passengers and admins too, because notify.js used to
// carry a SECOND AudioContext with its own note table and none of the
// machinery below — so the driver and passenger chimes were silently
// swallowed by the autoplay policy with nothing to tell anyone.
//
// FOUR THINGS THAT MAKE THIS FIDDLIER THAN IT LOOKS:
//
//   1. AUTOPLAY POLICY. Browsers create the AudioContext 'suspended' and
//      refuse to start it until the user interacts. resume() must be called
//      SYNCHRONOUSLY inside a gesture handler — deferring it into a .then()
//      or a timeout fails silently. See installAlertUnlock().
//
//   2. ONCE PER ORDER, not once per event. Broadcast reconnects, refetches
//      and remounts all re-deliver new_order for an order already
//      announced. The seen-set is what makes "once per order" true.
//
//   3. LOUD WITHOUT CLIPPING. Anything above 1.0 at destination hard-clips,
//      which sounds like crackle, not volume. The compressor is what lets
//      masterGain sit above 1.0 safely: it turns extra level into density
//      instead of distortion. The square an octave up is there because
//      phone speakers roll off below ~500 Hz while hearing peaks at 2-4 kHz,
//      so energy up there buys far more real loudness than a bigger
//      fundamental would.
//
//   4. REPEAT UNTIL ACKNOWLEDGED, for new orders only. A single 0.6s burst
//      was missable, and the next server-side nag is ten minutes later.
//      Everything else stays a single burst — a ride status update that
//      nags is just noise.
// ---------------------------------------------------------------------

// Rising thirds read as a notification; the 4-note version reads as urgent
// without becoming an alarm.
const TONES = {
  chime: {
    level: 0.6,
    notes: [
      { freq: 880, start: 0, duration: 0.16 },
      { freq: 1174, start: 0.13, duration: 0.3 },
    ],
  },
  order: {
    level: 1,
    notes: [
      { freq: 880, start: 0, duration: 0.16 },
      { freq: 1174, start: 0.13, duration: 0.16 },
      { freq: 1568, start: 0.26, duration: 0.16 },
      { freq: 1976, start: 0.39, duration: 0.5 },
    ],
  },
};

const MASTER_GAIN = 1.6; // safe only because the compressor sits before it
const PREFS_KEY = 'sm_sound_prefs';
const MIN_VOLUME = 0.15; // a slider at zero must not masquerade as mute
const REPEAT_MS = 6000;
const MAX_REPEATS = 20; // ~2 minutes, so a walked-away device stops screaming

let ctx = null;
let master = null;
let input = null;
const announced = new Set();

// --- preferences -----------------------------------------------------

let prefs = readPrefs();
const prefListeners = new Set();

function readPrefs() {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
    return {
      muted: !!raw.muted,
      volume:
        typeof raw.volume === 'number' ? Math.min(1, Math.max(MIN_VOLUME, raw.volume)) : 1,
    };
  } catch {
    return { muted: false, volume: 1 };
  }
}

export function getSoundPrefs() {
  return { ...prefs };
}

export function setSoundPrefs(next) {
  prefs = {
    muted: next.muted ?? prefs.muted,
    volume: Math.min(1, Math.max(MIN_VOLUME, next.volume ?? prefs.volume)),
  };
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* private mode / quota — the level still applies for this session */
  }
  if (master) master.gain.value = MASTER_GAIN * prefs.volume;
  prefListeners.forEach((fn) => fn(getSoundPrefs()));
}

export function subscribeSoundPrefs(fn) {
  prefListeners.add(fn);
  return () => prefListeners.delete(fn);
}

if (typeof window !== 'undefined') {
  // Two open tabs (a merchant with orders and menu side by side) must agree.
  window.addEventListener('storage', (e) => {
    if (e.key !== PREFS_KEY) return;
    prefs = readPrefs();
    if (master) master.gain.value = MASTER_GAIN * prefs.volume;
    prefListeners.forEach((fn) => fn(getSoundPrefs()));
  });
}

// --- audio graph -----------------------------------------------------

function audioContext() {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) {
    ctx = new Ctor();

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.knee.value = 12;
    compressor.ratio.value = 8;
    compressor.attack.value = 0.002;
    compressor.release.value = 0.2;

    master = ctx.createGain();
    master.gain.value = MASTER_GAIN * prefs.volume;

    compressor.connect(master);
    master.connect(ctx.destination);
    input = compressor;
  }
  return ctx;
}

export function isAlertBlocked() {
  const c = audioContext();
  return !!c && c.state === 'suspended';
}

export function unlockAlerts() {
  const c = audioContext();
  if (c && c.state === 'suspended') return c.resume().catch(() => {});
  return Promise.resolve();
}

// Installed once from main.jsx. Before this existed only three merchant/admin
// screens ever called resume(), so every driver and passenger chime was dead
// on arrival. Not { once: true }: resume() can be refused and must be retried.
export function installAlertUnlock() {
  if (typeof window === 'undefined') return;

  const resume = () => {
    const c = audioContext();
    // Synchronous inside the gesture — see note 1 at the top.
    if (c && c.state === 'suspended') c.resume().catch(() => {});
  };

  window.addEventListener('pointerdown', resume, true);
  window.addEventListener('keydown', resume, true);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    resume();
    // A hidden tab had its repeat timer throttled to roughly once a minute,
    // so anything still pending is overdue the moment we are back. Count it
    // against MAX_REPEATS like any other ring, and stay silent once every
    // pending order has hit the cap -- otherwise flipping tabs re-armed an
    // alert that had deliberately gone quiet, with no way to stop it.
    let due = false;
    for (const [key, count] of pending) {
      if (count >= MAX_REPEATS) continue;
      pending.set(key, count + 1);
      due = true;
    }
    if (due) playAlert('order');
  });
}

export function playAlert(kind = 'chime') {
  if (prefs.muted) return false;
  const c = audioContext();
  if (!c || c.state === 'suspended') return false;

  const tone = TONES[kind] || TONES.chime;
  const now = c.currentTime;

  for (const note of tone.notes) {
    const start = now + note.start;
    const end = start + note.duration;

    const gain = c.createGain();
    // Ramp rather than switch: a hard gain change clicks audibly.
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(tone.level, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    gain.connect(input);

    // Triangle carries further than a sine through room noise without the
    // harshness of a square; the octave-up square adds the high harmonic a
    // small phone speaker can actually reproduce.
    const body = c.createOscillator();
    body.type = 'triangle';
    body.frequency.value = note.freq;
    body.connect(gain);
    body.start(start);
    body.stop(end + 0.02);

    const harmonic = c.createOscillator();
    const harmonicGain = c.createGain();
    harmonic.type = 'square';
    harmonic.frequency.value = note.freq * 2;
    harmonicGain.gain.value = 0.3;
    harmonic.connect(harmonicGain);
    harmonicGain.connect(gain);
    harmonic.start(start);
    harmonic.stop(end + 0.02);
  }
  return true;
}

// --- repeat until acknowledged (new orders only) ---------------------

const pending = new Map(); // key -> repeats fired so far
const urgentListeners = new Set();
let repeatTimer = null;

// The tab title is the only channel that reaches a merchant who is on another
// tab, and the only one at all for a deaf merchant. Audio was the sole output
// for a business-critical event until this existed.
let baseTitle = null;
function paintTitleBadge(count) {
  if (typeof document === 'undefined') return;
  if (baseTitle === null) baseTitle = document.title;
  document.title = count ? `(${count}) New orders - ${baseTitle}` : baseTitle;
}

function notifyUrgent() {
  const keys = [...pending.keys()];
  paintTitleBadge(keys.length);
  urgentListeners.forEach((fn) => fn(keys));
}

function stopTimer() {
  if (repeatTimer) clearInterval(repeatTimer);
  repeatTimer = null;
}

function ensureTimer() {
  if (repeatTimer || !pending.size) return;
  // ONE timer for all pending orders. Three arriving together must not
  // produce three overlapping chimes.
  repeatTimer = setInterval(() => {
    if (!pending.size) return stopTimer();
    let sounded = false;
    for (const [key, count] of pending) {
      if (count >= MAX_REPEATS) continue;
      pending.set(key, count + 1);
      sounded = true;
    }
    // Everything hit the cap: stay pending on screen, but go quiet.
    if (sounded) playAlert('order');
    else stopTimer();
  }, REPEAT_MS);
}

export function startUrgentAlert(key) {
  if (!key) return playAlert('order');
  // Reuses the announced set on purpose: a broadcast reconnect replays
  // new_order, and that must not restart a loop already silenced.
  if (announced.has(key)) return false;
  announced.add(key);
  pending.set(key, 1);
  notifyUrgent();
  ensureTimer();
  return playAlert('order');
}

export function acknowledgeUrgentAlert(key) {
  if (!pending.delete(key)) return;
  if (!pending.size) stopTimer();
  notifyUrgent();
}

export function acknowledgeAllUrgentAlerts() {
  if (!pending.size) return;
  pending.clear();
  stopTimer();
  notifyUrgent();
}

export function subscribeUrgentAlerts(fn) {
  urgentListeners.add(fn);
  fn([...pending.keys()]);
  return () => urgentListeners.delete(fn);
}

// Announce an order at most once for the lifetime of the page. Returns true
// only if it actually made a sound.
export function announceNewOrder(orderCode) {
  // No code means we cannot dedupe. Announce anyway — a missed order is worse
  // than a repeated chime — but do not poison the set with undefined.
  if (!orderCode) return playAlert('order');
  if (announced.has(orderCode)) return false;
  announced.add(orderCode);
  return playAlert('order');
}

// Testing/remount hygiene.
export function _resetAnnouncedOrders() {
  announced.clear();
  pending.clear();
  stopTimer();
}
