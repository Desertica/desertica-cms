import fs from 'fs';
import path from 'path';
import type { Core } from '@strapi/strapi';

const SLUG = 'ejemplo-completo';

const LOREM = {
  en: {
    title: '[EXAMPLE] Complete tour',
    lead: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor.',
    description: 'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.',
    meeting: 'Lorem ipsum plaza, next to the main fountain.',
    termsSummary: 'Lorem ipsum: duis aute irure dolor in reprehenderit in voluptate velit esse.',
    seoTitle: 'Complete example tour | Desertica',
    seoDescription: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. This page is an example for editors.',
  },
  es: {
    title: '[EJEMPLO] Tour completo',
    lead: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor.',
    description: 'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.',
    meeting: 'Plaza lorem ipsum, junto a la fuente principal.',
    termsSummary: 'Lorem ipsum: duis aute irure dolor in reprehenderit in voluptate velit esse.',
    seoTitle: 'Tour de ejemplo completo | Desértica',
    seoDescription: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Esta página es un ejemplo para editores.',
  },
};

const PHOTO = (id: string, w = 1200, h = 800) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&h=${h}&q=80`;
const PHOTOS = ['photo-1533106497176-45ae19e68ba2', 'photo-1509316785289-025f5b846b35', 'photo-1469474968028-56623f02e42e'];
const lorem = (n: number) => Array.from({ length: n }, (_, i) => ({ text: `Lorem ipsum dolor sit amet ${i + 1}.` }));

const localized = (lang: 'en' | 'es') => ({
  ...LOREM[lang],
  paragraphs: lorem(3),
  expandedParagraphs: lorem(2),
  included: lorem(4),
  excluded: lorem(2),
  pack: lorem(3),
  notes: lorem(3),
  practices: ['lucideCar', 'lucideLanguages', 'lucideUsers', 'lucideWind'].map((icon, i) => ({
    icon,
    title: `Lorem ipsum ${i + 1}`,
    body: 'Consectetur adipiscing elit, sed do eiusmod tempor incididunt.',
  })),
  itinerary: PHOTOS.concat(PHOTOS).map((id, i) => ({
    imageUrl: PHOTO(id, 800, 600),
    title: `Lorem ipsum stop ${i + 1}`,
    body: 'Ut labore et dolore magna aliqua. Ut enim ad minim veniam.',
    expandedBody: 'Quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo.',
  })),
  videos: [{ posterUrl: PHOTO(PHOTOS[0], 1200, 675), mp4Url: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4' }],
  faqs: [1, 2, 3, 4].map((n) => ({ question: `Lorem ipsum question ${n}?`, answer: 'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore.' })),
  waiverBody: '## Lorem ipsum waiver\n\nLorem ipsum dolor sit amet, consectetur adipiscing elit. **Example text, not legal.**\n\n- Sed do eiusmod tempor\n- Ut labore et dolore magna aliqua',
});

/**
 * Staging only (SEED_SAMPLE_TOUR=true): one tour with every field filled with lorem ipsum, so partners see what goes
 * where and can duplicate it. Created once per database; it is a normal tour, so deleting it is final.
 */
export async function ensureSampleTour(strapi: Core.Strapi) {
  const store = strapi.store({ type: 'plugin', name: 'desertica', key: 'sample-tour' });
  if (await store.get({})) return;

  const tourUid = 'api::tour.tour' as any;
  const destination = await strapi.documents('api::destination.destination' as any).findFirst({ locale: 'en', filters: { slug: 'huacachina' } });
  const pdf = path.join(__dirname, '..', '..', 'seed', 'sample-itinerary.pdf');
  const altPdf = path.join(process.cwd(), 'seed', 'sample-itinerary.pdf');
  const file = fs.existsSync(pdf) ? pdf : altPdf;
  const [uploaded] = fs.existsSync(file)
    ? await strapi.plugin('upload').service('upload').upload({
        data: { fileInfo: { name: 'itinerario-ejemplo.pdf', alternativeText: 'Itinerario de ejemplo' } },
        files: { filepath: file, originalFilename: 'itinerario-ejemplo.pdf', mimetype: 'application/pdf', size: fs.statSync(file).size },
      })
    : [];

  const base = {
    slug: SLUG,
    order: 99,
    durationHours: 4,
    priceFrom: 99,
    featured: false,
    format: 'both',
    languages: ['es', 'en'],
    imageUrl: PHOTO(PHOTOS[0], 1200, 1200),
    galleryUrls: PHOTOS.map((id) => PHOTO(id, 1800, 1200)),
    imageFocus: 'center',
    latitude: -14.0875,
    longitude: -75.7626,
    meetingPointUrl: 'https://maps.app.goo.gl/lorem-ipsum',
    ...(uploaded ? { itineraryFile: uploaded.id } : {}),
    ...(destination ? { destination: { connect: [{ documentId: destination.documentId }] } } : {}),
  };
  const created = await strapi.documents(tourUid).create({ locale: 'en', status: 'published', data: { ...base, ...localized('en') } as any });
  await strapi.documents(tourUid).update({ documentId: created.documentId, locale: 'es', status: 'published', data: { ...base, ...localized('es') } as any });
  await store.set({ value: { done: true } });
  strapi.log.info(`[seed] sample tour "${SLUG}" created`);
}
