import { createReadStream } from 'node:fs';
import path from 'node:path';
import { errors } from '@strapi/utils';
import sharp from 'sharp';

/** Long side of a stored photo; the owner keeps the full originals elsewhere. */
export const MAX_SIDE = 2400;
export const WEBP_QUALITY = 82;

/** iPhone photos: the bundled sharp reads AVIF but not HEVC-coded HEIC, so they are refused. */
export const HEIC_MESSAGE =
  'Las fotos HEIC/HEIF (iPhone) no se pueden subir. Expórtala como JPG (en el iPhone: Ajustes > Cámara > Formatos > "Más compatible") y vuelve a subirla.';

export const isHeic = (file: { mime?: string; ext?: string }) =>
  /^image\/hei[cf]/i.test(file.mime ?? '') || /^\.hei[cf]s?$/i.test(file.ext ?? '');

type UploadFile = {
  name: string;
  hash: string;
  ext?: string;
  mime?: string;
  filepath?: string;
  tmpWorkingDirectory?: string;
  getStream: () => NodeJS.ReadableStream;
  [key: string]: unknown;
};

/**
 * Replaces Strapi's `optimize` (only called for jpeg, png, webp, tiff and avif; GIF, video and PDF never get here):
 * EXIF orientation applied, at most MAX_SIDE px without enlarging, WebP, all metadata (EXIF, GPS) dropped.
 */
export async function toWebp<T extends UploadFile>(file: T): Promise<T> {
  const input = file.filepath ? sharp(file.filepath, { animated: true }) : sharp({ animated: true });
  const target = path.join(file.tmpWorkingDirectory ?? '', `webp-${file.hash}.webp`);
  const pipeline = input
    .rotate()
    .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY });
  if (!file.filepath) file.getStream().pipe(pipeline);
  const { width, height, size, pageHeight } = await pipeline.toFile(target);
  const oldExt = file.ext ?? path.extname(file.name);
  return {
    ...file,
    name: oldExt && file.name.endsWith(oldExt) ? file.name.slice(0, -oldExt.length) + '.webp' : `${file.name}.webp`,
    ext: '.webp',
    mime: 'image/webp',
    filepath: target,
    getStream: () => createReadStream(target),
    width,
    height: pageHeight ?? height,
    size: Math.round((size / 1000) * 100) / 100, // Strapi's bytesToKbytes
    sizeInBytes: size,
  };
}

/** Upload plugin extension (src/extensions/upload/strapi-server.ts): runs before any provider (local, aws-s3). */
export function webpUploads(plugin: any) {
  const images = plugin.services['image-manipulation'];
  const isImage = images.isImage;
  plugin.services['image-manipulation'] = {
    ...images,
    optimize: toWebp,
    // First check of every upload; HEIC would otherwise be stored untouched (sharp cannot read it).
    isImage: async (file: { mime?: string; ext?: string }) => {
      if (isHeic(file)) throw new errors.ApplicationError(HEIC_MESSAGE);
      return isImage(file);
    },
  };
  return plugin;
}
