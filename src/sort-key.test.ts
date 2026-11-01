import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PAGE_ORDER, readableLabel, sortKey } from './sort-key.ts';

test('pages sort in website order, not alphabetically', () => {
  const keys = PAGE_ORDER.map((page) => sortKey({ page, section: 'hero', key: 'x' }));
  assert.deepEqual([...keys].sort(), keys);
  assert.ok(sortKey({ page: 'home', section: 'a', key: 'a' }) < sortKey({ page: 'about', section: 'a', key: 'a' }));
});

test('inside a page: section first, then key', () => {
  const k = (section: string, key: string) => sortKey({ page: 'about', section, key });
  assert.ok(k('hero', 'z') < k('map', 'a'));
  assert.ok(k('hero', 'a') < k('hero', 'b'));
  assert.ok(k('hero', 'z') < k('map', 'a') && k('my-booking', 'z') < k('trio', 'a'));
});

test('is stable, lowercase and tolerates missing fields', () => {
  assert.equal(sortKey({ page: 'Home', section: 'Hero', key: 'A.B' }), sortKey({ page: 'home', section: 'hero', key: 'a.b' }));
  assert.match(sortKey({}), /^14-\|\|$/);
});

test('label reads "Página › Sección › Nombre"', () => {
  assert.equal(readableLabel({ page: 'home', section: 'hero', key: 'home.pitchKicker' }), 'Inicio › hero › pitch kicker');
  assert.equal(readableLabel({ page: 'accessibility', section: 'skip-link', key: 'skip' }), 'Accesibilidad › skip link › skip');
});
