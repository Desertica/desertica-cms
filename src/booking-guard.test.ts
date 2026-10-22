import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bookingRuleError } from './booking-guard.ts';

test('booking limits must agree with each other', () => {
  const ok = { adultsMin: 1, adultsDefault: 2, childrenMin: 0, peopleMax: 12 };
  assert.equal(bookingRuleError(ok), null);
  assert.equal(bookingRuleError({ adultsMin: 1, adultsDefault: 1, childrenMin: 0, peopleMax: 12 }), null);
  assert.ok(bookingRuleError({ ...ok, adultsDefault: 0 }), 'default below the minimum');
  assert.ok(bookingRuleError({ ...ok, adultsDefault: 13 }), 'default above the maximum');
  assert.ok(bookingRuleError({ ...ok, adultsMin: 2, childrenMin: 1, peopleMax: 2 }), 'maximum below the minimums');
  assert.equal(bookingRuleError({ peopleMax: 3 }), null, 'missing values are not compared');
});
