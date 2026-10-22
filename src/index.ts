import fs from 'fs';
import path from 'path';
import type { Core } from '@strapi/strapi';
import { ensureSampleTour } from './sample-tour';
import { registerTranslateRoute } from './translate';
import { catalogNeedsSeed, clean, markCatalogSeeded, seedLocalized, syncNewTranslations } from './seed-sync';
import { registerPlaceholderGuard } from './placeholders';
import { LOCALE_NAMES, configureContentManager } from './content-manager';

const PUBLIC_ACTIONS = [
  'api::destination.destination.find',
  'api::destination.destination.findOne',
  'api::tour.tour.find',
  'api::tour.tour.findOne',
  ...['site-setting', 'theme-setting', 'booking-setting', 'form-setting', 'navigation'].map((n) => `api::${n}.${n}.find`),
  'api::reservation.reservation.create',
  'api::contact-message.contact-message.create',
  ...['translation', 'media-slot', 'page', 'blog-post', 'product'].flatMap((n) => [
    `api::${n}.${n}.find`,
    `api::${n}.${n}.findOne`,
  ]),
];

const LOCALES = ['en', 'es'] as const;

async function ensureLocales(strapi: Core.Strapi) {
  const service = strapi.plugin('i18n').service('locales');
  const existing: Array<{ code: string }> = await service.find();
  for (const code of LOCALES) {
    if (!existing.some((l) => l.code === code)) {
      await service.create({ code, name: LOCALE_NAMES[code], isDefault: code === 'en' });
      strapi.log.info(`[bootstrap] locale "${code}" created`);
    }
  }
}

async function grantPublicPermissions(strapi: Core.Strapi) {
  const role = await strapi.db.query('plugin::users-permissions.role').findOne({ where: { type: 'public' } });
  if (!role) {
    strapi.log.warn('[bootstrap] public role not found; permissions not granted');
    return;
  }
  const permQuery = strapi.db.query('plugin::users-permissions.permission');
  for (const action of PUBLIC_ACTIONS) {
    const found = await permQuery.findOne({ where: { action, role: role.id } });
    if (!found) {
      await permQuery.create({ data: { action, role: role.id } });
      strapi.log.info(`[bootstrap] public permission granted: ${action}`);
    }
  }

  // users-permissions ships the Public role with register, login and password-reset routes; anyone could
  // create an account. The Public role is exactly PUBLIC_ACTIONS.
  const { count } = (await permQuery.deleteMany({ where: { role: role.id, action: { $notIn: PUBLIC_ACTIONS } } })) as { count: number };
  if (count) strapi.log.info(`[bootstrap] ${count} extra public permission(s) removed`);
}

const items = (list: string[] = []) => list.filter(Boolean).map((text) => ({ text }));
const features = (list: any[] = []) => list.map((f) => clean({ icon: f.icon, title: f.title, body: f.body }));

async function seedExtras(strapi: Core.Strapi, source: string) {
  const catalog = JSON.parse(fs.readFileSync(source, 'utf8'));

  if ((await strapi.documents('api::translation.translation' as any).count({ locale: 'en' })) === 0) {
    const rows = (catalog.translations ?? []).map(({ i18n, ...base }: any) => ({
      base: clean(base), i18n, publish: false,
    }));
    await seedLocalized(strapi, 'api::translation.translation', rows);
    strapi.log.info(`[seed] ${rows.length} translations created`);
  }

  if ((await strapi.documents('api::media-slot.media-slot' as any).count({ locale: 'en' })) === 0) {
    const rows = (catalog.mediaSlots ?? []).map(({ key, ...rest }: any) => ({
      base: clean({ key, ...rest }), i18n: { en: {}, es: {} }, publish: false,
    }));
    await seedLocalized(strapi, 'api::media-slot.media-slot', rows);
    strapi.log.info(`[seed] ${rows.length} media slots created`);
  }

  if ((await strapi.documents('api::page.page' as any).count({ locale: 'en' })) === 0) {
    // Hub pages go live; the legal texts are seeded empty and stay drafts until someone writes and publishes them.
    const rows = (catalog.pages ?? []).map((p: any) => ({ base: { slug: p.slug }, i18n: p.i18n, publish: ['blog', 'products'].includes(p.slug) }));
    await seedLocalized(strapi, 'api::page.page', rows);
    strapi.log.info(`[seed] ${rows.length} pages created`);
  }
}

