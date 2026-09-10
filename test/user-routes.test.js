const { test } = require('node:test');
const assert = require('node:assert');
const routes = require('../src/routes');

test('accepts array and object route points', () => {
  assert.deepStrictEqual(routes.cleanRoutePoints([[27.7, 85.3], { lat: '27.8', lon: '85.4', label: ' Depot ' }]), [
    { lat: 27.7, lon: 85.3, label: '' },
    { lat: 27.8, lon: 85.4, label: 'Depot' },
  ]);
});

test('rejects bad names, coordinates, and oversized routes', () => {
  assert.throws(() => routes.cleanRouteName('  '), /name required/);
  assert.throws(() => routes.cleanRouteName('x'.repeat(81)), /max 80/);
  assert.throws(() => routes.cleanRoutePoints([[91, 0]]), /valid lat\/lon/);
  assert.throws(() => routes.cleanRoutePoints(new Array(201).fill([0, 0])), /max 200/);
  assert.deepStrictEqual(routes.cleanRoutePoints(undefined), undefined);
});
