import assert from 'node:assert/strict';
import { test } from 'node:test';
import guard from './public-guard.ts';

const run = async (path: string, { multipart = false, query = {} as Record<string, string>, authorization = '' } = {}) => {
  const ctx: any = {
    path,
    query,
    is: (type: string) => multipart && type === 'multipart',
    get: (name: string) => (name === 'authorization' ? authorization : ''),
    throw: (status: number) => {
      ctx.thrown = status;
    },
  };
  let reached = false;
  await guard()(ctx, async () => {
    reached = true;
  });
  return { ctx, reached };
};

test('anonymous multipart is refused everywhere, and the media upload needs credentials', async () => {
  for (const path of ['/api/tours', '/admin/login', '//API/Tours', '/content-manager/x']) {
    const { ctx, reached } = await run(path, { multipart: true });
    assert.equal(ctx.thrown, 415, path);
    assert.equal(reached, false, path);
  }

  for (const path of ['/upload', '/api/upload', '/API/Upload/files']) {
    const anonymous = await run(path, { multipart: true });
    assert.equal(anonymous.ctx.thrown, 401, path);
    assert.equal(anonymous.reached, false, path);
    assert.equal((await run(path, { multipart: true, authorization: 'Bearer x' })).reached, true, path);
  }
});

test('anonymous API requests only see published content, however the path is written', async () => {
  for (const path of ['/api/pages', '/API/Pages', '//api/pages']) {
    const { ctx } = await run(path, { query: { status: 'draft' } });
    assert.equal(ctx.query.status, 'published', path);
  }

  assert.equal((await run('/api/pages', { query: { status: 'draft' }, authorization: 'Bearer x' })).ctx.query.status, 'draft');
  assert.equal((await run('/admin/api', { query: { status: 'draft' } })).ctx.query.status, 'draft');
});
