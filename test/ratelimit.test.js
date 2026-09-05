const { test } = require('node:test');
const assert = require('node:assert');
const { rateLimit } = require('../src/ratelimit');

function fakeRes() {
  const res = { statusCode: 200, headers: {}, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.set = (k, v) => { res.headers[k] = v; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

// The limiter resolves through the store (a promise), so each hit is awaited.
function hit(limit, ip) {
  return new Promise((resolve) => {
    const res = fakeRes();
    let passed = false;
    const done = () => resolve({ res, passed });
    res.json = (body) => { res.body = body; done(); return res; };
    limit({ ip }, res, () => { passed = true; done(); });
  });
}

test('allows requests under the limit', async () => {
  const limit = rateLimit({ windowMs: 60_000, max: 3, keyFn: () => 'a' });
  for (let i = 0; i < 3; i++) {
    const { res, passed } = await hit(limit, '1.1.1.1');
    assert.strictEqual(passed, true);
    assert.strictEqual(res.statusCode, 200);
  }
});

test('blocks once the limit is exceeded', async () => {
  const limit = rateLimit({ windowMs: 60_000, max: 2, keyFn: () => 'b' });
  await hit(limit, '1.1.1.1');
  await hit(limit, '1.1.1.1');
  const { res, passed } = await hit(limit, '1.1.1.1');
  assert.strictEqual(passed, false);
  assert.strictEqual(res.statusCode, 429);
  assert.ok(res.headers['Retry-After'] > 0);
});

test('separate keys get separate budgets', async () => {
  const limit = rateLimit({ windowMs: 60_000, max: 1, keyFn: (req) => req.ip });
  const a = await hit(limit, '1.1.1.1');
  const b = await hit(limit, '2.2.2.2');
  assert.strictEqual(a.passed, true);
  assert.strictEqual(b.passed, true);
});
