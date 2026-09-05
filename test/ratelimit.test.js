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

test('allows requests under the limit', () => {
  const limit = rateLimit({ windowMs: 60_000, max: 3, keyFn: () => 'a' });
  for (let i = 0; i < 3; i++) {
    const res = fakeRes();
    let nextCalled = false;
    limit({ ip: '1.1.1.1' }, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true);
    assert.strictEqual(res.statusCode, 200);
  }
});

test('blocks once the limit is exceeded', () => {
  const limit = rateLimit({ windowMs: 60_000, max: 2, keyFn: () => 'b' });
  for (let i = 0; i < 2; i++) limit({ ip: '1.1.1.1' }, fakeRes(), () => {});
  const res = fakeRes();
  let nextCalled = false;
  limit({ ip: '1.1.1.1' }, res, () => { nextCalled = true; });
  assert.strictEqual(nextCalled, false);
  assert.strictEqual(res.statusCode, 429);
  assert.ok(res.headers['Retry-After'] > 0);
});

test('separate keys get separate budgets', () => {
  const limit = rateLimit({ windowMs: 60_000, max: 1, keyFn: (req) => req.ip });
  const res1 = fakeRes();
  let ok1 = false;
  limit({ ip: '1.1.1.1' }, res1, () => { ok1 = true; });
  const res2 = fakeRes();
  let ok2 = false;
  limit({ ip: '2.2.2.2' }, res2, () => { ok2 = true; });
  assert.strictEqual(ok1, true);
  assert.strictEqual(ok2, true);
});
