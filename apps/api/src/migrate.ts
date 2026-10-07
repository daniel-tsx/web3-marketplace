import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import type { Database } from './db.js';

export async function migrate(db: Database, directory = new URL('../migrations/', import.meta.url)) {
  const files = (await readdir(directory)).filter((name) => /^\d+_[a-z_]+\.sql$/.test(name)).sort();
  await db.transaction(async (client) => {
    // Transaction-scoped lock also works with transaction pooling. No session state.
    await client.query('SELECT pg_advisory_xact_lock(741906204)');
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    for (const version of files) {
      // Windows and Linux checkouts must produce the same migration checksum.
      const sql = (await readFile(new URL(version, directory), 'utf8')).replaceAll('\r\n', '\n');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const existing = (await client.query<{ checksum: string }>('SELECT checksum FROM schema_migrations WHERE version = $1', [version])).rows[0];
      if (existing) {
        if (existing.checksum !== checksum) throw new Error('An applied database migration was modified.');
        continue;
      }
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)', [version, checksum]);
    }
  });
}
