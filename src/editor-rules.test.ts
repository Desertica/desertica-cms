import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fixIcon, galleryError, slugChangeBlocked, slugToInherit, slugify, uniqueSlug } from './editor-rules.ts';

test('slugify drops accents, symbols and edge hyphens', () => {
  assert.equal(slugify('Dunas y Oasis: Ica'), 'dunas-y-oasis-ica');
  assert.equal(slugify('  ¡Sandboarding & Buggy! Ñandú '), 'sandboarding-buggy-nandu');
  assert.equal(slugify('Línea de Nazca (2h)'), 'linea-de-nazca-2h');
  assert.equal(slugify('???'), '');
});

test('a clash adds -2, then -3', () => {
  assert.equal(uniqueSlug('buggy', []), 'buggy');
  assert.equal(uniqueSlug('buggy', ['buggy']), 'buggy-2');
  assert.equal(uniqueSlug('buggy', ['buggy', 'buggy-2', 'buggy-tour']), 'buggy-3');
});

test('only a different slug on a stored entry by a non-Super Admin is blocked', () => {
  assert.equal(slugChangeBlocked('a', 'b', false), true);
  assert.equal(slugChangeBlocked('a', 'a', false), false);
  assert.equal(slugChangeBlocked('a', 'b', true), false);
  assert.equal(slugChangeBlocked(null, 'b', false), false);
  assert.equal(slugChangeBlocked('a', undefined, false), false);
});

test('a gallery holds up to six photos', () => {
  assert.equal(galleryError([1, 2, 3, 4, 5, 6]), null);
  assert.match(galleryError([1, 2, 3, 4, 5, 6, 7])!, /máximo 6 fotos \(hay 7\)/);
  assert.equal(galleryError(undefined), null);
});

test('an old icon keeps its meaning when a close name exists, otherwise becomes a check', () => {
  const allowed = ['lucideCar', 'lucideShieldCheck', 'lucideCheck'];
  assert.equal(fixIcon('lucideCar', allowed), 'lucideCar');
  assert.equal(fixIcon('lucideShield', allowed), 'lucideShieldCheck');
  assert.equal(fixIcon('banana', allowed), 'lucideCheck');
});

test('a language version without slug takes the one from its sibling', () => {
  const es = { slug: 'nazca', locale: 'es' };
  assert.equal(slugToInherit([es, { slug: null, locale: 'en' }], 'en'), 'nazca');
  assert.equal(slugToInherit([es], 'en'), 'nazca', 'new language version');
  assert.equal(slugToInherit([es, { slug: 'nazca-en', locale: 'en' }], 'en'), null, 'never overwrites');
  assert.equal(slugToInherit([], 'en'), null);
});
