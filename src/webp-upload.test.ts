import assert from 'node:assert/strict';
import { createReadStream, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import sharp from 'sharp';
import { isHeic, toWebp, webpUploads as strapiServer } from './webp-upload.ts';

const dir = mkdtempSync(path.join(tmpdir(), 'webp-'));
const fileAt = (name: string, bytes: Buffer, mime: string) => {
  const filepath = path.join(dir, name);
  writeFileSync(filepath, bytes);
  const ext = path.extname(name);
  return { name, hash: name.replace(/\W/g, '_'), ext, mime, filepath, tmpWorkingDirectory: dir, getStream: () => createReadStream(filepath) };
};
const noise = (width: number, height: number) =>
  sharp(Buffer.from(Array.from({ length: width * height * 3 }, (_, i) => (i * 7919) % 251)), { raw: { width, height, channels: 3 } });

test('a large JPG with EXIF and GPS becomes a WebP of at most 2400 px, upright, without metadata', async () => {
  // 4000x3000 stored sideways with orientation 6 (rotate 90°): upright it is 3000x4000.
  const jpg = await noise(4000, 3000).jpeg({ quality: 95 }).withExif({ IFD0: { Make: 'Phone' }, IFD3: { GPSLatitudeRef: 'S' } }).withMetadata({ orientation: 6 }).toBuffer();
  const out = await toWebp(fileAt('Duna Huacachina.JPG', jpg, 'image/jpeg'));
  const meta = await sharp(out.filepath).metadata();
  assert.deepEqual([meta.format, meta.width, meta.height], ['webp', 1800, 2400]);
  assert.equal(meta.exif, undefined);
  assert.equal(meta.orientation, undefined);
  assert.deepEqual([out.name, out.ext, out.mime, out.width, out.height], ['Duna Huacachina.webp', '.webp', 'image/webp', 1800, 2400]);
  assert.equal(out.sizeInBytes, statSync(out.filepath).size);
  assert.ok(out.sizeInBytes < jpg.length);
});

test('a small PNG becomes WebP without being enlarged', async () => {
  const png = await noise(800, 600).png().toBuffer();
  const out = await toWebp(fileAt('logo.png', png, 'image/png'));
  const meta = await sharp(readFileSync(out.filepath)).metadata();
  assert.deepEqual([meta.format, meta.width, meta.height, out.mime, out.name], ['webp', 800, 600, 'image/webp', 'logo.webp']);
});

test('videos and PDFs are not images for Strapi, so they are stored as they came', async () => {
  const original = { isImage: async () => false, optimize: async () => assert.fail('not an image') };
  const { services } = strapiServer({ services: { 'image-manipulation': original } });
  const images = services['image-manipulation'];
  assert.equal(images.optimize, toWebp);
  for (const file of [{ mime: 'video/mp4', ext: '.mp4' }, { mime: 'application/pdf', ext: '.pdf' }]) {
    assert.equal(await images.isImage(file), false);
  }
});

test('HEIC from a phone is refused with a message in Spanish', async () => {
  assert.ok(isHeic({ mime: 'image/heic', ext: '.HEIC' }) && isHeic({ mime: 'application/octet-stream', ext: '.heif' }));
  assert.ok(!isHeic({ mime: 'image/jpeg', ext: '.jpg' }));
  const { services } = strapiServer({ services: { 'image-manipulation': { isImage: async () => false } } });
  await assert.rejects(services['image-manipulation'].isImage({ mime: 'image/heic', ext: '.heic' }), /HEIC\/HEIF.*JPG/);
});
