const { test } = require('node:test');
const assert = require('node:assert');
const { courseDelta } = require('../src/rules');

test('a straight line is a zero-degree turn', () => {
  assert.strictEqual(courseDelta(0, 0), 0);
  assert.strictEqual(courseDelta(180, 180), 0);
});

test('course delta wraps around north', () => {
  assert.strictEqual(courseDelta(350, 10), 20);
  assert.strictEqual(courseDelta(10, 350), 20);
});

test('right angles and u-turns', () => {
  assert.strictEqual(courseDelta(0, 90), 90);
  assert.strictEqual(courseDelta(90, 0), 90);
  assert.strictEqual(courseDelta(0, 180), 180);
});

test('never exceeds 180 degrees', () => {
  for (let a = 0; a < 360; a += 17) {
    for (let b = 0; b < 360; b += 23) {
      const d = courseDelta(a, b);
      assert.ok(d >= 0 && d <= 180, `courseDelta(${a},${b}) = ${d}`);
    }
  }
});
