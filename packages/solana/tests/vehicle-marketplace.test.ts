import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Connection, Keypair, LAMPORTS_PER_SOL, SendTransactionError, sendAndConfirmTransaction, Transaction, type TransactionInstruction } from '@solana/web3.js';
import { createMint, getAccount, getOrCreateAssociatedTokenAccount, mintTo } from '@solana/spl-token';
import { buyVehicleInstruction, cancelListingInstruction, decodeListing, decodeMarketConfig, escrowAddress, FEE_RECIPIENT, initializeMarketInstruction, listVehicleInstruction, listingAddress, marketConfigAddress, PROGRAM_ID } from '../src/client.js';
import { feeRecipient, payer } from '../scripts/local-keys.js';

const connection = new Connection(process.env.SOLANA_RPC_URL ?? 'http://127.0.0.1:8899', 'confirmed');
const PRICE = 1_000_000_000n;

async function fund(key: Keypair) {
  const signature = await connection.requestAirdrop(key.publicKey, 5 * LAMPORTS_PER_SOL);
  const latest = await connection.getLatestBlockhash();
  await connection.confirmTransaction({ signature, ...latest }, 'confirmed');
}

function send(instruction: TransactionInstruction, ...signers: Keypair[]) {
  return sendAndConfirmTransaction(connection, new Transaction().add(instruction), [payer, ...signers], { commitment: 'confirmed' });
}

async function makeVehicle(owner: Keypair) {
  const mint = await createMint(connection, payer, payer.publicKey, null, 0);
  const ata = await getOrCreateAssociatedTokenAccount(connection, payer, mint, owner.publicKey);
  await mintTo(connection, payer, mint, ata.address, payer, 1);
  return { mint, ata: ata.address };
}

async function rejectsMarket(pending: Promise<unknown>, code: string) {
  await assert.rejects(pending, asyncError => {
    assert.ok(asyncError instanceof SendTransactionError);
    assert.ok(asyncError.logs?.some((log) => log.includes(`Error Code: ${code}.`)), `Expected ${code}; got ${asyncError.message}\n${asyncError.logs?.join('\n')}`);
    return true;
  });
}

