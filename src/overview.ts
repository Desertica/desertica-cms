import type { Core } from '@strapi/strapi';
import { type Gap, tourGaps } from './tour-gaps.ts';

/** The seven legal pages the website links from its footer; the hub pages (blog, products) are not part of it. */
export const LEGAL_SLUGS = ['terms', 'privacy', 'complaints', 'conduct', 'legal-mincetur', 'cancellation', 'cookies'];
const LOCALES = ['es', 'en'];

type Can = (action: string, uid: string) => boolean;

/** Read-only numbers for the admin home widgets; each part is only filled for people who may read that content. */
export async function overview(strapi: Core.Strapi, can: Can) {
  const docs = (uid: string) => strapi.documents(uid as any) as any;
  const read = (uid: string) => can('plugin::content-manager.explorer.read', uid);
  const out: {
    inbox?: { reservations: number; messages: number };
    legalDrafts?: { locale: string; slugs: string[] }[];
    tours?: { documentId: string; locale: string; title: string; gaps: Gap[] }[];
  } = {};

  if (read('api::reservation.reservation') && read('api::contact-message.contact-message')) {
    out.inbox = {
      reservations: await docs('api::reservation.reservation').count({ filters: { status: 'pending' } }),
      messages: await docs('api::contact-message.contact-message').count({ filters: { $or: [{ handled: false }, { handled: { $null: true } }] } }),
    };
  }

  if (read('api::page.page')) {
    out.legalDrafts = [];
    for (const locale of LOCALES) {
      const live: { slug: string }[] = await docs('api::page.page').findMany({ locale, status: 'published', filters: { slug: { $in: LEGAL_SLUGS } }, fields: ['slug'], limit: 50 });
      out.legalDrafts.push({ locale, slugs: LEGAL_SLUGS.filter((slug) => !live.some((p) => p.slug === slug)) });
    }
  }

  if (read('api::tour.tour')) {
    out.tours = [];
    for (const locale of LOCALES) {
      const tours: any[] = await docs('api::tour.tour').findMany({ locale, status: 'draft', populate: { image: true, faqs: true }, limit: 500 });
      for (const t of tours) {
        const gaps = tourGaps(t).filter((g) => g === 'photo' || g === 'waiver');
        if (gaps.length) out.tours.push({ documentId: t.documentId, locale, title: t.title, gaps });
      }
    }
  }
  return out;
}

export function registerOverviewRoute(strapi: Core.Strapi) {
  strapi.server.routes({
    type: 'admin',
    prefix: '/desertica',
    routes: [
      {
        method: 'GET',
        path: '/overview',
        handler: async (ctx: any) => {
          const ability = ctx.state.userAbility;
          ctx.body = { data: await overview(strapi, (action, uid) => ability.can(action, uid)) };
        },
        info: { pluginName: 'desertica' },
        config: { policies: ['admin::isAuthenticatedAdmin'] },
      },
    ],
  });
}
