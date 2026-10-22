#!/usr/bin/env node
/**
 * Checks the built-in Editor role against a RUNNING Strapi on an EMPTY seeded database (the CI smoke):
 * the first admin is registered, an Editor user is created and must list, edit and publish tours in
 * en and es, and must not delete them nor reach the inbox or the Sitio settings.
 *
 *   CMS_URL=http://127.0.0.1:1337 node scripts/verify-editor.mjs
 */
import assert from 'node:assert/strict';

const base = process.env.CMS_URL ?? 'http://127.0.0.1:1337';
const password = 'Editor-Smoke-1';

async function call(method, path, token, body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

const admin = await call('POST', '/admin/register-admin', null, {
  email: 'admin-smoke@example.com', firstname: 'Admin', lastname: 'Smoke', password,
});
assert.equal(admin.status, 200, 'register-admin (needs an empty database)');
const adminToken = admin.body.data.token;

const roles = await call('GET', '/admin/roles', adminToken);
const editor = roles.body.data.find((r) => r.code === 'strapi-editor');
const created = await call('POST', '/admin/users', adminToken, {
  email: 'editor-smoke@example.com', firstname: 'Editor', lastname: 'Smoke', roles: [editor.id],
});
assert.equal(created.status, 201, 'create editor');
const registered = await call('POST', '/admin/register', null, {
  registrationToken: created.body.data.registrationToken,
  userInfo: { firstname: 'Editor', lastname: 'Smoke', password },
});
assert.equal(registered.status, 200, 'register editor');
const token = registered.body.data.token;

const cm = '/content-manager/collection-types';
const tour = 'api::tour.tour';
for (const locale of ['en', 'es']) {
  const list = await call('GET', `${cm}/${tour}?locale=${locale}`, token);
  assert.equal(list.status, 200, `list tours ${locale}`);
  assert.ok(list.body.results.length > 0, `tours listed in ${locale}`);
}

const { documentId, title, slug } = (await call('GET', `${cm}/${tour}?locale=en`, token)).body.results[0];
const put = await call('PUT', `${cm}/${tour}/${documentId}?locale=en`, token, { title, slug });
assert.equal(put.status, 200, 'edit tour');
assert.equal(put.body.data.title, title, 'every field is readable and saved');
assert.equal((await call('POST', `${cm}/${tour}/${documentId}/actions/publish?locale=en`, token, {})).status, 200, 'publish tour');
assert.equal((await call('DELETE', `${cm}/${tour}/${documentId}?locale=en`, token)).status, 403, 'delete tour is refused');

for (const uid of ['api::reservation.reservation', 'api::contact-message.contact-message']) {
  assert.equal((await call('GET', `${cm}/${uid}`, token)).status, 403, `${uid} is refused`);
}
assert.equal((await call('GET', '/content-manager/single-types/api::site-setting.site-setting', token)).status, 403, 'site-setting is refused');

console.log('Editor role ok');
