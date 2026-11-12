const test = require('node:test');
const assert = require('node:assert');
const {
  emailError,
  nameError,
  MAX_NAME_LENGTH,
  MAX_EMAIL_LENGTH,
} = require('../lib/validate');

// BUG-002. The frontend validator in portal/lib/fieldValidation.js must use
// this same expression; if the two drift, the client accepts an address the
// server then rejects with a bare 400 and no field attached.
test('emailError rejects the shapes the signup form used to accept', () => {
  for (const bad of ['plainstring', 'no@tld', '@nolocal.com', 'spaces in@x.com', 'trailing@', '']) {
    assert.ok(emailError(bad), `expected a message for ${JSON.stringify(bad)}`);
  }
  for (const ok of ['a@b.co', 'first.last+tag@sub.example.com']) {
    assert.strictEqual(emailError(ok), null, `expected ${ok} to pass`);
  }
});

test('emailError caps length', () => {
  assert.strictEqual(emailError(`${'a'.repeat(MAX_EMAIL_LENGTH - 5)}@b.co`), null);
  assert.ok(emailError(`${'a'.repeat(MAX_EMAIL_LENGTH)}@b.co`));
});

// BUG-003. The assertion that matters is the boundary, not that "a long name
// is rejected" — an off-by-one here silently reopens the bug.
test('nameError caps full_name at the same limit the profile route uses', () => {
  assert.strictEqual(nameError('x'.repeat(MAX_NAME_LENGTH), 'First name'), null);
  assert.strictEqual(
    nameError('x'.repeat(MAX_NAME_LENGTH + 1), 'First name'),
    `First name must be at most ${MAX_NAME_LENGTH} characters`
  );
});

test('nameError leaves an absent name alone', () => {
  // full_name is optional on both /signup and /sync — a missing one must not
  // become a 400, or every signup without a name breaks.
  assert.strictEqual(nameError(undefined, 'Name'), null);
  assert.strictEqual(nameError(null, 'Name'), null);
  assert.strictEqual(nameError('', 'Name'), null);
});

test('nameError measures the trimmed value', () => {
  assert.strictEqual(nameError(`  ${'x'.repeat(MAX_NAME_LENGTH)}  `, 'Name'), null);
});

test('the name cap matches the one already enforced on PATCH /api/auth/profile', () => {
  // routes/auth.js caps full_name at 120 via validateBody. If MAX_NAME_LENGTH
  // and that literal diverge, one write path accepts what the other refuses.
  const routes = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '..', 'routes', 'auth.js'),
    'utf8'
  );
  const match = routes.match(/full_name:\s*\{\s*type:\s*'string',\s*maxLength:\s*(\d+)/);
  assert.ok(match, 'could not find the full_name rule in routes/auth.js');
  assert.strictEqual(Number(match[1]), MAX_NAME_LENGTH);
});

test('the frontend email regex is identical to the backend one', () => {
  // The two are written out separately (one is ESM in the Vite bundle, one is
  // CommonJS here) so nothing but this test stops them drifting. A client that
  // accepts what the server rejects is exactly how BUG-002 presented.
  const fs = require('node:fs');
  const path = require('node:path');
  const { EMAIL_RE } = require('../lib/validate');
  const front = fs.readFileSync(
    path.join(__dirname, '..', '..', 'frontend', 'src', 'portal', 'lib', 'fieldValidation.js'),
    'utf8'
  );
  const match = front.match(/const EMAIL_RE = (\/.*\/);/);
  assert.ok(match, 'could not find EMAIL_RE in frontend/src/portal/lib/fieldValidation.js');
  assert.strictEqual(match[1], EMAIL_RE.toString());
});
