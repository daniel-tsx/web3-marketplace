import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readServerConfig } from './config.js';

test('ordinary local development preserves SQLite, origin and listener defaults', () => {
  assert.deepEqual(readServerConfig({}), {
    databasePath: '.local/auth.sqlite', frontendOrigin: 'http://localhost:5173', host: '127.0.0.1', port: 3001,
  });
});

test('platform PORT takes precedence while API_PORT and API_HOST remain configurable', () => {
  const env = { DATABASE_PATH: '/data/auth.sqlite', FRONTEND_ORIGIN: 'https://marketplace.example', API_HOST: '0.0.0.0', API_PORT: '3001' };
  assert.deepEqual(readServerConfig(env), { databasePath: env.DATABASE_PATH, frontendOrigin: env.FRONTEND_ORIGIN, host: '0.0.0.0', port: 3001 });
  assert.equal(readServerConfig({ ...env, PORT: '4321' }).port, 4321);
});

test('Vercel development permits local SQLite; hosted environments reject ephemeral identity storage', () => {
  assert.equal(readServerConfig({ VERCEL: '1', VERCEL_ENV: 'development', PORT: '4321' }).port, 4321);
  for (const VERCEL_ENV of ['preview', 'production', undefined]) {
    for (const DATABASE_PATH of [undefined, '/tmp/auth.sqlite', ':memory:']) {
      assert.throws(() => readServerConfig({ VERCEL: '1', VERCEL_ENV, DATABASE_PATH }), /Complete the storage migration before deploying/);
    }
  }
});
