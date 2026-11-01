import type { Core } from '@strapi/strapi';
import { errors } from '@strapi/utils';

/** Types whose slug is built from the title and then fixed. */
export const SLUG_TYPES = ['api::tour.tour', 'api::destination.destination', 'api::blog-post.blog-post', 'api::product.product'];
/** Types with a photo gallery that is capped. */
export const GALLERY_TYPES = ['api::tour.tour', 'api::product.product'];
export const GALLERY_MAX = 6;

/** "Dunas y Oasis: Ica" -> "dunas-y-oasis-ica" (no accents, only a-z 0-9 and hyphens). */
export const slugify = (text: string): string =>
  text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/** `base`, or `base-2`, `base-3`... the first one not in `taken`. */
export function uniqueSlug(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

/** The team (any admin who is not a Super Admin) cannot change a slug once the entry exists. */
export const slugChangeBlocked = (stored: string | null | undefined, next: unknown, superAdmin: boolean): boolean =>
  !superAdmin && !!stored && typeof next === 'string' && next !== stored;

export const galleryError = (gallery: unknown): string | null =>
  Array.isArray(gallery) && gallery.length > GALLERY_MAX ? `La galería admite como máximo ${GALLERY_MAX} fotos (hay ${gallery.length}). Quita algunas y guarda de nuevo.` : null;

/** The slug a language version should take from its siblings: only when this version has none and another one does. */
export function slugToInherit(rows: Array<{ slug: string | null; locale: string }>, locale: string): string | null {
  if (rows.some((r) => r.locale === locale && r.slug)) return null;
  return rows.find((r) => r.slug)?.slug ?? null;
}

/** Admin user behind the current request, or null when the call is not from the admin panel (API token, seed, scripts). */
function adminUser(strapi: Core.Strapi): { roles?: Array<{ code: string }> } | null {
  const ctx = strapi.requestContext.get() as any;
  return ctx?.state?.user?.roles ? ctx.state.user : null;
}

/** Creates the slug from the title, locks it afterwards for non-Super Admins and caps the galleries. */
export function registerEditorRules(strapi: Core.Strapi) {
  strapi.documents.use(async (ctx, next) => {
    const params = ctx.params as any;
    const data = params?.data;
    if (!data || !['create', 'update'].includes(ctx.action)) return next();

    if (GALLERY_TYPES.includes(ctx.uid)) {
      const error = galleryError(data.gallery);
      if (error) throw new errors.ValidationError(error);
    }

    if (SLUG_TYPES.includes(ctx.uid)) {
      if (ctx.action === 'create' && !data.slug && typeof data.title === 'string') {
        const base = slugify(data.title);
        if (base) {
          const rows: Array<{ slug: string }> = await strapi.db.query(ctx.uid as any).findMany({ where: { slug: { $startsWith: base } }, select: ['slug'] });
          data.slug = uniqueSlug(base, rows.map((r) => r.slug));
        }
      } else if (ctx.action === 'update' && data.slug) {
        const user = adminUser(strapi);
        if (user && !user.roles!.some((r) => r.code === 'strapi-super-admin')) {
          const stored = await strapi.documents(ctx.uid as any).findOne({ documentId: params.documentId, fields: ['slug'] });
          if (slugChangeBlocked((stored as any)?.slug, data.slug, false)) throw new errors.ValidationError('La dirección web (slug) no se puede cambiar una vez creada.');
        }
      } else if (ctx.action === 'update' && params.documentId) {
        // A new language version (the automatic or manual translation) starts without slug, and the editor cannot type one: copy it from the other language.
        const locale = params.locale ?? (await strapi.plugin('i18n').service('locales').getDefaultLocale());
        const rows: Array<{ slug: string | null; locale: string }> = await strapi.db.query(ctx.uid as any).findMany({ where: { documentId: params.documentId }, select: ['slug', 'locale'] });
        const inherited = slugToInherit(rows, locale);
        if (inherited) data.slug = inherited;
      }
    }
    return next();
  });
}

/** Free-text icons saved before the field became a list: a close name moves to it, anything else to a neutral check. */
const ICON_ALIASES: Record<string, string> = { lucideShield: 'lucideShieldCheck' };
export const fixIcon = (value: string, allowed: readonly string[]): string => (allowed.includes(value) ? value : (ICON_ALIASES[value] ?? 'lucideCheck'));

/** Saving a feature whose stored icon is not in the list would fail; rewrites such values (every boot, one cheap query). */
export async function migrateIcons(strapi: Core.Strapi) {
  const allowed: string[] = (strapi.components['shared.feature'] as any).attributes.icon.enum;
  const rows: Array<{ id: number; icon: string }> = await strapi.db.query('shared.feature').findMany({ where: { icon: { $notNull: true, $notIn: allowed } } });
  for (const { id, icon } of rows) {
    await strapi.db.query('shared.feature').update({ where: { id }, data: { icon: fixIcon(icon, allowed) } });
    strapi.log.warn(`[bootstrap] icon "${icon}" -> "${fixIcon(icon, allowed)}"`);
  }
}
