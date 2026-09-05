const test = require('node:test');
const assert = require('node:assert');
const { parseFrame } = require('../src/protocol');

test('parses the spec example frame', () => {
  const raw = '*HQ,8151029030,V1,135114,A,4453.9605,N,00721.8155,E,000.21,000,221015,FBF7BBFF,222,10,11032,27783#';
  const p = parseFrame(raw);
  assert.equal(p.imei, '8151029030');
  assert.equal(p.valid, true);
  assert.ok(Math.abs(p.lat - 44.899342) < 1e-5, `lat ${p.lat}`);
  assert.ok(Math.abs(p.lon - 7.363592) < 1e-5, `lon ${p.lon}`);
  assert.ok(Math.abs(p.speedKn - 0.21) < 1e-9);
  assert.equal(p.course, 0);
  assert.equal(p.deviceTime.toISOString(), '2015-10-22T13:51:14.000Z');
});

test('southern/western hemispheres go negative', () => {
  const p = parseFrame('*HQ,8151029030,V1,135114,A,4453.9605,S,00721.8155,W,000.21,000,221015,FBF7BBFF,222#');
  assert.ok(p.lat < 0 && p.lon < 0);
});

test('invalid fix flag', () => {
  const p = parseFrame('*HQ,8151029030,V1,135114,V,4453.9605,N,00721.8155,E,000.21,000,221015,FBF7BBFF,222#');
  assert.equal(p.valid, false);
});

test('malformed frames throw', () => {
  assert.throws(() => parseFrame('*HELLO#'));
  assert.throws(() => parseFrame('*HQ,123,V1,135114,A,4453.9605,N,00721.8155,E#'));
  assert.throws(() => parseFrame('*HQ,8151029030,V1,135114,A,94.0000,N,00721.8155,E,000.21,000,221015#'));
});

// ---- H02 vehicle status word (negative logic: bit 0 = condition active) ----
const { decodeStatus } = require('../src/protocol');

test('ignition reads from bit 10 with negative logic', () => {
  // FBF7BBFF: third byte BB = 1011_1011, bit 2 clear -> ACC off bit clear -> ignition ON
  assert.strictEqual(decodeStatus('FBF7BBFF').ignition, true);
  // all bits set = nothing active = ignition OFF
  assert.strictEqual(decodeStatus('FFFFFFFF').ignition, false);
});

test('all-ones status raises no alarms', () => {
  const s = decodeStatus('FFFFFFFF');
  assert.strictEqual(s.sos, false);
  assert.strictEqual(s.powerCut, false);
  assert.strictEqual(s.theft, false);
});

test('clearing the SOS bit raises SOS', () => {
  // bit 1 low -> robbery/SOS active
  const s = decodeStatus('FFFFFFFD');
  assert.strictEqual(s.sos, true);
});

test('malformed or missing status decodes to null', () => {
  assert.strictEqual(decodeStatus(''), null);
  assert.strictEqual(decodeStatus(undefined), null);
  assert.strictEqual(decodeStatus('nothex'), null);
});
