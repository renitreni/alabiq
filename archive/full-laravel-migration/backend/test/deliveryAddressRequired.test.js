require('./helpers/pureEnv');

const test = require('node:test');
const assert = require('node:assert/strict');

// The body validator is the handler just before checkout on POST /orders.
function checkoutValidator(vertical) {
  const router = require(`../routes/${vertical}`);
  const layer = router.stack.find((l) => l.route && l.route.path === '/orders' && l.route.methods.post);
  const stack = layer.route.stack;
  return stack[stack.length - 2].handle;
}

function run(validator, body) {
  const out = { status: null, body: null, next: false };
  const res = {
    status(code) { out.status = code; return this; },
    json(b) { out.body = b; return this; },
  };
  validator({ body }, res, () => { out.next = true; });
  return out;
}

const filled = {
  merchant_id: 'm1',
  delivery_address: 'Al Olaya, Riyadh',
  delivery_lat: 24.7,
  delivery_lng: 46.68,
  delivery_street: 'King Fahd Rd',
  delivery_building: '12',
  contact_phone: '0500000000',
  payment_method: 'stcpay',
};

// Riders were reaching a pin with no street or door number on it.
for (const vertical of ['food', 'shop']) {
  test(`${vertical}: street and building number are both required`, () => {
    const validator = checkoutValidator(vertical);
    for (const field of ['delivery_street', 'delivery_building']) {
      for (const bad of [undefined, null, '', '   ']) {
        const out = run(validator, { ...filled, [field]: bad });
        assert.equal(out.status, 400, `${field}=${JSON.stringify(bad)} must be rejected`);
        assert.equal(out.next, false);
      }
    }
  });

  test(`${vertical}: a filled address passes, trimmed`, () => {
    const body = { ...filled, delivery_street: '  King Fahd Rd ', delivery_building: ' 12 ' };
    const req = { body };
    let passed = false;
    checkoutValidator(vertical)(req, {}, () => { passed = true; });
    assert.ok(passed);
    assert.equal(req.body.delivery_street, 'King Fahd Rd');
    assert.equal(req.body.delivery_building, '12');
  });
}
