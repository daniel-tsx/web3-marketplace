import { resolve } from 'node:path';
import { openDatabase } from './db.js';
import { buildServer } from './server.js';
import { readServerConfig } from './config.js';

const config = readServerConfig();
const db = openDatabase(resolve(config.databasePath));
const app = await buildServer(db, config.frontendOrigin);
await app.listen({ host: config.host, port: config.port });
