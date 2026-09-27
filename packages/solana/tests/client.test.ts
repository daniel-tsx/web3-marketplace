import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { Keypair } from '@solana/web3.js';
import { buyVehicleInstruction, decodeListing, decodeMarketConfig, initializeMarketInstruction, listingAddress, marketConfigAddress, type Listing } from '../src/client.js';

const discriminator = (name: string) => createHash('sha256').update(name).digest().subarray(0, 8);
const listing: Listing = {
  seller: Keypair.generate().publicKey, vehicleMint: Keypair.generate().publicKey,
  paymentMint: Keypair.generate().publicKey, price: 1000n, bump: 255, active: true, version: 7n,
};

test('Listing Borsh layout preserves an inactive generation without losing u64 precision', () => {
  const data = Buffer.alloc(122);
  discriminator('account:Listing').copy(data);
  listing.seller.toBuffer().copy(data, 8);
  listing.vehicleMint.toBuffer().copy(data, 40);
  listing.paymentMint.toBuffer().copy(data, 72);
  data.writeBigUInt64LE(listing.price, 104);
  data[112] = listing.bump;
  data[113] = 0;
  data.writeBigUInt64LE((1n << 63n) + 7n, 114);
  const decoded = decodeListing(data);
  assert.equal(decoded.active, false);
  assert.equal(decoded.version, (1n << 63n) + 7n);
  assert.equal(decoded.price, listing.price);
  assert.ok(decoded.paymentMint.equals(listing.paymentMint));
  assert.throws(() => decodeListing(data.subarray(0, 113)), /legacy/);
});

test('buy instruction binds explicit reviewed terms instead of replacing them with current data', () => {
  const reviewed = { expectedVersion: listing.version, maxPrice: listing.price };
  const current = { ...listing, version: 8n, price: 1500n };
  const instruction = buyVehicleInstruction(Keypair.generate().publicKey, current, reviewed);
  assert.equal(instruction.data.length, 24);
  assert.deepEqual(instruction.data.subarray(0, 8), discriminator('global:buy_vehicle'));
  assert.equal(instruction.data.readBigUInt64LE(8), 7n);
  assert.equal(instruction.data.readBigUInt64LE(16), 1000n);
  assert.ok(instruction.keys[2].pubkey.equals(marketConfigAddress()));
  assert.ok(instruction.keys[3].pubkey.equals(listingAddress(listing.vehicleMint)));
  assert.ok(instruction.keys[6].pubkey.equals(listing.paymentMint));
});

test('market configuration and initializer use the canonical PDA and exact mint', () => {
  const data = Buffer.concat([discriminator('account:MarketConfig'), listing.paymentMint.toBuffer()]);
  assert.ok(decodeMarketConfig(data).paymentMint.equals(listing.paymentMint));
  const instruction = initializeMarketInstruction(listing.seller, listing.paymentMint);
  assert.deepEqual(instruction.data, discriminator('global:initialize_market'));
  assert.ok(instruction.keys[0].isSigner);
  assert.ok(instruction.keys[1].pubkey.equals(marketConfigAddress()));
  assert.ok(instruction.keys[2].pubkey.equals(listing.paymentMint));
  assert.throws(() => decodeMarketConfig(Buffer.alloc(40)), /Invalid marketplace/);
});
