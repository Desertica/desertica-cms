/** Where a Google Maps link points, as far as it can be read without calling Google. */
export type MapLink =
  | { kind: 'empty' }
  | { kind: 'invalid' }
  /** A link that opens but cannot be previewed (not Google Maps, or no coordinates in it). */
  | { kind: 'other'; url: string }
  /** A shortened link (maps.app.goo.gl): only Google can resolve where it goes. */
  | { kind: 'short'; url: string }
  | { kind: 'place'; url: string; embed: string };

const HOSTS = new Set(['www.google.com', 'google.com', 'maps.google.com', 'www.google.com.pe', 'google.com.pe']);

/** Keyless preview: OpenStreetMap lets itself be framed, Google's embed needs an API key. The point is the same one. */
const embedFor = (lat: number, lng: number) => {
  const d = 0.004;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${lng - d},${lat - d},${lng + d},${lat + d}&layer=mapnik&marker=${lat},${lng}`;
};

const COORDS = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/;

function coordinates(text: string): [number, number] | null {
  const m = COORDS.exec(text);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? [lat, lng] : null;
}

export function parseMapLink(raw: string | null | undefined): MapLink {
  const value = (raw ?? '').trim();
  if (!value) return { kind: 'empty' };
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { kind: 'invalid' };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { kind: 'invalid' };
  if (url.hostname === 'maps.app.goo.gl' || (url.hostname === 'goo.gl' && url.pathname.startsWith('/maps'))) return { kind: 'short', url: url.toString() };
  if (!HOSTS.has(url.hostname) || !(url.pathname.startsWith('/maps') || url.hostname === 'maps.google.com')) return { kind: 'other', url: url.toString() };

  const at = /@(-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?)/.exec(url.pathname);
  const point = coordinates(at?.[1] ?? url.searchParams.get('q') ?? url.searchParams.get('query') ?? url.searchParams.get('ll') ?? '');
  return point ? { kind: 'place', url: url.toString(), embed: embedFor(...point) } : { kind: 'other', url: url.toString() };
}
