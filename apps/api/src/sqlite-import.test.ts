import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test, type TestContext } from 'node:test';
import { buildServer } from './server.js';
import { importSQLite } from './sqlite-import.js';
import { createTestDatabase } from './test-db.js';

async function snapshot(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), 'vehicle-sqlite-import-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'auth.sqlite');
  const source = new DatabaseSync(path);
  source.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, created_at INTEGER NOT NULL);
    CREATE TABLE wallets (id TEXT PRIMARY KEY, user_id TEXT, ecosystem TEXT, address TEXT, created_at INTEGER, verified_at INTEGER);
    CREATE TABLE auth_challenges (id TEXT PRIMARY KEY, ecosystem TEXT, address TEXT, purpose TEXT, user_id TEXT, message TEXT, expires_at INTEGER, consumed_at INTEGER);
    CREATE TABLE sessions (id TEXT PRIMARY KEY, user_id TEXT, token_hash TEXT, created_at INTEGER, expires_at INTEGER);
    CREATE TABLE wallet_link_requests (challenge_id TEXT PRIMARY KEY, session_id TEXT, authorizer_ecosystem TEXT, authorizer_address TEXT, authorization_message TEXT);
    INSERT INTO users VALUES ('existing-user', 123);
    INSERT INTO wallets VALUES ('existing-wallet', 'existing-user', 'evm', '0x1111111111111111111111111111111111111111', 123, 124);
    INSERT INTO auth_challenges VALUES ('pending-link', 'solana', 'target', 'link-wallet', 'existing-user', 'exact new-wallet message', 9999999999999, NULL);
    INSERT INTO auth_challenges VALUES ('used-login', 'evm', 'address', 'login', NULL, 'exact consumed message', 9999999999999, 125);
    INSERT INTO wallet_link_requests VALUES ('pending-link', 'existing-session', 'evm', '0x1111111111111111111111111111111111111111', 'exact trusted-wallet message');
  `);
  // Synthetic token only: exercises preservation of the opaque cookie/hash relationship.
  const token = 'synthetic-import-session-token';
  source.prepare('INSERT INTO sessions VALUES (?, ?, ?, ?, ?)').run('existing-session', 'existing-user', createHash('sha256').update(token).digest('hex'), 123, 9999999999999);
  const tables = ['users', 'wallets', 'auth_challenges', 'sessions', 'wallet_link_requests'];
  const expected = tables.map((table) => source.prepare(`SELECT * FROM ${table} ORDER BY 1`).all().map((row) => ({ ...row })));
  source.close();
  return { path, token, tables, expected };
}

test('SQLite cutover preserves all five entities, session hashes, consumption and link context without changing the source', async (t) => {
  const { path, token, tables, expected } = await snapshot(t);
  const before = await readFile(path);
  const { db } = await createTestDatabase(t);
  await importSQLite(db, path);
  for (const [i, table] of tables.entries()) assert.deepEqual((await db.query(`SELECT * FROM ${table} ORDER BY 1`)).rows, expected[i]);
  assert.deepEqual(await readFile(path), before);
  await assert.rejects(importSQLite(db, path), /requires an empty PostgreSQL/);
  const app = await buildServer(db);
  try {
    const response = await app.inject({ url: '/me', headers: { cookie: `vehicle_session=${token}` } });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().userId, 'existing-user');
    assert.equal(response.json().wallets.length, 1);
  } finally { await app.close(); }
});

test('invalid SQLite cutover rolls back earlier inserts instead of leaving a partial identity database', async (t) => {
  const { path, tables } = await snapshot(t);
  const source = new DatabaseSync(path);
  source.exec("UPDATE sessions SET user_id = 'missing-user'");
  source.close();
  const { db } = await createTestDatabase(t);
  await assert.rejects(importSQLite(db, path), { code: '23503' });
  for (const table of tables) assert.equal((await db.query(`SELECT count(*) AS count FROM ${table}`)).rows[0].count, 0);
});
