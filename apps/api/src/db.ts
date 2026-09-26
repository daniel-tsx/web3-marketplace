import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export type Ecosystem = 'evm' | 'solana';
export type Purpose = 'login' | 'link-wallet';

export interface Challenge {
  id: string;
  ecosystem: Ecosystem;
  address: string;
  purpose: Purpose;
  user_id: string | null;
  message: string;
  expires_at: number;
  consumed_at: number | null;
}

export interface WalletRow { ecosystem: Ecosystem; address: string; }

export function openDatabase(path: string) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS wallets (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
      ecosystem TEXT NOT NULL CHECK(ecosystem IN ('evm','solana')),
      address TEXT NOT NULL, created_at INTEGER NOT NULL, verified_at INTEGER NOT NULL,
      UNIQUE(ecosystem, address)
    );
    CREATE INDEX IF NOT EXISTS wallets_user_idx ON wallets(user_id);
    CREATE TABLE IF NOT EXISTS auth_challenges (
      id TEXT PRIMARY KEY, ecosystem TEXT NOT NULL, address TEXT NOT NULL,
      purpose TEXT NOT NULL CHECK(purpose IN ('login','link-wallet')),
      user_id TEXT REFERENCES users(id), message TEXT NOT NULL,
      expires_at INTEGER NOT NULL, consumed_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS challenges_expiry_idx ON auth_challenges(expires_at);
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
      token_hash TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
  `);
  return db;
}
