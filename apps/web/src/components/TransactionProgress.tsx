import type { Ecosystem } from '../execution/resolveExecution';
import { CopyableAddress } from './VehicleDetail';

export type ProgressStage = 'idle' | 'wallet' | 'submitted' | 'pending' | 'reconciling' | 'confirmed' | 'reconciliation-failed' | 'rejected' | 'failed';

export function solanaFailureIsUnverified(message: string, signature?: string) {
  return Boolean(signature) && !/^(Solana transaction failed:|This listing changed after you reviewed it\.|Payment mint does not match this marketplace\.|Not enough marketplace payment tokens)/.test(message);
}

export function TransactionProgress({ ecosystem, stage, identifier, message, details, unverified, retryReconciliation }: {
  ecosystem: Ecosystem; stage: ProgressStage; identifier?: string; message?: string; details?: string; unverified?: boolean; retryReconciliation: () => Promise<void>;
}) {
  if (stage === 'idle') return null;
  const label = stage === 'wallet' ? 'Approve in your wallet' : stage === 'submitted' ? 'Submitted to the network' : stage === 'pending' ? 'Waiting for confirmation' : stage === 'reconciling' ? 'Transaction succeeded' : stage === 'confirmed' ? 'Confirmed; affected reads refreshed' : stage === 'reconciliation-failed' ? 'Transaction succeeded; state refresh failed' : stage === 'rejected' ? 'Wallet request cancelled' : unverified ? 'Execution result not verified' : 'Transaction failed';
  const description = stage === 'wallet' ? `Review the request in your ${ecosystem.toUpperCase()} wallet. You can reject it there.` : stage === 'submitted' || stage === 'pending' ? 'An identifier means submission, not confirmation. Wait for the chain’s execution result before taking another action.' : stage === 'reconciling' ? 'Successful execution is verified. Refreshing the affected asset and payment reads…' : stage === 'confirmed' ? ecosystem === 'solana' ? 'Executed at confirmed commitment. Affected reads are refreshed; this is not a finalized commitment claim.' : 'Successful execution is verified and the affected reads are refreshed.' : stage === 'reconciliation-failed' ? 'Your transaction succeeded. Retry refresh safely; do not resubmit the transaction. Trading stays paused until reads recover.' : stage === 'rejected' ? 'The wallet request was cancelled. Review the asset again when you are ready.' : unverified ? 'The network result could not be read. Check the original transaction before considering another submission.' : failureMessage(message);
  return <section className={`transaction transaction-${stage}`} aria-label={`${ecosystem.toUpperCase()} transaction`} role={stage === 'failed' || stage === 'rejected' ? 'alert' : 'status'}>
    <p className="eyebrow">{ecosystem.toUpperCase()} / Transaction</p><strong>{label}</strong><p>{description}</p>
    {identifier && <CopyableAddress value={identifier} label={ecosystem === 'evm' ? 'transaction hash' : ecosystem === 'solana' ? 'transaction signature' : 'transaction digest'} />}
    {stage === 'reconciliation-failed' && <button onClick={() => void retryReconciliation()}>Retry state refresh</button>}
    {(message || details) && <details><summary>Technical transaction details</summary>{message && <p>{message}</p>}{details && <pre>{details}</pre>}</details>}
  </section>;
}

export function failureMessage(message?: string) {
  if (/listing.*(chang|stale)|version|maximum|not.active/i.test(message ?? '')) return 'The listing changed after review. Refresh it and review the new terms before signing again.';
  if (/balance|funds|insufficient/i.test(message ?? '')) return 'Your payment or native fee balance is too low. Check both balances before reviewing again.';
  if (/approval|allowance/i.test(message ?? '')) return 'A required token approval is missing. Check the asset and spending approvals.';
  if (/network|rpc|fetch|timeout/i.test(message ?? '')) return 'The network request did not complete. Check the connection and any existing transaction identifier.';
  if (/revert|abort/i.test(message ?? '')) return 'The chain rejected the transaction. Refresh the asset and review its current requirements.';
  return 'The request could not be completed. Check the details and refresh the asset before reviewing again.';
}
