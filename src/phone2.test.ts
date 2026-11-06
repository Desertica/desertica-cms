import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spacedPhone } from './phone2.ts';

test('a Peruvian mobile number is spaced like the website does', () => {
  assert.equal(spacedPhone('51912345678'), '+51 912 345 678');
});

test('any other length keeps just the plus and the digits', () => {
  assert.equal(spacedPhone('14155550123'), '+14155550123');
  assert.equal(spacedPhone('5191234567'), '+5191234567');
});
