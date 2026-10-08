import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

test('browser API requests use the configured base and preserve session credentials', async (t) => {
  for (const scenario of [
    { name: 'ordinary Vite development', dev: true, base: undefined, expected: 'http://localhost:3001' },
    { name: 'production same-origin default', dev: false, base: undefined, expected: '/api' },
    { name: 'Vercel development override', dev: true, base: '/api/', expected: '/api' },
    { name: 'separate API or Docker override', dev: false, base: 'https://api.example/', expected: 'https://api.example' },
  ]) {
    await t.test(scenario.name, async (t) => {
      const fetch = t.mock.method(globalThis, 'fetch', async () => Response.json({ userId: 'user', wallets: [] }));
      const vite = await createServer({
        configFile: false,
        root: fileURLToPath(new URL('../..', import.meta.url)),
        server: { middlewareMode: true, watch: null },
        optimizeDeps: { noDiscovery: true, include: [] },
        define: {
          'import.meta.env.DEV': JSON.stringify(scenario.dev),
          'import.meta.env.VITE_API_URL': scenario.base === undefined ? 'undefined' : JSON.stringify(scenario.base),
        },
      });
      try {
        const api = await vite.ssrLoadModule('/src/auth/api.ts');
        assert.equal((await api.getSession()).userId, 'user');
        await api.requestChallenge('evm', 'wallet');
        await api.logout();
        const calls = fetch.mock.calls.map(({ arguments: args }) => args as unknown as [string, RequestInit]);
        assert.deepEqual(calls.map(([url]) => url), ['/me', '/auth/challenge', '/logout'].map((path) => `${scenario.expected}${path}`));
        for (const [, options] of calls) assert.equal(options.credentials, 'include');
        assert.equal(calls[0][1].method, 'GET');
        assert.equal(calls[1][1].method, 'POST');
        assert.equal(calls[1][1].body, JSON.stringify({ ecosystem: 'evm', address: 'wallet' }));
        fetch.mock.mockImplementation(async () => Response.json({ error: { code: 'unauthenticated', message: 'Session expired' } }, { status: 401 }));
        assert.equal(await api.getSession(), null);
        fetch.mock.mockImplementation(async () => new Response('<html>Service unavailable</html>', { status: 503 }));
        await assert.rejects(api.getSession(), (error: unknown) => error instanceof Error && 'code' in error && error.code === 'api_unavailable');
        fetch.mock.mockImplementation(async () => Response.json({ userId: 'user', wallets: [] }));
        const abort = new AbortController();
        await api.getSession(abort.signal);
        const last = fetch.mock.calls.at(-1)!.arguments as unknown as [string, RequestInit];
        assert.equal(last[1].signal, abort.signal);
      } finally { await vite.close(); }
    });
  }
});
