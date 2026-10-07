import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { migrate } from './migrate.js';
import { createTestDatabase } from './test-db.js';

test('clean PostgreSQL migrations are concurrent-safe, repeatable and retain identity rows', async (t) => {
  const { db, connect } = await createTestDatabase(t, false);
  const other = connect();
  try {
    await Promise.all([migrate(db), migrate(other)]);
    assert.equal((await db.query('SELECT count(*) AS count FROM schema_migrations')).rows[0].count, 1);
    await db.query("INSERT INTO users VALUES ('existing', 1)");
    await migrate(db);
    assert.equal((await other.query("SELECT id FROM users WHERE id = 'existing'")).rows[0].id, 'existing');
    await db.query("UPDATE schema_migrations SET checksum = 'changed'");
    await assert.rejects(migrate(db), /migration was modified/);
  } finally { await other.close(); }
});

test('PostgreSQL enforces wallet ownership, session hashes, references and ecosystem/purpose checks', async (t) => {
  const { db } = await createTestDatabase(t);
  await db.query("INSERT INTO users VALUES ('user-a', 1), ('user-b', 1)");
  await db.query("INSERT INTO wallets VALUES ('wallet-a', 'user-a', 'evm', 'address', 1, 1)");
  await assert.rejects(db.query("INSERT INTO wallets VALUES ('wallet-b', 'user-b', 'evm', 'address', 1, 1)"), { code: '23505' });
  await assert.rejects(db.query("INSERT INTO wallets VALUES ('bad', 'missing', 'evm', 'other', 1, 1)"), { code: '23503' });
  await assert.rejects(db.query("INSERT INTO wallets VALUES ('bad', 'user-a', 'unknown', 'other', 1, 1)"), { code: '23514' });
  await db.query("INSERT INTO wallets VALUES ('case-a', 'user-a', 'solana', 'Abc', 1, 1), ('case-b', 'user-b', 'solana', 'abc', 1, 1)");
  assert.equal((await db.query("SELECT count(*) AS count FROM wallets WHERE ecosystem = 'solana'")).rows[0].count, 2);
  await db.query("INSERT INTO sessions VALUES ('session-a', 'user-a', 'hash', 1, 9999999999999)");
  await assert.rejects(db.query("INSERT INTO sessions VALUES ('session-b', 'user-b', 'hash', 1, 9999999999999)"), { code: '23505' });
  await assert.rejects(db.query("INSERT INTO auth_challenges VALUES ('bad', 'evm', 'address', 'unknown', NULL, 'message', 10, NULL)"), { code: '23514' });
  await db.query("INSERT INTO auth_challenges VALUES ('link', 'evm', 'address', 'link-wallet', 'user-a', 'message', 10, NULL)");
  await db.query("INSERT INTO wallet_link_requests VALUES ('link', 'session-a', 'evm', 'address', 'approval')");
  await db.query("DELETE FROM sessions WHERE id = 'session-a'");
  assert.equal((await db.query('SELECT count(*) AS count FROM wallet_link_requests')).rows[0].count, 0);
  assert.equal((await db.query('SELECT count(*) AS count FROM auth_challenges')).rows[0].count, 1);
});

test('transaction failure rolls back all writes and releases its connection', async (t) => {
  const { db } = await createTestDatabase(t);
  await assert.rejects(db.transaction(async (client) => {
    await client.query("INSERT INTO users VALUES ('rolled-back', 1)");
    throw new Error('abort');
  }), /abort/);
  assert.equal((await db.query('SELECT count(*) AS count FROM users')).rows[0].count, 0);
  assert.equal(db.pool.waitingCount, 0);
});

test('migration checksums agree across Windows and Linux line endings', async (t) => {
  const { db } = await createTestDatabase(t, false);
  const directory = await mkdtemp(join(tmpdir(), 'vehicle-pg-migrations-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, '001_example.sql');
  await writeFile(file, 'CREATE TABLE example (id TEXT PRIMARY KEY);\r\n');
  const location = pathToFileURL(`${directory}/`);
  await migrate(db, location);
  await writeFile(file, 'CREATE TABLE example (id TEXT PRIMARY KEY);\n');
  await migrate(db, location);
  assert.equal((await db.query('SELECT count(*) AS count FROM schema_migrations')).rows[0].count, 1);
});
