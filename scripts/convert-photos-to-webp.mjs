#!/usr/bin/env node
/**
 * Optional: turns the photos uploaded BEFORE the WebP conversion into WebP (docs/FOTOS-WEBP.md).
 *
 *   CMS_URL=https://cms.example CMS_TOKEN=<temporary full-access API token> node scripts/convert-photos-to-webp.mjs
 *
 * Without APPLY it only lists the photos that are not WebP yet. With APPLY=true it downloads each one and
 * sends it back with the media library's "replace" (POST /api/upload?id=<id>): the CMS converts it like a new
 * upload and the file keeps its id, so every tour, page or text that uses it shows the new WebP.
 * Strapi's replace also keeps the hash and extension so the URL does not change: the URL still ends in
 * .jpg/.png while the bytes and `mime` are WebP (R2 serves them as image/webp; browsers show them anyway).
 * GIF, videos and PDFs are skipped. Node >= 20, no dependencies.
 *
 *   BACKUP_DIR=<folder>  first downloads EVERY file of the media library there (plus files.json) and checks
 *                        each size against Strapi; stops if anything does not match.
 *   ONLY=<id>            converts just that file (to try one first).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = (process.env.CMS_URL ?? 'http://localhost:1337').replace(/\/+$/, '');
const TOKEN = process.env.CMS_TOKEN;
const APPLY = process.env.APPLY === 'true';
const { BACKUP_DIR, ONLY } = process.env;
const CONVERT = new Set(['image/jpeg', 'image/png', 'image/tiff', 'image/avif']);

if (!TOKEN) {
  console.error('Set CMS_TOKEN (a temporary full-access API token) and CMS_URL if not http://localhost:1337.');
  process.exit(2);
}
const auth = { Authorization: `Bearer ${TOKEN}` };
const urlOf = (f) => (/^https?:\/\//.test(f.url) ? f.url : `${BASE}${f.url}`);

async function call(path, init = {}) {
  const res = await fetch(`${BASE}${path}`, init);
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path}: HTTP ${res.status} ${JSON.stringify(body).slice(0, 300)}`);
  return body;
}

const all = await call('/api/upload/files?sort=id:asc', { headers: auth });

if (BACKUP_DIR) {
  mkdirSync(BACKUP_DIR, { recursive: true });
  writeFileSync(join(BACKUP_DIR, 'files.json'), JSON.stringify(all, null, 2));
  let bytes = 0;
  for (const f of all) {
    const res = await fetch(urlOf(f));
    const buf = Buffer.from(await res.arrayBuffer());
    // `size` is KB (1000 B) rounded to 2 decimals.
    if (!res.ok || Math.abs(buf.length - f.size * 1000) > 10) {
      console.error(`Backup failed for #${f.id} ${f.name}: HTTP ${res.status}, ${buf.length} B vs ${f.size} KB`);
      process.exit(1);
    }
    writeFileSync(join(BACKUP_DIR, `${f.id}_${f.hash}${f.ext}`), buf);
    bytes += buf.length;
  }
  console.log(`Backup: ${all.length} file(s), ${(bytes / 1e6).toFixed(2)} MB in ${BACKUP_DIR}`);
}

const photos = all.filter((f) => CONVERT.has(f.mime) && (!ONLY || String(f.id) === ONLY));
console.log(`${photos.length} photo(s) to convert${APPLY ? '' : ' (dry run: set APPLY=true to convert them)'}`);
let before = 0;
let after = 0;
for (const f of photos) {
  if (!APPLY) {
    console.log(`  #${f.id} ${f.name} ${f.mime} ${f.width}x${f.height} ${f.size} KB`);
    continue;
  }
  const res = await fetch(urlOf(f));
  if (!res.ok) {
    console.log(`  #${f.id} ${f.name}: download failed (HTTP ${res.status}), skipped`);
    continue;
  }
  const form = new FormData();
  form.append('files', new Blob([await res.arrayBuffer()], { type: f.mime }), f.name);
  // Keep what the editors typed (Strapi keeps the folder when none is sent); the name changes to .webp on its own.
  form.append('fileInfo', JSON.stringify({ name: f.name, alternativeText: f.alternativeText, caption: f.caption }));
  const out = await call(`/api/upload?id=${f.id}`, { method: 'POST', headers: auth, body: form });
  const saved = Array.isArray(out) ? out[0] : out;
  if (saved.mime !== 'image/webp') {
    console.error(`#${f.id} came back as ${saved.mime}: this CMS does not convert to WebP yet (deploy it first). Stopped.`);
    process.exit(1);
  }
  before += f.size;
  after += saved.size;
  console.log(`  #${f.id} ${f.name} ${f.size} KB -> ${saved.name} ${saved.width}x${saved.height} ${saved.size} KB`);
}
if (APPLY) console.log(`Total: ${Math.round(before)} KB -> ${Math.round(after)} KB`);
