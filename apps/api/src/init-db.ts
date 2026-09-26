import { resolve } from 'node:path';
import { openDatabase } from './db.js';

const path = resolve(process.env.DATABASE_PATH ?? '.local/auth.sqlite');
openDatabase(path).close();
console.log(`Authentication schema ready: ${path}`);
