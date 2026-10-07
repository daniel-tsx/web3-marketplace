import assert from 'node:assert/strict';
import { test } from 'node:test';
import { affectedSuiKeys } from './queryKeys';
import { successfulDigest } from './transactionResult';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { createReadReconciliation, type ReconciliationPhase } from '../reconciliation';
import { reconcileSuiVehicleState, type suiVehicleQueries } from './reconcileVehicleState';

function readFixture(listingId: string | null, listingError?: Error) {
  const reads: string[] = [];
  const queries: ReturnType<typeof suiVehicleQueries> = {
    market: { queryKey: ['sui', 'testnet', 'market', 'market'], queryFn: async () => { reads.push('market'); return { id: 'market', listingId, feeRecipient: 'fee' }; } },
    listing: (id) => ({ queryKey: ['sui', 'testnet', 'listing', id], queryFn: async () => {
      reads.push(id);
      if (listingError) throw listingError;
      return { id, marketId: 'market', seller: 'seller', price: 1000n, vehicleId: 'vehicle', vehicleName: 'Vehicle' };
    } }),
    vehicle: { queryKey: ['sui', 'testnet', 'vehicle', 'vehicle'], queryFn: async () => {
      reads.push('vehicle');
      if (listingId) throw new Error('Vehicle is wrapped; this read must not run.');
      return { id: 'vehicle', name: 'Vehicle', owner: 'buyer' };
    } },
  };
  return { reads, queries };
}

test('resolved failed transaction is never reported as success', () => {
  assert.equal(successfulDigest({ Transaction: { digest: 'digest' } }), 'digest');
  assert.throws(() => successfulDigest({ FailedTransaction: { status: { error: { message: 'Move abort 7' } } } }), /Move abort 7/);
});

test('purchase refreshes Sui objects and three payment balances only', () => {
  const keys = affectedSuiKeys({ action: 'buy', network: 'testnet', marketId: 'market', vehicleId: 'vehicle', listingId: 'listing', coinType: 'mUSDC', buyer: 'buyer', seller: 'seller', feeRecipient: 'fee' });
  assert.deepEqual(keys, [
    ['sui', 'testnet', 'market', 'market'], ['sui', 'testnet', 'vehicle', 'vehicle'],
    ['sui', 'testnet', 'listing', 'listing'],
    ['sui', 'testnet', 'balance', 'mUSDC', 'buyer'],
    ['sui', 'testnet', 'balance', 'mUSDC', 'seller'],
    ['sui', 'testnet', 'balance', 'mUSDC', 'fee'],
  ]);
  assert.equal(affectedSuiKeys({ action: 'list', network: 'testnet', marketId: 'market', vehicleId: 'vehicle' }).length, 2);
});

test('Sui listing reconciliation awaits the fresh Market and its newly discovered Listing', async () => {
  const client = new QueryClient();
  const { reads, queries } = readFixture('new-listing');
  client.setQueryData(queries.market.queryKey, { listingId: null });
  const vehicleObserver = new QueryObserver(client, { ...queries.vehicle, enabled: false, initialData: { id: 'vehicle', name: 'Vehicle', owner: 'seller' } });
  const unsubscribe = vehicleObserver.subscribe(() => {});
  try {
    await reconcileSuiVehicleState(client, queries, { action: 'list', network: 'testnet', marketId: 'market', vehicleId: 'vehicle' });
    assert.deepEqual(reads, ['market', 'new-listing']);
    assert.equal(client.getQueryData<{ id: string }>(queries.listing('new-listing').queryKey)?.id, 'new-listing');
  } finally { unsubscribe(); client.clear(); }
});

test('Sui cancel/buy reconciliation reads the unwrapped Vehicle, not the inactive old Listing', async (t) => {
  for (const action of ['cancel', 'buy'] as const) {
    await t.test(action, async () => {
      const client = new QueryClient();
      const { reads, queries } = readFixture(null);
      const input = { action, network: 'testnet', marketId: 'market', vehicleId: 'vehicle', listingId: 'old-listing', coinType: 'mUSDC', buyer: 'buyer', seller: 'seller', feeRecipient: 'fee' };
      client.setQueryData(queries.market.queryKey, { listingId: 'old-listing' });
      const observers = [
        new QueryObserver(client, { ...queries.vehicle, enabled: false, initialData: { id: 'vehicle', name: 'Vehicle', owner: 'seller' } }),
        new QueryObserver(client, { queryKey: queries.listing('old-listing').queryKey, staleTime: Infinity, initialData: 'active listing', queryFn: async () => { throw new Error('Old Listing is inactive.'); } }),
        ...['buyer', 'seller', 'fee', 'unrelated'].map((owner) => new QueryObserver(client, {
          queryKey: ['sui', 'testnet', 'balance', 'mUSDC', owner], initialData: 1n, staleTime: Infinity,
          queryFn: async () => { reads.push(`balance:${owner}`); return 2n; },
        })),
      ];
      const unsubscribes = observers.map((observer) => observer.subscribe(() => {}));
      try {
        await reconcileSuiVehicleState(client, queries, input);
        assert.deepEqual(reads, action === 'buy' ? ['market', 'vehicle', 'balance:buyer', 'balance:seller', 'balance:fee'] : ['market', 'vehicle']);
        assert.equal(client.getQueryData<{ owner: string }>(queries.vehicle.queryKey)?.owner, 'buyer');
        assert.equal(client.getQueryState(queries.listing('old-listing').queryKey)?.isInvalidated, true);
      } finally { unsubscribes.forEach((unsubscribe) => unsubscribe()); client.clear(); }
    });
  }
});

test('a newly discovered Sui Listing read failure remains reconciliation failure and can recover', async (t) => {
  t.mock.method(console, 'error', () => {});
  const client = new QueryClient();
  const cause = new Error('new Listing RPC read failed');
  let fixture = readFixture('new-listing', cause);
  const phases: ({ digest: string } & ReconciliationPhase)[] = [];
  const reconciliation = createReadReconciliation<{ digest: string }>((phase) => phases.push(phase));
  try {
    await reconciliation.start({ digest: 'executed-digest' }, async () => {
      await reconcileSuiVehicleState(client, fixture.queries, { action: 'list', network: 'testnet', marketId: 'market', vehicleId: 'vehicle' });
    });
    const failed = phases.at(-1)!;
    assert.ok(failed.stage === 'reconciliation-failed');
    assert.equal(failed.refreshError.cause, cause);
    assert.equal(failed.digest, 'executed-digest');
    fixture = readFixture('new-listing');
    await reconciliation.retry();
    assert.equal(phases.at(-1)!.stage, 'confirmed');
    assert.deepEqual(fixture.reads, ['market', 'new-listing']);
  } finally { client.clear(); }
});
