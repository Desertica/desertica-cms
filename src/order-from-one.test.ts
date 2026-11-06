import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startsAtZero } from './order-from-one.ts';

test('a list that still has a 0 or an empty order is old', () => {
  assert.equal(startsAtZero([0, 1, 2]), true);
  assert.equal(startsAtZero([3, null]), true);
});

test('a list that starts at 1 is left alone, so a second boot changes nothing', () => {
  assert.equal(startsAtZero([1, 2, 5]), false);
  assert.equal(startsAtZero([]), false);
});
