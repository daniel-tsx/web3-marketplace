import { useEffect, useState } from 'react';
import { usePublicClient } from 'wagmi';
import type { Hash, TransactionReceipt } from 'viem';
import { explainWeb3Error, type Web3ActionError } from './errors';
import type { ReconciliationPhase } from './reconciliation';
import { useReadReconciliation } from './useReadReconciliation';

export type TransactionPhase =
  | { stage: 'idle' }
  | { stage: 'wallet' }
  | { stage: 'submitted' | 'pending'; hash: Hash }
  | ({ hash: Hash; detail?: string } & ReconciliationPhase)
  | { stage: 'rejected' | 'failed'; error: Web3ActionError; hash?: Hash };

export function useTransactionFlow() {
  const publicClient = usePublicClient();
  const [phase, setPhase] = useState<TransactionPhase>({ stage: 'idle' });
  const reconciliation = useReadReconciliation<{ hash: Hash; detail?: string }>(setPhase);

  useEffect(() => {
    if (phase.stage !== 'submitted') return;
    const timer = setTimeout(() => setPhase((current) => current.stage === 'submitted' ? { ...current, stage: 'pending' } : current), 0);
    return () => clearTimeout(timer);
  }, [phase]);

  async function run(
    requestWallet: () => Promise<Hash>,
    refreshAffectedQueries: () => Promise<unknown>,
    inspectReceipt?: (receipt: TransactionReceipt) => string | undefined,
    diagnoseRevert?: (blockNumber: bigint) => Promise<unknown>,
  ) {
    if (busy) return;
    reconciliation.reset();
    if (!publicClient) {
      setPhase({ stage: 'failed', error: { kind: 'wrong-chain', message: 'Switch to the local Anvil chain.', cause: null } });
      return;
    }
    let hash: Hash | undefined;
    try {
      setPhase({ stage: 'wallet' });
      // Wagmi resolves this promise only after the wallet signs and RPC accepts the broadcast.
      hash = await requestWallet();
      setPhase({ stage: 'submitted', hash });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== 'success') {
        if (diagnoseRevert) await diagnoseRevert(receipt.blockNumber);
        throw new Error('Transaction was included in a block but reverted.');
      }
      let detail: string | undefined;
      try { detail = inspectReceipt?.(receipt); }
      catch (cause) { console.error('Receipt event decoding failed', cause); }
      await reconciliation.start({ hash, detail }, async () => { await refreshAffectedQueries(); });
    } catch (cause) {
      const error = explainWeb3Error(cause);
      console.error('Web3 transaction failed', cause);
      setPhase({ stage: error.kind === 'rejected' ? 'rejected' : 'failed', error, hash });
    }
  }

  const busy = phase.stage === 'wallet' || phase.stage === 'submitted' || phase.stage === 'pending' || phase.stage === 'reconciling' || phase.stage === 'reconciliation-failed';
  return { phase, busy, run, retryReconciliation: reconciliation.retry };
}
