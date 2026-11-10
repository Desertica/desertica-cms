import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deepl, missingPlaceholders, plan, protect, registerAutoTranslate, restore, shouldAutoTranslate, slugFromEnglish, translateDocument } from './translate.ts';

const strapi = {
  components: {
    'shared.stop': { attributes: { title: { type: 'string' }, body: { type: 'text' }, imageUrl: { type: 'string' }, image: { type: 'media' } } },
    'shared.nav-link': { attributes: { label: { type: 'string' }, path: { type: 'string' } } },
  },
} as any;

const localized = { pluginOptions: { i18n: { localized: true } } };
const attrs = {
  slug: { type: 'uid', ...localized },
  order: { type: 'integer' },
  title: { type: 'string', ...localized },
  notes: { type: 'text' }, // not localized: shared between languages, never translated
  body: { type: 'customField', customField: 'plugin::ckeditor5.CKEditor', ...localized },
  itinerary: { type: 'component', component: 'shared.stop', repeatable: true, ...localized },
  links: { type: 'component', component: 'shared.nav-link', repeatable: true, ...localized },
};

test('collects only localized copy and rebuilds it with the translations, keeping values and media', () => {
  const texts: string[] = [];
  const steps = plan(strapi, attrs as any, {
    slug: 'dune-buggy',
    order: 1,
    title: 'Dune buggy',
    notes: 'do not touch',
    body: '## Hello',
    itinerary: [{ id: 7, title: 'Stop', body: 'Text', imageUrl: 'https://x/y.jpg', image: { id: 42 } }],
    links: [{ id: 8, label: 'Tours', path: '/tours' }],
  }, true, texts);

  assert.deepEqual(texts, ['Dune buggy', '## Hello', 'Stop', 'Text', 'Tours']);

  let i = 0;
  const out = Object.fromEntries(steps.map((step) => step(() => `ES:${texts[i++]}`)));
  assert.deepEqual(out, {
    title: 'ES:Dune buggy',
    body: 'ES:## Hello',
    itinerary: [{ title: 'ES:Stop', body: 'ES:Text', imageUrl: 'https://x/y.jpg', image: 42 }],
    links: [{ label: 'ES:Tours', path: '/tours' }],
  });
});

test('legal texts never reach DeepL: not the waiver, not any page', async () => {
  const texts: string[] = [];
  const waiver = { type: 'customField', customField: 'plugin::ckeditor5.CKEditor', ...localized };
  assert.equal(plan(strapi, { waiverBody: waiver } as any, { waiverBody: 'I accept the risks' }, true, texts).length, 0);
  assert.deepEqual(texts, []);

  await assert.rejects(translateDocument({} as any, 'api::page.page', 'doc', 'en', 'es'), { status: 422 });
});

test('skips empty and missing fields', () => {
  const texts: string[] = [];
  assert.equal(plan(strapi, attrs as any, { title: '   ', body: null }, true, texts).length, 0);
  assert.deepEqual(texts, []);
});

const withFetch = async (answer: (body: any) => unknown, run: () => Promise<void>) => {
  const real = globalThis.fetch;
  process.env.DEEPL_API_KEY = 'k:fx';
  globalThis.fetch = (async (_url: string, init: { body: string }) => new Response(JSON.stringify(answer(JSON.parse(init.body))))) as any;
  try {
    await run();
  } finally {
    globalThis.fetch = real;
    delete process.env.DEEPL_API_KEY;
  }
};

test('a short DeepL answer is an error, not a half-translated draft', async () => {
  await withFetch(
    (body) => ({ translations: body.text.slice(1).map((text: string) => ({ text })) }),
    () => assert.rejects(deepl(['a', 'b', 'c'], 'en', 'es'), /fewer texts/),
  );
});

test('an empty DEEPL_API_URL (as copied from .env.example) falls back to the real endpoint', async () => {
  const real = globalThis.fetch;
  process.env.DEEPL_API_KEY = 'k:fx';
  process.env.DEEPL_API_URL = '';
  let called = '';
  globalThis.fetch = (async (url: string) => {
    called = url;
    return new Response(JSON.stringify({ translations: [{ text: 'x' }] }));
  }) as any;
  try {
    await deepl(['a'], 'es', 'en');
    assert.equal(called, 'https://api-free.deepl.com/v2/translate');
  } finally {
    globalThis.fetch = real;
    delete process.env.DEEPL_API_KEY;
    delete process.env.DEEPL_API_URL;
  }
});

test('placeholders are shielded from DeepL and restored, and plain texts go through untouched', async () => {
  assert.equal(restore(protect('Hola {tour} & <b>')), 'Hola {tour} & <b>');
  assert.equal(protect('a {tour}'), 'a <keep>{tour}</keep>');
  let sent: any;
  await withFetch(
    (body) => {
      sent = body;
      return { translations: body.text.map((text: string) => ({ text: `ES ${text}` })) };
    },
    async () => assert.deepEqual(await deepl(['Book {tour}', 'Plain'], 'en', 'es'), ['ES Book {tour}', 'ES Plain']),
  );
  assert.equal(sent.tag_handling, 'xml');
  assert.deepEqual(sent.ignore_tags, ['keep']);
  await withFetch(
    (body) => {
      sent = body;
      return { translations: body.text.map((text: string) => ({ text })) };
    },
    async () => void (await deepl(['Plain'], 'en', 'es')),
  );
  assert.equal(sent.tag_handling, undefined);
});

