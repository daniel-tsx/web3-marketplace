import { randomUUID } from 'node:crypto';
import type { TestContext } from 'node:test';
import { openDatabase } from './db.js';
import { readDatabaseUrl } from './config.js';
import { migrate } from './migrate.js';

export async function createTestDatabase(t: TestContext, applyMigrations = true) {
  if (!process.env.TEST_DATABASE_URL) throw new Error('API tests require TEST_DATABASE_URL for a dedicated disposable PostgreSQL database.');
  const base = readDatabaseUrl(process.env.TEST_DATABASE_URL);
  const schema = `test_${randomUUID().replaceAll('-', '')}`;
  const admin = openDatabase(base);
  const url = new URL(base);
  url.searchParams.set('options', `-c search_path=${schema}`);
  const db = openDatabase(url.toString());
  await admin.query(`CREATE SCHEMA ${schema}`);
  t.after(async () => {
    await db.close();
    try { await admin.query(`DROP SCHEMA ${schema} CASCADE`); } finally { await admin.close(); }
  });
  if (applyMigrations) await migrate(db);
  return { db, connect: () => openDatabase(url.toString()) };
}
