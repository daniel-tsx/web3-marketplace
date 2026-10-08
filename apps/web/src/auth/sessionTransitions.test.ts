import assert from 'node:assert/strict';
import test from 'node:test';
import { QueryClient } from '@tanstack/react-query';
import { clearSession, refreshSession, sessionKey } from './sessionTransitions';

const signedIn = { userId: 'account', wallets: [{ ecosystem: 'evm' as const, address: 'wallet' }] };
test('logout cancels a pre-logout session read so its late result cannot restore identity', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let finish!: (value: typeof signedIn) => void;
  const oldRead = client.fetchQuery({ queryKey: sessionKey, queryFn: () => new Promise<typeof signedIn>((resolve) => { finish = resolve; }) }).catch(() => undefined);
  await clearSession(client);
  finish(signedIn);
  await oldRead;
  assert.equal(client.getQueryData(sessionKey), null);
  client.clear();
});
test('post-login refresh reads the new session even with an indefinitely fresh guest cache', async () => {
  const client = new QueryClient();
  client.setQueryData(sessionKey, null);
  let reads = 0;
  const session = await refreshSession(client, async () => { reads++; return signedIn; });
  assert.deepEqual(session, signedIn);
  assert.equal(reads, 1);
  client.clear();
});
test('an expired session becomes guest and API read failure remains distinct from expiry', async () => {
  const client = new QueryClient();
  client.setQueryData(sessionKey, signedIn);
  assert.equal(await refreshSession(client, async () => null), null);
  client.setQueryData(sessionKey, signedIn);
  await assert.rejects(refreshSession(client, async () => { throw new Error('API unavailable'); }), /API unavailable/);
  assert.equal(client.getQueryState(sessionKey)?.status, 'error');
  client.clear();
});
