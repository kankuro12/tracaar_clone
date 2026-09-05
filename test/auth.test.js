const { test } = require('node:test');
const assert = require('node:assert');
const { weakPassword, MIN_PASSWORD_LEN } = require('../src/auth');

test('rejects empty/missing passwords', () => {
  assert.strictEqual(weakPassword(''), true);
  assert.strictEqual(weakPassword(undefined), true);
  assert.strictEqual(weakPassword(null), true);
});

test(`rejects passwords shorter than ${MIN_PASSWORD_LEN} chars`, () => {
  assert.strictEqual(weakPassword('a'.repeat(MIN_PASSWORD_LEN - 1)), true);
});

test(`accepts passwords >= ${MIN_PASSWORD_LEN} chars`, () => {
  assert.strictEqual(weakPassword('a'.repeat(MIN_PASSWORD_LEN)), false);
  assert.strictEqual(weakPassword('a'.repeat(MIN_PASSWORD_LEN + 5)), false);
});
