import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readServerConfig, readDatabaseUrl } from './config.js';

const DATABASE_URL = 'postgresql://vehicle:example@localhost:5432/vehicle_test';

test('PostgreSQL is mandatory; local origin and listener defaults remain unchanged', () => {
  assert.deepEqual(readServerConfig({ DATABASE_URL }), {
    databaseUrl: DATABASE_URL, frontendOrigin: 'http://localhost:5173', host: '127.0.0.1', port: 3001,
  });
  for (const env of [{}, { DATABASE_PATH: '.local/auth.sqlite' }, { DATABASE_URL: '' }]) {
    assert.throws(() => readServerConfig(env), /DATABASE_URL is required/);
  }
});

test('platform PORT takes precedence while API_PORT and API_HOST remain configurable', () => {
  const env = { DATABASE_URL, FRONTEND_ORIGIN: 'https://marketplace.example', API_HOST: '0.0.0.0', API_PORT: '3001' };
  assert.deepEqual(readServerConfig(env), { databaseUrl: DATABASE_URL, frontendOrigin: env.FRONTEND_ORIGIN, host: '0.0.0.0', port: 3001 });
  assert.equal(readServerConfig({ ...env, PORT: '4321' }).port, 4321);
});

test('Vercel environments use PostgreSQL and never fall back to SQLite', () => {
  for (const VERCEL_ENV of ['development', 'preview', 'production']) {
    assert.equal(readServerConfig({ DATABASE_URL, VERCEL: '1', VERCEL_ENV }).databaseUrl, DATABASE_URL);
    assert.throws(() => readServerConfig({ VERCEL: '1', VERCEL_ENV, DATABASE_PATH: '/tmp/auth.sqlite' }), /DATABASE_URL is required/);
  }
});

test('invalid connection configuration is rejected without echoing credentials', () => {
  for (const value of ['sqlite:auth.sqlite', ':memory:', 'https://user:credential@example.invalid/db', 'postgresql://']) {
    assert.throws(() => readDatabaseUrl(value), (error: unknown) => error instanceof Error && error.message === 'Database connection must be a valid PostgreSQL URL.');
  }
});
