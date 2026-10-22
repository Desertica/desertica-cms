import fs from 'fs';
import path from 'path';
import type { Core } from '@strapi/strapi';
import { errors } from '@strapi/utils';
import { PLACEHOLDER, missingPlaceholders } from './translate';

type Originals = Record<string, Record<string, string>>;

/** key -> locale -> seed text, only for texts that carry markers. Empty when the seed file is missing. */
function loadOriginals(): Originals {
  const file = [path.join(__dirname, '..', '..', 'seed', 'catalog.json'), path.join(process.cwd(), 'seed', 'catalog.json')].find((f) => fs.existsSync(f));
  const out: Originals = {};
  if (!file) return out;
  for (const row of JSON.parse(fs.readFileSync(file, 'utf8')).translations ?? []) {
    for (const [locale, { value }] of Object.entries<{ value: string }>(row.i18n)) {
      if (value.match(PLACEHOLDER)) (out[row.key] ??= {})[locale] = value;
    }
  }
  return out;
}

/**
 * Rejects saving a "Textos" row that drops a `{marker}` the seed text had: the website would show it raw or blank.
 * shortcut: compares with the seed text, so a marker added later in code is not protected until the seed is regenerated.
 */
export function registerPlaceholderGuard(strapi: Core.Strapi) {
  const originals = loadOriginals();
  strapi.documents.use(async (ctx, next) => {
    const data = (ctx.params as any)?.data;
    if (ctx.uid !== 'api::translation.translation' || !['create', 'update'].includes(ctx.action) || typeof data?.value !== 'string') return next();
    const key = data.key ?? (await strapi.documents(ctx.uid as any).findOne({ documentId: (ctx.params as any).documentId, fields: ['key'] }))?.key;
    const original = originals[key]?.[(ctx.params as any).locale ?? 'en'];
    const missing = original ? missingPlaceholders(original, data.value) : [];
    if (missing.length) throw new errors.ValidationError(`Falta el marcador ${missing.join(', ')} en "${key}". Déjalo tal cual: la web lo reemplaza con el dato real.`);
    return next();
  });
}
