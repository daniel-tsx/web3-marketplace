import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Connection, LAMPORTS_PER_SOL, sendAndConfirmTransaction, Transaction } from '@solana/web3.js';
import { createMint, getAccount, getMint, getOrCreateAssociatedTokenAccount, mintTo } from '@solana/spl-token';
import { FEE_RECIPIENT, listVehicleInstruction, listingAddress, PROGRAM_ID } from '../src/client.js';
import { buyer, feeRecipient, payer, paymentMintKey, seller, vehicleMintKey } from './local-keys.js';

const connection = new Connection(process.env.SOLANA_RPC_URL ?? 'http://127.0.0.1:8899', 'confirmed');

async function fund(address: typeof payer.publicKey) {
  if (await connection.getBalance(address) >= LAMPORTS_PER_SOL) return;
  const signature = await connection.requestAirdrop(address, 10 * LAMPORTS_PER_SOL);
  const latest = await connection.getLatestBlockhash();
  await connection.confirmTransaction({ signature, ...latest }, 'confirmed');
}

async function main() {
  if (!(await connection.getAccountInfo(PROGRAM_ID))?.executable) throw new Error('Deploy the Anchor program before seeding.');
  if (!feeRecipient.publicKey.equals(FEE_RECIPIENT)) throw new Error('Fee recipient key mismatch.');
  await Promise.all([fund(payer.publicKey), fund(seller.publicKey), fund(buyer.publicKey), fund(feeRecipient.publicKey)]);

  const vehicleMint = vehicleMintKey.publicKey;
  const paymentMint = paymentMintKey.publicKey;
  if (!await connection.getAccountInfo(vehicleMint)) await createMint(connection, payer, payer.publicKey, null, 0, vehicleMintKey);
  if (!await connection.getAccountInfo(paymentMint)) await createMint(connection, payer, payer.publicKey, null, 6, paymentMintKey);

  const sellerVehicle = await getOrCreateAssociatedTokenAccount(connection, payer, vehicleMint, seller.publicKey);
  const buyerPayment = await getOrCreateAssociatedTokenAccount(connection, payer, paymentMint, buyer.publicKey);
  await getOrCreateAssociatedTokenAccount(connection, payer, paymentMint, seller.publicKey);
  await getOrCreateAssociatedTokenAccount(connection, payer, paymentMint, feeRecipient.publicKey);
  const vehicleSupply = (await getMint(connection, vehicleMint)).supply;
  if (vehicleSupply > 1n) throw new Error('Vehicle mint supply exceeds one; reset the local validator.');
  const mintedVehicle = vehicleSupply === 0n;
  if (mintedVehicle) await mintTo(connection, payer, vehicleMint, sellerVehicle.address, payer, 1);
  const buyerBalance = (await getAccount(connection, buyerPayment.address)).amount;
  if (buyerBalance < 100_000_000_000n) await mintTo(connection, payer, paymentMint, buyerPayment.address, payer, 100_000_000_000n - buyerBalance);
  if (mintedVehicle && !await connection.getAccountInfo(listingAddress(vehicleMint))) {
    const instruction = listVehicleInstruction(seller.publicKey, vehicleMint, paymentMint, 12_000_000_000n);
    await sendAndConfirmTransaction(connection, new Transaction().add(instruction), [payer, seller], { commitment: 'confirmed' });
  }

  const envPath = resolve('../../apps/web/.env.local');
  const existing = (() => { try { return readFileSync(envPath, 'utf8'); } catch { return ''; } })();
  const evmLines = existing.split(/\r?\n/).filter((line) => line && !line.startsWith('VITE_SOLANA_'));
  const solanaLines = [
    `VITE_SOLANA_RPC_URL=${connection.rpcEndpoint}`,
    `VITE_SOLANA_PROGRAM_ID=${PROGRAM_ID.toBase58()}`,
    `VITE_SOLANA_VEHICLE_MINT=${vehicleMint.toBase58()}`,
    `VITE_SOLANA_PAYMENT_MINT=${paymentMint.toBase58()}`,
  ];
  writeFileSync(envPath, [...evmLines, ...solanaLines, ''].join('\n'));
  console.log('Seeded one escrow listing, buyer mUSDC, seller and fee accounts. Public mint addresses saved to apps/web/.env.local.');
  console.log(`Local seller: ${seller.publicKey.toBase58()} · local buyer: ${buyer.publicKey.toBase58()}`);
}

await main();
