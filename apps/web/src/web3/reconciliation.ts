import type { FetchQueryOptions, QueryClient, QueryKey } from '@tanstack/react-query';

export type ReconciliationPhase =
  | { stage: 'reconciling' }
  | { stage: 'confirmed' }
  | { stage: 'reconciliation-failed'; refreshError: { message: string; cause: unknown } };

// This owns reads after proven execution only. It never receives a wallet/write callback.
export function createReadReconciliation<T extends object>(publish: (phase: T & ReconciliationPhase) => void) {
  let job: { result: T; read: () => Promise<Partial<T> | void>; pending?: Promise<void> } | undefined;

  function retry(): Promise<void> {
    const current = job;
    if (!current) return Promise.resolve();
    if (current.pending) return current.pending;
    publish({ ...current.result, stage: 'reconciling' });
    current.pending = Promise.resolve().then(current.read).then((details) => {
      if (job === current) {
        current.result = { ...current.result, ...details };
        publish({ ...current.result, stage: 'confirmed' });
      }
    }, (cause: unknown) => {
      console.error('Transaction executed but state reconciliation failed', cause);
      if (job === current) publish({ ...current.result, stage: 'reconciliation-failed', refreshError: { message: cause instanceof Error ? cause.message : String(cause), cause } });
    }).finally(() => { current.pending = undefined; });
    return current.pending;
  }

  return {
    start(result: T, read: () => Promise<Partial<T> | void>) { job = { result, read }; return retry(); },
    retry,
    reset() { job = undefined; },
  };
}

// Invalidate without automatic refetch, cancel any pre-transaction read, then force
// an awaited read. fetchQuery rejects on failure and awaits paused fetches instead
// of treating a disabled/paused query as a successful refetchQueries no-op.
export async function fetchReconciledQuery<T, TKey extends QueryKey = QueryKey>(client: QueryClient, options: FetchQueryOptions<T, Error, T, TKey>) {
  await client.invalidateQueries({ queryKey: options.queryKey, exact: true, refetchType: 'none' });
  await client.cancelQueries({ queryKey: options.queryKey, exact: true });
  return client.fetchQuery({ ...options, staleTime: 0, retry: false });
}

export async function refetchAffectedQueries(client: QueryClient, keys: readonly QueryKey[]) {
  const queries = keys.map((queryKey) => {
    const query = client.getQueryCache().find({ queryKey, exact: true });
    if (!query) throw new Error('An affected marketplace read is no longer available.');
    return query;
  });
  await Promise.all([...new Set(queries)].map((query) => fetchReconciledQuery(client, { ...query.options, queryKey: query.queryKey })));
}
