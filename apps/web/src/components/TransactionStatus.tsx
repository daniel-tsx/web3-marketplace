import type { TransactionPhase } from '../web3/useTransactionFlow';

export function TransactionStatus({ phase, retryReconciliation }: { phase: TransactionPhase; retryReconciliation: () => Promise<void> }) {
  if (phase.stage === 'idle') return <p className="transaction">Ready for a transaction.</p>;
  if (phase.stage === 'wallet') return <p className="transaction" role="status">Waiting for wallet confirmation and signature…</p>;
  if (phase.stage === 'rejected' || phase.stage === 'failed') {
    const label = phase.stage === 'rejected' ? 'Rejected: ' : phase.hash && phase.error.kind === 'network' ? 'Receipt not verified: ' : 'Failed: ';
    return <p className="transaction error" role="alert">{label}{phase.error.message}{phase.hash && <> Hash: <code>{phase.hash}</code></>}</p>;
  }
  const label = phase.stage === 'submitted' ? 'Submitted to RPC' : phase.stage === 'pending' ? 'Pending block confirmation' : phase.stage === 'confirmed' ? 'Confirmed; affected reads refreshed' : 'Transaction succeeded';
  return <div className="transaction" role="status">
    <p>{label}: <code>{phase.hash}</code>{'detail' in phase && phase.detail && <> · {phase.detail}</>}{phase.stage === 'reconciling' && <> · Refreshing affected state…</>}</p>
    {phase.stage === 'reconciliation-failed' && <><p className="error">State refresh failed: {phase.refreshError.message}. Retry refresh safely; do not resubmit the transaction.</p><button onClick={() => void retryReconciliation()}>Retry state refresh</button></>}
  </div>;
}
