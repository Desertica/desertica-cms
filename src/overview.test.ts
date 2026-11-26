import assert from 'node:assert/strict';
import { test } from 'node:test';
import { overview } from './overview.ts';
import { tourGaps } from './tour-gaps.ts';

test('tour gaps: a photo is the media or the seeded URL', () => {
  assert.deepEqual(tourGaps({}), ['photo', 'description', 'faqs']);
  const full = { image: { id: 1 }, body: 'x', faqs: [{ id: 1 }] };
  assert.deepEqual(tourGaps(full), []);
  assert.deepEqual(tourGaps({ ...full, body: ' ', description: 'x' }), ['description'], 'the card text alone is not the description');
  assert.deepEqual(tourGaps({ ...full, body: null, lead: 'old' }), [], 'tours not migrated yet still count');
  assert.deepEqual(tourGaps({ ...full, image: null, imageUrl: 'https://x/y.jpg' }), []);
  assert.deepEqual(tourGaps({ ...full, image: null }), ['photo']);
});

const strapi = {
  documents: (uid: string) => ({
    findMany: async (q: any) =>
      uid.includes('page')
        ? q.locale === 'es' ? [{ slug: 'complaints' }] : []
        : [{ documentId: 'a', title: 'Sin nada' }, { documentId: 'b', title: 'Completo', image: { id: 1 } }],
  }),
} as any;

test('overview fills only what the person may read', async () => {
  const all = await overview(strapi, () => true);
  assert.equal(all.legalDrafts![0].slugs.includes('complaints'), false);
  assert.equal(all.legalDrafts![1].slugs.length, 2);
  assert.deepEqual(all.tours!.map((t) => [t.documentId, t.locale, t.gaps]), [['a', 'es', ['photo']], ['a', 'en', ['photo']]]);

  const editor = await overview(strapi, (_action, uid) => !uid.includes('tour'));
  assert.equal(editor.tours, undefined);
  assert.ok(editor.legalDrafts);
});
