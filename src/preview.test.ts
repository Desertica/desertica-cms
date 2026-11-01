import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import { previewBase, previewPath, previewUrl } from './preview.ts';

test('preview token signs "<exp>:<pathname>" and lasts ten minutes', () => {
  const url = new URL(previewUrl('https://stg.desertica.pe/', '/es/tours/nazca-lines', 's3cret', 1_000_000));
  assert.equal(url.origin + url.pathname, 'https://stg.desertica.pe/es/tours/nazca-lines');
  const [exp, sig] = url.searchParams.get('preview')!.split('.');
  assert.equal(exp, '1600');
  assert.equal(sig, createHmac('sha256', 's3cret').update('1600:/es/tours/nazca-lines').digest('hex'));
});

test('paths follow the website routes', () => {
  assert.equal(previewPath('api::tour.tour', 'a', 'en'), '/en/tours/a');
  assert.equal(previewPath('api::destination.destination', 'nazca', 'es'), '/es/nazca');
  assert.equal(previewPath('api::page.page', 'terms', 'es'), '/es/terms');
  assert.equal(previewPath('api::page.page', 'legal-mincetur', 'es'), '/es/legal/mincetur');
  assert.equal(previewPath('api::blog-post.blog-post', 'x', 'en'), '/en/blog/x');
  assert.equal(previewPath('api::product.product', 'x', 'en'), '/en/products/x');
  assert.equal(previewPath('api::translation.translation', 'x', 'en'), null);
});

test('the preview site is the first CLIENT_URLS entry', () => {
  assert.equal(previewBase('https://stg.desertica.pe, https://cms-stg.desertica.pe'), 'https://stg.desertica.pe');
  assert.equal(previewBase(''), '');
  assert.equal(previewBase(undefined), '');
});
