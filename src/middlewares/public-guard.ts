/**
 * Two holes in the public API, both reachable without credentials:
 * - multipart bodies are written to disk before permissions are checked, so anonymous uploads fill the disk on any
 *   route (`/api/tours`, `/admin/login`...); only the media upload (`/upload`, `/api/upload`) accepts them.
 * - `?status=draft` returns unpublished drafts (unapproved legal text, new prices) to the Public role.
 * The path is lowercased and slashes collapsed because the router matches `/API/Tours` and `//api/tours` too.
 */
export default () => async (ctx: any, next: () => Promise<unknown>) => {
  const path = ctx.path.toLowerCase().replace(/^\/+/, '/');
  if (ctx.is('multipart') && !/^\/(api\/)?upload(\/|$)/.test(path)) {
    return ctx.throw(415);
  }

  if (/^\/api(\/|$)/.test(path) && !ctx.get('authorization') && ctx.query.status && ctx.query.status !== 'published') {
    ctx.query = { ...ctx.query, status: 'published' };
  }

  await next();
};
