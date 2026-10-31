import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildNotice, registerNotifications } from './notify.ts';

function fake(send: (mail: any) => Promise<unknown>) {
  const logs: string[] = [];
  let handler: any;
  const strapi = {
    log: { warn: (m: string) => logs.push(`warn ${m}`), error: (m: string) => logs.push(`error ${m}`) },
    db: { lifecycles: { subscribe: (s: any) => (handler = s.afterCreate) } },
    plugin: () => ({ service: () => ({ send }) }),
  } as any;
  return { strapi, logs, fire: (uid: string, result: any) => handler({ model: { uid }, result }) };
}

const env = { SMTP_HOST: 'smtp', NOTIFY_EMAIL: 'a@x.pe, b@x.pe ', PUBLIC_URL: 'https://cms.x.pe/' };
const reservation = { tourTitle: 'Dune <b>buggy</b>', date: '2026-12-01', adults: 2, children: 1, name: 'Ana & Co', email: 'secret@x.pe', phone: '999', notes: 'private' };

test('the notice is Spanish, escaped and leaves out contact data', () => {
  const n = buildNotice('api::reservation.reservation', reservation, 'https://cms.x.pe/');
  assert.equal(n.subject, 'Nueva solicitud de reserva');
  assert.match(n.html, /Dune &lt;b&gt;buggy&lt;\/b&gt;/);
  assert.match(n.html, /Ana &amp; Co/);
  assert.match(n.text, /Personas: 3/);
  assert.doesNotMatch(n.text + n.html, /secret@x\.pe|999|private/);
  assert.match(n.text, /https:\/\/cms\.x\.pe\/admin\/content-manager\/collection-types\/api::reservation\.reservation/);
});

test('sends to every address without waiting for the mail server', () => {
  const sent: any[] = [];
  const { strapi, fire } = fake(() => new Promise(() => sent.push('pending'))); // never resolves
  registerNotifications(strapi, env);
  assert.equal(fire('api::contact-message.contact-message', { name: 'Ana' }), undefined, 'afterCreate returns at once');
  assert.deepEqual(sent, ['pending']);
});

test('a failed send is logged and never thrown', async () => {
  const { strapi, logs, fire } = fake(() => Promise.reject(new Error('smtp down')));
  registerNotifications(strapi, env);
  assert.doesNotThrow(() => fire('api::reservation.reservation', reservation));
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(logs, ['error [notify] e-mail not sent: smtp down']);
});

test('without SMTP_HOST or NOTIFY_EMAIL it warns once and subscribes to nothing', () => {
  for (const partial of [{ NOTIFY_EMAIL: 'a@x.pe' }, { SMTP_HOST: 'smtp' }]) {
    const { strapi, logs, fire } = fake(async () => {});
    registerNotifications(strapi, partial);
    assert.equal(logs.length, 1);
    assert.throws(() => fire('api::reservation.reservation', reservation), 'no handler registered');
  }
});
