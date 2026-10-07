import { Pool, types, type PoolClient, type QueryResultRow } from 'pg';

export type Ecosystem = 'evm' | 'solana' | 'sui';
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

export interface WalletLinkRequest {
  challenge_id: string;
  session_id: string;
  authorizer_ecosystem: Ecosystem;
  authorizer_address: string;
  authorization_message: string;
}

export class Database {
  readonly pool: Pool;
  private closing?: Promise<void>;

  constructor(connectionString: string) {
    this.pool = new Pool({
      connectionString, max: 5, idleTimeoutMillis: 5_000, connectionTimeoutMillis: 10_000,
      types: {
        getTypeParser(oid, format) {
          if (oid === 20 && format !== 'binary') return (value: string) => {
            const number = Number(value);
            if (!Number.isSafeInteger(number)) throw new Error('Database integer exceeds JavaScript safe range.');
            return number;
          };
          return types.getTypeParser(oid, format);
        },
      },
    });
    // Do not log connection strings or driver errors that may contain credentials.
    this.pool.on('error', () => console.error('PostgreSQL idle connection failed.'));
  }

  query<T extends QueryResultRow = QueryResultRow>(sql: string, values: unknown[] = []) {
    return this.pool.query<T>(sql, values);
  }

  async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    let destroy = false;
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (cause) {
      try { await client.query('ROLLBACK'); } catch { destroy = true; }
      throw cause;
    } finally { client.release(destroy); }
  }

  close() { return this.closing ??= this.pool.end(); }
}

export const openDatabase = (connectionString: string) => new Database(connectionString);
