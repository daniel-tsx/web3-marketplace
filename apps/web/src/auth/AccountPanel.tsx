import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useAccount, useSignMessage } from 'wagmi';
import { ConnectButton as SuiConnectButton, useCurrentAccount, useCurrentWallet, useDAppKit, useWalletConnection } from '@mysten/dapp-kit-react';
import { logout, requestChallenge, verifyChallenge } from './api';
import { sessionKey, useSession } from './useSession';
import type { Ecosystem } from '../execution/resolveExecution';

function toBase64(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function AccountPanel() {
  const session = useSession();
  const queryClient = useQueryClient();
  const { address: evmAddress } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const solana = useWallet();
  const { connection } = useConnection();
  const suiAccount = useCurrentAccount();
  const suiWallet = useCurrentWallet();
  const suiConnection = useWalletConnection();
  const dAppKit = useDAppKit();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function authenticate(ecosystem: Ecosystem, purpose: 'login' | 'link-wallet') {
    const address = ecosystem === 'evm' ? evmAddress : ecosystem === 'solana' ? solana.publicKey?.toBase58() : suiAccount?.address;
    if (!address) { setError(`Connect a ${ecosystem.toUpperCase()} wallet first.`); return; }
    if (ecosystem === 'solana' && !solana.signMessage) { setError('This Solana wallet does not support message signing. Select another wallet.'); return; }
    setBusy(true);
    setError(null);
    try {
      const challenge = await requestChallenge(ecosystem, address, purpose);
      const message = new TextEncoder().encode(challenge.message);
      const signature = ecosystem === 'evm'
        ? await signMessageAsync({ message: challenge.message })
        : ecosystem === 'solana'
          ? toBase64(await solana.signMessage!(message))
          : (await dAppKit.signPersonalMessage({ message })).signature;
      await verifyChallenge(ecosystem, address, signature, challenge.challengeId, purpose);
      await queryClient.invalidateQueries({ queryKey: sessionKey, exact: true });
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }

  async function endSession() {
    setBusy(true);
    setError(null);
    try { await logout(); await queryClient.invalidateQueries({ queryKey: sessionKey, exact: true }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }

  return <section className="chain-panel" aria-label="Application identity and wallets">
    <h2>Application identity</h2>
    {session.isPending ? <p>Checking application session…</p> : session.isError ? <p role="alert" className="error">Session check failed: {session.error.message}</p> : <p>Session: <strong>{session.data ? 'Authenticated' : 'Unauthenticated'}</strong>{session.data && <> · User <code>{session.data.userId}</code></>}</p>}
    <div className="account-columns">
      <div><h3>Linked wallets</h3>{session.data?.wallets.length ? <ul>{session.data.wallets.map((wallet) => <li key={`${wallet.ecosystem}:${wallet.address}`}>{wallet.ecosystem.toUpperCase()}: <code>{wallet.address}</code></li>)}</ul> : <p>None for this session.</p>}</div>
      <div><h3>Connected in this browser</h3><p>EVM: <code>{evmAddress ?? 'Disconnected'}</code></p><p>Solana: <code>{solana.publicKey?.toBase58() ?? 'Disconnected'}</code></p><WalletMultiButton /><p className="muted">Solana RPC: <code>{connection.rpcEndpoint}</code></p><p>Sui: <code>{suiAccount?.address ?? 'Disconnected'}</code> {suiWallet?.name && `(${suiWallet.name})`}</p><SuiConnectButton /><p className="muted">Sui connection: {suiConnection.status}</p></div>
    </div>
    <div className="account-actions">
      {session.data ? <>
        <button disabled={busy || !evmAddress} onClick={() => void authenticate('evm', 'link-wallet')}>Link connected EVM wallet</button>
        <button disabled={busy || !solana.publicKey} onClick={() => void authenticate('solana', 'link-wallet')}>Link connected Solana wallet</button>
        <button disabled={busy || !suiAccount} onClick={() => void authenticate('sui', 'link-wallet')}>Link connected Sui wallet</button>
        <button disabled={busy} onClick={() => void endSession()}>Logout</button>
      </> : <>
        <button disabled={busy || !evmAddress} onClick={() => void authenticate('evm', 'login')}>Login with EVM signature</button>
        <button disabled={busy || !solana.publicKey} onClick={() => void authenticate('solana', 'login')}>Login with Solana signature</button>
        <button disabled={busy || !suiAccount} onClick={() => void authenticate('sui', 'login')}>Login with Sui signature</button>
      </>}
    </div>
    {error && <p role="alert" className="error">{error}</p>}
  </section>;
}
