import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildBody } from './tour-body.ts';

test('body is the lead followed by the paragraphs, as the page showed them', () => {
  assert.equal(buildBody({ lead: 'Uno.', paragraphs: [{ text: 'Dos.' }, { text: 'Tres.' }] }), 'Uno.\n\nDos.\n\nTres.');
});

test('a missing lead falls back to the card description, like the website did', () => {
  assert.equal(buildBody({ lead: null, description: 'Tarjeta.', paragraphs: [{ text: 'Dos.' }] }), 'Tarjeta.\n\nDos.');
});

test('blank entries are dropped and nothing gives an empty body', () => {
  assert.equal(buildBody({ lead: ' ', description: '', paragraphs: [{ text: '  ' }, { text: null }] }), '');
  assert.equal(buildBody({}), '');
});
