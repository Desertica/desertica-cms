import assert from 'node:assert/strict';
import { test } from 'node:test';
import { groupTexts, imageHelp, HIDDEN_SECTIONS, isLong, rowName, sectionTitle, type TextRow } from './textos-page.ts';

const row = (page: string, section: string, key: string, value = 'x', extra: Partial<TextRow> = {}): TextRow => ({ documentId: key, page, section, key, value, ...extra });

test('groups by page in website order, then section, keeping row order', () => {
  const groups = groupTexts([row('about', 'hero', 'a'), row('global', 'seo', 'b'), row('about', 'hero', 'c'), row('about', 'map', 'd'), row('zzz', 'x', 'e')]);
  assert.deepEqual(groups.map((g) => g.page), ['global', 'about', 'zzz']);
  const about = groups[1];
  assert.equal(about.title, 'Nosotros');
  assert.deepEqual(about.sections.map((s) => s.rows.map((r) => r.key)), [['a', 'c'], ['d']]);
  assert.equal(about.count, 3);
});

test('technical sections are hidden', () => {
  assert.ok(HIDDEN_SECTIONS.has('global/placeholders'));
  const groups = groupTexts([row('global', 'placeholders', 'p', 'Placeholder SSR.'), row('global', 'seo', 's')]);
  assert.deepEqual(groups[0].sections.map((s) => s.id), ['global/seo']);
});

test('search matches value or name, ignoring case, across pages', () => {
  const rows = [row('home', 'hero', 'h', 'Reserva ahora'), row('about', 'hero', 'a', 'Quiénes somos', { label: 'Nosotros › portada › título' })];
  assert.deepEqual(groupTexts(rows, ' RESERVA ').map((g) => g.page), ['home']);
  assert.deepEqual(groupTexts(rows, 'título').map((g) => g.page), ['about']);
  assert.deepEqual(groupTexts(rows, 'nada'), []);
});

test('readable names and field size', () => {
  assert.equal(rowName(row('a', 'b', 'k', 'v', { label: 'Inicio › portada › hero title' })), 'Hero title');
  assert.equal(rowName(row('a', 'b', 'k')), 'K');
  assert.equal(sectionTitle('not-found'), 'Página no encontrada');
  assert.equal(sectionTitle('new-thing'), 'New thing');
  assert.ok(isLong(row('a', 'b', 'k', 'x', { kind: 'long' })) && isLong(row('a', 'b', 'k', 'y'.repeat(80))) && !isLong(row('a', 'b', 'k')));
});

test('numbers stay the same while searching, and every image has help', () => {
  const rows = [row('about', 'hero', 'a', 'uno'), row('about', 'map', 'b', 'dos'), row('about', 'map', 'c', 'tres')];
  const [g] = groupTexts(rows, 'tres');
  assert.deepEqual([g.sections[0].n, g.sections[0].start, g.sections[0].rows.length], [2, 1, 1]);
  assert.match(imageHelp('home.hero', 'home', 'hero'), /portada de Inicio/);
  assert.match(imageHelp('about.archive.3', 'about', 'archive'), /Foto 3 de 12/);
  assert.match(imageHelp('x.y', 'home', 'hero'), /Aparece en Inicio/);
});

test('keys with numbers sort as numbers inside a section', () => {
  const rows = ['about.archive.10', 'about.archive.2', 'about.archive.1'].map((k) => row('about', 'archive', k));
  assert.deepEqual(groupTexts(rows)[0].sections[0].rows.map((r) => r.key), ['about.archive.1', 'about.archive.2', 'about.archive.10']);
});
