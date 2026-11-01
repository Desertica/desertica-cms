import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import { placeholderPng } from './placeholder-image.ts';

test('the placeholder is a 4:3 PNG, light gray, small', async () => {
  const png = await placeholderPng();
  const meta = await sharp(png).metadata();
  assert.deepEqual([meta.format, meta.width, meta.height], ['png', 1600, 1200]);
  const [r, g, b] = (await sharp(png).extract({ left: 5, top: 5, width: 1, height: 1 }).raw().toBuffer()) as unknown as number[];
  assert.deepEqual([r, g, b], [229, 231, 235]);
  assert.ok(png.length < 30_000, `${png.length} bytes`);
});
