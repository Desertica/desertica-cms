import type { Core } from '@strapi/strapi';

/** Website walk-through order; the list of "Textos" and "Medios" follows it instead of the alphabet. */
export const PAGE_ORDER = ['global', 'navigation', 'footer', 'home', 'tours', 'tour-detail', 'booking', 'about', 'contact', 'blog', 'products', 'legal', 'accessibility', 'brand'];

const PAGE_ES: Record<string, string> = {
  global: 'Todo el sitio', navigation: 'Menú', footer: 'Pie de página', home: 'Inicio', tours: 'Tours', 'tour-detail': 'Detalle del tour',
  booking: 'Reserva', about: 'Nosotros', contact: 'Contacto', blog: 'Blog', products: 'Tienda', legal: 'Textos legales', accessibility: 'Accesibilidad', brand: 'Marca',
};

type Row = { page?: string | null; section?: string | null; key?: string | null };

/** `<NN>-<page>|<section>|<key>`: NN is the page's place in the walk-through.
 * shortcut: no padding, so a section named `x-y` would sort before `x`; no such sections exist, pad if one appears. */
export function sortKey({ page, section, key }: Row): string {
  const index = PAGE_ORDER.indexOf((page ?? '').toLowerCase());
  const at = String(index < 0 ? PAGE_ORDER.length : index).padStart(2, '0');
  return `${at}-${page ?? ''}|${section ?? ''}|${key ?? ''}`.toLowerCase();
}

const words = (text: string) => text.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[-_.]/g, ' ').toLowerCase();

/** "Página › Sección › Nombre" for the list column; the key already says what the text is for. */
export function readableLabel({ page, section, key }: Row): string {
  const name = words((key ?? '').split('.').slice(1).join('.') || (key ?? ''));
  return [PAGE_ES[page ?? ''] ?? page, section && words(section), name].filter(Boolean).join(' › ');
}

const UIDS = ['api::translation.translation', 'api::media-slot.media-slot'];

/** Keeps `sortKey` (and the translation `label`) in step with page, section and key on every write. */
export function registerSortKey(strapi: Core.Strapi) {
  const fill = async (event: any) => {
    const data = event.params.data;
    if (!data || !['page', 'section', 'key'].some((f) => f in data)) return;
    const where = event.action === 'beforeUpdate' ? event.params.where : null;
    const current = where ? ((await strapi.db.query(event.model.uid).findOne({ where })) ?? {}) : {};
    const row = { page: data.page ?? current.page, section: data.section ?? current.section, key: data.key ?? current.key };
    data.sortKey = sortKey(row);
    if (event.model.uid === UIDS[0]) data.label = readableLabel(row);
  };
  strapi.db.lifecycles.subscribe({ models: UIDS, beforeCreate: fill, beforeUpdate: fill });
}

/** Fills existing rows (every locale); idempotent, runs on each boot and only writes what differs. */
export async function backfillSortKeys(strapi: Core.Strapi) {
  let changed = 0;
  for (const uid of UIDS) {
    const rows: any[] = await strapi.db.query(uid).findMany({});
    for (const row of rows) {
      const data: Record<string, string> = { sortKey: sortKey(row) };
      if (uid === UIDS[0]) data.label = readableLabel(row);
      if (Object.entries(data).every(([k, v]) => row[k] === v)) continue;
      await strapi.db.query(uid).update({ where: { id: row.id }, data });
      changed++;
    }
  }
  if (changed) strapi.log.info(`[bootstrap] sortKey: ${changed} row(s) updated`);
}
