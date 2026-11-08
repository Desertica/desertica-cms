import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertProductionEnv } from './production-env.ts';

const ok = { NODE_ENV: 'production', CLIENT_URLS: 'https://desertica.pe', APP_KEYS: 'a,b,c,d' };

test('production needs real secrets and CLIENT_URLS', () => {
  assert.doesNotThrow(() => assertProductionEnv(ok));
  assert.throws(() => assertProductionEnv({ ...ok, CLIENT_URLS: '' }), /CLIENT_URLS/);
  assert.throws(() => assertProductionEnv({ ...ok, APP_KEYS: 'changeMe1,b,c,d' }), /APP_KEYS/);
  assert.doesNotThrow(() => assertProductionEnv({ NODE_ENV: 'development' }));
});
