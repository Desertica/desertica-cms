import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { catalogNeedsSeed, markCatalogSeeded, syncNewTranslations } from './seed-sync.ts';

const row = (key: string, en: string) => ({ key, page: 'booking', i18n: { en: { value: en }, es: { value: `es ${en}` } } });

function fakeStrapi(rows: Array<{ key: string; value: string }>) {
  const stored: any[] = [];
  let store: any = null;
  return {
    stored,
    log: { info() {} },
    store: () => ({ get: async () => store, set: async ({ value }: any) => { store = value; } }),
    documents: () => ({
      findMany: async () => rows,
      create: async ({ data }: any) => { const d = { documentId: `d${stored.length}`, ...data }; stored.push(d); return d; },
      update: async ({ documentId, locale, data }: any) => { stored.push({ documentId, locale, ...data }); },
    }),
  } as any;
}

test('sync adds only new keys, leaves edited rows alone and never re-adds a deleted one', async () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'seed-')), 'catalog.json');
  fs.writeFileSync(file, JSON.stringify({ translations: [row('booking.lead', 'seed lead'), row('waiver.thanks', 'Thanks')] }));
  const strapi = fakeStrapi([{ key: 'booking.lead', value: 'EDITED by a partner' }]);

  await syncNewTranslations(strapi, file);
  assert.deepEqual(strapi.stored.filter((d: any) => d.locale === undefined).map((d: any) => d.key), ['waiver.thanks']);
  assert.ok(!strapi.stored.some((d: any) => d.value === 'seed lead'));

  // an editor deletes the new row; the next boot must not bring it back
  strapi.stored.length = 0;
  await syncNewTranslations(strapi, file);
  assert.equal(strapi.stored.length, 0);
});

test('the catalog is seeded only on a database that was never seeded', async () => {
  let mark: unknown = null;
  const strapi = (count: number) => ({
    store: () => ({ get: async () => mark, set: async ({ value }: any) => { mark = value; } }),
    documents: () => ({ count: async () => count }),
  }) as any;

  assert.equal(await catalogNeedsSeed(strapi(0), 'x'), true);
  assert.equal(await catalogNeedsSeed(strapi(3), 'x'), false);

  await markCatalogSeeded(strapi(0));
  // every destination unpublished or deleted on purpose: the count is 0 again, the seed must not return
  assert.equal(await catalogNeedsSeed(strapi(0), 'x'), false);
});
