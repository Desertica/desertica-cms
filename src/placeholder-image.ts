import fs from 'fs';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import type { Core } from '@strapi/strapi';

/** Light-gray wireframe card with a photo icon (frame, sun, two hills). Only used as the input of the PNG below. */
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1200" viewBox="0 0 1600 1200">
<rect width="1600" height="1200" fill="#e5e7eb"/>
<g fill="none" stroke="#9ca3af" stroke-width="26" stroke-linejoin="round" stroke-linecap="round">
<rect x="520" y="400" width="560" height="400" rx="36"/>
<path d="M520 740 L690 580 L800 680 L900 600 L1080 760"/>
</g>
<circle cx="680" cy="494" r="34" fill="#9ca3af"/>
</svg>`;

export const placeholderPng = () => sharp(Buffer.from(SVG)).png({ compressionLevel: 9 }).toBuffer();

/** Uploads the neutral placeholder into `site-setting.placeholderImage` only while it is empty; the website falls back to it when a photo is missing. */
export async function ensurePlaceholderImage(strapi: Core.Strapi) {
  const uid = 'api::site-setting.site-setting';
  const setting: any = await strapi.documents(uid).findFirst({ populate: { placeholderImage: true } } as any);
  if (!setting || setting.placeholderImage) return;

  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'placeholder-')), 'imagen-de-relleno.png');
  try {
    fs.writeFileSync(file, await placeholderPng());
    const [uploaded] = await strapi.plugin('upload').service('upload').upload({
      data: { fileInfo: { name: 'imagen-de-relleno.png', alternativeText: 'Imagen de relleno' } },
      files: { filepath: file, originalFilename: 'imagen-de-relleno.png', mimetype: 'image/png', size: fs.statSync(file).size },
    });
    await strapi.documents(uid).update({ documentId: setting.documentId, data: { placeholderImage: uploaded.id } as any });
    strapi.log.info('[seed] placeholder image uploaded');
  } finally {
    fs.rmSync(path.dirname(file), { recursive: true, force: true });
  }
}
