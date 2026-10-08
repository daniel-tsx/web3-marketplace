import assert from 'node:assert/strict';
import { test } from 'node:test';
import { onlineManager, QueryClient, QueryObserver } from '@tanstack/react-query';
import { createReadReconciliation, fetchReconciledQuery, refetchAffectedQueries, type ReconciliationPhase } from './reconciliation';
import { successfulDigest } from './sui/transactionResult';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TransactionStatus } from '../components/TransactionStatus';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

test('post-execution invalidation must surface an authoritative reread failure', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const queryKey = ['evm', 'listing', 'vehicle'];
  const cause = new Error('RPC reread unavailable');
  const observer = new QueryObserver(client, { queryKey, initialData: 'reviewed listing', staleTime: Infinity, queryFn: async () => { throw cause; } });
  const unsubscribe = observer.subscribe(() => {});
  try {
    // Before H3, invalidateQueries resolved despite this exact query's failed reread.
    await assert.rejects(refetchAffectedQueries(client, [queryKey]), (error) => error === cause);
    assert.equal(client.getQueryData(queryKey), 'reviewed listing');
  } finally { unsubscribe(); client.clear(); }
});

test('successful execution retains each native identifier through failed refresh and read-only recovery', async (t) => {
  t.mock.method(console, 'error', () => {});
  for (const result of [{ hash: 'evm-hash' }, { signature: 'solana-signature' }, { digest: 'sui-digest' }]) {
    await t.test(Object.keys(result)[0], async () => {
      type Phase = typeof result & ReconciliationPhase;
      const phases: Phase[] = [];
      const reconciliation = createReadReconciliation<typeof result>((phase) => phases.push(phase));
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const queryKey = [Object.keys(result)[0], 'affected-state'];
      const cause = new Error('post-execution RPC failure');
      let broken = true;
      let reads = 0;
      const observer = new QueryObserver(client, {
        queryKey, initialData: 'old', staleTime: Infinity,
        queryFn: async () => { reads++; if (broken) throw cause; return 'canonical'; },
      });
      const unsubscribe = observer.subscribe(() => {});
      let walletSubmissions = 0;
      const execute = async () => { walletSubmissions++; return result; };
      try {
        await reconciliation.start(await execute(), async () => { await refetchAffectedQueries(client, [queryKey]); });
        const failed = phases.at(-1)!;
        assert.equal(failed.stage, 'reconciliation-failed');
        assert.deepEqual(Object.fromEntries(Object.entries(failed).filter(([key]) => key in result)), result);
        assert.ok(failed.stage === 'reconciliation-failed');
        assert.equal(failed.refreshError.cause, cause);
        assert.equal(failed.refreshError.message, cause.message);
        assert.equal(client.getQueryData(queryKey), 'old');
        assert.equal(phases.some((phase) => phase.stage === 'confirmed'), false);
        broken = false;
        await reconciliation.retry();
        assert.equal(phases.at(-1)!.stage, 'confirmed');
        assert.equal(client.getQueryData(queryKey), 'canonical');
        assert.equal(reads, 2);
        assert.equal(walletSubmissions, 1);
      } finally { unsubscribe(); client.clear(); }
    });
  }
});

test('execution success and successful reads reach confirmed only after the reads complete', async () => {
  const phases: ({ hash: string } & ReconciliationPhase)[] = [];
  const reconciliation = createReadReconciliation<{ hash: string }>((phase) => phases.push(phase));
  const read = deferred<void>();
  const pending = reconciliation.start({ hash: 'hash' }, () => read.promise);
  assert.equal(phases.at(-1)!.stage, 'reconciling');
  read.resolve(undefined);
  await pending;
  assert.deepEqual(phases.at(-1), { hash: 'hash', stage: 'confirmed' });
});

test('concurrent reconciliation retries perform one read batch and preserve read details', async () => {
  const phases: ({ digest: string; details?: string } & ReconciliationPhase)[] = [];
  const reconciliation = createReadReconciliation<{ digest: string; details?: string }>((phase) => phases.push(phase));
  const read = deferred<{ details: string }>();
  let reads = 0;
  const first = reconciliation.start({ digest: 'digest' }, () => { reads++; return read.promise; });
  const second = reconciliation.retry();
  assert.equal(first, second);
  read.resolve({ details: 'effects' });
  await first;
  assert.equal(reads, 1);
  assert.deepEqual(phases.at(-1), { digest: 'digest', details: 'effects', stage: 'confirmed' });
});

test('failed execution never creates a reconciliation job or a write retry', async () => {
  const phases: ({ digest: string } & ReconciliationPhase)[] = [];
  const reconciliation = createReadReconciliation<{ digest: string }>((phase) => phases.push(phase));
  let reads = 0;
  await assert.rejects(async () => {
    const digest = successfulDigest({ FailedTransaction: { status: { error: { message: 'Move abort' } } } });
    await reconciliation.start({ digest }, async () => { reads++; });
  }, /Move abort/);
  await reconciliation.retry();
  assert.equal(reads, 0);
  assert.deepEqual(phases, []);
});

test('a reset prevents an older read job from overwriting another transaction result', async () => {
  const phases: ({ hash: string } & ReconciliationPhase)[] = [];
  const reconciliation = createReadReconciliation<{ hash: string }>((phase) => phases.push(phase));
  const read = deferred<void>();
  const old = reconciliation.start({ hash: 'old' }, () => read.promise);
  reconciliation.reset();
  await reconciliation.start({ hash: 'new' }, async () => {});
  read.resolve(undefined);
  await old;
  assert.deepEqual(phases.at(-1), { hash: 'new', stage: 'confirmed' });
});

