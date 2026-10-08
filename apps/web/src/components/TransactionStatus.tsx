import type { TransactionPhase } from '../web3/useTransactionFlow';
import { TransactionProgress } from './TransactionProgress';

export function TransactionStatus({ phase, retryReconciliation }: { phase: TransactionPhase; retryReconciliation: () => Promise<void> }) {
  const unverified = phase.stage === 'failed' && Boolean(phase.hash) && !['revert', 'stale-listing', 'balance', 'allowance', 'approval'].includes(phase.error.kind) && !/included in a block but reverted/.test(phase.error.message);
  return <TransactionProgress ecosystem="evm" stage={phase.stage} identifier={'hash' in phase ? phase.hash : undefined} message={'error' in phase ? phase.error.message : phase.stage === 'reconciliation-failed' ? phase.refreshError.message : undefined} details={'detail' in phase ? phase.detail : undefined} unverified={unverified} retryReconciliation={retryReconciliation} />;
}
