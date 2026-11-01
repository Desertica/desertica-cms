import { createHmac } from 'node:crypto';

const TTL_SECONDS = 600;

/** Where each content type lives on the website (routes of desertica-web); null = no preview for that type. */
export function previewPath(uid: string, slug: string, locale: string): string | null {
  const base = `/${locale}`;
  switch (uid) {
    case 'api::tour.tour':
      return `${base}/tours/${slug}`;
    case 'api::blog-post.blog-post':
      return `${base}/blog/${slug}`;
    case 'api::product.product':
      return `${base}/products/${slug}`;
    case 'api::destination.destination':
      return `${base}/${slug}`;
    case 'api::page.page':
      // The Mincetur page is served under /legal/mincetur; every other slug is its own route.
      return `${base}/${slug === 'legal-mincetur' ? 'legal/mincetur' : slug}`;
    default:
      return null;
  }
}

/** The website the Preview button opens: the first address of CLIENT_URLS (empty when none). */
export const previewBase = (clientUrls = ''): string => clientUrls.split(',')[0]!.trim();

/** `?preview=<exp>.<sig>`: exp in unix seconds, sig = HMAC-SHA256 hex of `<exp>:<pathname>` (the website verifies the same). */
export function previewUrl(baseUrl: string, pathname: string, secret: string, nowMs = Date.now()): string {
  const exp = Math.floor(nowMs / 1000) + TTL_SECONDS;
  const sig = createHmac('sha256', secret).update(`${exp}:${pathname}`).digest('hex');
  return `${baseUrl.replace(/\/+$/, '')}${pathname}?preview=${exp}.${sig}`;
}