test('disabled reads and indefinitely fresh cache still require a real post-execution read', async () => {
  const client = new QueryClient();
  const queryKey = ['sui', 'vehicle'];
  let reads = 0;
  const observer = new QueryObserver(client, { queryKey, enabled: false, initialData: 'old owner', staleTime: Infinity, queryFn: async () => { reads++; return 'new owner'; } });
  const unsubscribe = observer.subscribe(() => {});
  try {
    await refetchAffectedQueries(client, [queryKey]);
    assert.equal(reads, 1);
    assert.equal(client.getQueryData(queryKey), 'new owner');
    await assert.rejects(refetchAffectedQueries(client, [['missing-required-read']]), /no longer available/);
  } finally { unsubscribe(); client.clear(); }
});

test('partial refresh success cannot hide another affected read failure', async (t) => {
  t.mock.method(console, 'error', () => {});
  const client = new QueryClient();
  const cause = new Error('allowance RPC failed');
  const observers = [
    new QueryObserver(client, { queryKey: ['evm', 'listing'], initialData: 'active', staleTime: Infinity, queryFn: async () => 'inactive' }),
    new QueryObserver(client, { queryKey: ['evm', 'allowance'], initialData: 1000n, staleTime: Infinity, queryFn: async () => { throw cause; } }),
  ];
  const unsubscribes = observers.map((observer) => observer.subscribe(() => {}));
  const phases: ({ hash: string } & ReconciliationPhase)[] = [];
  const reconciliation = createReadReconciliation<{ hash: string }>((phase) => phases.push(phase));
  try {
    await reconciliation.start({ hash: 'hash' }, async () => { await refetchAffectedQueries(client, [['evm', 'listing'], ['evm', 'allowance']]); });
    assert.equal(client.getQueryData(['evm', 'listing']), 'inactive');
    assert.equal(client.getQueryData(['evm', 'allowance']), 1000n);
    const failed = phases.at(-1)!;
    assert.ok(failed.stage === 'reconciliation-failed');
    assert.equal(failed.refreshError.cause, cause);
  } finally { unsubscribes.forEach((unsubscribe) => unsubscribe()); client.clear(); }
});

test('duplicate affected keys perform one reread instead of cancelling each other', async () => {
  const client = new QueryClient();
  let reads = 0;
  const observer = new QueryObserver(client, { queryKey: ['balance'], initialData: 1n, staleTime: Infinity, queryFn: async () => { reads++; return 2n; } });
  const unsubscribe = observer.subscribe(() => {});
  try {
    await refetchAffectedQueries(client, [['balance'], ['balance']]);
    assert.equal(reads, 1);
  } finally { unsubscribe(); client.clear(); }
});

test('reconciliation-failure UI states execution success, retains the hash, and offers reads only', () => {
  const markup = renderToStaticMarkup(createElement(TransactionStatus, {
    phase: { stage: 'reconciliation-failed', hash: '0x123', refreshError: { message: 'RPC unavailable', cause: new Error('RPC unavailable') } },
    retryReconciliation: async () => {},
  }));
  assert.match(markup, /Transaction succeeded/);
  assert.match(markup, /0x123/);
  assert.match(markup, /state refresh failed/);
  assert.match(markup, /Technical transaction details/);
  assert.match(markup, /RPC unavailable/);
  assert.match(markup, /do not resubmit the transaction/);
  assert.match(markup, /Retry state refresh/);
  assert.doesNotMatch(markup, /Confirmed/);
});

test('a pre-transaction in-flight response cannot masquerade as post-execution reconciliation', async () => {
  const client = new QueryClient();
  const queryKey = ['evm', 'owner'];
  const oldRead = deferred<string>();
  let reads = 0;
  const queryFn = () => ++reads === 1 ? oldRead.promise : Promise.resolve('buyer');
  const old = client.fetchQuery({ queryKey, queryFn }).catch(() => {});
  await fetchReconciledQuery(client, { queryKey, queryFn });
  oldRead.resolve('seller');
  await old;
  assert.equal(reads, 2);
  assert.equal(client.getQueryData(queryKey), 'buyer');
  client.clear();
});

test('an offline/paused reread cannot mark execution fully reconciled', { timeout: 2000 }, async () => {
  const client = new QueryClient();
  client.mount();
  const phases: ({ signature: string } & ReconciliationPhase)[] = [];
  const reconciliation = createReadReconciliation<{ signature: string }>((phase) => phases.push(phase));
  let reads = 0;
  onlineManager.setOnline(false);
  try {
    const pending = reconciliation.start({ signature: 'signature' }, async () => {
      await fetchReconciledQuery(client, { queryKey: ['solana', 'listing'], queryFn: async () => { reads++; return 'new'; } });
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(client.getQueryState(['solana', 'listing'])?.fetchStatus, 'paused');
    assert.equal(phases.at(-1)!.stage, 'reconciling');
    assert.equal(reads, 0);
    onlineManager.setOnline(true);
    await pending;
    assert.equal(reads, 1);
    assert.equal(phases.at(-1)!.stage, 'confirmed');
  } finally { onlineManager.setOnline(true); client.unmount(); client.clear(); }
});
