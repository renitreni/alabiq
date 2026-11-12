'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.REALTIME_INTERNAL_URL = 'http://realtime:4100';
process.env.REALTIME_PUBLISH_TOKEN = 'test-publish-token';
const realtime = require('../lib/realtime');

test('broadcast publishes only to the configured internal realtime endpoint', async (t) => {
  const originalFetch = global.fetch;
  let request;
  global.fetch = async (url, options) => {
    request = { url, options };
    return new Response('', { status: 202 });
  };
  t.after(() => { global.fetch = originalFetch; });

  await realtime.pushBookingStatus('SM-test-code', { status: 'assigned' });

  assert.equal(request.url, 'http://realtime:4100/publish');
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.headers.Authorization, 'Bearer test-publish-token');
  assert.deepEqual(JSON.parse(request.options.body), {
    topic: 'booking-SM-test-code',
    event: 'status',
    payload: { status: 'assigned' },
  });
});

test('broadcast failures are swallowed so business requests remain available', async (t) => {
  const originalFetch = global.fetch;
  const originalError = console.error;
  global.fetch = async () => { throw new Error('realtime offline'); };
  console.error = () => {};
  t.after(() => {
    global.fetch = originalFetch;
    console.error = originalError;
  });

  await assert.doesNotReject(realtime.pingAdmin('SM-example'));
});
