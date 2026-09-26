import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Connection, Keypair, LAMPORTS_PER_SOL, sendAndConfirmTransaction, Transaction, type TransactionInstruction } from '@solana/web3.js';
import { createMint, getAccount, getOrCreateAssociatedTokenAccount, mintTo } from '@solana/spl-token';
import { buyVehicleInstruction, cancelListingInstruction, decodeListing, escrowAddress, FEE_RECIPIENT, listVehicleInstruction, listingAddress, PROGRAM_ID } from '../src/client.js';
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

test('Anchor escrow marketplace on local validator', async (t) => {
  assert.equal((await connection.getAccountInfo(PROGRAM_ID))?.executable, true, 'Build and deploy the program first.');
  assert.equal(feeRecipient.publicKey.toBase58(), FEE_RECIPIENT.toBase58());
  await fund(payer);
  await fund(feeRecipient);
  const seller = Keypair.generate();
  const buyer = Keypair.generate();
  const stranger = Keypair.generate();
  await Promise.all([fund(seller), fund(buyer), fund(stranger)]);
  const paymentMint = await createMint(connection, payer, payer.publicKey, null, 6);
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
    assert.equal((await getAccount(connection, cancelVehicle.ata)).amount, 0n);
    assert.equal((await getAccount(connection, escrowAddress(cancelVehicle.mint))).amount, 1n);
  });
  await t.test('unauthorized user cannot cancel; seller cancel returns vehicle', async () => {
    await assert.rejects(send(cancelListingInstruction(stranger.publicKey, cancelVehicle.mint), stranger));
    await send(cancelListingInstruction(seller.publicKey, cancelVehicle.mint), seller);
    assert.equal((await getAccount(connection, cancelVehicle.ata)).amount, 1n);
    assert.equal(await connection.getAccountInfo(listingAddress(cancelVehicle.mint)), null);
  });

  const purchaseVehicle = await makeVehicle(seller);
  await t.test('non-owner cannot list', async () => {
    await getOrCreateAssociatedTokenAccount(connection, payer, purchaseVehicle.mint, stranger.publicKey);
    await assert.rejects(send(listVehicleInstruction(stranger.publicKey, purchaseVehicle.mint, paymentMint, PRICE), stranger));
    assert.equal(await connection.getAccountInfo(listingAddress(purchaseVehicle.mint)), null);
  });
  await send(listVehicleInstruction(seller.publicKey, purchaseVehicle.mint, paymentMint, PRICE), seller);
  const listing = decodeListing((await connection.getAccountInfo(listingAddress(purchaseVehicle.mint)))!.data);
  await t.test('insufficient SPL payment cannot purchase', async () => {
    await assert.rejects(send(buyVehicleInstruction(buyer.publicKey, listing), buyer));
    assert.equal((await getAccount(connection, escrowAddress(purchaseVehicle.mint))).amount, 1n);
  });
  await mintTo(connection, payer, paymentMint, buyerPayment.address, payer, 1_000_000_000);
  await t.test('purchase transfers seller proceeds, platform fee, and vehicle', async () => {
    const sellerBefore = (await getAccount(connection, sellerPayment.address)).amount;
    const feeBefore = (await getAccount(connection, feePayment.address)).amount;
    const buyerBefore = (await getAccount(connection, buyerPayment.address)).amount;
    await send(buyVehicleInstruction(buyer.publicKey, listing), buyer);
    const buyerVehicle = await getOrCreateAssociatedTokenAccount(connection, payer, purchaseVehicle.mint, buyer.publicKey);
    assert.equal((await getAccount(connection, buyerVehicle.address)).amount, 1n);
    assert.equal((await getAccount(connection, sellerPayment.address)).amount - sellerBefore, 975_000_000n);
    assert.equal((await getAccount(connection, feePayment.address)).amount - feeBefore, 25_000_000n);
    assert.equal(buyerBefore - (await getAccount(connection, buyerPayment.address)).amount, PRICE);
    assert.equal(await connection.getAccountInfo(listingAddress(purchaseVehicle.mint)), null);
  });
  await t.test('closed listing cannot be purchased twice', async () => {
    await assert.rejects(send(buyVehicleInstruction(buyer.publicKey, listing), buyer));
  });
});
