import { openDatabase } from './db.js';
import { readDatabaseUrl } from './config.js';
import { importSQLite } from './sqlite-import.js';

const path = process.argv[2];
if (!path) throw new Error('Usage: db:import <SQLite snapshot path>. Target must be migrated and empty.');
const db = openDatabase(readDatabaseUrl(process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL));
try {
  await importSQLite(db, path);
  console.log('SQLite identity snapshot imported into PostgreSQL. Source unchanged.');
} catch {
  console.error('Identity import failed; check the source schema, empty migrated target and database connection.');
  process.exitCode = 1;
} finally { await db.close(); }
