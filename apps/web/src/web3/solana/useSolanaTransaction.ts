import { useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { Transaction, type TransactionInstruction } from '@solana/web3.js';

type Phase = { stage: 'idle' | 'wallet' } | { stage: 'submitted' | 'pending' | 'confirmed'; signature: string; logs?: string[]; refreshError?: string } | { stage: 'rejected' | 'failed'; message: string; signature?: string };

export function useSolanaTransaction() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [phase, setPhase] = useState<Phase>({ stage: 'idle' });

  async function run(instruction: TransactionInstruction, refresh: () => Promise<unknown>) {
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
      if (confirmation.value.err) throw new Error(`Solana transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      const result = await connection.getTransaction(signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
      if (result?.meta?.err) throw new Error(`Solana program failed: ${JSON.stringify(result.meta.err)}. Logs: ${result.meta.logMessages?.join(' | ')}`);
      let refreshError: string | undefined;
      try { await refresh(); }
      catch (cause) {
        console.error('Solana transaction confirmed but query refresh failed', cause);
        refreshError = cause instanceof Error ? cause.message : String(cause);
      }
      setPhase({ stage: 'confirmed', signature, logs: result?.meta?.logMessages ?? undefined, refreshError });
    } catch (cause) {
      console.error('Solana transaction failed', cause);
      const message = cause instanceof Error ? cause.message : String(cause);
      const rejected = /reject|declin|cancel/i.test(message);
      setPhase({ stage: rejected ? 'rejected' : 'failed', signature, message });
    }
  }
  return { phase, busy: phase.stage === 'wallet' || phase.stage === 'submitted' || phase.stage === 'pending', run };
}
