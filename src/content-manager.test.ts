import assert from 'node:assert/strict';
import { test } from 'node:test';
import { configureContentManager } from './content-manager.ts';

function fakeStrapi(failUid?: string) {
  let stored: unknown = null;
  const config = { findConfiguration: async (ct: { uid?: string }) => {
    if (failUid && ct.uid === failUid) throw new Error('boom');
    return { settings: {}, layouts: {}, metadatas: {} };
  }, updateConfiguration: async () => {} };
  const strapi: any = {
    store: () => ({ get: async () => stored, set: async ({ value }: any) => { stored = value; } }),
    service: () => config,
    contentType: (uid: string) => ({ uid }),
    components: new Proxy({}, { get: () => ({}) }),
    db: { query: () => ({ update: async () => {} }) },
    log: { info() {}, error() {} },
  };
  return { strapi, stored: () => stored };
}

test('the configuration is marked done only when no type failed', async () => {
  const bad = fakeStrapi('api::tour.tour');
  await configureContentManager(bad.strapi);
  assert.equal(bad.stored(), null);

  const good = fakeStrapi();
  await configureContentManager(good.strapi);
  assert.ok((good.stored() as { version: number }).version > 0);
});
