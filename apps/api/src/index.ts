import { resolve } from 'node:path';
import { openDatabase } from './db.js';
import { buildServer } from './server.js';

const db = openDatabase(resolve(process.env.DATABASE_PATH ?? '.local/auth.sqlite'));
const app = await buildServer(db, process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173');
await app.listen({ host: '127.0.0.1', port: Number(process.env.API_PORT ?? 3001) });
