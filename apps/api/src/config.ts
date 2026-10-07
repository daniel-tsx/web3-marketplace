export function readServerConfig(env: NodeJS.ProcessEnv = process.env) {
  if (env.VERCEL === '1' && env.VERCEL_ENV !== 'development') {
    throw new Error('Vercel API deployment is blocked: file-backed SQLite cannot durably share identity, sessions, or challenges across function instances. Complete the storage migration before deploying.');
  }
  return {
    databasePath: env.DATABASE_PATH ?? '.local/auth.sqlite',
    frontendOrigin: env.FRONTEND_ORIGIN ?? 'http://localhost:5173',
    host: env.API_HOST ?? '127.0.0.1',
    port: Number(env.PORT ?? env.API_PORT ?? 3001),
  };
}
