import assert from 'node:assert/strict';
import { test } from 'node:test';
import { affectedSuiKeys } from './queryKeys';
import { successfulDigest } from './transactionResult';

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
