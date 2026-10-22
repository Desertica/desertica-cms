import { timingSafeEqual } from 'node:crypto';
import type { Core } from '@strapi/strapi';

type RateLimitConfig = { max?: number; windowMs?: number };

const hits = new Map<string, number[]>();

// Limpieza periodica para evitar crecimiento ilimitado del mapa.
let lastSweep = Date.now();
const sweep = (now: number, windowMs: number) => {
  if (now - lastSweep < windowMs) return;
  lastSweep = now;
  for (const [key, stamps] of hits) {
    const fresh = stamps.filter((s) => now - s < windowMs);
    if (fresh.length) hits.set(key, fresh);
    else hits.delete(key);
  }
};

// El frontend (Express) reenvia los formularios con el secreto compartido FORMS_PROXY_SECRET. Con el secreto
// configurado se exige siempre: sin el, quien llame al CMS directo se salta la validacion y el limite del frontend.
const viaProxy = (ctx: any): boolean => {
  const secret = process.env.FORMS_PROXY_SECRET;
  const given = String(ctx.get('x-forms-secret') ?? '');
  return !!secret && given.length === secret.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret));
};

// X-Client-IP solo se cree si la peticion trae el secreto.
const clientIp = (ctx: any): string =>
  viaProxy(ctx) ? String(ctx.get('x-client-ip') ?? '').slice(0, 64) || ctx.request.ip : ctx.request.ip;

export default (config: RateLimitConfig, _deps: { strapi: Core.Strapi }) => {
  const max = config?.max ?? 10;
  const windowMs = config?.windowMs ?? 10 * 60 * 1000;

  return async (ctx: any, next: () => Promise<unknown>) => {
    if (process.env.FORMS_PROXY_SECRET && !viaProxy(ctx)) {
      return ctx.forbidden();
    }

    const now = Date.now();
    sweep(now, windowMs);

    // The route, not the raw path: `/API/contact-messages` and `/api/contact-messages/` would each get their own quota.
    const key = `${ctx.state.route?.handler ?? ctx.path}|${clientIp(ctx)}`;
    const stamps = (hits.get(key) ?? []).filter((s) => now - s < windowMs);

    if (stamps.length >= max) {
      const retryAfter = Math.ceil((stamps[0] + windowMs - now) / 1000);
      ctx.set('Retry-After', String(Math.max(retryAfter, 1)));
      ctx.status = 429;
      ctx.body = {
        data: null,
        error: { status: 429, name: 'TooManyRequestsError', message: 'Too many requests', details: {} },
      };
      return;
    }

    stamps.push(now);
    hits.set(key, stamps);
    await next();
  };
};
