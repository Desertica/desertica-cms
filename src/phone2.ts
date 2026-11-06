import type { Core } from '@strapi/strapi';

/** `51912345678` -> `+51 912 345 678`; any other length stays `+digits`. */
export const spacedPhone = (digits: string): string =>
  /^51\d{9}$/.test(digits) ? `+51 ${digits.slice(2).replace(/(\d{3})(?=\d)/g, '$1 ')}` : `+${digits}`;

/**
 * The second number used to be a second WhatsApp (`whatsapp2`); it is now a second phone (`phone2`).
 * Copies a value that was already there so the footer keeps showing it, once. `whatsapp2` stays as data.
 */
export async function migrateWhatsapp2(strapi: Core.Strapi) {
  const store = strapi.store({ type: 'plugin', name: 'desertica', key: 'phone2-migrated' });
  if (await store.get({})) return;
  const uid = 'api::site-setting.site-setting';
  const rows: Array<{ id: number; whatsapp2?: string | null; phone2?: string | null }> = await strapi.db.query(uid).findMany();
  let copied = 0;
  for (const row of rows) {
    if (!row.whatsapp2 || row.phone2) continue;
    await strapi.db.query(uid).update({ where: { id: row.id }, data: { phone2: spacedPhone(row.whatsapp2) } });
    copied++;
  }
  await store.set({ value: { done: true } });
  strapi.log.info(`[bootstrap] Second phone: ${copied} value(s) copied from whatsapp2`);
}
