import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseMapLink } from './map-url.ts';

test('empty and broken values are told apart', () => {
  assert.equal(parseMapLink('  ').kind, 'empty');
  assert.equal(parseMapLink(null).kind, 'empty');
  assert.equal(parseMapLink('no es un enlace').kind, 'invalid');
  assert.equal(parseMapLink('javascript:alert(1)').kind, 'invalid');
});

test('shortened links cannot be previewed, other sites just open', () => {
  assert.equal(parseMapLink('https://maps.app.goo.gl/abc123').kind, 'short');
  assert.equal(parseMapLink('https://example.com/maps/x').kind, 'other');
});

test('links with coordinates give a preview centered on them', () => {
  const at = parseMapLink('https://www.google.com/maps/@-14.0875,-75.7626,15z');
  assert.ok(at.kind === 'place' && at.embed.includes('marker=-14.0875,-75.7626') && at.embed.startsWith('https://www.openstreetmap.org/'));
  const q = parseMapLink('https://www.google.com/maps?q=-14.0875,-75.7626');
  assert.equal(q.kind, 'place');
  const ll = parseMapLink('https://maps.google.com/?ll=-14.0875,-75.7626');
  assert.equal(ll.kind, 'place');
});

test('links with only a place name, or impossible coordinates, just open', () => {
  assert.equal(parseMapLink('https://www.google.com/maps?q=Huacachina+Ica').kind, 'other');
  assert.equal(parseMapLink('https://www.google.com/maps/place/Laguna+de+Huacachina/data=x').kind, 'other');
  assert.equal(parseMapLink('https://www.google.com/maps?q=-140.5,-75.7').kind, 'other');
});
