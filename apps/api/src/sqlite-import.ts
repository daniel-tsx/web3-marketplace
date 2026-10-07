import { DatabaseSync } from 'node:sqlite';
import type { Database } from './db.js';

const tables = [
  ['users', ['id', 'created_at']],
  ['wallets', ['id', 'user_id', 'ecosystem', 'address', 'created_at', 'verified_at']],
  ['auth_challenges', ['id', 'ecosystem', 'address', 'purpose', 'user_id', 'message', 'expires_at', 'consumed_at']],
  ['sessions', ['id', 'user_id', 'token_hash', 'created_at', 'expires_at']],
  ['wallet_link_requests', ['challenge_id', 'session_id', 'authorizer_ecosystem', 'authorizer_address', 'authorization_message']],
] as const;

// Explicit one-time cutover tool only. The running API never imports SQLite.
export async function importSQLite(db: Database, path: string) {
  const source = new DatabaseSync(path, { readOnly: true });
  try {
    source.exec('BEGIN'); // A consistent read snapshot; no source schema/data writes.
    await db.transaction(async (client) => {
      await client.query(`LOCK TABLE users, wallets, auth_challenges, sessions, wallet_link_requests IN ACCESS EXCLUSIVE MODE`);
      for (const [table] of tables) {
        if ((await client.query(`SELECT 1 FROM ${table} LIMIT 1`)).rowCount) throw new Error('SQLite import requires an empty PostgreSQL identity database.');
      }
      for (const [table, columns] of tables) {
        const exists = source.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
        // Pre-H2 snapshots lack link context; their legacy links must still fail closed.
        if (!exists && table === 'wallet_link_requests') continue;
        if (!exists) throw new Error('SQLite source is missing an identity table.');
        const rows = source.prepare(`SELECT ${columns.join(', ')} FROM ${table}`).all();
        for (const row of rows) {
          await client.query(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')})`, columns.map((column) => row[column]));
        }
      }
    });
  } finally { source.close(); }
}
