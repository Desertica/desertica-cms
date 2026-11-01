import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { COMPONENT_LAYOUTS, EDIT_LAYOUTS, HIDDEN_FIELDS } from './content-manager.ts';

const fields = (layout: Array<Array<{ name: string }>>) => layout.flat().map((f) => f.name).sort();
const attributes = (file: string) => Object.keys(JSON.parse(fs.readFileSync(new URL(file, import.meta.url), 'utf8')).attributes).sort();

test('every field of a content type is in its edit layout or hidden on purpose, and no other', () => {
  for (const [uid, layout] of Object.entries(EDIT_LAYOUTS)) {
    const name = uid.split('::')[1]!.split('.')[0];
    assert.deepEqual([...fields(layout), ...(HIDDEN_FIELDS[uid] ?? [])].sort(), attributes(`./api/${name}/content-types/${name}/schema.json`), uid);
  }
});

test('every field of a component appears once in its edit layout, and no other', () => {
  for (const [uid, layout] of Object.entries(COMPONENT_LAYOUTS)) {
    const [category, name] = uid.split('.');
    assert.deepEqual([...fields(layout), ...(HIDDEN_FIELDS[uid] ?? [])].sort(), attributes(`./components/${category}/${name}.json`), uid);
  }
});

test('hidden fields exist and are not in the layout', () => {
  for (const [uid, hidden] of Object.entries(HIDDEN_FIELDS)) {
    const layout = EDIT_LAYOUTS[uid] ?? COMPONENT_LAYOUTS[uid];
    assert.ok(layout, `${uid} needs a layout for its hidden fields to be hidden`);
    for (const name of hidden) assert.ok(!fields(layout).includes(name), `${uid}.${name}`);
  }
});
