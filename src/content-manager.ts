import type { Core } from '@strapi/strapi';
import { COMPONENT_FIELDS, CONTENT_TYPE_FIELDS, type FieldMeta } from './admin-es.ts';

export const LOCALE_NAMES: Record<string, string> = { en: 'Inglés (en)', es: 'Español (es)' };

const CM_UID = 'plugin::content-manager.content-types';
const CM_CONFIG_VERSION = 14;

type ListConfig = { fields: string[]; mainField?: string; sortBy?: string; sortOrder?: 'ASC' | 'DESC'; pageSize?: number };
const LIST_CONFIGS: Record<string, ListConfig> = {
  // Sorted by the hidden `sortKey` (website page order, then section, then key; see src/sort-key.ts).
  'api::translation.translation': { fields: ['page', 'section', 'label', 'value'], mainField: 'label', sortBy: 'sortKey', sortOrder: 'ASC', pageSize: 50 },
  'api::media-slot.media-slot': { fields: ['page', 'section', 'description', 'image'], mainField: 'description', sortBy: 'sortKey', sortOrder: 'ASC', pageSize: 50 },
  'api::blog-post.blog-post': { fields: ['title', 'publishedDate', 'featured'], mainField: 'title', sortBy: 'publishedDate', sortOrder: 'DESC' },
  'api::product.product': { fields: ['title', 'price', 'order'], mainField: 'title', sortBy: 'order', sortOrder: 'ASC' },
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
export const EDIT_LAYOUTS: Record<string, Array<Array<{ name: string; size: number }>>> = {
  'api::tour.tour': [
    row(['title', 8], ['slug', 4]),
    row(['destination', 6], ['order', 3], ['featured', 3]),
    row(['priceFrom', 4], ['durationHours', 4], ['format', 4]),
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
  ],
  'api::destination.destination': [
    row(['title', 8], ['slug', 4]),
    row(['lead', 12]),
    row(['allLabel', 12]),
    row(['image', 12]),
    row(['order', 4], ['footerOrder', 4], ['showInFooter', 4]),
    row(['tours', 12]),
  ],
  'api::page.page': [
    row(['title', 8], ['slug', 4]),
    row(['lead', 12]),
    row(['body', 12]),
    row(['heroImage', 12]),
    row(['seoTitle', 12]),
    row(['seoDescription', 12]),
  ],
  'api::blog-post.blog-post': [
    row(['title', 8], ['slug', 4]),
    row(['publishedDate', 6], ['category', 4], ['featured', 2]),
    row(['excerpt', 12]),
    row(['content', 12]),
    row(['cover', 12]),
    row(['seoDescription', 12]),
  ],
  'api::product.product': [
    row(['title', 8], ['slug', 4]),
    row(['price', 4], ['order', 4], ['featured', 4]),
    row(['description', 12]),
    row(['details', 12]),
    row(['image', 12]),
    row(['gallery', 12]),
  ],
  'api::translation.translation': [
    row(['page', 4], ['section', 4], ['kind', 4]),
    row(['label', 12]),
    row(['value', 12]),
    row(['note', 12]),
    row(['key', 6], ['group', 6]),
  ],
  'api::media-slot.media-slot': [
    row(['key', 6], ['page', 3], ['section', 3]),
    row(['description', 12]),
    row(['image', 12]),
    row(['alt', 12]),
    row(['video', 6], ['poster', 6]),
    row(['videoUrl', 6], ['videoWebmUrl', 6]),
  ],
  'api::site-setting.site-setting': [
    row(['brandName', 6], ['legalName', 6]),
    row(['ruc', 6], ['legalYear', 6]),
    row(['email', 6], ['phone', 6]),
    row(['whatsapp', 12]),
    row(['instagram', 8], ['showInstagram', 4]),
    row(['facebook', 8], ['showFacebook', 4]),
    row(['tiktok', 8], ['showTiktok', 4]),
    row(['youtube', 8], ['showYoutube', 4]),
    row(['linkedin', 8], ['showLinkedin', 4]),
    row(['google', 8], ['showGoogle', 4]),
    row(['tripadvisor', 8], ['showTripadvisor', 4]),
    row(['shareImage', 12]),
    row(['placeholderImage', 12]),
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

/**
 * Fields kept in the schema (the website reads them) but out of the editor's form: external addresses and the raw language list.
 * Each layout plus this list must cover every attribute (src/cm-layouts.test.ts).
 */
export const HIDDEN_FIELDS: Record<string, string[]> = {
  'api::tour.tour': ['languages', 'imageUrl', 'galleryUrls', 'itineraryFileUrl'],
  'api::destination.destination': ['imageUrl'],
  'api::page.page': ['heroImageUrl'],
  'api::blog-post.blog-post': ['coverUrl'],
  'api::product.product': ['imageUrl'],
  'api::media-slot.media-slot': ['imageUrl', 'posterUrl', 'sortKey'],
  'api::translation.translation': ['sortKey'],
  'api::site-setting.site-setting': ['shareImageUrl'],
  'shared.stop': ['imageUrl'],
  'shared.video': ['posterUrl'],
};

/** Shown but not editable: slugs are made from the title, and a text or media row is only ever edited for its content. */
const READ_ONLY_FIELDS: Record<string, string[]> = {
  'api::tour.tour': ['slug'],
  'api::destination.destination': ['slug'],
  'api::blog-post.blog-post': ['slug'],
  'api::product.product': ['slug'],
  'api::translation.translation': ['key', 'group', 'page', 'section', 'label', 'note', 'kind'],
  'api::media-slot.media-slot': ['key', 'page', 'section', 'description'],
};

const SINGLE_TYPE_TITLES: Record<string, string> = {
  'api::theme-setting.theme-setting': 'fontSans',
  'api::booking-setting.booking-setting': 'currencyCode',
  'api::site-setting.site-setting': 'brandName',
};

/** Component layouts: uid -> rows. Grouped as surfaces, brand, text, states, accents. */
export const COMPONENT_LAYOUTS: Record<string, Array<Array<{ name: string; size: number }>>> = {
  'shared.stop': [row(['image', 12]), row(['title', 12]), row(['body', 12]), row(['expandedBody', 12])],
  'shared.video': [row(['poster', 12]), row(['webm', 6], ['webmUrl', 6]), row(['mp4', 6], ['mp4Url', 6])],
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
function applyFieldMeta(metadatas: Record<string, any>, fields: Record<string, FieldMeta> = {}, readOnly: string[] = []) {
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
  for (const field of readOnly) if (metadatas[field]) metadatas[field] = { ...metadatas[field], edit: { ...metadatas[field].edit, editable: false } };
}

export async function configureContentManager(strapi: Core.Strapi) {
  const store = strapi.store({ type: 'plugin', name: 'desertica', key: 'content-manager-config' });
  const done = (await store.get({})) as { version?: number } | null;
  if (done?.version === CM_CONFIG_VERSION) return;

  const failed: string[] = [];
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
      applyFieldMeta(metadatas, CONTENT_TYPE_FIELDS[uid], READ_ONLY_FIELDS[uid]);
      await service.updateConfiguration(contentType, { settings, layouts, metadatas });
    } catch (error) {
      failed.push(uid);
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
      failed.push(uid);
      strapi.log.error(`[bootstrap] component config failed for ${uid}: ${(error as Error).message}`);
    }
  }
  // Locales created by earlier versions have English display names; the language switcher shows these.
  for (const [code, name] of Object.entries(LOCALE_NAMES)) {
    try {
      await strapi.db.query('plugin::i18n.locale').update({ where: { code }, data: { name } });
    } catch (error) {
      failed.push(`locale ${code}`);
      strapi.log.error(`[bootstrap] locale name failed for ${code}: ${(error as Error).message}`);
    }
  }
  // Not marked as done: the next boot retries instead of leaving the failed types unconfigured until the next bump.
  if (failed.length) {
    strapi.log.error(`[bootstrap] content-manager configuration incomplete, will retry on next boot: ${failed.join(', ')}`);
    return;
  }
  await store.set({ value: { version: CM_CONFIG_VERSION } });
  strapi.log.info('[bootstrap] content-manager configuration applied');
}
