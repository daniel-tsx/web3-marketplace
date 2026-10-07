import { useState } from 'react';
import { useCurrentClient, useDAppKit } from '@mysten/dapp-kit-react';
import type { Transaction } from '@mysten/sui/transactions';
import { successfulDigest } from './transactionResult';
import type { ReconciliationPhase } from '../reconciliation';
import { useReadReconciliation } from '../useReadReconciliation';

type Phase =
  | { stage: 'idle' | 'wallet' }
  | { stage: 'submitted'; digest: string }
  | ({ digest: string; details?: string } & ReconciliationPhase)
  | { stage: 'rejected' | 'failed'; message: string; digest?: string };

export function useSuiTransaction() {
  const dAppKit = useDAppKit();
  const client = useCurrentClient();
  const [phase, setPhase] = useState<Phase>({ stage: 'idle' });
  const reconciliation = useReadReconciliation<{ digest: string; details?: string }>(setPhase);

  async function run(transaction: Transaction, refresh: () => Promise<unknown>) {
    if (busy) return;
    reconciliation.reset();
    let digest: string | undefined;
    try {
      setPhase({ stage: 'wallet' });
      const result = await dAppKit.signAndExecuteTransaction({ transaction });
      digest = successfulDigest(result);
      setPhase({ stage: 'submitted', digest });
      const executedDigest = digest;
      await reconciliation.start({ digest }, async () => {
        await client.waitForTransaction({ digest: executedDigest });
        const inspected = await client.getTransaction({ digest: executedDigest, include: { effects: true, events: true, balanceChanges: true } });
        if (inspected.FailedTransaction) successfulDigest(inspected);
        if (!inspected.Transaction) throw new Error('Sui transaction was not readable after waiting.');
        const details = JSON.stringify({ effects: inspected.Transaction.effects, events: inspected.Transaction.events, balanceChanges: inspected.Transaction.balanceChanges }, (_, value) => typeof value === 'bigint' ? value.toString() : value);
        await refresh();
        return { details };
      });
    } catch (cause) {
      console.error('Sui transaction failed', cause);
      const message = cause instanceof Error ? cause.message : String(cause);
      setPhase({ stage: /reject|declin|cancel/i.test(message) ? 'rejected' : 'failed', message, digest });
    }
  }
  const busy = phase.stage === 'wallet' || phase.stage === 'submitted' || phase.stage === 'reconciling' || phase.stage === 'reconciliation-failed';
  return { phase, busy, run, retryReconciliation: reconciliation.retry };
}
