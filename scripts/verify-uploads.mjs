#!/usr/bin/env node
/**
 * End-to-end check of media uploads against a RUNNING Strapi instance.
 *
 *   CMS_URL=http://localhost:1337 CMS_ADMIN_EMAIL=you@x.pe CMS_ADMIN_PASSWORD=... \
 *     node scripts/verify-uploads.mjs
 *
 * What it does (Node >= 20, no dependencies):
 *   1. logs in to the admin API and creates a temporary Full-access API token;
 *   2. uploads an image, a PNG, a PDF, a WebM and an MP4 through POST /api/upload;
 *   3. attaches them to content (tour dune-buggy, destination huacachina, media-slots
 *      about.video / about.trio, page terms, site-setting, plus a new blog post and product),
 *      in both locales, and publishes;
 *   4. reads everything back WITHOUT credentials, with the same populate queries the Angular
 *      frontend uses, and fetches every file URL (status, content type, size, and for videos
 *      Range requests: 206, Content-Range, Accept-Ranges);
 *   5. restores every document it touched, deletes what it created (documents, files, token) and
 *      confirms the deleted files return 404.
 *
 * Environment:
 *   CMS_URL                 base URL of the CMS (default http://localhost:1337)
 *   CMS_ADMIN_EMAIL/PASSWORD admin credentials (required)
 *   CMS_PUBLIC_URL          expected host of media URLs when PUBLIC_URL is set on the CMS (optional;
 *                           when set, `url` must be absolute and start with it)
 *   SAMPLES_DIR             folder with sand.mp4, sand.webm, sand-poster.jpg and *.png to use real
 *                           media (default: small synthetic files generated in memory)
 *   VERIFY_BIG_MB           also upload a file of that many MB (e.g. 200) to test size limits
 *   KEEP_DATA=true          skip cleanup (debugging only)
 *
 * It is idempotent: leftovers from an interrupted run (files, documents and tokens named
 * `verify-uploads-*`) are removed first. Exit code 1 if any check fails.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const BASE = (process.env.CMS_URL ?? 'http://localhost:1337').replace(/\/+$/, '');
const EMAIL = process.env.CMS_ADMIN_EMAIL;
const PASSWORD = process.env.CMS_ADMIN_PASSWORD;
const PUBLIC_URL = (process.env.CMS_PUBLIC_URL ?? '').replace(/\/+$/, '');
const SAMPLES_DIR = process.env.SAMPLES_DIR;
const BIG_MB = Number(process.env.VERIFY_BIG_MB ?? 0);
const KEEP = process.env.KEEP_DATA === 'true';
const PREFIX = 'verify-uploads';
const LOCALES = ['en', 'es'];

if (!EMAIL || !PASSWORD) {
  console.error('Set CMS_ADMIN_EMAIL and CMS_ADMIN_PASSWORD (and CMS_URL if not http://localhost:1337).');
  process.exit(2);
}

// ---------------------------------------------------------------- reporting
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`);
  return Boolean(ok);
};
const section = (title) => console.log(`\n== ${title}`);

// ---------------------------------------------------------------- http helpers
let token = '';
let adminToken = '';
async function api(method, path, { json, form, auth = token, headers = {} } = {}) {
  const init = { method, headers: { ...headers } };
  if (auth) init.headers.Authorization = `Bearer ${auth}`;
  if (json !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(json);
  }
  if (form) init.body = form;
  const res = await fetch(`${BASE}${path}`, init);
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, ok: res.ok, body };
}
const must = (res, what) => {
  if (!res.ok) throw new Error(`${what}: HTTP ${res.status} ${JSON.stringify(res.body).slice(0, 400)}`);
  return res.body;
};
const qs = (params) => new URLSearchParams(params).toString();

// ---------------------------------------------------------------- sample media
function crc32(buf) {
  let c;
  let crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function png(width, height, seed) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = y * (width * 3 + 1) + 1 + x * 3;
      raw[o] = (x * 255) / width;
      raw[o + 1] = (y * 255) / height;
      raw[o + 2] = seed;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
// 16x16 baseline JPEG (decodable by sharp, so thumbnails are generated).
const JPEG_1X1 = Buffer.from(
  '/9j/4AAQSkZJRgABAQAASABIAAD/4QBMRXhpZgAATU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAEKADAAQAAAABAAAAEAAAAAD/7QA4UGhvdG9zaG9wIDMuMAA4QklNBAQAAAAAAAA4QklNBCUAAAAAABDUHYzZjwCyBOmACZjs+EJ+/8AAEQgAEAAQAwEiAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKC//EALURAAIBAgQEAwQHBQQEAAECdwABAgMRBAUhMQYSQVEHYXETIjKBCBRCkaGxwQkjM1LwFWJy0QoWJDThJfEXGBkaJicoKSo1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoKDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/bAEMADw8PDw8PGg8PGiQaGhokMSQkJCQxPjExMTExPks+Pj4+Pj5LS0tLS0tLS1paWlpaWmlpaWlpdnZ2dnZ2dnZ2dv/bAEMBEhMTHhweNBwcNHtURVR7e3t7e3t7e3t7e3t7e3t7e3t7e3t7e3t7e3t7e3t7e3t7e3t7e3t7e3t7e3t7e3t7e//dAAQAAf/aAAwDAQACEQMRAD8A52G09q1IbT2rUhtPatSG09qKuKDAY3Y//9k=',
  'base64',
);
function pdf() {
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length 44 >>\nstream\nBT /F1 18 Tf 20 40 Td (verify-uploads) Tj ET\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
function filler(total, head) {
  const buf = Buffer.alloc(total);
  head.copy(buf);
  for (let i = head.length; i < total; i++) buf[i] = (i * 31 + 7) & 0xff;
  return buf;
}
const synthMp4 = () => {
  const ftyp = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.from([0, 0, 2, 0]), Buffer.from('isomiso2')]);
  return filler(300_000, ftyp);
};
const synthWebm = () => filler(150_000, Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x84, 0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6d]));

function loadSamples() {
  const real = SAMPLES_DIR && existsSync(SAMPLES_DIR);
  const read = (...p) => readFileSync(join(SAMPLES_DIR, ...p));
  let pngs = [png(32, 32, 40), png(32, 32, 200)];
  let jpg = JPEG_1X1;
  let mp4 = synthMp4();
  let webm = synthWebm();
  if (real) {
    const find = (name) => {
      for (const d of ['.', 'about', 'legal']) {
        const f = join(SAMPLES_DIR, d, name);
        if (existsSync(f)) return readFileSync(f);
      }
      return null;
    };
    jpg = find('sand-poster.jpg') ?? jpg;
    mp4 = find('sand.mp4') ?? mp4;
    webm = find('sand.webm') ?? webm;
    const legal = ['legal', '.'].map((d) => join(SAMPLES_DIR, d)).find((d) => existsSync(d));
    const found = legal ? readdirSync(legal).filter((f) => f.endsWith('.png')).sort() : [];
    if (found.length) pngs = found.slice(0, 2).map((f) => readFileSync(join(legal, f)));
    if (pngs.length === 1) pngs.push(pngs[0]);
    void read;
  }
  return [
    { key: 'jpg', name: `${PREFIX}-image.jpg`, type: 'image/jpeg', data: jpg },
    { key: 'png1', name: `${PREFIX}-one.png`, type: 'image/png', data: pngs[0] },
    { key: 'png2', name: `${PREFIX}-two.png`, type: 'image/png', data: pngs[1] },
    { key: 'pdf', name: `${PREFIX}-itinerary.pdf`, type: 'application/pdf', data: pdf() },
    { key: 'webm', name: `${PREFIX}-video.webm`, type: 'video/webm', data: webm },
    { key: 'mp4', name: `${PREFIX}-video.mp4`, type: 'video/mp4', data: mp4 },
  ];
}

// ---------------------------------------------------------------- content helpers
const mid = (m) => (m && typeof m === 'object' ? m.id : null) ?? null;
const mids = (list) => (Array.isArray(list) ? list.map((m) => m.id) : []);
const tours = {
  path: 'tours',
  media: ['image', 'gallery', 'itineraryFile'],
};
const toComponents = (list, mediaKeys) =>
  (list ?? []).map((item) => {
    const out = { id: item.id };
    for (const [k, v] of Object.entries(item)) {
      if (k === 'id') continue;
      out[k] = mediaKeys.includes(k) ? mid(v) : v;
    }
    return out;
  });

async function findDoc(collection, filters, locale = 'en') {
  const query = { locale, status: 'draft', 'pagination[pageSize]': '1' };
  for (const [k, v] of Object.entries(filters)) query[`filters[${k}][$eq]`] = v;
  const body = must(await api('GET', `/api/${collection}?${qs(query)}`), `find ${collection}`);
  return body.data?.[0] ?? null;
}

// ---------------------------------------------------------------- cleanup of leftovers
async function sweepTokens(adminJwt) {
  const tokens = await api('GET', '/admin/api-tokens', { auth: adminJwt });
  for (const t of tokens.body?.data ?? []) {
    if (String(t.name).startsWith(PREFIX)) await api('DELETE', `/admin/api-tokens/${t.id}`, { auth: adminJwt });
  }
}

async function sweepLeftovers() {
  const files = await api('GET', `/api/upload/files?${qs({ 'filters[name][$startsWith]': PREFIX, 'pagination[pageSize]': '100' })}`);
  for (const f of Array.isArray(files.body) ? files.body : []) await api('DELETE', `/api/upload/files/${f.id}`);
  for (const [collection, slug] of [['blog-posts', `${PREFIX}-post`], ['products', `${PREFIX}-product`]]) {
    for (const locale of LOCALES) {
      const doc = await findDoc(collection, { slug }, locale);
      if (doc) await deleteDoc(collection, doc.documentId);
    }
  }
}

// REST DELETE only removes the locale given (default: the default locale), so delete every locale.
async function deleteDoc(collection, documentId) {
  let ok = true;
  let last = 0;
  for (const locale of LOCALES) {
    const res = await api('DELETE', `/api/${collection}/${documentId}?${qs({ locale })}`);
    last = res.status;
    if (!(res.ok || res.status === 404)) ok = false;
  }
  return { ok, status: last };
}

// ---------------------------------------------------------------- main
const restores = []; // async functions run in reverse order
const created = []; // [collection, documentId]
const uploaded = new Map(); // key -> file object from Strapi
const urlOf = (file) => (file.url.startsWith('http') ? file.url : `${BASE}${file.url}`);

async function main() {
  section('login');
  let login = await api('POST', '/admin/login', { json: { email: EMAIL, password: PASSWORD }, auth: '' });
  if (login.status === 429) {
    // The admin login endpoint is rate limited by Strapi (a few attempts per minute).
    console.log('      admin login rate limited (429); waiting 65 s and retrying once');
    await new Promise((resolve) => setTimeout(resolve, 65_000));
    login = await api('POST', '/admin/login', { json: { email: EMAIL, password: PASSWORD }, auth: '' });
  }
  const adminJwt = must(login, 'admin login').data.token;
  adminToken = adminJwt;
  check('admin login', Boolean(adminJwt));
  await sweepTokens(adminJwt);
  const tokenRes = must(
    await api('POST', '/admin/api-tokens', {
      auth: adminJwt,
      json: { name: `${PREFIX}-${Date.now()}`, description: 'temporary, deleted by scripts/verify-uploads.mjs', type: 'full-access', lifespan: 7 * 24 * 3600 * 1000 },
    }),
    'create api token',
  ).data;
  token = tokenRes.accessKey;
  await sweepLeftovers();
  const tokenId = tokenRes.id;
  restores.push(async () => {
    const res = await api('DELETE', `/admin/api-tokens/${tokenId}`, { auth: adminJwt });
    check('temporary API token deleted', res.ok, `HTTP ${res.status}`);
  });

  try {
    await uploadAll();
    await attachContent();
    await verifyPublicApi();
    await verifyBig();
  } finally {
    if (KEEP) {
      console.log('\nKEEP_DATA=true: skipping cleanup');
    } else {
      section('cleanup');
      for (const fn of restores.reverse()) {
        try {
          await fn();
        } catch (error) {
          check('cleanup step', false, error.message);
        }
      }
    }
  }
}

async function uploadAll() {
  section('uploads (POST /api/upload)');
  const media = loadSamples();
  for (const m of media) {
    const form = new FormData();
    form.append('files', new Blob([m.data], { type: m.type }), m.name);
    form.append('fileInfo', JSON.stringify({ name: m.name, alternativeText: `${PREFIX} ${m.key}` }));
    const res = await api('POST', '/api/upload', { form });
    const file = Array.isArray(res.body) ? res.body[0] : null;
    if (!check(`upload ${m.key}`, (res.status === 200 || res.status === 201) && file, `HTTP ${res.status} ${file ? '' : JSON.stringify(res.body).slice(0, 200)}`)) continue;
    uploaded.set(m.key, { ...file, bytes: m.data.length, type: m.type });
    restores.push(async () => {
      const del = await api('DELETE', `/api/upload/files/${file.id}`);
      check(`delete file ${m.key}`, del.ok, `HTTP ${del.status}`);
      const gone = await fetch(urlOf(file));
      await gone.arrayBuffer();
      check(`deleted file ${m.key} returns 404`, gone.status === 404, `HTTP ${gone.status}`);
    });
    console.log(`      url=${file.url} mime=${file.mime} size=${file.size}KB provider=${file.provider} formats=${Object.keys(file.formats ?? {}).join(',') || '-'}`);
    check(`${m.key} mime`, file.mime === m.type, file.mime);
    check(`${m.key} url is ${PUBLIC_URL ? 'absolute under CMS_PUBLIC_URL' : 'relative (/uploads/...)'}`,
      PUBLIC_URL ? file.url.startsWith(`${PUBLIC_URL}/`) : file.url.startsWith('/uploads/') || file.url.startsWith('http'), file.url);
  }
  if (uploaded.size !== media.length) throw new Error('not every upload succeeded; aborting');
}

// Update helper: snapshot -> write -> register restore.
async function patchLocalized({ collection, documentId, locales = LOCALES, fields, snapshotQuery, build, restore, status }) {
  for (const locale of locales) {
    const before = must(await api('GET', `/api/${collection}/${documentId}?${qs({ locale, status: 'draft', ...snapshotQuery })}`), `snapshot ${collection}`).data;
    const original = restore(before);
    restores.push(async () => {
      const res = await api('PUT', `/api/${collection}/${documentId}?${qs({ locale, ...(status ? { status } : {}) })}`, { json: { data: original } });
      check(`restore ${collection}/${documentId} [${locale}]`, res.ok, `HTTP ${res.status}`);
    });
    const res = await api('PUT', `/api/${collection}/${documentId}?${qs({ locale, ...(status ? { status } : {}) })}`, { json: { data: build(before, locale) } });
    check(`attach ${fields} -> ${collection} [${locale}]`, res.ok, `HTTP ${res.status} ${res.ok ? '' : JSON.stringify(res.body).slice(0, 300)}`);
  }
}

// The REST content API rejects a second locale that reuses a unique non-localized `slug` ("This attribute
// must be unique"), while the Content Manager API (what the admin UI uses) accepts it. So extra locales of
// new documents are created through the Content Manager, with the admin JWT. Media are NOT sent: this also
// proves that non-localized media are copied to the new locale.
async function addLocale(uid, documentId, label, data) {
  const cm = `/content-manager/collection-types/${uid}/${documentId}`;
  const put = await api('PUT', `${cm}?locale=es`, { json: data, auth: adminToken });
  check(`create ${label} (es) via Content Manager`, put.ok, `HTTP ${put.status} ${put.ok ? '' : JSON.stringify(put.body).slice(0, 300)}`);
  const pub = await api('POST', `${cm}/actions/publish?locale=es`, { json: {}, auth: adminToken });
  check(`publish ${label} (es)`, pub.ok, `HTTP ${pub.status} ${pub.ok ? "" : JSON.stringify(pub.body).slice(0, 300)}`);
}

async function attachContent() {
  section('attach media to content and publish');
  const id = (k) => uploaded.get(k).id;

  // tour dune-buggy
  const tour = await findDoc('tours', { slug: 'dune-buggy' });
  if (!tour) throw new Error('tour dune-buggy not found (is the seed loaded?)');
  await patchLocalized({
    collection: 'tours',
    documentId: tour.documentId,
    fields: 'image,gallery,itineraryFile,itinerary[0].image,videos',
    status: 'published',
    snapshotQuery: { 'populate[image]': 'true', 'populate[gallery]': 'true', 'populate[itineraryFile]': 'true', 'populate[itinerary][populate][0]': 'image', 'populate[videos][populate][0]': 'poster', 'populate[videos][populate][1]': 'webm', 'populate[videos][populate][2]': 'mp4' },
    restore: (t) => ({
      image: mid(t.image),
      gallery: mids(t.gallery),
      itineraryFile: mid(t.itineraryFile),
      itinerary: toComponents(t.itinerary, ['image']),
      videos: toComponents(t.videos, ['poster', 'webm', 'mp4']),
    }),
    build: (t) => ({
      image: id('jpg'),
      gallery: [id('jpg'), id('png1')],
      itineraryFile: id('pdf'),
      itinerary: toComponents(t.itinerary, ['image']).map((s, i) => (i === 0 ? { ...s, image: id('png2') } : s)),
      videos: [...toComponents(t.videos, ['poster', 'webm', 'mp4']), { poster: id('jpg'), webm: id('webm'), mp4: id('mp4') }],
    }),
  });

  // destination huacachina: write en only, then check that es sees the non-localized media
  const dest = await findDoc('destinations', { slug: 'huacachina' });
  if (!dest) throw new Error('destination huacachina not found');
  await patchLocalized({
    collection: 'destinations', documentId: dest.documentId, locales: ['en'], fields: 'image (en only)', status: 'published',
    snapshotQuery: { 'populate[image]': 'true' }, restore: (d) => ({ image: mid(d.image) }), build: () => ({ image: id('jpg') }),
  });
  const destEs = must(await api('GET', `/api/destinations/${dest.documentId}?${qs({ locale: 'es', status: 'published', 'populate[image]': 'true' })}`), 'destination es').data;
  check('non-localized media syncs to the other locale (destination.image en -> es)', mid(destEs.image) === id('jpg'), `es image id=${mid(destEs.image)}`);
  restores.push(async () => {
    const res = await api('PUT', `/api/destinations/${dest.documentId}?${qs({ locale: 'es', status: 'published' })}`, { json: { data: { image: null } } });
    check('restore destinations [es] image', res.ok, `HTTP ${res.status}`);
  });

  // media slots
  for (const [key, build, restore, what] of [
    ['about.video', () => ({ video: id('mp4'), poster: id('jpg') }), (s) => ({ video: mid(s.video), poster: mid(s.poster) }), 'video,poster'],
    ['about.trio', () => ({ image: id('png1') }), (s) => ({ image: mid(s.image) }), 'image'],
  ]) {
    const slot = await findDoc('media-slots', { key });
    if (!slot) throw new Error(`media-slot ${key} not found`);
    await patchLocalized({
      collection: 'media-slots', documentId: slot.documentId, fields: `${key}: ${what}`,
      snapshotQuery: { 'populate[image]': 'true', 'populate[video]': 'true', 'populate[poster]': 'true' }, restore, build,
    });
  }

  // page terms
  const page = await findDoc('pages', { slug: 'terms' });
  if (!page) throw new Error('page terms not found');
  await patchLocalized({
    collection: 'pages', documentId: page.documentId, fields: 'terms.heroImage', status: 'published',
    snapshotQuery: { 'populate[heroImage]': 'true' }, restore: (p) => ({ heroImage: mid(p.heroImage) }), build: () => ({ heroImage: id('png2') }),
  });

  // site-setting (single type, no locales, no draft/publish)
  const site = must(await api('GET', `/api/site-setting?${qs({ 'populate[shareImage]': 'true' })}`), 'site-setting').data;
  const siteBefore = mid(site.shareImage);
  restores.push(async () => {
    const res = await api('PUT', '/api/site-setting', { json: { data: { shareImage: siteBefore } } });
    check('restore site-setting.shareImage', res.ok, `HTTP ${res.status}`);
  });
  const siteRes = await api('PUT', '/api/site-setting', { json: { data: { shareImage: id('jpg') } } });
  check('attach site-setting.shareImage', siteRes.ok, `HTTP ${siteRes.status}`);

  // new blog post and product (deleted at the end)
  const post = await api('POST', `/api/blog-posts?${qs({ locale: 'en', status: 'published' })}`, {
    json: { data: { slug: `${PREFIX}-post`, title: 'Verify uploads post', cover: id('jpg'), excerpt: 'x', content: 'x', category: 'test' } },
  });
  check('create blog-post (en, published, cover)', post.ok, `HTTP ${post.status} ${post.ok ? '' : JSON.stringify(post.body).slice(0, 300)}`);
  if (post.ok) {
    created.push(['blog-posts', post.body.data.documentId]);
    restores.push(async () => {
      const res = await deleteDoc('blog-posts', post.body.data.documentId);
      check('delete blog-post (en + es)', res.ok, `HTTP ${res.status}`);
    });
    await addLocale('api::blog-post.blog-post', post.body.data.documentId, 'blog-post', {
      slug: `${PREFIX}-post`, title: 'Verificar subidas', excerpt: 'x', content: 'x', category: 'prueba',
    });
  }
  const product = await api('POST', `/api/products?${qs({ locale: 'en', status: 'published' })}`, {
    json: { data: { slug: `${PREFIX}-product`, title: 'Verify uploads product', price: 1, image: id('png1'), gallery: [id('jpg'), id('png2')], description: 'x', details: 'x' } },
  });
  check('create product (en, published, image+gallery)', product.ok, `HTTP ${product.status} ${product.ok ? '' : JSON.stringify(product.body).slice(0, 300)}`);
  if (product.ok) {
    created.push(['products', product.body.data.documentId]);
    restores.push(async () => {
      const res = await deleteDoc('products', product.body.data.documentId);
      check('delete product (en + es)', res.ok, `HTTP ${res.status}`);
    });
    await addLocale('api::product.product', product.body.data.documentId, 'product', {
      slug: `${PREFIX}-product`, title: 'Verificar producto', description: 'x', details: 'x',
    });
  }
}

// Same populate map as desertica-web/src/app/core/cms/cms-api.ts (POPULATE).
const POPULATE = {
  destinations: { 'populate[image]': 'true' },
  tours: {
    'populate[destination][fields][0]': 'slug', 'populate[image]': 'true', 'populate[gallery]': 'true', 'populate[itineraryFile]': 'true',
    'populate[practices]': 'true', 'populate[paragraphs]': 'true', 'populate[expandedParagraphs]': 'true', 'populate[included]': 'true',
    'populate[excluded]': 'true', 'populate[pack]': 'true', 'populate[notes]': 'true', 'populate[assurances]': 'true',
    'populate[itinerary][populate][0]': 'image', 'populate[videos][populate][0]': 'poster', 'populate[videos][populate][1]': 'webm', 'populate[videos][populate][2]': 'mp4',
  },
  'media-slots': { 'populate[image]': 'true', 'populate[video]': 'true', 'populate[poster]': 'true' },
  pages: { 'populate[heroImage]': 'true' },
  'blog-posts': { 'populate[cover]': 'true' },
  products: { 'populate[image]': 'true', 'populate[gallery]': 'true' },
  'site-setting': { 'populate[shareImage]': 'true' },
};

async function publicList(collection, locale) {
  const out = [];
  for (let page = 1; page < 20; page++) {
    const res = await api('GET', `/api/${collection}?${qs({ ...POPULATE[collection], locale, 'pagination[page]': String(page), 'pagination[pageSize]': '100' })}`, { auth: '' });
    if (!res.ok) throw new Error(`GET ${collection} (public) -> ${res.status}`);
    out.push(...res.body.data);
    if (page >= (res.body.meta?.pagination?.pageCount ?? 1)) break;
  }
  return out;
}

function collectMedia(node, found = new Map()) {
  if (Array.isArray(node)) node.forEach((n) => collectMedia(n, found));
  else if (node && typeof node === 'object') {
    if (typeof node.url === 'string' && typeof node.mime === 'string') found.set(node.url, node);
    Object.values(node).forEach((v) => collectMedia(v, found));
  }
  return found;
}

async function verifyPublicApi() {
  section('public REST API (no credentials, frontend populate queries)');
  const id = (k) => uploaded.get(k).id;
  const seen = new Map();
  const note = (node) => collectMedia(node, seen);

  for (const locale of LOCALES) {
    const t = (await publicList('tours', locale)).find((x) => x.slug === 'dune-buggy');
    note(t);
    check(`tours/dune-buggy [${locale}] image`, mid(t?.image) === id('jpg'));
    check(`tours/dune-buggy [${locale}] gallery (2)`, JSON.stringify(mids(t?.gallery)) === JSON.stringify([id('jpg'), id('png1')]));
    check(`tours/dune-buggy [${locale}] itineraryFile (pdf)`, mid(t?.itineraryFile) === id('pdf'));
    check(`tours/dune-buggy [${locale}] itinerary[0].image`, mid(t?.itinerary?.[0]?.image) === id('png2'));
    const v = t?.videos?.at(-1);
    check(`tours/dune-buggy [${locale}] videos poster/webm/mp4`, mid(v?.poster) === id('jpg') && mid(v?.webm) === id('webm') && mid(v?.mp4) === id('mp4'));

    const d = (await publicList('destinations', locale)).find((x) => x.slug === 'huacachina');
    note(d);
    check(`destinations/huacachina [${locale}] image`, mid(d?.image) === id('jpg'));

    const slots = await publicList('media-slots', locale);
    const video = slots.find((x) => x.key === 'about.video');
    const trio = slots.find((x) => x.key === 'about.trio');
    note([video, trio]);
    check(`media-slots about.video [${locale}] video+poster`, mid(video?.video) === id('mp4') && mid(video?.poster) === id('jpg'));
    check(`media-slots about.trio [${locale}] image`, mid(trio?.image) === id('png1'));

    const p = (await publicList('pages', locale)).find((x) => x.slug === 'terms');
    note(p);
    check(`pages/terms [${locale}] heroImage`, mid(p?.heroImage) === id('png2'));

    const b = (await publicList('blog-posts', locale)).find((x) => x.slug === `${PREFIX}-post`);
    note(b);
    check(`blog-posts [${locale}] cover`, mid(b?.cover) === id('jpg'));

    const pr = (await publicList('products', locale)).find((x) => x.slug === `${PREFIX}-product`);
    note(pr);
    check(`products [${locale}] image + gallery(2)`, mid(pr?.image) === id('png1') && mids(pr?.gallery).length === 2);
  }
  const site = await api('GET', `/api/site-setting?${qs(POPULATE['site-setting'])}`, { auth: '' });
  note(site.body?.data);
  check('site-setting shareImage', mid(site.body?.data?.shareImage) === id('jpg'));

  section('file delivery (public, no credentials)');
  const originals = new Map([...uploaded.values()].map((f) => [f.url, f]));
  console.log(`      ${seen.size} distinct media URLs found in API responses`);
  for (const [url, media] of seen) {
    const abs = url.startsWith('http') ? url : `${BASE}${url}`;
    const original = originals.get(url);
    const res = await fetch(abs);
    const buf = Buffer.from(await res.arrayBuffer());
    const type = res.headers.get('content-type') ?? '';
    const ok = res.status === 200 && type.startsWith(media.mime) && Math.abs(buf.length - (media.sizeInBytes ?? media.size * 1000)) <= 11; // `size` is KB (1000 B) rounded to 2 decimals
    check(`GET ${url}`, ok, `HTTP ${res.status} ${type} ${buf.length}B (API size ${media.sizeInBytes ?? Math.round(media.size * 1000)}B)`);
    if (original && media.mime.startsWith('video/')) await rangeChecks(abs, url, buf.length, res.headers.get('accept-ranges'));
  }
}

async function rangeChecks(abs, url, total, acceptRangesOn200) {
  check(`Accept-Ranges on 200 ${url}`, acceptRangesOn200 === 'bytes', String(acceptRangesOn200));
  const head = await fetch(abs, { method: 'HEAD' });
  check(`HEAD ${url}`, head.status === 200 && Number(head.headers.get('content-length')) === total, `HTTP ${head.status} length=${head.headers.get('content-length')}`);

  const r1 = await fetch(abs, { headers: { Range: 'bytes=0-1023' } });
  const b1 = Buffer.from(await r1.arrayBuffer());
  check(`Range bytes=0-1023 ${url}`, r1.status === 206 && b1.length === 1024 && r1.headers.get('content-range') === `bytes 0-1023/${total}` && r1.headers.get('accept-ranges') === 'bytes',
    `HTTP ${r1.status} content-range=${r1.headers.get('content-range')} accept-ranges=${r1.headers.get('accept-ranges')} got ${b1.length}B`);

  const from = Math.max(total - 100, 0);
  const r2 = await fetch(abs, { headers: { Range: `bytes=${from}-` } });
  const b2 = Buffer.from(await r2.arrayBuffer());
  check(`Range bytes=${from}- (seek to tail) ${url}`, r2.status === 206 && b2.length === total - from && r2.headers.get('content-range') === `bytes ${from}-${total - 1}/${total}`,
    `HTTP ${r2.status} content-range=${r2.headers.get('content-range')} got ${b2.length}B`);

  // Informational: an unsatisfiable range. Browsers do not send these; Strapi's static handler may reset the connection.
  try {
    const r3 = await fetch(abs, { headers: { Range: `bytes=${total + 10}-` } });
    await r3.arrayBuffer();
    console.log(`INFO  Range past end ${url} -> HTTP ${r3.status}`);
  } catch (error) {
    console.log(`INFO  Range past end ${url} -> connection error (${error.cause?.code ?? error.message}); harmless for players`);
  }
}

async function verifyBig() {
  if (!BIG_MB) return;
  section(`size limit: ${BIG_MB} MB upload`);
  const data = Buffer.alloc(BIG_MB * 1024 * 1024, 7);
  const form = new FormData();
  form.append('files', new Blob([data], { type: 'video/mp4' }), `${PREFIX}-big.mp4`);
  const res = await api('POST', '/api/upload', { form });
  const file = Array.isArray(res.body) ? res.body[0] : null;
  check(`upload ${BIG_MB} MB`, (res.status === 200 || res.status === 201) && file, `HTTP ${res.status} ${file ? `size=${file.size}KB` : JSON.stringify(res.body).slice(0, 200)}`);
  if (!file) return;
  restores.push(async () => {
    const del = await api('DELETE', `/api/upload/files/${file.id}`);
    check('delete big file', del.ok, `HTTP ${del.status}`);
  });
  const r = await fetch(urlOf(file), { headers: { Range: 'bytes=0-1023' } });
  await r.arrayBuffer();
  check('Range on big file', r.status === 206, `HTTP ${r.status}`);
}

main()
  .catch((error) => {
    check('script completed', false, error.message);
  })
  .finally(() => {
    const failed = results.filter((r) => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
    if (failed.length) {
      console.log('Failed:');
      for (const f of failed) console.log(`  - ${f.name} ${f.detail}`);
      process.exitCode = 1;
    }
  });
