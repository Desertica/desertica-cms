import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerTourStatusGuard, withoutDestination } from './tour-status.ts';

function middleware(drafts: Array<{ destination?: unknown }> = [{ destination: { id: 1 } }]) {
  let fn: any;
  registerTourStatusGuard({ documents: { use: (f: any) => (fn = f) }, db: { query: () => ({ findMany: async () => drafts }) } } as any);
  return async (uid: string, action: string, locale = 'es') => {
    const ctx = { uid, action, params: { documentId: 'x', locale } };
    let reached = false;
    await fn(ctx, async () => (reached = true));
    return { locale: ctx.params.locale, reached };
  };
}

test('unpublishing a tour applies to every language', async () => {
  const run = middleware();
  assert.equal((await run('api::tour.tour', 'unpublish')).locale, '*');
  assert.equal((await run('api::tour.tour', 'unpublish', 'en')).locale, '*');
});

test('publishing a tour and unpublishing other types keep their language', async () => {
  const run = middleware();
  assert.equal((await run('api::tour.tour', 'publish')).locale, 'es');
  assert.equal((await run('api::page.page', 'unpublish')).locale, 'es');
});

test('a tour with a destination is published', async () => {
  assert.equal((await middleware()('api::tour.tour', 'publish')).reached, true);
});

test('a tour without a destination is refused with a message the editor can act on', async () => {
  const run = middleware([{ destination: null }]);
  await assert.rejects(run('api::tour.tour', 'publish'), /destino/);
});

test('the destination is only checked for tours', async () => {
  assert.equal((await middleware([{ destination: null }])('api::page.page', 'publish')).reached, true);
});

test('counts the drafts that lack a destination', () => {
  assert.equal(withoutDestination([{ destination: { id: 1 } }, { destination: null }, {}]), 2);
  assert.equal(withoutDestination([]), 0);
});
