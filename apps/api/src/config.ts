export function readServerConfig(env: NodeJS.ProcessEnv = process.env) {
  return {
    databaseUrl: readDatabaseUrl(env.DATABASE_URL),
    frontendOrigin: env.FRONTEND_ORIGIN ?? 'http://localhost:5173',
    host: env.API_HOST ?? '127.0.0.1',
    port: Number(env.PORT ?? env.API_PORT ?? 3001),
  };
}

export function readDatabaseUrl(value?: string): string {
  if (!value?.trim()) throw new Error('DATABASE_URL is required; configure a PostgreSQL connection.');
  try {
    const url = new URL(value);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname) throw new Error();
  } catch { throw new Error('Database connection must be a valid PostgreSQL URL.'); }
  return value;
}