function seedSource(): string | null {
  const file = path.join(__dirname, '..', '..', 'seed', 'catalog.json');
  const altFile = path.join(process.cwd(), 'seed', 'catalog.json');
  const source = fs.existsSync(file) ? file : altFile;
  return fs.existsSync(source) ? source : null;
}

/**
 * Editor permissions per content type. Strapi's built-in Editor has no locales on its permissions (so every list
 * comes back empty on a fresh database), can delete everything and reads the inbox (customers' names, e-mails and
 * WhatsApp numbers). Only a Super Admin deletes tours, destinations and pages; the inbox, company data, colors,
 * booking rules, forms and menus (the `Sitio` group) are not the Editor's. Applied once; an admin can change the
 * role from Settings > Roles afterwards and the change is kept.
 */
const EDITOR_RIGHTS: Record<string, string[]> = {
  'api::tour.tour': ['create', 'read', 'update', 'publish'],
  'api::destination.destination': ['create', 'read', 'update', 'publish'],
  'api::page.page': ['create', 'read', 'update', 'publish'],
  'api::blog-post.blog-post': ['create', 'read', 'update', 'delete', 'publish'],
  'api::product.product': ['create', 'read', 'update', 'delete', 'publish'],
  // Seeded rows the website looks up by key: edited, never created or deleted here.
  'api::translation.translation': ['read', 'update'],
  'api::media-slot.media-slot': ['read', 'update'],
};

async function restrictEditorRole(strapi: Core.Strapi) {
  const store = strapi.store({ type: 'plugin', name: 'desertica', key: 'editor-permissions' });
  if (await store.get({})) return;

  const role = await strapi.db.query('admin::role').findOne({ where: { code: 'strapi-editor' } });
  if (!role) return;

  // assignPermissions replaces the whole set: keep what is not content-manager (media library, plugins).
  const prefix = 'plugin::content-manager.explorer.';
  const kept = (await strapi.db.query('admin::permission').findMany({ where: { role: role.id } }))
    .filter((p: any) => !p.action.startsWith(prefix))
    .map(({ action, subject, properties, conditions }: any) => ({ action, subject, properties, conditions }));
  const explicit = Object.entries(EDITOR_RIGHTS).flatMap(([subject, actions]) =>
    actions.map((action) => ({ action: `${prefix}${action}`, subject, properties: { locales: [...LOCALES] }, conditions: [] })),
  );
  await strapi.service('admin::role').assignPermissions(role.id, [...kept, ...explicit]);
  await store.set({ value: { done: true } });
  strapi.log.info(`[bootstrap] Editor role: ${explicit.length} content permission(s) set`);
}

