import type { Core } from '@strapi/strapi';

/**
 * The tour page used to show `lead` and then each `paragraphs` entry; `body` is the same text in one field.
 * Same fallback the website had: a missing `lead` was the card `description`.
 */
export function buildBody(row: { lead?: string | null; description?: string | null; paragraphs?: Array<{ text?: string | null }> | null }): string {
  return [row.lead || row.description, ...(row.paragraphs ?? []).map((p) => p.text)]
    .map((part) => (part ?? '').trim())
    .filter(Boolean)
    .join('\n\n');
}

/**
 * Fills `body` once from the old fields, on every row (draft and published, each language), without touching them:
 * the old fields stay as they were, so this can be undone. Rows that already have a `body` are left alone.
 */
export async function migrateTourBody(strapi: Core.Strapi) {
  const store = strapi.store({ type: 'plugin', name: 'desertica', key: 'tour-body-migrated' });
  if (await store.get({})) return;

  const uid = 'api::tour.tour';
  const rows: any[] = await strapi.db.query(uid).findMany({ populate: ['paragraphs'] });
  let filled = 0;
  for (const row of rows) {
    if (row.body) continue;
    const body = buildBody(row);
    if (!body) continue;
    await strapi.db.query(uid).update({ where: { id: row.id }, data: { body } });
    filled++;
  }
  await store.set({ value: { done: true } });
  strapi.log.info(`[bootstrap] Tour body: ${filled} of ${rows.length} row(s) filled`);
}
