import fs from 'fs';
import path from 'path';
import type { Core } from '@strapi/strapi';

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
const LOCALE_NAMES: Record<string, string> = { en: 'English (en)', es: 'Spanish (es)' };

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
}

const clean = <T extends Record<string, any>>(obj: T): T =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== '')) as T;

const items = (list: string[] = []) => list.filter(Boolean).map((text) => ({ text }));
const features = (list: any[] = []) => list.map((f) => clean({ icon: f.icon, title: f.title, body: f.body }));

async function seedLocalized(
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
    const rows = (catalog.pages ?? []).map((p: any) => ({ base: { slug: p.slug }, i18n: p.i18n, publish: true }));
    await seedLocalized(strapi, 'api::page.page', rows);
    strapi.log.info(`[seed] ${rows.length} pages created`);
  }
}

async function seedCatalog(strapi: Core.Strapi) {
  if (process.env.SEED_ON_EMPTY === 'false') return;

  const destUid = 'api::destination.destination';
  const tourUid = 'api::tour.tour';
  const settingUid = 'api::site-setting.site-setting';

  const file = path.join(__dirname, '..', '..', 'seed', 'catalog.json');
  const altFile = path.join(process.cwd(), 'seed', 'catalog.json');
  const source = fs.existsSync(file) ? file : altFile;
  if (!fs.existsSync(source)) {
    strapi.log.warn('[seed] seed/catalog.json not found; skipping');
    return;
  }

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

const CM_UID = 'plugin::content-manager.content-types';
const CM_CONFIG_VERSION = 5;

type ListConfig = { fields: string[]; mainField?: string; sortBy?: string; sortOrder?: 'ASC' | 'DESC'; pageSize?: number };
const LIST_CONFIGS: Record<string, ListConfig> = {
  'api::translation.translation': { fields: ['page', 'section', 'key', 'value', 'kind'], mainField: 'key', sortBy: 'page', sortOrder: 'ASC', pageSize: 50 },
  'api::media-slot.media-slot': { fields: ['page', 'section', 'key'], mainField: 'key', sortBy: 'page', sortOrder: 'ASC', pageSize: 50 },
  'api::tour.tour': { fields: ['title', 'destination', 'featured', 'order', 'priceFrom'], mainField: 'title', sortBy: 'order', sortOrder: 'ASC' },
  'api::destination.destination': { fields: ['title', 'order', 'footerOrder'], mainField: 'title', sortBy: 'order', sortOrder: 'ASC' },
  'api::reservation.reservation': { fields: ['tourTitle', 'date', 'adults', 'children', 'status'], mainField: 'tourTitle', sortBy: 'createdAt', sortOrder: 'DESC' },
  'api::contact-message.contact-message': { fields: ['name', 'email', 'handled', 'createdAt'], mainField: 'name', sortBy: 'createdAt', sortOrder: 'DESC' },
};

/** Editor-facing hints shown under fields in the edit view: uid -> field -> description. */
/** Which field of the related entry relations display (otherwise Strapi picks the first string). */
const RELATION_MAIN_FIELDS: Record<string, Record<string, string>> = {
  'api::tour.tour': { destination: 'title' },
  'api::destination.destination': { tours: 'title' },
};

const row = (...fields: Array<[string, number]>) => fields.map(([name, size]) => ({ name, size }));

/** Edit-view layouts (rows of fields, 12 columns wide). Content types: uid -> rows. */
const EDIT_LAYOUTS: Record<string, Array<Array<{ name: string; size: number }>>> = {
  'api::theme-setting.theme-setting': [
    row(['fontSans', 6], ['fontHeading', 6]),
    row(['radius', 6], ['headerSize', 6]),
    row(['light', 12]),
    row(['dark', 12]),
    row(['introEnabled', 6], ['introAccent', 6]),
    row(['introRestScale', 6], ['introFailsafeMs', 6]),
  ],
};

const SINGLE_TYPE_TITLES: Record<string, string> = { 'api::theme-setting.theme-setting': 'fontSans' };

/** Component layouts: uid -> rows, and per-field hints. Grouped as surfaces, brand, text, states, accents. */
const COMPONENT_CONFIGS: Record<string, { layout: Array<Array<{ name: string; size: number }>>; hints: Record<string, string> }> = {
  'theme.palette': {
    layout: [
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
    hints: {
      background: 'Surfaces: page background.',
      foreground: 'Surfaces: main text color on the page.',
      card: 'Surfaces: background of cards and panels.',
      cardForeground: 'Surfaces: text on cards.',
      popover: 'Surfaces: background of menus and popups.',
      popoverForeground: 'Surfaces: text in menus and popups.',
      primary: 'Brand: main color (buttons, links, highlights).',
      primaryForeground: 'Brand: text and icons on primary buttons.',
      secondary: 'Brand: secondary buttons and soft blocks.',
      secondaryForeground: 'Brand: text on secondary blocks.',
      accent: 'Brand: hover and selected states.',
      accentForeground: 'Brand: text on accent areas.',
      muted: 'Text: subtle background (tags, disabled, skeletons).',
      mutedForeground: 'Text: secondary text (captions, hints).',
      destructive: 'States: errors and dangerous actions.',
      border: 'States: lines and dividers.',
      input: 'States: outline of form fields.',
      ring: 'States: focus outline.',
      tierra: 'Accents: terracotta tone used in highlights.',
      tierraForeground: 'Accents: text on the terracotta tone.',
      arena: 'Accents: sand tone used in soft sections.',
      arenaForeground: 'Accents: text on the sand tone.',
    },
  },
};

const FIELD_HINTS: Record<string, Record<string, string>> = {
  'api::translation.translation': {
    key: 'Technical key used by the website. Do not change it.',
    page: 'Page where this text appears.',
    section: 'Block of the page (hero, form, errors...).',
    label: 'Where and what this text is.',
    note: 'Internal hint for editors (not public).',
    value: 'The text shown on the site, one per language.',
  },
  'api::media-slot.media-slot': {
    key: 'Technical key used by the website. Do not change it.',
    image: 'Uploaded image; takes priority over Image URL.',
    imageUrl: 'External image URL, used when no image is uploaded.',
  },
  'api::theme-setting.theme-setting': {
    light: 'Colors of the light theme. Click a swatch to open the color picker.',
    dark: 'Colors of the dark theme (applied when the visitor uses dark mode).',
    fontSans: 'Body text font. Radio Canada = current look; Inter/Poppins/Montserrat/DM Sans = clean sans-serif; Playfair Display/Lora/Merriweather = serif; System = the visitor device font.',
    fontHeading: 'Headings font. Same options as body text; a serif here with a sans body gives an editorial look.',
    radius: 'Corner roundness of cards, inputs and buttons. None = square corners, Small = slightly softened, Medium = default, Large = very round, Full = pill-shaped buttons.',
    headerSize: 'Height of the top bar. Compact = 3rem to 4rem, Standard = 3.5rem to 5rem, Tall = 4rem to 6rem (phone to desktop).',
    introEnabled: 'Show the animated logo intro on the first visit.',
    introAccent: 'Color of the intro animation.',
    introRestScale: 'Final scale of the logo in the intro (0.85 = 85%).',
    introFailsafeMs: 'Milliseconds after which the intro is dismissed no matter what.',
  },
  'api::booking-setting.booking-setting': {
    depositRate: 'Fraction charged as deposit, from 0 to 1 (0.2 = 20%).',
    peopleMax: 'Maximum adults + children per booking.',
    currencyCode: 'ISO currency code, for example USD.',
    assurances: 'Reassurance bullets next to the booking form. A tour can override them.',
  },
  'api::form-setting.form-setting': { messageMax: 'Maximum characters in the contact message.' },
  'api::navigation.navigation': {
    headerLinks: 'Kind "tours-menu" marks the item whose dropdown is built from destinations and tours.',
  },
  'api::destination.destination': {
    order: 'Order in menus and the tours page.',
    footerOrder: 'Order of the destination column in the footer.',
    showInFooter: 'Show this destination in the footer.',
  },
  'api::tour.tour': {
    assurances: 'Optional. Replaces the global assurances (Site — Booking rules) for this tour.',
    seoTitle: 'Page title for search engines. Empty = tour title.',
    seoDescription: 'Meta description. Empty = tour description.',
  },
};

async function configureContentManager(strapi: Core.Strapi) {
  const store = strapi.store({ type: 'plugin', name: 'desertica', key: 'content-manager-config' });
  const done = (await store.get({})) as { version?: number } | null;
  if (done?.version === CM_CONFIG_VERSION) return;

  const service = strapi.service(CM_UID as any) as any;
  const uids = new Set([
    ...Object.keys(LIST_CONFIGS),
    ...Object.keys(FIELD_HINTS),
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
      for (const [field, description] of Object.entries(FIELD_HINTS[uid] ?? {})) {
        if (metadatas[field]) metadatas[field] = { ...metadatas[field], edit: { ...metadatas[field].edit, description } };
      }
      await service.updateConfiguration(contentType, { settings, layouts, metadatas });
    } catch (error) {
      strapi.log.error(`[bootstrap] content-manager config failed for ${uid}: ${(error as Error).message}`);
    }
  }
  const components = strapi.service('plugin::content-manager.components') as any;
  for (const [uid, config] of Object.entries(COMPONENT_CONFIGS)) {
    try {
      const component = strapi.components[uid as keyof typeof strapi.components] as any;
      const current = await components.findConfiguration(component);
      const metadatas = { ...current.metadatas };
      for (const [field, description] of Object.entries(config.hints)) {
        if (metadatas[field]) metadatas[field] = { ...metadatas[field], edit: { ...metadatas[field].edit, description } };
      }
      await components.updateConfiguration(component, {
        settings: current.settings,
        layouts: { ...current.layouts, edit: config.layout },
        metadatas,
      });
    } catch (error) {
      strapi.log.error(`[bootstrap] component config failed for ${uid}: ${(error as Error).message}`);
    }
  }
  await store.set({ value: { version: CM_CONFIG_VERSION } });
  strapi.log.info('[bootstrap] content-manager configuration applied');
}

export default {
  register() {},

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
      await configureContentManager(strapi);
    } catch (error) {
      strapi.log.error(`[bootstrap] content-manager config failed: ${(error as Error).message}`);
    }
    try {
      await seedCatalog(strapi);
    } catch (error) {
      strapi.log.error(`[seed] failed (boot continues): ${(error as Error).stack ?? error}`);
    }
  },
};
