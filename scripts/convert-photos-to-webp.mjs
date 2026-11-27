#!/usr/bin/env node
/**
 * Optional: turns the photos uploaded BEFORE the WebP conversion into WebP (docs/FOTOS-WEBP.md).
 *
 *   CMS_URL=https://cms.example CMS_ADMIN_EMAIL=you@x.pe CMS_ADMIN_PASSWORD=... node scripts/convert-photos-to-webp.mjs
 *   ... APPLY=true node scripts/convert-photos-to-webp.mjs
 *
 * Without APPLY it only lists the photos that are not WebP yet. With APPLY=true it downloads each one and
 * sends it back with the media library's "replace" (POST /upload?id=<id>): the CMS converts it like a new
 * upload and the file keeps its id, so every tour, page or text that uses it shows the new WebP.
 * Strapi's replace also keeps the hash and extension so the URL does not change: the URL still ends in
 * .jpg/.png while the bytes and `mime` are WebP (R2 serves them as image/webp; browsers show them anyway).
 * GIF, videos and PDFs are skipped. Node >= 20, no dependencies.
 */
const BASE = (process.env.CMS_URL ?? 'http://localhost:1337').replace(/\/+$/, '');
const { CMS_ADMIN_EMAIL: email, CMS_ADMIN_PASSWORD: password } = process.env;
const APPLY = process.env.APPLY === 'true';
const CONVERT = new Set(['image/jpeg', 'image/png', 'image/tiff', 'image/avif']);

if (!email || !password) {
  console.error('Set CMS_ADMIN_EMAIL and CMS_ADMIN_PASSWORD (and CMS_URL if not http://localhost:1337).');
  process.exit(2);
}

async function call(path, init = {}) {
  const res = await fetch(`${BASE}${path}`, init);
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path}: HTTP ${res.status} ${JSON.stringify(body).slice(0, 300)}`);
  return body;
}

const login = await call('/admin/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
});
const auth = { Authorization: `Bearer ${login.data.token}` };

const photos = [];
for (let page = 1; ; page++) {
  const { results, pagination } = await call(`/upload/files?page=${page}&pageSize=100&sort=id:asc`, { headers: auth });
  photos.push(...results.filter((f) => CONVERT.has(f.mime)));
  if (page >= pagination.pageCount) break;
}

console.log(`${photos.length} photo(s) to convert${APPLY ? '' : ' (dry run: set APPLY=true to convert them)'}`);
let before = 0;
let after = 0;
for (const f of photos) {
  if (!APPLY) {
    console.log(`  #${f.id} ${f.name} ${f.mime} ${f.width}x${f.height} ${f.size} KB`);
    continue;
  }
  const res = await fetch(/^https?:\/\//.test(f.url) ? f.url : `${BASE}${f.url}`);
  if (!res.ok) {
    console.log(`  #${f.id} ${f.name}: download failed (HTTP ${res.status}), skipped`);
    continue;
  }
  const form = new FormData();
  form.append('files', new Blob([await res.arrayBuffer()], { type: f.mime }), f.name);
  // Keep what the editors typed (Strapi keeps the folder when none is sent); the name changes to .webp on its own.
  form.append('fileInfo', JSON.stringify({ name: f.name, alternativeText: f.alternativeText, caption: f.caption }));
  const out = await call(`/upload?id=${f.id}`, { method: 'POST', headers: auth, body: form });
  const saved = Array.isArray(out) ? out[0] : out;
  before += f.size;
  after += saved.size;
  console.log(`  #${f.id} ${f.name} ${f.size} KB -> ${saved.name} ${saved.width}x${saved.height} ${saved.size} KB`);
}
if (APPLY) console.log(`Total: ${Math.round(before)} KB -> ${Math.round(after)} KB`);
