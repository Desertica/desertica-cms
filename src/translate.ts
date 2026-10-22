import type { Core } from '@strapi/strapi';

const LOCALES = ['en', 'es'] as const;
type Locale = (typeof LOCALES)[number];

/** Text that is a value, not copy: icons, routes, kinds and media addresses stay as they are. */
const KEEP = new Set(['slug', 'key', 'icon', 'path', 'fragment', 'kind', 'imageUrl', 'posterUrl', 'webmUrl', 'mp4Url', 'planTripPath']);
const TEXT_TYPES = new Set(['string', 'text', 'richtext']);

const DEEPL_LANG: Record<Locale, string> = { en: 'EN-US', es: 'ES' };

/** `{tour}`-style placeholders must reach the website untouched, so DeepL is told to leave them out of the translation. */
const PLACEHOLDER = /\{[A-Za-z0-9_.]+\}/g;
const escapeXml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const protect = (text: string) => escapeXml(text).replace(PLACEHOLDER, (match) => `<keep>${match}</keep>`);
export const restore = (text: string) => text.replace(/<\/?keep>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/** Calls DeepL for a list of texts. Free keys end in ":fx" and use api-free.deepl.com. */
export async function deepl(texts: string[], from: Locale, to: Locale): Promise<string[]> {
  const key = process.env.DEEPL_API_KEY;
  if (!key) throw Object.assign(new Error('DEEPL_API_KEY is not set'), { status: 503 });
  const base = process.env.DEEPL_API_URL ?? (key.endsWith(':fx') ? 'https://api-free.deepl.com' : 'https://api.deepl.com');
  const placeholders = texts.some((text) => PLACEHOLDER.test(text));
  PLACEHOLDER.lastIndex = 0;
  const out: string[] = [];
  // 50 texts per request is DeepL's documented limit.
  for (let i = 0; i < texts.length; i += 50) {
    const batch = texts.slice(i, i + 50);
    const response = await fetch(`${base}/v2/translate`, {
      method: 'POST',
      headers: { Authorization: `DeepL-Auth-Key ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: placeholders ? batch.map(protect) : batch,
        source_lang: from.toUpperCase(),
        target_lang: DEEPL_LANG[to],
        preserve_formatting: true,
        ...(placeholders ? { tag_handling: 'xml', ignore_tags: ['keep'] } : {}),
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw Object.assign(new Error(`DeepL answered ${response.status}`), { status: 502 });
    const translated = ((await response.json()) as { translations: Array<{ text: string }> }).translations.map((item) => item.text);
    // A short answer would leave fields untranslated while the editor is told it worked.
    if (translated.length !== batch.length) throw Object.assign(new Error('DeepL returned fewer texts than sent'), { status: 502 });
    out.push(...(placeholders ? translated.map(restore) : translated));
  }
  return out;
}

type Attr = { type: string; component?: string; repeatable?: boolean; customField?: string; pluginOptions?: { i18n?: { localized?: boolean } } };
const isText = (attr: Attr) => TEXT_TYPES.has(attr.type) || attr.customField === 'plugin::ckeditor5.CKEditor';

/**
 * Walks `value` (a document or a component entry) and collects the copy to translate: localized text fields,
 * and the text inside components. Returns a function that rebuilds the value with the translated texts.
 */
export function plan(strapi: Core.Strapi, attrs: Record<string, Attr>, value: Record<string, any>, top: boolean, texts: string[]) {
  const steps: Array<(next: () => string) => [string, unknown]> = [];
  for (const [name, attr] of Object.entries(attrs)) {
    const current = value[name];
    if (current === undefined || current === null || KEEP.has(name)) continue;
    const localized = attr.pluginOptions?.i18n?.localized === true;
    if (top && !localized) continue;
    if (isText(attr) && typeof current === 'string' && current.trim()) {
      texts.push(current);
      steps.push((next) => [name, next()]);
    } else if (attr.type === 'component' && attr.component) {
      // shortcut: components inside components are not populated or rebuilt here, so a nested one would be dropped from the target; upgrade the populate before nesting any.
      const inner = (strapi.components as any)[attr.component].attributes as Record<string, Attr>;
      const entries = (attr.repeatable ? current : [current]) as Array<Record<string, any>>;
      const rebuilt = entries.map((entry) => {
        const sub = plan(strapi, inner, entry, false, texts);
        return (next: () => string) => {
          const copy: Record<string, any> = {};
          for (const [key, v] of Object.entries(entry)) {
            if (key === 'id' || key === 'documentId') continue;
            // Media inside components is linked by id; everything else is copied as is.
            copy[key] = v && typeof v === 'object' && 'id' in v ? v.id : Array.isArray(v) ? v.map((m: any) => m?.id ?? m) : v;
          }
          for (const step of sub) {
            const [key, translated] = step(next);
            copy[key] = translated;
          }
          return copy;
        };
      });
      steps.push((next) => [name, attr.repeatable ? rebuilt.map((build) => build(next)) : rebuilt[0]!(next)]);
    }
  }
  return steps;
}

export async function translateDocument(strapi: Core.Strapi, uid: string, documentId: string, from: Locale, to: Locale, userAbility?: unknown) {
  const model = strapi.contentType(uid as any) as any;
  const populate = Object.fromEntries(
    Object.entries(model.attributes as Record<string, Attr>)
      .filter(([, attr]) => attr.type === 'component')
      .map(([name, attr]) => [name, { populate: '*' }]),
  );
  const source = await strapi.documents(uid as any).findOne({ documentId, locale: from, status: 'draft', populate } as any);
  if (!source) throw Object.assign(new Error(`No ${from} version to translate`), { status: 404 });

  // The role may be limited to some documents (Author), languages or fields: check the real document and the target language.
  const checker = userAbility
    ? (strapi.plugin('content-manager') as any).service('permission-checker').create({ userAbility, model: uid })
    : null;
  const update = 'plugin::content-manager.explorer.update';
  if (checker && (!checker.can(update, source) || !checker.can(update, { ...(source as any), locale: to }))) {
    throw Object.assign(new Error('Not allowed to edit this document in that language'), { status: 403 });
  }

  const texts: string[] = [];
  const steps = plan(strapi, model.attributes, source as any, true, texts);
  if (!texts.length) throw Object.assign(new Error('Nothing to translate'), { status: 422 });

  const translated = await deepl(texts, from, to);
  let index = 0;
  const built = Object.fromEntries(steps.map((step) => step(() => translated[index++]!)));
  const data = checker ? checker.sanitizeUpdateInput(source)(built) : built;
  // The target version is saved as a draft: a person reviews and publishes it.
  await strapi.documents(uid as any).update({ documentId, locale: to, data } as any);
  return { fields: steps.length, characters: texts.reduce((sum, text) => sum + text.length, 0) };
}

/** Admin-only endpoint behind the "Traducir" panel of the edit view. */
export function registerTranslateRoute(strapi: Core.Strapi) {
  strapi.server.routes({
    type: 'admin',
    prefix: '/desertica',
    routes: [
      {
        method: 'POST',
        path: '/translate',
        handler: async (ctx: any) => {
          const { uid, documentId, from, to } = ctx.request.body ?? {};
          const valid = LOCALES.includes(from) && LOCALES.includes(to) && from !== to && typeof documentId === 'string' && typeof uid === 'string';
          if (!valid || !strapi.contentTypes[uid as keyof typeof strapi.contentTypes]?.pluginOptions) return ctx.badRequest('Invalid request');
          if (!ctx.state.userAbility?.can('plugin::content-manager.explorer.update', uid)) return ctx.forbidden();
          try {
            ctx.body = { data: await translateDocument(strapi, uid, documentId, from, to, ctx.state.userAbility) };
          } catch (error: any) {
            ctx.status = error.status ?? 500;
            ctx.body = { error: { message: error.message } };
          }
        },
        info: { pluginName: 'desertica' },
        config: { policies: ['admin::isAuthenticatedAdmin'] },
      },
    ],
  });
}
