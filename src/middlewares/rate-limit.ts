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

// El frontend (Express) reenvia los formularios; sin esto todas las peticiones compartirian IP.
// Solo se confia en X-Client-IP si llega con el secreto compartido FORMS_PROXY_SECRET.
const clientIp = (ctx: any): string => {
  const secret = process.env.FORMS_PROXY_SECRET;
  const given = String(ctx.get('x-forms-secret') ?? '');
  const forwarded = String(ctx.get('x-client-ip') ?? '').slice(0, 64);
  if (secret && forwarded && given.length === secret.length) {
    if (timingSafeEqual(Buffer.from(given), Buffer.from(secret))) return forwarded;
  }
  return ctx.request.ip;
};

export default (config: RateLimitConfig, _deps: { strapi: Core.Strapi }) => {
  const max = config?.max ?? 10;
  const windowMs = config?.windowMs ?? 10 * 60 * 1000;

  return async (ctx: any, next: () => Promise<unknown>) => {
    const now = Date.now();
    sweep(now, windowMs);

    const key = `${ctx.path}|${clientIp(ctx)}`;
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