async function seedCatalog(strapi: Core.Strapi) {
  if (process.env.SEED_ON_EMPTY === 'false') return;

  const destUid = 'api::destination.destination';
  const tourUid = 'api::tour.tour';
  const settingUid = 'api::site-setting.site-setting';

  const source = seedSource();
  if (!source) {
    strapi.log.warn('[seed] seed/catalog.json not found; skipping');
    return;
  }

  // shortcut: tours are seeded inside the destinations branch, so a crash between them leaves a catalog without tours; upgrade by seeding tours on their own count.
  if (await catalogNeedsSeed(strapi, destUid)) {
    const catalog = JSON.parse(fs.readFileSync(source, 'utf8'));
    strapi.log.info('[seed] seeding catalog...');

    const destinationIds = new Map<string, string>();
    for (const d of catalog.destinations) {
      const base = clean({
        slug: d.slug,
        order: d.order,
        footerOrder: d.footerOrder,
        showInFooter: d.showInFooter,
        imageUrl: d.imageUrl,
      });
      const created = await strapi.documents(destUid).create({
        locale: 'en',
        status: 'published',
        data: { ...base, ...clean(d.i18n.en) } as any,
      });
      await strapi.documents(destUid).update({
        documentId: created.documentId,
        locale: 'es',
        status: 'published',
        data: { ...base, ...clean(d.i18n.es) } as any,
      });
      destinationIds.set(d.slug, created.documentId);
    }

    for (const t of catalog.tours) {
      const destinationId = destinationIds.get(t.destination);
      const base = clean({
        slug: t.slug,
        order: t.order,
        durationHours: t.durationHours,
        priceFrom: t.priceFrom,
        featured: t.featured,
        format: t.format,
        languages: t.languages,
        imageUrl: t.imageUrl,
        galleryUrls: t.galleryUrls,
        itineraryFileUrl: t.itineraryFileUrl,
      });
      const localized = (l: any) =>
        clean({
          title: l.title,
          description: l.description,
          lead: l.lead,
          seoTitle: l.seoTitle,
          seoDescription: l.seoDescription,
          assurances: features(l.assurances),
          meeting: l.meeting,
          paragraphs: items(l.paragraphs),
          expandedParagraphs: items(l.expandedParagraphs),
          termsSummary: l.termsSummary,
          videos: (l.videos ?? []).map((v: any) => clean({ posterUrl: v.posterUrl, webmUrl: v.webmUrl, mp4Url: v.mp4Url })),
          practices: features(l.practices),
          itinerary: (l.itinerary ?? []).map((s: any) => clean({ imageUrl: s.imageUrl, title: s.title, body: s.body, expandedBody: s.expandedBody })),
          included: items(l.included),
          excluded: items(l.excluded),
          pack: items(l.pack),
          notes: items(l.notes),
        });
      const relation = destinationId ? { destination: { connect: [{ documentId: destinationId }] } } : {};
      const created = await strapi.documents(tourUid).create({
        locale: 'en',
        status: 'published',
        data: { ...base, ...localized(t.i18n.en), ...relation } as any,
      });
      await strapi.documents(tourUid).update({
        documentId: created.documentId,
        locale: 'es',
        status: 'published',
        data: { ...base, ...localized(t.i18n.es), ...relation } as any,
      });
    }
    strapi.log.info(`[seed] created ${catalog.destinations.length} destinations and ${catalog.tours.length} tours`);
  }
  // Also marks databases that already had a catalog before the mark existed.
  await markCatalogSeeded(strapi);

  await seedExtras(strapi, source);

  await seedSingles(strapi, source);
}

/** Single types are seeded once: a missing document means "never seeded". */
async function seedSingles(strapi: Core.Strapi, source: string) {
  const catalog = JSON.parse(fs.readFileSync(source, 'utf8'));
  const exists = (uid: string, locale?: string) =>
    strapi.documents(uid as any).findFirst(locale ? { locale } : {});

  const siteUid = 'api::site-setting.site-setting';
  if (catalog.siteSetting && !(await exists(siteUid))) {
    await strapi.documents(siteUid).create({ data: clean(catalog.siteSetting) as any });
    strapi.log.info('[seed] site-setting created');
  }

  const palette = (p: Record<string, any> = {}) => clean(p);
  const themeUid = 'api::theme-setting.theme-setting';
  if (catalog.themeSetting && !(await exists(themeUid))) {
    const { light, dark, ...rest } = catalog.themeSetting;
    await strapi.documents(themeUid).create({ data: { ...clean(rest), light: palette(light), dark: palette(dark) } as any });
    strapi.log.info('[seed] theme-setting created');
  }

  const formUid = 'api::form-setting.form-setting';
  if (catalog.formSetting && !(await exists(formUid))) {
    await strapi.documents(formUid).create({ data: clean(catalog.formSetting) as any });
    strapi.log.info('[seed] form-setting created');
  }

  const bookingUid = 'api::booking-setting.booking-setting';
  if (catalog.bookingSetting && !(await exists(bookingUid, 'en'))) {
    const { i18n, ...base } = catalog.bookingSetting;
    const localized = (l: any) => ({ assurances: features(l.assurances) });
    const created = await strapi.documents(bookingUid).create({ locale: 'en', data: { ...clean(base), ...localized(i18n.en) } as any });
    await strapi.documents(bookingUid).update({ documentId: created.documentId, locale: 'es', data: { ...clean(base), ...localized(i18n.es) } as any });
    strapi.log.info('[seed] booking-setting created');
  }

  const navUid = 'api::navigation.navigation';
  if (catalog.navigation && !(await exists(navUid, 'en'))) {
    const links = (list: any[] = []) => list.map((l) => clean({ label: l.label, path: l.path, fragment: l.fragment, kind: l.kind }));
    const localized = (l: any) =>
      clean({
        headerLinks: links(l.headerLinks),
        footerBrandLinks: links(l.footerBrandLinks),
        footerLegalLinks: links(l.footerLegalLinks),
        planTripLabel: l.planTripLabel,
        planTripPath: l.planTripPath,
      });
    const { i18n } = catalog.navigation;
    const created = await strapi.documents(navUid).create({ locale: 'en', data: localized(i18n.en) as any });
    await strapi.documents(navUid).update({ documentId: created.documentId, locale: 'es', data: localized(i18n.es) as any });
    strapi.log.info('[seed] navigation created');
  }
}

