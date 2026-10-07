import { openDatabase } from './db.js';
import { readDatabaseUrl } from './config.js';
import { migrate } from './migrate.js';

const db = openDatabase(readDatabaseUrl(process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL));
try {
  await migrate(db);
  console.log('Authentication PostgreSQL migrations applied.');
} catch {
  console.error('Database migration failed; check connectivity, permissions and migration history.');
  process.exitCode = 1;
} finally { await db.close(); }
