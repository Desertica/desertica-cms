import fs from 'fs';
import path from 'path';
import type { Core } from '@strapi/strapi';
import { ensureSampleTour } from './sample-tour';
import { registerTranslateRoute } from './translate';
import { clean, seedLocalized, syncNewTranslations } from './seed-sync';
import { registerPlaceholderGuard } from './placeholders';
import { COMPONENT_FIELDS, CONTENT_TYPE_FIELDS, type FieldMeta } from './admin-es';

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
const LOCALE_NAMES: Record<string, string> = { en: 'Inglés (en)', es: 'Español (es)' };

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
  const existingDestinations = await strapi.documents(destUid).count({ locale: 'en' });
  if (existingDestinations === 0) {
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

const CM_UID = 'plugin::content-manager.content-types';
const CM_CONFIG_VERSION = 11;

type ListConfig = { fields: string[]; mainField?: string; sortBy?: string; sortOrder?: 'ASC' | 'DESC'; pageSize?: number };
const LIST_CONFIGS: Record<string, ListConfig> = {
  'api::translation.translation': { fields: ['page', 'section', 'key', 'value', 'kind'], mainField: 'key', sortBy: 'page', sortOrder: 'ASC', pageSize: 50 },
  'api::media-slot.media-slot': { fields: ['page', 'section', 'key'], mainField: 'key', sortBy: 'page', sortOrder: 'ASC', pageSize: 50 },
  'api::tour.tour': { fields: ['title', 'destination', 'featured', 'order', 'priceFrom'], mainField: 'title', sortBy: 'order', sortOrder: 'ASC' },
  'api::destination.destination': { fields: ['title', 'order', 'footerOrder'], mainField: 'title', sortBy: 'order', sortOrder: 'ASC' },
  // Legal texts and hub pages share this list: sorted by slug so cancellation, complaints, conduct, cookies, legal-mincetur, privacy and terms sit together.
  'api::page.page': { fields: ['title', 'slug', 'updatedAt'], mainField: 'title', sortBy: 'slug', sortOrder: 'ASC', pageSize: 25 },
  'api::reservation.reservation': { fields: ['tourTitle', 'date', 'adults', 'children', 'status'], mainField: 'tourTitle', sortBy: 'createdAt', sortOrder: 'DESC' },
  'api::contact-message.contact-message': { fields: ['name', 'email', 'handled', 'createdAt'], mainField: 'name', sortBy: 'createdAt', sortOrder: 'DESC' },
};

/** Which field of the related entry relations display (otherwise Strapi picks the first string). */
const RELATION_MAIN_FIELDS: Record<string, Record<string, string>> = {
  'api::tour.tour': { destination: 'title' },
  'api::destination.destination': { tours: 'title' },
};

const row = (...fields: Array<[string, number]>) => fields.map(([name, size]) => ({ name, size }));

/** Edit-view layouts (rows of fields, 12 columns wide). Content types: uid -> rows. A field left out of a layout disappears from the form. */
const EDIT_LAYOUTS: Record<string, Array<Array<{ name: string; size: number }>>> = {
  'api::tour.tour': [
    row(['title', 8], ['slug', 4]),
    row(['destination', 6], ['order', 3], ['featured', 3]),
    row(['priceFrom', 4], ['durationHours', 4], ['format', 4]),
    row(['languages', 12]),
    row(['lead', 12]),
    row(['description', 12]),
    row(['image', 8], ['imageFocus', 4]),
    row(['gallery', 12]),
    row(['meeting', 12]),
    row(['meetingPointUrl', 12]),
    row(['latitude', 6], ['longitude', 6]),
    row(['itinerary', 12]),
    row(['practices', 12]),
    row(['included', 12]),
    row(['excluded', 12]),
    row(['pack', 12]),
    row(['notes', 12]),
    row(['paragraphs', 12]),
    row(['expandedParagraphs', 12]),
    row(['termsSummary', 12]),
    row(['videos', 12]),
    row(['itineraryFile', 12]),
    row(['assurances', 12]),
    row(['faqs', 12]),
    row(['waiverBody', 12]),
    row(['seoTitle', 12]),
    row(['seoDescription', 12]),
    // Fallbacks for external images; rarely needed once photos are uploaded.
    row(['imageUrl', 12]),
    row(['galleryUrls', 12]),
    row(['itineraryFileUrl', 12]),
  ],
  'api::destination.destination': [
    row(['title', 8], ['slug', 4]),
    row(['lead', 12]),
    row(['allLabel', 12]),
    row(['image', 12]),
    row(['order', 4], ['footerOrder', 4], ['showInFooter', 4]),
    row(['tours', 12]),
    row(['imageUrl', 12]),
  ],
  'api::page.page': [
    row(['title', 8], ['slug', 4]),
    row(['lead', 12]),
    row(['body', 12]),
    row(['heroImage', 12]),
    row(['seoTitle', 12]),
    row(['seoDescription', 12]),
    row(['heroImageUrl', 12]),
  ],
  'api::media-slot.media-slot': [
    row(['key', 6], ['page', 3], ['section', 3]),
    row(['description', 12]),
    row(['image', 12]),
    row(['alt', 12]),
    row(['video', 6], ['poster', 6]),
    row(['imageUrl', 12]),
    row(['videoUrl', 6], ['videoWebmUrl', 6]),
    row(['posterUrl', 12]),
  ],
  'api::site-setting.site-setting': [
    row(['brandName', 6], ['legalName', 6]),
    row(['ruc', 6], ['legalYear', 6]),
    row(['email', 6], ['phone', 6]),
    row(['whatsapp', 12]),
    row(['instagram', 6], ['facebook', 6]),
    row(['tiktok', 6], ['youtube', 6]),
    row(['linkedin', 6], ['google', 6]),
    row(['tripadvisor', 12]),
    row(['shareImage', 12]),
    row(['shareImageUrl', 12]),
  ],
  'api::booking-setting.booking-setting': [
    row(['availabilityMonths', 6], ['currencyCode', 6]),
    row(['adultsMin', 6], ['adultsDefault', 6]),
    row(['childrenMin', 6], ['childrenDefault', 6]),
    row(['peopleMax', 12]),
    row(['assurances', 12]),
    row(['depositRate', 12]),
  ],
  'api::theme-setting.theme-setting': [
    row(['fontSans', 6], ['fontHeading', 6]),
    row(['radius', 6], ['headerSize', 6]),
    row(['light', 12]),
    row(['dark', 12]),
    row(['introEnabled', 6], ['introAccent', 6]),
    row(['introRestScale', 6], ['introFailsafeMs', 6]),
  ],
};

const SINGLE_TYPE_TITLES: Record<string, string> = {
  'api::theme-setting.theme-setting': 'fontSans',
  'api::booking-setting.booking-setting': 'currencyCode',
  'api::site-setting.site-setting': 'brandName',
};

/** Component layouts: uid -> rows. Grouped as surfaces, brand, text, states, accents. */
const COMPONENT_LAYOUTS: Record<string, Array<Array<{ name: string; size: number }>>> = {
  'theme.palette': [
    // Surfaces
    row(['background', 6], ['foreground', 6]),
    row(['card', 6], ['cardForeground', 6]),
    row(['popover', 6], ['popoverForeground', 6]),
    // Brand
    row(['primary', 6], ['primaryForeground', 6]),
    row(['secondary', 6], ['secondaryForeground', 6]),
    row(['accent', 6], ['accentForeground', 6]),
    // Text
    row(['muted', 6], ['mutedForeground', 6]),
    // States
    row(['destructive', 6], ['border', 6]),
    row(['input', 6], ['ring', 6]),
    // Accents
    row(['tierra', 6], ['tierraForeground', 6]),
    row(['arena', 6], ['arenaForeground', 6]),
  ],
};

/** Spanish label, hint and placeholder for each field (see src/admin-es.ts); list columns get the same label. */
function applyFieldMeta(metadatas: Record<string, any>, fields: Record<string, FieldMeta> = {}) {
  for (const [field, meta] of Object.entries(fields)) {
    const current = metadatas[field];
    if (!current) continue;
    metadatas[field] = {
      ...current,
      edit: {
        ...current.edit,
        label: meta.label,
        ...(meta.description !== undefined ? { description: meta.description } : {}),
        ...(meta.placeholder !== undefined ? { placeholder: meta.placeholder } : {}),
      },
      list: { ...current.list, label: meta.label },
    };
  }
}

async function configureContentManager(strapi: Core.Strapi) {
  const store = strapi.store({ type: 'plugin', name: 'desertica', key: 'content-manager-config' });
  const done = (await store.get({})) as { version?: number } | null;
  if (done?.version === CM_CONFIG_VERSION) return;

  const service = strapi.service(CM_UID as any) as any;
  const uids = new Set([
    ...Object.keys(LIST_CONFIGS),
    ...Object.keys(CONTENT_TYPE_FIELDS),
    ...Object.keys(RELATION_MAIN_FIELDS),
    ...Object.keys(EDIT_LAYOUTS),
  ]);
  for (const uid of uids) {
    try {
      const contentType = strapi.contentType(uid as any);
      const current = await service.findConfiguration(contentType);
      const settings = { ...current.settings };
      const layouts = { ...current.layouts };
      const metadatas = { ...current.metadatas };

      const list = LIST_CONFIGS[uid];
      if (list) {
        settings.mainField = list.mainField ?? settings.mainField;
        settings.defaultSortBy = list.sortBy ?? settings.defaultSortBy;
        settings.defaultSortOrder = list.sortOrder ?? settings.defaultSortOrder;
        if (list.pageSize) settings.pageSize = list.pageSize;
        layouts.list = list.fields;
      }
      if (EDIT_LAYOUTS[uid]) layouts.edit = EDIT_LAYOUTS[uid];
      // The edit header shows the main field; without this a single type titles itself with its first string (a hex color).
      if (SINGLE_TYPE_TITLES[uid]) settings.mainField = SINGLE_TYPE_TITLES[uid];
      for (const [field, mainField] of Object.entries(RELATION_MAIN_FIELDS[uid] ?? {})) {
        const meta = metadatas[field];
        if (meta) {
          metadatas[field] = {
            ...meta,
            edit: { ...meta.edit, mainField },
            list: { ...meta.list, mainField },
          };
        }
      }
      applyFieldMeta(metadatas, CONTENT_TYPE_FIELDS[uid]);
      await service.updateConfiguration(contentType, { settings, layouts, metadatas });
    } catch (error) {
      strapi.log.error(`[bootstrap] content-manager config failed for ${uid}: ${(error as Error).message}`);
    }
  }
  const components = strapi.service('plugin::content-manager.components') as any;
  for (const uid of new Set([...Object.keys(COMPONENT_LAYOUTS), ...Object.keys(COMPONENT_FIELDS)])) {
    try {
      const component = strapi.components[uid as keyof typeof strapi.components] as any;
      const current = await components.findConfiguration(component);
      const metadatas = { ...current.metadatas };
      applyFieldMeta(metadatas, COMPONENT_FIELDS[uid]);
      await components.updateConfiguration(component, {
        settings: current.settings,
        layouts: { ...current.layouts, ...(COMPONENT_LAYOUTS[uid] ? { edit: COMPONENT_LAYOUTS[uid] } : {}) },
        metadatas,
      });
    } catch (error) {
      strapi.log.error(`[bootstrap] component config failed for ${uid}: ${(error as Error).message}`);
    }
  }
  // Locales created by earlier versions have English display names; the language switcher shows these.
  for (const [code, name] of Object.entries(LOCALE_NAMES)) {
    try {
      await strapi.db.query('plugin::i18n.locale').update({ where: { code }, data: { name } });
    } catch (error) {
      strapi.log.error(`[bootstrap] locale name failed for ${code}: ${(error as Error).message}`);
    }
  }
  await store.set({ value: { version: CM_CONFIG_VERSION } });
  strapi.log.info('[bootstrap] content-manager configuration applied');
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