/** Legal pages created empty (as drafts) when missing, once per database; editors fill and publish them. */
const EXTRA_PAGES = [
  { slug: 'cancellation', title: { en: 'Cancellation and refund policy', es: 'Política de cancelación y reembolso' } },
  { slug: 'cookies', title: { en: 'Cookie policy', es: 'Política de cookies' } },
];

async function ensureExtraPages(strapi: Core.Strapi) {
  const store = strapi.store({ type: 'plugin', name: 'desertica', key: 'extra-pages' });
  if (await store.get({})) return;
  const uid = 'api::page.page' as any;
  for (const { slug, title } of EXTRA_PAGES) {
    const found = await strapi.documents(uid).findFirst({ locale: 'en', filters: { slug } });
    if (found) continue;
    const created = await strapi.documents(uid).create({ locale: 'en', data: { slug, title: title.en } as any });
    await strapi.documents(uid).update({ documentId: created.documentId, locale: 'es', data: { slug, title: title.es } as any });
    strapi.log.info(`[seed] empty draft page "${slug}" created`);
  }
  await store.set({ value: { done: true } });
}

export default {
  register({ strapi }: { strapi: Core.Strapi }) {
    registerTranslateRoute(strapi);
    registerPlaceholderGuard(strapi);
    // The example secrets are public in the repo: signing admin tokens with them would open the panel.
    const placeholders = ['APP_KEYS', 'API_TOKEN_SALT', 'ADMIN_JWT_SECRET', 'TRANSFER_TOKEN_SALT', 'ENCRYPTION_KEY', 'JWT_SECRET'].filter((key) =>
      /changeMe/i.test(process.env[key] ?? ''),
    );
    if (process.env.NODE_ENV === 'production' && placeholders.length) {
      throw new Error(`Placeholder secrets in production: ${placeholders.join(', ')}. Generate real values.`);
    }

    // Without it every visitor shares the proxy's IP: ten form submissions in ten minutes for the whole website.
    if (process.env.NODE_ENV === 'production' && !process.env.FORMS_PROXY_SECRET) {
      throw new Error('FORMS_PROXY_SECRET is required in production (the same value as the website).');
    }
  },

  async bootstrap({ strapi }: { strapi: Core.Strapi }) {
    try {
      await ensureLocales(strapi);
    } catch (error) {
      strapi.log.error(`[bootstrap] ensureLocales failed: ${(error as Error).message}`);
    }
    try {
      await grantPublicPermissions(strapi);
    } catch (error) {
      strapi.log.error(`[bootstrap] permissions failed: ${(error as Error).message}`);
    }
    try {
      await restrictEditorRole(strapi);
    } catch (error) {
      strapi.log.error(`[bootstrap] editor role failed: ${(error as Error).message}`);
    }
    try {
      await configureContentManager(strapi);
    } catch (error) {
      strapi.log.error(`[bootstrap] content-manager config failed: ${(error as Error).message}`);
    }
    try {
      await seedCatalog(strapi);
    } catch (error) {
      strapi.log.error(`[seed] failed (boot continues): ${(error as Error).stack ?? error}`);
    }
    if (process.env.SEED_SAMPLE_TOUR === 'true') {
      try {
        await ensureSampleTour(strapi);
      } catch (error) {
        strapi.log.error(`[seed] sample tour failed (boot continues): ${(error as Error).stack ?? error}`);
      }
    }
    try {
      await syncNewTranslations(strapi, seedSource());
    } catch (error) {
      strapi.log.error(`[seed] translation sync failed (boot continues): ${(error as Error).stack ?? error}`);
    }
    try {
      await ensureExtraPages(strapi);
    } catch (error) {
      strapi.log.error(`[seed] extra pages failed (boot continues): ${(error as Error).message}`);
    }
  },
};
