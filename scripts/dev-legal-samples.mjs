#!/usr/bin/env node
/**
 * Loads NOT-LEGAL sample texts (waiver, cancellation, cookies) into a DEVELOPMENT CMS, as drafts.
 *
 *   CMS_URL=http://localhost:1337 CMS_API_TOKEN=<full-access API token> \
 *     node scripts/dev-legal-samples.mjs [--tour <slug>]
 *
 * Never publishes: it only writes drafts (`status=draft`), so nothing reaches the public API.
 * To use the texts from another session, press Publish on the entry (or see docs/DEV-LEGAL-SAMPLES.md).
 * Do not run it against production. Every sample starts with a NOT LEGAL banner.
 */
const base = (process.env.CMS_URL ?? 'http://localhost:1337').replace(/\/+$/, '');
const token = process.env.CMS_API_TOKEN;
if (!token) {
  console.error('Set CMS_API_TOKEN (Settings > API Tokens > Full access) and CMS_URL.');
  process.exit(1);
}
const tourArg = process.argv.indexOf('--tour');
const tourSlug = tourArg > -1 ? process.argv[tourArg + 1] : undefined;

const BANNER = {
  en: '> **NOT LEGAL: DEVELOPMENT SAMPLE.** Placeholder text for testing only. Replace it with text approved by counsel.',
  es: '> **NO LEGAL: MUESTRA DE DESARROLLO.** Texto de ejemplo solo para pruebas. Sustituirlo por el texto aprobado por el asesor legal.',
};

const SAMPLES = {
  waiver: {
    en: `${BANNER.en}\n\n## Sample liability waiver\n\n1. I understand that desert activities (sandboarding, buggies, boat rides) carry inherent risks.\n2. I will follow the guide's instructions and wear the safety equipment provided.\n3. I confirm that I have no medical condition that prevents me from taking part.\n4. (Sample clause for testing.)`,
    es: `${BANNER.es}\n\n## Descargo de responsabilidad de ejemplo\n\n1. Entiendo que las actividades en el desierto (sandboard, buggies, paseos en bote) implican riesgos inherentes.\n2. Seguiré las indicaciones del guía y usaré el equipo de seguridad entregado.\n3. Confirmo que no tengo ninguna condición médica que me impida participar.\n4. (Cláusula de ejemplo para pruebas.)`,
  },
  cancellation: {
    title: { en: 'Cancellation and refund policy', es: 'Política de cancelación y reembolso' },
    en: `${BANNER.en}\n\n## Sample cancellation policy\n\n- More than 48 hours before the tour: full refund.\n- Between 24 and 48 hours: 50% refund.\n- Less than 24 hours or no-show: no refund.\n\n(Sample numbers for testing.)`,
    es: `${BANNER.es}\n\n## Política de cancelación de ejemplo\n\n- Más de 48 horas antes del tour: reembolso total.\n- Entre 24 y 48 horas: reembolso del 50 %.\n- Menos de 24 horas o no presentarse: sin reembolso.\n\n(Cifras de ejemplo para pruebas.)`,
  },
  cookies: {
    title: { en: 'Cookie policy', es: 'Política de cookies' },
    en: `${BANNER.en}\n\n## Sample cookie policy\n\nThis site uses only the cookies needed to work, plus optional analytics. (Sample text for testing.)`,
    es: `${BANNER.es}\n\n## Política de cookies de ejemplo\n\nEste sitio usa solo las cookies necesarias para funcionar y, de forma opcional, analítica. (Texto de ejemplo para pruebas.)`,
  },
};

async function api(method, path, body) {
  const res = await fetch(`${base}/api${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify({ data: body }) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

async function findDocument(collection, slug) {
  const res = await api('GET', `/${collection}?locale=en&status=draft&filters[slug][$eq]=${encodeURIComponent(slug)}&fields[0]=slug`);
  return res.data?.[0];
}

for (const slug of ['cancellation', 'cookies']) {
  const doc = await findDocument('pages', slug);
  const sample = SAMPLES[slug];
  for (const locale of ['en', 'es']) {
    const data = { title: sample.title[locale], body: sample[locale] };
    if (doc) {
      await api('PUT', `/pages/${doc.documentId}?locale=${locale}&status=draft`, data);
    } else if (locale === 'en') {
      await api('POST', `/pages?locale=en&status=draft`, { slug, ...data });
    } else {
      const created = await findDocument('pages', slug);
      await api('PUT', `/pages/${created.documentId}?locale=es&status=draft`, data);
    }
    console.log(`page ${slug} [${locale}]: draft saved`);
  }
}

const tours = await api('GET', `/tours?locale=en&status=draft&sort=order:asc&pagination[pageSize]=1${tourSlug ? `&filters[slug][$eq]=${encodeURIComponent(tourSlug)}` : ''}&fields[0]=slug`);
const tour = tours.data?.[0];
if (!tour) {
  console.error(`Tour not found${tourSlug ? `: ${tourSlug}` : ''}`);
  process.exit(1);
}
for (const locale of ['en', 'es']) {
  await api('PUT', `/tours/${tour.documentId}?locale=${locale}&status=draft`, { waiverBody: SAMPLES.waiver[locale] });
  console.log(`tour ${tour.slug} [${locale}]: waiverBody draft saved`);
}
console.log('Done. Nothing was published.');
