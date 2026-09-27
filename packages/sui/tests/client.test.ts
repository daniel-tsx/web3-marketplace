import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeSuiAddress } from '@mysten/sui/utils';
import { buildBuyVehicleTransaction, buildCancelListingTransaction, buildListVehicleTransaction } from '../src/client.js';

const ids = { packageId: '0x1', marketId: '0x2' };
const vehicle = '0x3';
const listing = '0x4';
const inspect = (value: unknown) => JSON.stringify(value, (_, item) => typeof item === 'bigint' ? item.toString() : item);

test('Sui builders identify the Move calls and exact object inputs', () => {
  const listed = inspect(buildListVehicleTransaction(ids, vehicle, 1_000_000n).getData());
  assert.match(listed, /"function":"list"/);
  assert.match(listed, /0000000000000000000000000000000000000000000000000000000000000002/);
  assert.match(listed, /0000000000000000000000000000000000000000000000000000000000000003/);
  const cancelled = inspect(buildCancelListingTransaction(ids, listing).getData());
  assert.match(cancelled, /"function":"cancel"/);
  assert.match(cancelled, /0000000000000000000000000000000000000000000000000000000000000004/);
  const bought = inspect(buildBuyVehicleTransaction(ids, listing, 1_000_000n, '0x1::musdc::MUSDC').getData());
  assert.match(bought, /"function":"buy"/);
  assert.match(bought, /"balance":"1000000"/);
  assert.match(bought, /::musdc::MUSDC/);
  assert.doesNotMatch(bought, /approve|allowance/i);
});

test('a reviewed Sui purchase retains the old Listing ID and exact amount after relisting', () => {
  const oldListing = '0x4';
  const newListing = '0x5';
  const reviewedPurchase = buildBuyVehicleTransaction(ids, oldListing, 1_000_000n, '0x1::musdc::MUSDC');
  const newPurchase = buildBuyVehicleTransaction(ids, newListing, 1_500_000n, '0x1::musdc::MUSDC');
  const oldData = inspect(reviewedPurchase.getData());
  assert.ok(oldData.includes(normalizeSuiAddress(oldListing)));
  assert.ok(!oldData.includes(normalizeSuiAddress(newListing)));
  assert.match(oldData, /"balance":"1000000"/);
  assert.ok(inspect(newPurchase.getData()).includes(normalizeSuiAddress(newListing)));
});
