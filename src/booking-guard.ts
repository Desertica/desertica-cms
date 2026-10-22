import type { Core } from '@strapi/strapi';
import { errors } from '@strapi/utils';

type Rules = { adultsMin?: number | null; adultsDefault?: number | null; childrenMin?: number | null; peopleMax?: number | null };

/** The rules a single-field min/max in the schema cannot express; null when the numbers agree with each other. */
export function bookingRuleError({ adultsMin, adultsDefault, childrenMin, peopleMax }: Rules): string | null {
  const [lo, def, kids, max] = [adultsMin, adultsDefault, childrenMin, peopleMax].map((n) => n ?? undefined);
  if (lo !== undefined && def !== undefined && def < lo) return 'Los adultos por defecto no pueden ser menos que el mínimo de adultos.';
  if (def !== undefined && max !== undefined && def > max) return 'Los adultos por defecto no pueden superar el máximo de personas.';
  if (lo !== undefined && max !== undefined && lo + (kids ?? 0) > max) return 'El máximo de personas no alcanza para los mínimos de adultos y niños.';
  return null;
}

/** Checks `booking-setting` as a whole when it is saved; an update sends only some fields, so the stored ones fill the rest. */
export function registerBookingGuard(strapi: Core.Strapi) {
  const uid = 'api::booking-setting.booking-setting';
  strapi.documents.use(async (ctx, next) => {
    const params = ctx.params as any;
    if (ctx.uid !== uid || !['create', 'update'].includes(ctx.action)) return next();
    const stored = ctx.action === 'update' ? await strapi.documents(uid).findFirst({ locale: params.locale }) : null;
    const error = bookingRuleError({ ...stored, ...params.data });
    if (error) throw new errors.ValidationError(error);
    return next();
  });
}
