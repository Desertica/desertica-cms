/**
 * Pure logic of scripts/migrate-uploads-to-s3.mjs (local media -> S3/R2). Compiled to dist/ so the
 * script can use it inside the production image, and tested in media-migration.test.ts.
 */

export interface MediaFormat {
  hash: string;
  ext?: string | null;
  mime?: string;
  url: string;
  [key: string]: unknown;
}

export interface MediaFile {
  id: number;
  hash: string;
  ext?: string | null;
  mime?: string;
  url: string;
  provider: string;
  formats?: Record<string, MediaFormat> | null;
}

/** One object to upload: the original or one of its formats (thumbnail, small, medium, large). */
export interface UploadItem {
  format: string | null;
  name: string;
  hash: string;
  ext: string;
  mime?: string;
}

/** `/uploads/x.jpg` -> `x.jpg`. Null for anything else (absolute URLs, sub-folders, `..`). */
export function localUploadName(url: string | null | undefined): string | null {
  const m = /^\/uploads\/([A-Za-z0-9._-]+)$/.exec(url ?? '');
  return m && !m[1].startsWith('.') ? m[1] : null;
}

/** Public URL the S3 provider gives an object (same rule as its getFileKey + baseUrl, without `file.path`). */
export function mediaUrl(publicUrl: string, rootPath: string, name: string): string {
  const root = rootPath.replace(/^\/+|\/+$/g, '');
  return `${publicUrl.replace(/\/+$/, '')}/${root ? `${root}/` : ''}${name}`;
}

/** Only files still on the local provider are migrated; once updated a file is skipped (idempotent). */
export function needsMigration(file: MediaFile): boolean {
  return file.provider === 'local';
}

/** Everything to upload for a file; throws when a URL is not a plain local upload. */
export function uploadItems(file: MediaFile): UploadItem[] {
  const entries: [string | null, MediaFormat | MediaFile][] = [[null, file], ...Object.entries(file.formats ?? {})];
  return entries.map(([format, f]) => {
    const name = localUploadName(f.url);
    if (!name) throw new Error(`url inesperada en ${format ?? 'original'}: ${f.url}`);
    return { format, name, hash: f.hash, ext: f.ext ?? '', mime: f.mime };
  });
}

/** Record update once every object is uploaded: url, provider and the url of each format. */
export function migratedData(file: MediaFile, urls: Map<string | null, string>, provider = 'aws-s3') {
  const pick = (format: string | null) => {
    const url = urls.get(format);
    if (!url) throw new Error(`falta la url subida de ${format ?? 'original'}`);
    return url;
  };
  const formats = file.formats
    ? Object.fromEntries(Object.entries(file.formats).map(([k, f]) => [k, { ...f, url: pick(k) }]))
    : file.formats;
  return { url: pick(null), provider, formats };
}

/** Names (`x.jpg`) whose record already points at the bucket: only those are rewritten in texts. */
export function migratedNames(files: MediaFile[], publicUrl: string, rootPath: string): Set<string> {
  const names = new Set<string>();
  for (const file of files) {
    for (const f of [file, ...Object.values(file.formats ?? {})]) {
      const name = `${f.hash}${f.ext ?? ''}`;
      if (f.url === mediaUrl(publicUrl, rootPath, name)) names.add(name);
    }
  }
  return names;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Rewrites `/uploads/x.jpg` (relative, or absolute on one of `cmsUrls`) to the bucket URL, only for
 * names in `known`. A bucket URL is never matched again, so running it twice changes nothing.
 */
export function rewriteUploadUrls(
  text: string,
  opts: { publicUrl: string; rootPath: string; cmsUrls: string[]; known: Set<string> },
): { text: string; count: number } {
  const hosts = opts.cmsUrls.map((u) => u.replace(/\/+$/, '')).filter(Boolean).map(escape);
  const origin = hosts.length ? `(?:${hosts.join('|')})?` : '';
  // Must start the URL: after a quote, bracket, space or `=`, so `https://media.x/uploads/a.jpg` is left alone.
  const re = new RegExp(`(^|[\\s("'=<\\[])${origin}/uploads/([A-Za-z0-9._-]+)`, 'g');
  let count = 0;
  const out = text.replace(re, (all, before: string, name: string) => {
    if (!opts.known.has(name)) return all;
    count++;
    return before + mediaUrl(opts.publicUrl, opts.rootPath, name);
  });
  return { text: out, count };
}