test('missingPlaceholders reports dropped markers and ignores new or repeated ones', () => {
  assert.deepEqual(missingPlaceholders('Hi, I want {tour} on {date}', 'Quiero {date}'), ['{tour}']);
  assert.deepEqual(missingPlaceholders('{a} {a}', 'x {a}'), []);
  assert.deepEqual(missingPlaceholders('Hola', 'Hola {extra}'), []);
});

test('English is rewritten on every Spanish save, with a key, for the types that translate themselves', () => {
  const ok = { uid: 'api::tour.tour', locale: 'es', hasKey: true };
  assert.equal(shouldAutoTranslate(ok), true);
  assert.equal(shouldAutoTranslate({ ...ok, uid: 'api::destination.destination' }), true);
  assert.equal(shouldAutoTranslate({ ...ok, locale: 'en' }), false, 'saving English does nothing, so it cannot loop');
  assert.equal(shouldAutoTranslate({ ...ok, hasKey: false }), false, 'no DEEPL_API_KEY');
  assert.equal(shouldAutoTranslate({ ...ok, uid: 'api::page.page' }), false, 'legal pages');
  assert.equal(shouldAutoTranslate({ ...ok, uid: 'api::translation.translation' }), false, 'site texts keep the manual panel');
});

test('a DeepL failure after saving is only logged', async () => {
  const logs: string[] = [];
  let middleware: any;
  const fakeStrapi: any = {
    documents: Object.assign(() => ({ findOne: async () => null }), { use: (fn: unknown) => (middleware = fn) }),
    db: { transaction: async (cb: any) => cb({ onCommit: (done: () => void) => done() }) },
    log: { warn: (m: string) => logs.push(m), info: () => {} },
  };
  registerAutoTranslate(fakeStrapi, { DEEPL_API_KEY: 'k' });
  const result = await middleware({ action: 'update', uid: 'api::tour.tour', params: { documentId: 'd1', locale: 'es' } }, async () => 'saved');
  assert.equal(result, 'saved', 'the save result is untouched');
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(logs.length, 1);
  assert.match(logs[0]!, /automatic English version failed/);
});

test('an unrelated action never schedules work; saving English schedules only the slug', async () => {
  let scheduled = 0;
  let middleware: any;
  const fakeStrapi: any = {
    documents: Object.assign(() => ({}), { use: (fn: unknown) => (middleware = fn) }),
    db: { transaction: async () => { scheduled++; } },
    log: { warn: () => {}, info: () => {} },
  };
  registerAutoTranslate(fakeStrapi, { DEEPL_API_KEY: 'k' });
  await middleware({ action: 'publish', uid: 'api::tour.tour', params: { documentId: 'd1', locale: 'es' } }, async () => 1);
  await middleware({ action: 'update', uid: 'api::page.page', params: { documentId: 'd1', locale: 'en' } }, async () => 1);
  assert.equal(scheduled, 0);
  await middleware({ action: 'update', uid: 'api::tour.tour', params: { documentId: 'd1', locale: 'en' } }, async () => 1);
  assert.equal(scheduled, 1, 'saving the English name schedules only the slug update');
});

test('the slug follows the English name; locked, only until the first publication', async () => {
  const written: unknown[] = [];
  const fake = (published: number, english: { title: string; slug: string }, taken: Array<{ slug: string; documentId: string }> = []): any => ({
    db: {
      query: () => ({
        count: async () => published,
        findMany: async () => taken,
        updateMany: async (q: unknown) => written.push(q),
      }),
    },
    documents: () => ({ findOne: async () => english }),
  });

  assert.equal(await slugFromEnglish(fake(0, { title: 'Dune Buggy & Sandboarding', slug: 'paseo-en-buggy' }), 'api::tour.tour', 'd1'), 'dune-buggy-sandboarding');
  assert.equal(written.length, 1);
  assert.equal(await slugFromEnglish(fake(1, { title: 'Dune Buggy', slug: 'paseo' }), 'api::tour.tour', 'd1', true), null, 'locked: published entries keep their address');
  assert.equal(await slugFromEnglish(fake(1, { title: 'Dune Buggy', slug: 'paseo' }), 'api::tour.tour', 'd1', false), 'dune-buggy', 'unlocked (staging): it keeps following the English name');
  assert.equal(await slugFromEnglish(fake(0, { title: 'Dune Buggy', slug: 'dune-buggy' }), 'api::tour.tour', 'd1'), null, 'already right');
  assert.equal(await slugFromEnglish(fake(0, { title: 'Dune Buggy', slug: 'x' }, [{ slug: 'dune-buggy', documentId: 'other' }]), 'api::tour.tour', 'd1'), 'dune-buggy-2', 'another entry has it');
  assert.equal(await slugFromEnglish(fake(0, { title: 'Terms', slug: 'x' }), 'api::page.page', 'd1'), null, 'only the types with a title-based slug');
});
