#!/usr/bin/env node
/**
 * One-off migration of the media library from the local provider (public/uploads) to S3/R2.
 *
 * Run it INSIDE the CMS container (/opt/app), already started with UPLOAD_PROVIDER=aws-s3 and the
 * S3_* variables (docs/DEPLOY.md, "Pasar los medios a R2"):
 *
 *   node scripts/migrate-uploads-to-s3.mjs --dry-run   # only lists what it would do
 *   node scripts/migrate-uploads-to-s3.mjs
 *
 * 1. Every plugin::upload.file with provider "local": uploads the original and each format
 *    (thumbnail, small, medium, large) from public/uploads with the configured provider, then
 *    updates url, provider and formats[].url in one write.
 * 2. Every text field (string, text, richtext / CKEditor Markdown) of content types and components:
 *    rewrites /uploads/<name> (relative or on PUBLIC_URL) to S3_PUBLIC_URL, only for files already in
 *    the bucket.
 *
 * Idempotent: migrated files are no longer "local" and rewritten texts no longer match. Nothing is
 * deleted from disk. Exit code 1 if anything failed (run it again: it retries only what is left).
 * Needs `npm run build` first (it reads dist/), which the image already has.
 */
import { createReadStream, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

// CommonJS on purpose: the ESM build of @strapi/core does not load under plain Node (named lodash imports).
const require = createRequire(import.meta.url);
const { createStrapi } = require('@strapi/strapi');
const {
  localUploadName,
  mediaUrl,
  migratedData,
  migratedNames,
  needsMigration,
  rewriteUploadUrls,
  uploadItems,
} = require('../dist/src/media-migration.js');

const DRY = process.argv.includes('--dry-run');
const PUBLIC_URL = (process.env.S3_PUBLIC_URL ?? '').replace(/\/+$/, '');
const ROOT_PATH = process.env.S3_ROOT_PATH ?? '';
const CMS_URLS = [process.env.PUBLIC_URL ?? ''].filter(Boolean);
const FILE_UID = 'plugin::upload.file';

if (process.env.UPLOAD_PROVIDER !== 'aws-s3' || !PUBLIC_URL) {
  console.error('Hace falta UPLOAD_PROVIDER=aws-s3 y S3_PUBLIC_URL (ver docs/DEPLOY.md).');
  process.exit(2);
}

const appDir = process.cwd();
const strapi = await createStrapi({ appDir, distDir: join(appDir, 'dist') }).load();
strapi.log.level = 'warn';
const summary = { migrados: 0, omitidos: 0, errores: 0, textos: 0, enlaces: 0, erroresTexto: 0 };
const mode = DRY ? '[simulación] ' : '';

try {
  const uploadsDir = join(strapi.dirs.static.public, 'uploads');
  const provider = strapi.plugin('upload').service('provider');
  const files = await strapi.db.query(FILE_UID).findMany({ orderBy: { id: 'asc' } });
  const wouldMigrate = []; // dry run: what step 1 would have put in the bucket

  // 1. Files.
  for (const file of files) {
    if (!needsMigration(file)) {
      summary.omitidos++;
      continue;
    }
    try {
      const items = uploadItems(file);
      const missing = items.filter((i) => !existsSync(join(uploadsDir, i.name)));
      if (missing.length) throw new Error(`no está en disco: ${missing.map((i) => i.name).join(', ')}`);
      const urls = new Map();
      for (const item of items) {
        if (DRY) {
          urls.set(item.format, mediaUrl(PUBLIC_URL, ROOT_PATH, item.name));
          continue;
        }
        // Same hash and ext as the local file, so the key in the bucket is the same name; a re-run overwrites it.
        const upload = { hash: item.hash, ext: item.ext, mime: item.mime, getStream: () => createReadStream(join(uploadsDir, item.name)) };
        await provider.upload(upload);
        urls.set(item.format, upload.url);
      }
      const data = migratedData(file, urls);
      if (DRY) wouldMigrate.push(...items.map((i) => i.name));
      else await strapi.db.query(FILE_UID).update({ where: { id: file.id }, data });
      console.log(`${mode}archivo ${file.id} ${localUploadName(file.url)} -> ${data.url} (${items.length} objetos)`);
      summary.migrados++;
    } catch (err) {
      summary.errores++;
      console.error(`ERROR archivo ${file.id} (${file.url}): ${err?.message ?? err}`);
    }
  }

  // 2. Texts: only links to files already in the bucket (or, in a dry run, that step 1 would put there).
  const after = DRY ? files : await strapi.db.query(FILE_UID).findMany();
  const known = migratedNames(after, PUBLIC_URL, ROOT_PATH);
  for (const name of wouldMigrate) known.add(name);

  // shortcut: json/blocks/dynamic-zone fields are not scanned (no media URLs in them today); add them if that changes.
  const models = [
    ...Object.values(strapi.contentTypes).filter((m) => m.uid.startsWith('api::')),
    ...Object.values(strapi.components),
  ];
  for (const model of models) {
    const fields = Object.entries(model.attributes)
      .filter(([, a]) => ['string', 'text', 'richtext'].includes(a.type))
      .map(([name]) => name);
    if (!fields.length) continue;
    const rows = await strapi.db.query(model.uid).findMany({ select: ['id', ...fields] });
    for (const row of rows) {
      const data = {};
      let count = 0;
      for (const field of fields) {
        if (typeof row[field] !== 'string' || !row[field].includes('/uploads/')) continue;
        const r = rewriteUploadUrls(row[field], { publicUrl: PUBLIC_URL, rootPath: ROOT_PATH, cmsUrls: CMS_URLS, known });
        if (r.count) {
          data[field] = r.text;
          count += r.count;
        }
      }
      if (!count) continue;
      try {
        const changed = Object.keys(data).join(', ');
        // db.query on purpose: the document service would trigger the DeepL auto-translation.
        if (!DRY) await strapi.db.query(model.uid).update({ where: { id: row.id }, data });
        console.log(`${mode}texto ${model.uid} #${row.id} (${changed}): ${count} enlaces`);
        summary.textos++;
        summary.enlaces += count;
      } catch (err) {
        summary.erroresTexto++;
        console.error(`ERROR texto ${model.uid} #${row.id}: ${err?.message ?? err}`);
      }
    }
  }
} finally {
  console.log(`\n${mode}Resumen: ${JSON.stringify(summary)}`);
  await strapi.destroy();
}
process.exit(summary.errores || summary.erroresTexto ? 1 : 0);
