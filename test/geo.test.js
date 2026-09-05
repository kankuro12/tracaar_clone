const { test } = require('node:test');
const assert = require('node:assert');
const { classifyTransition } = require('../src/geo');

test('outside -> inside fires enter', () => {
  assert.strictEqual(classifyTransition(true, false), 'enter');
});

test('inside -> outside fires exit', () => {
  assert.strictEqual(classifyTransition(false, true), 'exit');
});

test('still inside fires nothing', () => {
  assert.strictEqual(classifyTransition(true, true), null);
});

test('still outside fires nothing', () => {
  assert.strictEqual(classifyTransition(false, false), null);
});

test('unknown previous state (cold start) never fires', () => {
  assert.strictEqual(classifyTransition(true, null), null);
  assert.strictEqual(classifyTransition(false, null), null);
});
