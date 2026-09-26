import { Keypair } from '@solana/web3.js';

// Deterministic local-validator fixtures only. Never fund or reuse these on a public cluster.
const localKey = (byte: number) => Keypair.fromSeed(Uint8Array.from({ length: 32 }, () => byte));
export const program = localKey(7);
export const payer = localKey(8);
export const seller = localKey(1);
export const buyer = localKey(2);
export const feeRecipient = localKey(9);
export const vehicleMintKey = localKey(11);
export const paymentMintKey = localKey(12);
