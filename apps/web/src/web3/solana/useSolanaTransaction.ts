import { useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { Transaction, type TransactionInstruction } from '@solana/web3.js';
import { explainSolanaError, solanaExecutionError } from './errors';
import type { ReconciliationPhase } from '../reconciliation';
import { useReadReconciliation } from '../useReadReconciliation';

type Phase = { stage: 'idle' | 'wallet' } | { stage: 'submitted' | 'pending'; signature: string } | ({ signature: string; logs?: string[] } & ReconciliationPhase) | { stage: 'rejected' | 'failed'; message: string; signature?: string };

export function useSolanaTransaction() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [phase, setPhase] = useState<Phase>({ stage: 'idle' });
  const reconciliation = useReadReconciliation<{ signature: string; logs?: string[] }>(setPhase);

  async function run(instruction: TransactionInstruction, refresh: () => Promise<unknown>) {
    if (busy) return;
    reconciliation.reset();
    if (!wallet.publicKey) { setPhase({ stage: 'failed', message: 'Connect your Solana wallet.' }); return; }
    let signature: string | undefined;
    try {
      setPhase({ stage: 'wallet' });
      const latest = await connection.getLatestBlockhash('confirmed');
      const transaction = new Transaction({ feePayer: wallet.publicKey, recentBlockhash: latest.blockhash }).add(instruction);
      signature = await wallet.sendTransaction(transaction, connection);
      setPhase({ stage: 'submitted', signature });
      setPhase({ stage: 'pending', signature });
      const confirmation = await connection.confirmTransaction({ signature, ...latest }, 'confirmed');
      if (confirmation.value.err) {
        // Logs identify a missing listing/escrow after cancellation; preserve the execution error if this read fails.
        let logs: string[] | undefined;
        try {
          const failed = await connection.getTransaction(signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
          logs = failed?.meta?.logMessages ?? undefined;
        } catch (cause) { console.error('Could not read failed transaction logs', cause); }
        throw solanaExecutionError(confirmation.value.err, logs);
      }
      // confirmTransaction already proved execution. Metadata/RPC failures below
      // cannot turn that successful execution into a failed transaction.
      const confirmedSignature = signature;
      await reconciliation.start({ signature }, async () => {
        const result = await connection.getTransaction(confirmedSignature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
        if (result?.meta?.err) throw solanaExecutionError(result.meta.err, result.meta.logMessages ?? undefined);
        await refresh();
        return { logs: result?.meta?.logMessages ?? undefined };
      });
    } catch (cause) {
      console.error('Solana transaction failed', cause);
      const message = explainSolanaError(cause);
      const rejected = /reject|declin|cancel/i.test(message);
      setPhase({ stage: rejected ? 'rejected' : 'failed', signature, message });
    }
  }
  const busy = phase.stage === 'wallet' || phase.stage === 'submitted' || phase.stage === 'pending' || phase.stage === 'reconciling' || phase.stage === 'reconciliation-failed';
  return { phase, busy, run, retryReconciliation: reconciliation.retry };
}
