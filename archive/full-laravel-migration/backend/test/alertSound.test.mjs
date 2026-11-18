// The one frontend module in this suite. It lives here because it is pure
// state-machine logic behind a browser API, needs no bundler, and the
// behaviour it encodes -- a merchant not missing an order -- is the loudest
// failure the portal has. See helpers/webAudioStub.mjs for what is stubbed.

import { markAudio, audioSince, suspendAudio, resumeAudio } from './helpers/webAudioStub.mjs';

import test, { beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';

import {
  startUrgentAlert,
  acknowledgeUrgentAlert,
  acknowledgeAllUrgentAlerts,
  subscribeUrgentAlerts,
  _resetAnnouncedOrders,
} from '../../frontend/src/portal/lib/alertSound.js';

const REPEAT_MS = 6000;

beforeEach(() => {
  _resetAnnouncedOrders();
  resumeAudio();
  // The module reads setInterval off the global at call time, so mocking it
  // here reaches the repeat loop without touching the module.
  mock.timers.enable({ apis: ['setInterval'] });
  markAudio();
});

afterEach(() => {
  // Order matters: stop the loop while the timers are still mocked, or a real
  // 6-second interval outlives the test and holds the process open.
  _resetAnnouncedOrders();
  mock.timers.reset();
});

// Ring once, and record what one burst costs so no test hardcodes it.
function burstSize() {
  markAudio();
  startUrgentAlert('sizing-probe');
  const size = audioSince();
  assert.ok(size > 0, 'the stub context must actually be producing sound');
  _resetAnnouncedOrders();
  return size;
}

test('a new order rings immediately', () => {
  markAudio();
  const rang = startUrgentAlert('ORD-1');
  assert.equal(rang, true);
  assert.ok(audioSince() > 0);
});

test('the same order announced twice rings once', () => {
  // Broadcast reconnects, refetches and remounts all re-deliver new_order for
  // an order already on screen. Once per ORDER, not once per event.
  const burst = burstSize();
  startUrgentAlert('ORD-1');
  markAudio();
  const second = startUrgentAlert('ORD-1');
  assert.equal(second, false);
  assert.equal(audioSince(), 0);
  assert.notEqual(burst, 0);
});

test('acknowledging does not clear the seen-set, so a replay cannot restart a silenced loop', () => {
  // The nastiest version of the bug: merchant silences the alarm, the socket
  // reconnects, the same order replays and the kitchen starts screaming again
  // at an order somebody is already cooking.
  startUrgentAlert('ORD-1');
  acknowledgeUrgentAlert('ORD-1');
  markAudio();
  assert.equal(startUrgentAlert('ORD-1'), false);
  assert.equal(audioSince(), 0);

  // And no timer comes back with it.
  mock.timers.tick(REPEAT_MS);
  assert.equal(audioSince(), 0);
});

test('three orders arriving together share ONE repeat timer', () => {
  // Three timers would mean three overlapping chimes every six seconds, which
  // is noise rather than an alert.
  const burst = burstSize();
  startUrgentAlert('ORD-1');
  startUrgentAlert('ORD-2');
  startUrgentAlert('ORD-3');

  markAudio();
  mock.timers.tick(REPEAT_MS);
  assert.equal(audioSince(), burst, 'exactly one burst per tick, not one per pending order');
});

test('an unacknowledged order keeps ringing on every repeat', () => {
  const burst = burstSize();
  startUrgentAlert('ORD-1');

  markAudio();
  mock.timers.tick(REPEAT_MS * 3);
  assert.equal(audioSince(), burst * 3);
});

test('acknowledging the last pending order stops the repeat', () => {
  startUrgentAlert('ORD-1');
  acknowledgeUrgentAlert('ORD-1');

  markAudio();
  mock.timers.tick(REPEAT_MS * 5);
  assert.equal(audioSince(), 0);
});

test('acknowledging one of two orders leaves the other still ringing', () => {
  const burst = burstSize();
  startUrgentAlert('ORD-1');
  startUrgentAlert('ORD-2');
  acknowledgeUrgentAlert('ORD-1');

  markAudio();
  mock.timers.tick(REPEAT_MS);
  assert.equal(audioSince(), burst);
});

test('acknowledging an order that is not pending is a no-op', () => {
  const burst = burstSize();
  startUrgentAlert('ORD-1');
  acknowledgeUrgentAlert('ORD-UNKNOWN');

  markAudio();
  mock.timers.tick(REPEAT_MS);
  assert.equal(audioSince(), burst, 'the real pending order must survive a stray acknowledgement');
});

test('acknowledge-all silences every pending order at once', () => {
  startUrgentAlert('ORD-1');
  startUrgentAlert('ORD-2');
  startUrgentAlert('ORD-3');

  const seen = [];
  subscribeUrgentAlerts((keys) => seen.push(keys));
  acknowledgeAllUrgentAlerts();

  assert.deepEqual(seen.at(-1), []);
  markAudio();
  mock.timers.tick(REPEAT_MS * 3);
  assert.equal(audioSince(), 0);
});

test('acknowledge-all on an empty queue does not notify subscribers', () => {
  const seen = [];
  subscribeUrgentAlerts((keys) => seen.push(keys));
  acknowledgeAllUrgentAlerts();
  // One call only: the immediate replay on subscribe. Nothing changed, so
  // nothing is broadcast, and a badge does not repaint on every render.
  assert.equal(seen.length, 1);
});

test('a subscriber is handed the current queue immediately, before any new event', () => {
  // A component mounting mid-alarm has to paint the badge from state that
  // already exists, not wait for the next order.
  startUrgentAlert('ORD-1');
  let received = null;
  subscribeUrgentAlerts((keys) => {
    received = keys;
  });
  assert.deepEqual(received, ['ORD-1']);
});

test('unsubscribing stops the callbacks', () => {
  const seen = [];
  const off = subscribeUrgentAlerts((keys) => seen.push(keys));
  off();
  startUrgentAlert('ORD-1');
  assert.equal(seen.length, 1, 'only the immediate replay from subscribe time');
});

test('subscribers see orders queue up and drain in order', () => {
  const seen = [];
  subscribeUrgentAlerts((keys) => seen.push([...keys]));
  startUrgentAlert('ORD-1');
  startUrgentAlert('ORD-2');
  acknowledgeUrgentAlert('ORD-1');
  assert.deepEqual(seen, [[], ['ORD-1'], ['ORD-1', 'ORD-2'], ['ORD-2']]);
});

test('an order with no key rings but never joins the repeat loop', () => {
  // No key means no way to dedupe or acknowledge it. Ringing once is right;
  // starting an un-silenceable loop would not be.
  const burst = burstSize();
  markAudio();
  assert.equal(startUrgentAlert(''), true);
  assert.equal(audioSince(), burst);

  markAudio();
  mock.timers.tick(REPEAT_MS * 3);
  assert.equal(audioSince(), 0);
});

test('an alert blocked by the autoplay policy still rings once the audio is unlocked', () => {
  // The browser refuses to start the context until the user interacts, so the
  // first announcement can be silent. The repeat loop is what rescues it --
  // the merchant hears the order within one interval of touching the screen.
  suspendAudio();
  markAudio();
  assert.equal(startUrgentAlert('ORD-1'), false, 'it reports honestly that nothing was heard');
  assert.equal(audioSince(), 0);

  resumeAudio();
  mock.timers.tick(REPEAT_MS);
  assert.ok(audioSince() > 0);
});

test('the alarm gives up after about two minutes but the order stays on screen', () => {
  // A device somebody walked away from must stop screaming. Silence is not
  // dismissal though: the order is still pending and still badged.
  const burst = burstSize();
  startUrgentAlert('ORD-1');

  markAudio();
  mock.timers.tick(REPEAT_MS * 30); // well past the 20-repeat cap
  const repeats = audioSince() / burst;
  assert.equal(repeats, 19, 'the initial ring plus 19 repeats is the 20-repeat cap');

  let received = null;
  subscribeUrgentAlerts((keys) => {
    received = keys;
  });
  assert.deepEqual(received, ['ORD-1'], 'gone quiet, not gone');
});
