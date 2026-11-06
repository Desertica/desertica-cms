import type { Core } from '@strapi/strapi';
import { errors } from '@strapi/utils';

const TOUR = 'api::tour.tour';

/** Draft rows of this document (the language being published, or all of them) that have no destination. */
export const withoutDestination = (rows: Array<{ destination?: unknown }>): number => rows.filter((row) => !row.destination).length;

/**
 * A tour is active or not as a whole: unpublishing one language would leave it visible (and bookable) in the other.
 * Publishing stays per language, since a new tour may exist in Spanish only, but it needs a destination: Strapi does
 * not enforce a required relation, and the website skips a tour without one (it would "publish" and not appear).
 */
export function registerTourStatusGuard(strapi: Core.Strapi) {
  strapi.documents.use(async (ctx, next) => {
    if (ctx.uid !== TOUR) return next();
    const params = ctx.params as any;
    if (ctx.action === 'unpublish') params.locale = '*';
    if (ctx.action === 'publish' && params.documentId) {
      const rows: Array<{ destination?: unknown }> = await strapi.db.query(TOUR).findMany({
        where: { documentId: params.documentId, publishedAt: { $null: true }, ...(typeof params.locale === 'string' && params.locale !== '*' ? { locale: params.locale } : {}) },
        populate: ['destination'],
      });
      if (withoutDestination(rows)) throw new errors.ValidationError('Elige el destino del tour antes de publicarlo: sin destino no aparece en la web.');
    }
    return next();
  });
}
