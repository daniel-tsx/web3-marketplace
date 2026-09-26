export function successfulDigest(result: { FailedTransaction?: { status: { error?: { message?: string } | null } }; Transaction?: { digest: string } }) {
  if (result.FailedTransaction) {
    throw new Error(`Sui transaction failed: ${result.FailedTransaction.status.error?.message ?? 'Move execution aborted'}`);
  }
  if (!result.Transaction) throw new Error('Sui execution returned no transaction result.');
  return result.Transaction.digest;
}
