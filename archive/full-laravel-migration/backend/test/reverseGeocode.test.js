require('./helpers/pureEnv');

const test = require('node:test');
const assert = require('node:assert/strict');

const { placeFromMapboxReverse } = require('../lib/geo');

const poi = {
  id: 'poi.1',
  place_type: ['poi'],
  text: 'Olaya Mall',
  place_name: 'Olaya Mall, Riyadh, Saudi Arabia',
  center: [46.68, 24.71],
  properties: { mapbox_id: 'pc' },
};
const street = {
  id: 'address.1',
  place_type: ['address'],
  text: 'King Fahd Rd',
  address: '12',
  place_name: '12 King Fahd Rd, Al Olaya, Riyadh 12211, Saudi Arabia',
  center: [46.68, 24.7],
  properties: { mapbox_id: 'st' },
  context: [{ id: 'street.1', text: 'King Fahd Rd' }],
};
const roadOnly = {
  id: 'road.1',
  place_type: ['road'],
  text: 'King Fahd Rd',
  place_name: 'King Fahd Rd, Riyadh Saudi Arabia',
  properties: { mapbox_id: 'rt' },
  context: [{ id: 'street.1', text: 'King Fahd Rd' }],
};

test('a street address beats a POI listed first', () => {
  const place = placeFromMapboxReverse([poi, roadOnly, street], 24.7, 46.68);
  assert.equal(place.id, 'st');
  assert.equal(place.address, street.place_name);
});

test('street and building number come from the chosen feature', () => {
  const place = placeFromMapboxReverse([street], 24.7, 46.68);
  assert.equal(place.street, 'King Fahd Rd');
  assert.equal(place.buildingNumber, '12');
});

test('without an address feature, the first feature is used', () => {
  const place = placeFromMapboxReverse([roadOnly, poi], 1, 2);
  assert.equal(place.id, 'rt');
  // Street falls back to the street context entry.
  assert.equal(place.street, 'King Fahd Rd');
  // Common in KSA: the customer has to type it.
  assert.equal(place.buildingNumber, '');
  // No usable center on the result: the point asked about is kept.
  assert.deepEqual([place.lat, place.lng], [1, 2]);
});

test('no features is null, so the route can answer 404', () => {
  assert.equal(placeFromMapboxReverse([], 1, 2), null);
  assert.equal(placeFromMapboxReverse(undefined, 1, 2), null);
});

// The route itself, minus the rate limiter: the last handler on /reverse.
function reverseHandler() {
  process.env.MAPBOX_ACCESS_TOKEN = 'test-key';
  const router = require('../routes/locations');
  const layer = router.stack.find((l) => l.route && l.route.path === '/reverse');
  const stack = layer.route.stack;
  return stack[stack.length - 1].handle;
}

function fakeRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test('an upstream error is a logged 502, not a silent "no address"', async (t) => {
  const logged = [];
  t.mock.method(console, 'error', (...args) => logged.push(args.join(' ')));
  t.mock.method(globalThis, 'fetch', async () => ({
    ok: false,
    status: 401,
    text: async () => '{"message":"Not Authorized - Invalid Token"}',
  }));

  const res = fakeRes();
  await reverseHandler()({ query: { lat: '10.5', lng: '20.5' } }, res);

  assert.equal(res.statusCode, 502);
  assert.equal(logged.length, 1);
  assert.match(logged[0], /Not Authorized/);
});

test('empty features are still a 404', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => ({
    ok: true,
    json: async () => ({ type: 'FeatureCollection', features: [] }),
  }));

  const res = fakeRes();
  await reverseHandler()({ query: { lat: '11.5', lng: '21.5' } }, res);

  assert.equal(res.statusCode, 404);
});
