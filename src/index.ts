import fs from 'fs';
import path from 'path';
import type { Core } from '@strapi/strapi';

const PUBLIC_ACTIONS = [
  'api::destination.destination.find',
  'api::destination.destination.findOne',
  'api::tour.tour.find',
  'api::tour.tour.findOne',
  'api::site-setting.site-setting.find',
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
    const rows = (catalog.translations ?? []).map((t: any) => ({
      base: { key: t.key, group: t.group }, i18n: t.i18n, publish: false,
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
      const base = clean({ slug: d.slug, order: d.order, imageUrl: d.imageUrl });
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
        portraitUrls: t.portraitUrls,
      });
      const localized = (l: any) =>
        clean({
          title: l.title,
          description: l.description,
          lead: l.lead,
          lead2: l.lead2,
          meeting: l.meeting,
          highlights: features(l.highlights),
          practices: features(l.practices),
          itinerary: (l.itinerary ?? []).map((s: any) => clean({ time: s.time, title: s.title, body: s.body })),
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

  const settings = await strapi.documents(settingUid).findFirst();
  if (!settings) {
    const { siteSetting } = JSON.parse(fs.readFileSync(source, 'utf8'));
    if (siteSetting) {
      await strapi.documents(settingUid).create({ data: clean(siteSetting) as any });
      strapi.log.info('[seed] site-setting created');
    }
  }
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
      await seedCatalog(strapi);
    } catch (error) {
      strapi.log.error(`[seed] failed (boot continues): ${(error as Error).stack ?? error}`);
    }
  },
};
