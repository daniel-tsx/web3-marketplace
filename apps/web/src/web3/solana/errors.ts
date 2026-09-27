import type { TransactionError } from '@solana/web3.js';

const changed = 'This listing changed after you reviewed it. Refresh the listing and confirm the new terms.';

// The transaction hook sends one marketplace instruction, so its Custom code belongs to this program.
export function solanaExecutionError(error: TransactionError, logs?: readonly string[]): Error {
  const instruction = typeof error === 'object' && 'InstructionError' in error && Array.isArray(error.InstructionError) ? error.InstructionError[1] : null;
  const code = instruction && typeof instruction === 'object' && 'Custom' in instruction ? instruction.Custom : undefined;
  const name = code === 6005 ? 'ListingNotActive' : code === 6007 ? 'ListingVersionMismatch' : code === 6008 ? 'PriceExceedsMaximum' : code === 6002 ? 'InvalidPaymentMint' : code === 6004 ? 'InsufficientPayment' : undefined;
  return Object.assign(new Error(`Solana transaction failed: ${name ?? JSON.stringify(error)}`, { cause: error }), { logs });
}

export function explainSolanaError(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : String(cause);
  const logs = cause && typeof cause === 'object' && 'logs' in cause && Array.isArray(cause.logs) ? cause.logs.join('\n') : '';
  const detail = `${message}\n${logs}`;
  if (/ListingVersionMismatch|PriceExceedsMaximum|ListingNotActive/.test(detail) ||
    (/AccountNotInitialized/.test(detail) && /account: (listing|escrow)\b/.test(detail))) return changed;
  if (/InvalidPaymentMint/.test(detail)) return 'Payment mint does not match this marketplace. Refresh and verify the configured payment asset.';
  if (/InsufficientPayment/.test(detail)) return 'Not enough marketplace payment tokens to buy this listing.';
  return message;
}
