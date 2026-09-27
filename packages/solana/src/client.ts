import { Buffer } from 'buffer';
import { PublicKey, SystemProgram, TransactionInstruction } from '@solana/web3.js';
import { ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from '@solana/spl-token';

export const PROGRAM_ID = new PublicKey('GmaDrppBC7P5ARKV8g3djiwP89vz1jLK23V2GBjuAEGB');
export const FEE_RECIPIENT = new PublicKey('J2xccRtuG43drESLYznHhLhQkLTdfepcKYbiQ9BsJVaf');
const LIST = Uint8Array.from([165, 244, 15, 210, 96, 179, 66, 46]);
const CANCEL = Uint8Array.from([41, 183, 50, 232, 230, 233, 157, 70]);
const BUY = Uint8Array.from([107, 156, 187, 14, 189, 238, 144, 182]);
const LISTING = Uint8Array.from([218, 32, 50, 73, 43, 134, 26, 58]);
const INITIALIZE_MARKET = Uint8Array.from([35, 35, 189, 193, 155, 48, 170, 203]);
const MARKET_CONFIG = Uint8Array.from([119, 255, 200, 88, 252, 82, 128, 24]);

export interface Listing { seller: PublicKey; vehicleMint: PublicKey; paymentMint: PublicKey; price: bigint; bump: number; active: boolean; version: bigint; }

export function marketConfigAddress() {
  return PublicKey.findProgramAddressSync([new TextEncoder().encode('market')], PROGRAM_ID)[0];
}

export function decodeMarketConfig(data: Uint8Array) {
  if (data.length !== 40 || !MARKET_CONFIG.every((byte, index) => data[index] === byte)) throw new Error('Invalid marketplace configuration data.');
  return { paymentMint: new PublicKey(data.slice(8, 40)) };
}

export function listingAddress(vehicleMint: PublicKey) {
  return PublicKey.findProgramAddressSync([new TextEncoder().encode('listing'), vehicleMint.toBytes()], PROGRAM_ID)[0];
}

export function escrowAddress(vehicleMint: PublicKey) {
  return getAssociatedTokenAddressSync(vehicleMint, listingAddress(vehicleMint), true);
}

export function decodeListing(data: Uint8Array): Listing {
  if (data.length !== 122 || !LISTING.every((byte, index) => data[index] === byte) || data[113] > 1) throw new Error('Invalid listing account data; legacy local accounts require a fresh deployment.');
  return {
    seller: new PublicKey(data.slice(8, 40)),
    vehicleMint: new PublicKey(data.slice(40, 72)),
    paymentMint: new PublicKey(data.slice(72, 104)),
    price: new DataView(data.buffer, data.byteOffset + 104, 8).getBigUint64(0, true),
    bump: data[112],
    active: data[113] === 1,
    version: new DataView(data.buffer, data.byteOffset + 114, 8).getBigUint64(0, true),
  };
}

const meta = (pubkey: PublicKey, isWritable = false, isSigner = false) => ({ pubkey, isWritable, isSigner });

export function initializeMarketInstruction(authority: PublicKey, paymentMint: PublicKey) {
  return new TransactionInstruction({ programId: PROGRAM_ID, data: Buffer.from(INITIALIZE_MARKET), keys: [
    meta(authority, true, true), meta(marketConfigAddress(), true), meta(paymentMint), meta(SystemProgram.programId),
  ] });
}

export function listVehicleInstruction(seller: PublicKey, vehicleMint: PublicKey, paymentMint: PublicKey, price: bigint) {
  if (price <= 0n || price > (1n << 64n) - 1n) throw new Error('Price must fit a positive u64.');
  const data = new Uint8Array(16);
  data.set(LIST);
  new DataView(data.buffer).setBigUint64(8, price, true);
  return new TransactionInstruction({ programId: PROGRAM_ID, data: Buffer.from(data), keys: [
    meta(seller, true, true), meta(marketConfigAddress()), meta(vehicleMint), meta(paymentMint),
    meta(getAssociatedTokenAddressSync(vehicleMint, seller), true),
    meta(listingAddress(vehicleMint), true), meta(escrowAddress(vehicleMint), true),
    meta(TOKEN_PROGRAM_ID), meta(ASSOCIATED_TOKEN_PROGRAM_ID), meta(SystemProgram.programId),
  ] });
}

export function cancelListingInstruction(seller: PublicKey, vehicleMint: PublicKey) {
  return new TransactionInstruction({ programId: PROGRAM_ID, data: Buffer.from(CANCEL), keys: [
    meta(seller, true, true), meta(vehicleMint), meta(listingAddress(vehicleMint), true),
    meta(escrowAddress(vehicleMint), true), meta(getAssociatedTokenAddressSync(vehicleMint, seller), true),
    meta(TOKEN_PROGRAM_ID), meta(ASSOCIATED_TOKEN_PROGRAM_ID), meta(SystemProgram.programId),
  ] });
}

export function buyVehicleInstruction(buyer: PublicKey, listing: Listing, intent: { expectedVersion: bigint; maxPrice: bigint }) {
  const { seller, vehicleMint, paymentMint } = listing;
  if (intent.expectedVersion < 1n || intent.expectedVersion > (1n << 64n) - 1n || intent.maxPrice < 0n || intent.maxPrice > (1n << 64n) - 1n) throw new Error('Purchase intent must fit u64 values with a positive version.');
  const data = new Uint8Array(24);
  data.set(BUY);
  const view = new DataView(data.buffer);
  view.setBigUint64(8, intent.expectedVersion, true);
  view.setBigUint64(16, intent.maxPrice, true);
  return new TransactionInstruction({ programId: PROGRAM_ID, data: Buffer.from(data), keys: [
    meta(buyer, true, true), meta(vehicleMint), meta(marketConfigAddress()), meta(listingAddress(vehicleMint), true),
    meta(seller, true), meta(FEE_RECIPIENT), meta(paymentMint), meta(escrowAddress(vehicleMint), true),
    meta(getAssociatedTokenAddressSync(vehicleMint, buyer), true),
    meta(getAssociatedTokenAddressSync(paymentMint, buyer), true),
    meta(getAssociatedTokenAddressSync(paymentMint, seller), true),
    meta(getAssociatedTokenAddressSync(paymentMint, FEE_RECIPIENT), true),
    meta(TOKEN_PROGRAM_ID), meta(ASSOCIATED_TOKEN_PROGRAM_ID), meta(SystemProgram.programId),
  ] });
}
