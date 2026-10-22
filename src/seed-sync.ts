import fs from 'fs';
import type { Core } from '@strapi/strapi';

export const clean = <T extends Record<string, any>>(obj: T): T =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== '')) as T;

export async function seedLocalized(
  strapi: Core.Strapi,
  uid: string,
  rows: Array<{ base: Record<string, any>; i18n: Record<string, Record<string, any>>; publish: boolean }>,
) {
  for (const row of rows) {
    const status = row.publish ? 'published' : undefined;
    const created = await strapi.documents(uid as any).create({
      locale: 'en',
      ...(status ? { status } : {}),
      data: { ...row.base, ...clean(row.i18n.en) } as any,
    });
    await strapi.documents(uid as any).update({
      documentId: created.documentId,
      locale: 'es',
      ...(status ? { status } : {}),
      data: { ...row.base, ...clean(row.i18n.es) } as any,
    });
  }
}

/**
 * Texts the website gains after the first seed (a new button, the cookie banner) appear as rows in
 * "Textos" without reseeding. Each key is offered once: a row an editor deletes does not come back,
 * and existing rows are never touched. Runs whatever SEED_ON_EMPTY says.
 */
export async function syncNewTranslations(strapi: Core.Strapi, source: string | null) {
  if (!source) return;

  const uid = 'api::translation.translation';
  const store = strapi.store({ type: 'plugin', name: 'desertica', key: 'translations-offered' });
  const offered = new Set<string>(((await store.get({})) as { keys?: string[] } | null)?.keys ?? []);
  const existing = new Set((await strapi.documents(uid as any).findMany({ locale: 'en', fields: ['key'], limit: 5000 })).map((row: any) => row.key));
  const rows = (JSON.parse(fs.readFileSync(source, 'utf8')).translations ?? []).filter((row: any) => !offered.has(row.key));
  const missing = rows.filter((row: any) => !existing.has(row.key));
  await seedLocalized(strapi, uid, missing.map(({ i18n, ...base }: any) => ({ base: clean(base), i18n, publish: false })));
  if (rows.length) {
    await store.set({ value: { keys: [...offered, ...rows.map((row: any) => row.key)] } });
  }

  if (missing.length) strapi.log.info(`[seed] ${missing.length} new translation(s) added`);
}

