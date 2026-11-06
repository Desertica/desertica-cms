import assert from 'node:assert/strict';
import { test } from 'node:test';
import { seedOrderShift, startsAtZero } from './order-from-one.ts';

test('a list that still has a 0 or an empty order is old', () => {
  assert.equal(startsAtZero([0, 1, 2]), true);
  assert.equal(startsAtZero([3, null]), true);
});

test('a list that starts at 1 is left alone, so a second boot changes nothing', () => {
  assert.equal(startsAtZero([1, 2, 5]), false);
  assert.equal(startsAtZero([]), false);
});

test('a seed that starts at 0 is shifted to start at 1, one that already starts at 1 is not', () => {
  assert.equal(seedOrderShift([0, 0, 1, 2]), 1);
  assert.equal(seedOrderShift([undefined, 1]), 1);
  assert.equal(seedOrderShift([1, 2, 3]), 0);
});
