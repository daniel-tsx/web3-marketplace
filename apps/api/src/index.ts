import { attachDatabasePool } from '@vercel/functions';
import Fastify from 'fastify';
import { openDatabase } from './db.js';
import { buildServer } from './server.js';
import { readServerConfig } from './config.js';

const config = readServerConfig();
const db = openDatabase(config.databaseUrl);
if (process.env.VERCEL === '1') attachDatabasePool(db.pool);
const app = await buildServer(db, config.frontendOrigin, Fastify);
// Vercel captures listen(); awaiting it would block the adapter's module import.
app.listen({ host: config.host, port: config.port });
