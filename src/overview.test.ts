import assert from 'node:assert/strict';
import { test } from 'node:test';
import { overview } from './overview.ts';
import { tourGaps } from './tour-gaps.ts';

test('tour gaps: a photo is the media or the seeded URL; meeting is text or map link', () => {
  assert.deepEqual(tourGaps({}), ['photo', 'description', 'meeting', 'waiver', 'faqs']);
  const full = { image: { id: 1 }, description: 'x', meeting: 'x', waiverBody: 'x', faqs: [{ id: 1 }] };
  assert.deepEqual(tourGaps(full), []);
  assert.deepEqual(tourGaps({ ...full, image: null, imageUrl: 'https://x/y.jpg', meeting: ' ', meetingPointUrl: 'https://maps' }), []);
  assert.deepEqual(tourGaps({ ...full, image: null, waiverBody: '' }), ['photo', 'waiver']);
});

const strapi = {
  documents: (uid: string) => ({
    count: async () => (uid.includes('reservation') ? 3 : 2),
    findMany: async (q: any) =>
      uid.includes('page')
        ? q.locale === 'es' ? [{ slug: 'terms' }] : []
        : [{ documentId: 'a', title: 'Sin nada' }, { documentId: 'b', title: 'Completo', image: { id: 1 }, waiverBody: 'x' }],
  }),
} as any;

test('overview fills only what the person may read', async () => {
  const all = await overview(strapi, () => true);
  assert.deepEqual(all.inbox, { reservations: 3, messages: 2 });
  assert.equal(all.legalDrafts![0].slugs.includes('terms'), false);
  assert.equal(all.legalDrafts![1].slugs.length, 7);
  assert.deepEqual(all.tours!.map((t) => [t.documentId, t.locale, t.gaps]), [['a', 'es', ['photo', 'waiver']], ['a', 'en', ['photo', 'waiver']]]);

  const editor = await overview(strapi, (_action, uid) => !uid.includes('reservation'));
  assert.equal(editor.inbox, undefined);
  assert.ok(editor.tours);
});