test('Anchor escrow marketplace on local validator', async (t) => {
  assert.equal((await connection.getAccountInfo(PROGRAM_ID))?.executable, true, 'Build and deploy the program first.');
  assert.equal(feeRecipient.publicKey.toBase58(), FEE_RECIPIENT.toBase58());
  await fund(payer);
  await fund(feeRecipient);
  const seller = Keypair.generate();
  const buyer = Keypair.generate();
  const stranger = Keypair.generate();
  await Promise.all([fund(seller), fund(buyer), fund(stranger)]);
  const existingConfig = await connection.getAccountInfo(marketConfigAddress());
  const paymentMint = existingConfig ? decodeMarketConfig(existingConfig.data).paymentMint : await createMint(connection, payer, payer.publicKey, null, 6);
  await t.test('only the protocol authority can initialize payment configuration', async () => {
    await assert.rejects(send(initializeMarketInstruction(stranger.publicKey, paymentMint), stranger));
  });
  if (!existingConfig) await send(initializeMarketInstruction(feeRecipient.publicKey, paymentMint), feeRecipient);
  assert.ok(decodeMarketConfig((await connection.getAccountInfo(marketConfigAddress()))!.data).paymentMint.equals(paymentMint));
  const buyerPayment = await getOrCreateAssociatedTokenAccount(connection, payer, paymentMint, buyer.publicKey);
  const sellerPayment = await getOrCreateAssociatedTokenAccount(connection, payer, paymentMint, seller.publicKey);
  const feePayment = await getOrCreateAssociatedTokenAccount(connection, payer, paymentMint, feeRecipient.publicKey);
  await mintTo(connection, payer, paymentMint, buyerPayment.address, payer, 500_000_000);

  const cancelVehicle = await makeVehicle(seller);
  await t.test('seller lists owned vehicle and escrow holds the token', async () => {
    await send(listVehicleInstruction(seller.publicKey, cancelVehicle.mint, paymentMint, PRICE), seller);
    const account = await connection.getAccountInfo(listingAddress(cancelVehicle.mint));
    assert.ok(account);
    const listing = decodeListing(account.data);
    assert.equal(listing.seller.toBase58(), seller.publicKey.toBase58());
    assert.equal(listing.price, PRICE);
    assert.equal(listing.version, 1n);
    assert.equal(listing.active, true);
    assert.equal((await getAccount(connection, cancelVehicle.ata)).amount, 0n);
    assert.equal((await getAccount(connection, escrowAddress(cancelVehicle.mint))).amount, 1n);
  });
  await t.test('unauthorized user cannot cancel; seller cancel returns vehicle', async () => {
    await assert.rejects(send(cancelListingInstruction(stranger.publicKey, cancelVehicle.mint), stranger));
    await send(cancelListingInstruction(seller.publicKey, cancelVehicle.mint), seller);
    assert.equal((await getAccount(connection, cancelVehicle.ata)).amount, 1n);
    const inactive = decodeListing((await connection.getAccountInfo(listingAddress(cancelVehicle.mint)))!.data);
    assert.equal(inactive.active, false);
    assert.equal(inactive.version, 1n);
    assert.equal(await connection.getAccountInfo(escrowAddress(cancelVehicle.mint)), null);
  });

  const purchaseVehicle = await makeVehicle(seller);
  await t.test('non-owner cannot list', async () => {
    await getOrCreateAssociatedTokenAccount(connection, payer, purchaseVehicle.mint, stranger.publicKey);
    await assert.rejects(send(listVehicleInstruction(stranger.publicKey, purchaseVehicle.mint, paymentMint, PRICE), stranger));
    assert.equal(await connection.getAccountInfo(listingAddress(purchaseVehicle.mint)), null);
  });
  await send(listVehicleInstruction(seller.publicKey, purchaseVehicle.mint, paymentMint, PRICE), seller);
  const listing = decodeListing((await connection.getAccountInfo(listingAddress(purchaseVehicle.mint)))!.data);
  const intent = { expectedVersion: listing.version, maxPrice: listing.price };
  await t.test('insufficient SPL payment cannot purchase', async () => {
    await rejectsMarket(send(buyVehicleInstruction(buyer.publicKey, listing, intent), buyer), 'InsufficientPayment');
    assert.equal((await getAccount(connection, escrowAddress(purchaseVehicle.mint))).amount, 1n);
  });
  await mintTo(connection, payer, paymentMint, buyerPayment.address, payer, 1_000_000_000);
  await t.test('purchase transfers seller proceeds, platform fee, and vehicle', async () => {
    const sellerBefore = (await getAccount(connection, sellerPayment.address)).amount;
    const feeBefore = (await getAccount(connection, feePayment.address)).amount;
    const buyerBefore = (await getAccount(connection, buyerPayment.address)).amount;
    await send(buyVehicleInstruction(buyer.publicKey, listing, { ...intent, maxPrice: PRICE + 1n }), buyer);
    const buyerVehicle = await getOrCreateAssociatedTokenAccount(connection, payer, purchaseVehicle.mint, buyer.publicKey);
    assert.equal((await getAccount(connection, buyerVehicle.address)).amount, 1n);
    assert.equal((await getAccount(connection, sellerPayment.address)).amount - sellerBefore, 975_000_000n);
    assert.equal((await getAccount(connection, feePayment.address)).amount - feeBefore, 25_000_000n);
    assert.equal(buyerBefore - (await getAccount(connection, buyerPayment.address)).amount, PRICE);
    const inactive = decodeListing((await connection.getAccountInfo(listingAddress(purchaseVehicle.mint)))!.data);
    assert.equal(inactive.active, false);
    assert.equal(inactive.version, listing.version);
    assert.equal(await connection.getAccountInfo(escrowAddress(purchaseVehicle.mint)), null);
  });
  await t.test('inactive listing cannot be purchased twice', async () => {
    await assert.rejects(send(buyVehicleInstruction(buyer.publicKey, listing, intent), buyer));
  });
  await t.test('version survives purchase and new owner relisting', async () => {
    await send(listVehicleInstruction(buyer.publicKey, purchaseVehicle.mint, paymentMint, PRICE), buyer);
    const next = decodeListing((await connection.getAccountInfo(listingAddress(purchaseVehicle.mint)))!.data);
    assert.equal(next.version, listing.version + 1n);
    assert.ok(next.seller.equals(buyer.publicKey));
  });

  await mintTo(connection, payer, paymentMint, buyerPayment.address, payer, PRICE * 5n);
  const raceVehicle = await makeVehicle(seller);
  await send(listVehicleInstruction(seller.publicKey, raceVehicle.mint, paymentMint, PRICE), seller);
  const reviewed = decodeListing((await connection.getAccountInfo(listingAddress(raceVehicle.mint)))!.data);
  const reviewedIntent = { expectedVersion: reviewed.version, maxPrice: reviewed.price };
  // Build before the seller changes anything: the signed instruction must retain this intent.
  const staleBuy = buyVehicleInstruction(buyer.publicKey, reviewed, reviewedIntent);
  await t.test('same-price cancel/relist rejects the old version at the same PDA', async () => {
    await send(cancelListingInstruction(seller.publicKey, raceVehicle.mint), seller);
    await send(listVehicleInstruction(seller.publicKey, raceVehicle.mint, paymentMint, PRICE), seller);
    const next = decodeListing((await connection.getAccountInfo(listingAddress(raceVehicle.mint)))!.data);
    assert.equal(next.version, reviewed.version + 1n);
    const balanceBefore = (await getAccount(connection, buyerPayment.address)).amount;
    await rejectsMarket(send(staleBuy, buyer), 'ListingVersionMismatch');
    assert.equal((await getAccount(connection, buyerPayment.address)).amount, balanceBefore);
    assert.equal((await getAccount(connection, escrowAddress(raceVehicle.mint))).amount, 1n);
  });
  await t.test('higher-price relisting rejects old intent and independently enforces maximum', async () => {
    await send(cancelListingInstruction(seller.publicKey, raceVehicle.mint), seller);
    await send(listVehicleInstruction(seller.publicKey, raceVehicle.mint, paymentMint, PRICE * 3n / 2n), seller);
    await rejectsMarket(send(staleBuy, buyer), 'ListingVersionMismatch');
    const next = decodeListing((await connection.getAccountInfo(listingAddress(raceVehicle.mint)))!.data);
    await rejectsMarket(send(buyVehicleInstruction(buyer.publicKey, next, { expectedVersion: next.version, maxPrice: reviewed.price }), buyer), 'PriceExceedsMaximum');
    await send(buyVehicleInstruction(buyer.publicKey, next, { expectedVersion: next.version, maxPrice: next.price }), buyer);
    assert.equal((await getAccount(connection, (await getOrCreateAssociatedTokenAccount(connection, payer, raceVehicle.mint, buyer.publicKey)).address)).amount, 1n);
  });
  await t.test('another six-decimal mint cannot be listed or supplied to a purchase', async () => {
    const wrongMint = await createMint(connection, payer, payer.publicKey, null, 6);
    const vehicle = await makeVehicle(seller);
    await rejectsMarket(send(listVehicleInstruction(seller.publicKey, vehicle.mint, wrongMint, PRICE), seller), 'InvalidPaymentMint');
    await send(listVehicleInstruction(seller.publicKey, vehicle.mint, paymentMint, PRICE), seller);
    const current = decodeListing((await connection.getAccountInfo(listingAddress(vehicle.mint)))!.data);
    const wrongPayment = await getOrCreateAssociatedTokenAccount(connection, payer, wrongMint, buyer.publicKey);
    await mintTo(connection, payer, wrongMint, wrongPayment.address, payer, PRICE * 2n);
    await rejectsMarket(send(buyVehicleInstruction(buyer.publicKey, { ...current, paymentMint: wrongMint }, { expectedVersion: current.version, maxPrice: current.price }), buyer), 'InvalidPaymentMint');
    assert.equal((await getAccount(connection, wrongPayment.address)).amount, PRICE * 2n);
    assert.equal((await getAccount(connection, escrowAddress(vehicle.mint))).amount, 1n);
  });
});
