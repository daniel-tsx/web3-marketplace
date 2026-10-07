export function readServerConfig(env: NodeJS.ProcessEnv = process.env) {
  return {
    databaseUrl: readDatabaseUrl(env.DATABASE_URL),
    frontendOrigin: readFrontendOrigin(env),
    host: env.API_HOST ?? '127.0.0.1',
    port: Number(env.PORT ?? env.API_PORT ?? 3001),
  };
}

export function readFrontendOrigin(env: NodeJS.ProcessEnv = process.env): string {
  const hosted = env.VERCEL === '1' && env.VERCEL_ENV !== 'development';
  let value = env.FRONTEND_ORIGIN ?? 'http://localhost:5173';
  if (hosted) {
    if (env.VERCEL_ENV === 'preview') {
      // Trust only this deployment's platform metadata, never request headers.
      if (!env.VERCEL_URL || !/^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.vercel\.app$/i.test(env.VERCEL_URL)) {
        throw new Error('Vercel Preview requires a valid platform VERCEL_URL.');
      }
      value = `https://${env.VERCEL_URL}`;
    } else if (env.VERCEL_ENV === 'production') {
      if (!env.FRONTEND_ORIGIN) throw new Error('Vercel Production requires the canonical FRONTEND_ORIGIN.');
    } else {
      throw new Error('Vercel requires a recognized VERCEL_ENV for origin configuration.');
    }
  }
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== value || url.hostname.includes('*') ||
      (hosted && url.protocol !== 'https:')) throw new Error();
  } catch { throw new Error('Frontend origin must be one exact origin; hosted origins require HTTPS.'); }
  return value;
}

export function readDatabaseUrl(value?: string): string {
  if (!value?.trim()) throw new Error('DATABASE_URL is required; configure a PostgreSQL connection.');
  try {
    const url = new URL(value);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname) throw new Error();
  } catch { throw new Error('Database connection must be a valid PostgreSQL URL.'); }
  return value;
}
