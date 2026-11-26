import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  localUploadName,
  mediaUrl,
  migratedData,
  migratedNames,
  needsMigration,
  rewriteUploadUrls,
  uploadItems,
  type MediaFile,
} from './media-migration.ts';

const BASE = 'https://media.desertica.pe';
const file = (over: Partial<MediaFile> = {}): MediaFile => ({
  id: 1,
  hash: 'duna_ab12',
  ext: '.jpg',
  mime: 'image/jpeg',
  url: '/uploads/duna_ab12.jpg',
  provider: 'local',
  formats: {
    thumbnail: { hash: 'thumbnail_duna_ab12', ext: '.jpg', mime: 'image/jpeg', url: '/uploads/thumbnail_duna_ab12.jpg', width: 156 },
    small: { hash: 'small_duna_ab12', ext: '.jpg', mime: 'image/jpeg', url: '/uploads/small_duna_ab12.jpg' },
  },
  ...over,
});

test('only plain /uploads/<name> URLs are local files', () => {
  assert.equal(localUploadName('/uploads/duna_ab12.jpg'), 'duna_ab12.jpg');
  for (const bad of ['/uploads/../.env', '/uploads/a/b.jpg', '/uploads/.hidden', 'https://x.pe/uploads/a.jpg', '', null]) {
    assert.equal(localUploadName(bad), null, String(bad));
  }
});

test('the bucket URL follows the provider key: base, optional root path, hash + ext', () => {
  assert.equal(mediaUrl(BASE, '', 'a.jpg'), 'https://media.desertica.pe/a.jpg');
  assert.equal(mediaUrl(`${BASE}/`, '/cms/', 'a.jpg'), 'https://media.desertica.pe/cms/a.jpg');
});

test('the original and every format are uploaded; a strange URL stops the file', () => {
  assert.deepEqual(
    uploadItems(file()).map((i) => [i.format, i.name, i.hash, i.ext]),
    [
      [null, 'duna_ab12.jpg', 'duna_ab12', '.jpg'],
      ['thumbnail', 'thumbnail_duna_ab12.jpg', 'thumbnail_duna_ab12', '.jpg'],
      ['small', 'small_duna_ab12.jpg', 'small_duna_ab12', '.jpg'],
    ],
  );
  assert.equal(uploadItems(file({ formats: null })).length, 1);
  assert.throws(() => uploadItems(file({ url: '/uploads/../x' })), /url inesperada/);
});

test('the update sets url, provider and each format url, keeping the other format data', () => {
  const urls = new Map<string | null, string>([
    [null, `${BASE}/duna_ab12.jpg`],
    ['thumbnail', `${BASE}/thumbnail_duna_ab12.jpg`],
    ['small', `${BASE}/small_duna_ab12.jpg`],
  ]);
  const data = migratedData(file(), urls);
  assert.equal(data.url, `${BASE}/duna_ab12.jpg`);
  assert.equal(data.provider, 'aws-s3');
  assert.equal(data.formats?.thumbnail.url, `${BASE}/thumbnail_duna_ab12.jpg`);
  assert.equal(data.formats?.thumbnail.width, 156);
  urls.delete('small');
  assert.throws(() => migratedData(file(), urls), /falta la url/);
});

test('a migrated file is skipped on the next run and counts as known for texts', () => {
  const done = file({
    provider: 'aws-s3',
    url: `${BASE}/duna_ab12.jpg`,
    formats: { thumbnail: { hash: 'thumbnail_duna_ab12', ext: '.jpg', url: `${BASE}/thumbnail_duna_ab12.jpg` } },
  });
  assert.equal(needsMigration(file()), true);
  assert.equal(needsMigration(done), false);
  assert.deepEqual([...migratedNames([done, file({ id: 2, hash: 'otra', url: '/uploads/otra.jpg', formats: null })], BASE, '')], [
    'duna_ab12.jpg',
    'thumbnail_duna_ab12.jpg',
  ]);
});

test('texts: relative and CMS-absolute links to migrated files are rewritten, and only once', () => {
  const opts = { publicUrl: BASE, rootPath: 'uploads', cmsUrls: ['https://cms.desertica.pe/'], known: new Set(['a.jpg', 'b.png']) };
  const md = [
    '![](/uploads/a.jpg)',
    '<img src="https://cms.desertica.pe/uploads/b.png?updatedAt=1">',
    'texto /uploads/a.jpg al final',
    '![](/uploads/borrada.jpg)',
    '[web](https://otra.pe/uploads/a.jpg)',
  ].join('\n');
  const once = rewriteUploadUrls(md, opts);
  assert.equal(once.count, 3);
  assert.equal(
    once.text,
    [
      '![](https://media.desertica.pe/uploads/a.jpg)',
      '<img src="https://media.desertica.pe/uploads/b.png?updatedAt=1">',
      'texto https://media.desertica.pe/uploads/a.jpg al final',
      '![](/uploads/borrada.jpg)',
      '[web](https://otra.pe/uploads/a.jpg)',
    ].join('\n'),
  );
  // Even with root path "uploads" the new URLs contain /uploads/ but are not touched again.
  assert.deepEqual(rewriteUploadUrls(once.text, opts), { text: once.text, count: 0 });
});
