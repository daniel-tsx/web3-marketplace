import { attachDatabasePool } from '@vercel/functions';
import { openDatabase } from './db.js';
import { buildServer } from './server.js';
import { readServerConfig } from './config.js';

const config = readServerConfig();
const db = openDatabase(config.databaseUrl);
if (process.env.VERCEL === '1') attachDatabasePool(db.pool);
const app = await buildServer(db, config.frontendOrigin);
await app.listen({ host: config.host, port: config.port });
