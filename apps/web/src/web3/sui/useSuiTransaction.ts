import { useState } from 'react';
import { useCurrentClient, useDAppKit } from '@mysten/dapp-kit-react';
import type { Transaction } from '@mysten/sui/transactions';
import { successfulDigest } from './transactionResult';

type Phase =
  | { stage: 'idle' | 'wallet' }
  | { stage: 'submitted' | 'confirming' | 'confirmed' | 'executed'; digest: string; details?: string; refreshError?: string }
  | { stage: 'rejected' | 'failed'; message: string; digest?: string };

export function useSuiTransaction() {
  const dAppKit = useDAppKit();
  const client = useCurrentClient();
  const [phase, setPhase] = useState<Phase>({ stage: 'idle' });

  async function run(transaction: Transaction, refresh: () => Promise<unknown>) {
    let digest: string | undefined;
    try {
      setPhase({ stage: 'wallet' });
      const result = await dAppKit.signAndExecuteTransaction({ transaction });
      digest = successfulDigest(result);
      setPhase({ stage: 'submitted', digest });
      setPhase({ stage: 'confirming', digest });
      let details: string;
      try {
        await client.waitForTransaction({ digest });
        const inspected = await client.getTransaction({ digest, include: { effects: true, events: true, balanceChanges: true } });
        if (inspected.FailedTransaction) successfulDigest(inspected);
        if (!inspected.Transaction) throw new Error('Sui transaction was not readable after waiting.');
        details = JSON.stringify({ effects: inspected.Transaction.effects, events: inspected.Transaction.events, balanceChanges: inspected.Transaction.balanceChanges }, (_, value) => typeof value === 'bigint' ? value.toString() : value);
      } catch (cause) {
        console.error('Sui execution succeeded but transaction reads failed', cause);
        setPhase({ stage: 'executed', digest, refreshError: cause instanceof Error ? cause.message : String(cause) });
        return;
      }
      let refreshError: string | undefined;
      try { await refresh(); }
      catch (cause) {
        console.error('Sui transaction succeeded but query refresh failed', cause);
        refreshError = cause instanceof Error ? cause.message : String(cause);
      }
      setPhase({ stage: 'confirmed', digest, details, refreshError });
    } catch (cause) {
      console.error('Sui transaction failed', cause);
      const message = cause instanceof Error ? cause.message : String(cause);
      setPhase({ stage: /reject|declin|cancel/i.test(message) ? 'rejected' : 'failed', message, digest });
    }
  }
  return { phase, busy: phase.stage === 'wallet' || phase.stage === 'submitted' || phase.stage === 'confirming', run };
}
