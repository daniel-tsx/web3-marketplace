import type { TransactionPhase } from '../web3/useTransactionFlow';

export function TransactionStatus({ phase }: { phase: TransactionPhase }) {
  if (phase.stage === 'idle') return <p className="transaction">Ready for a transaction.</p>;
  if (phase.stage === 'wallet') return <p className="transaction" role="status">Waiting for wallet confirmation and signature…</p>;
  if (phase.stage === 'rejected' || phase.stage === 'failed') {
    const label = phase.stage === 'rejected' ? 'Rejected: ' : phase.hash && phase.error.kind === 'network' ? 'Receipt not verified: ' : 'Failed: ';
    return <p className="transaction error" role="alert">{label}{phase.error.message}{phase.hash && <> Hash: <code>{phase.hash}</code></>}</p>;
  }
  const label = phase.stage === 'submitted' ? 'Submitted to RPC' : phase.stage === 'pending' ? 'Pending block confirmation' : 'Confirmed';
  return <p className="transaction" role="status">{label}: <code>{phase.hash}</code>{phase.stage === 'confirmed' && phase.detail && <> · {phase.detail}</>}{phase.stage === 'confirmed' && phase.refreshError && <> · State refresh failed: {phase.refreshError.message}</>}</p>;
}
