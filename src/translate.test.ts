import assert from 'node:assert/strict';
import { test } from 'node:test';
import { plan } from './translate.ts';

const strapi = {
  components: {
    'shared.stop': { attributes: { title: { type: 'string' }, body: { type: 'text' }, imageUrl: { type: 'string' }, image: { type: 'media' } } },
    'shared.nav-link': { attributes: { label: { type: 'string' }, path: { type: 'string' } } },
  },
} as any;

const localized = { pluginOptions: { i18n: { localized: true } } };
const attrs = {
  slug: { type: 'uid', ...localized },
  order: { type: 'integer' },
  title: { type: 'string', ...localized },
  notes: { type: 'text' }, // not localized: shared between languages, never translated
  body: { type: 'customField', customField: 'plugin::ckeditor5.CKEditor', ...localized },
  itinerary: { type: 'component', component: 'shared.stop', repeatable: true, ...localized },
  links: { type: 'component', component: 'shared.nav-link', repeatable: true, ...localized },
};

test('collects only localized copy and rebuilds it with the translations, keeping values and media', () => {
  const texts: string[] = [];
  const steps = plan(strapi, attrs as any, {
    slug: 'dune-buggy',
    order: 1,
    title: 'Dune buggy',
    notes: 'do not touch',
    body: '## Hello',
    itinerary: [{ id: 7, title: 'Stop', body: 'Text', imageUrl: 'https://x/y.jpg', image: { id: 42 } }],
    links: [{ id: 8, label: 'Tours', path: '/tours' }],
  }, true, texts);

  assert.deepEqual(texts, ['Dune buggy', '## Hello', 'Stop', 'Text', 'Tours']);

  let i = 0;
  const out = Object.fromEntries(steps.map((step) => step(() => `ES:${texts[i++]}`)));
  assert.deepEqual(out, {
    title: 'ES:Dune buggy',
    body: 'ES:## Hello',
    itinerary: [{ title: 'ES:Stop', body: 'ES:Text', imageUrl: 'https://x/y.jpg', image: 42 }],
    links: [{ label: 'ES:Tours', path: '/tours' }],
  });
});

test('skips empty and missing fields', () => {
  const texts: string[] = [];
  assert.equal(plan(strapi, attrs as any, { title: '   ', body: null }, true, texts).length, 0);
  assert.deepEqual(texts, []);
});
