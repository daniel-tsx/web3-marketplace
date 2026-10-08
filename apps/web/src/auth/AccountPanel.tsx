import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useAccount, useSignMessage } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { ConnectButton as SuiConnectButton, useCurrentAccount, useCurrentWallet, useDAppKit, useWalletConnection } from '@mysten/dapp-kit-react';
import { normalizeSuiAddress } from '@mysten/sui/utils';
import { ApiError, logout, requestChallenge, requestWalletLink, verifyChallenge, verifyWalletLink, type LinkChallenge } from './api';
import { sessionKey, useSession } from './useSession';
import type { Ecosystem, LinkedWallet } from '../execution/resolveExecution';

type PendingLink = { userId: string; target: LinkedWallet; challenge: LinkChallenge; authorizerSignature?: string };
const walletKey = (wallet: LinkedWallet) => `${wallet.ecosystem}:${wallet.address}`;

function matchesWallet(wallet: LinkedWallet, connected?: string) {
  if (!connected) return false;
  if (wallet.ecosystem === 'evm') return connected.toLowerCase() === wallet.address.toLowerCase();
  if (wallet.ecosystem === 'sui') return normalizeSuiAddress(connected) === normalizeSuiAddress(wallet.address);
  return connected === wallet.address;
}

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
  const [authorizerKey, setAuthorizerKey] = useState('');
  const [pendingLink, setPendingLink] = useState<PendingLink | null>(null);
  const wallets = session.data?.wallets ?? [];
  const authorizer = wallets.find((wallet) => walletKey(wallet) === authorizerKey) ?? wallets[0];

  useEffect(() => {
    setPendingLink((current) => current?.userId === session.data?.userId ? current : null);
  }, [session.data?.userId, pendingLink?.userId]);

  function connectedAddress(ecosystem: Ecosystem) {
    return ecosystem === 'evm' ? evmAddress : ecosystem === 'solana' ? solana.publicKey?.toBase58() : suiAccount?.address;
  }

  async function signWallet(wallet: LinkedWallet, text: string) {
    if (!matchesWallet(wallet, connectedAddress(wallet.ecosystem))) throw new Error(`Connect the requested ${wallet.ecosystem.toUpperCase()} wallet ${wallet.address} before signing.`);
    if (wallet.ecosystem === 'evm') return signMessageAsync({ message: text, account: wallet.address as `0x${string}` });
    const message = new TextEncoder().encode(text);
    if (wallet.ecosystem === 'solana') {
      if (!solana.signMessage) throw new Error('This Solana wallet does not support message signing. Select another wallet.');
      return toBase64(await solana.signMessage(message));
    }
    return (await dAppKit.signPersonalMessage({ message })).signature;
  }

  async function authenticate(ecosystem: Ecosystem) {
    const address = connectedAddress(ecosystem);
    if (!address) { setError(`Connect a ${ecosystem.toUpperCase()} wallet first.`); return; }
    if (ecosystem === 'solana' && !solana.signMessage) { setError('This Solana wallet does not support message signing. Select another wallet.'); return; }
    setBusy(true);
    setError(null);
    try {
      const challenge = await requestChallenge(ecosystem, address);
      const signature = await signWallet({ ecosystem, address }, challenge.message);
      await verifyChallenge(ecosystem, address, signature, challenge.challengeId);
      await queryClient.invalidateQueries({ queryKey: sessionKey, exact: true });
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }

  async function prepareLink(ecosystem: Ecosystem) {
    const address = connectedAddress(ecosystem);
    if (!address || !session.data || !authorizer) return;
    const target = { ecosystem, address };
    setBusy(true);
    setError(null);
    try {
      const challenge = await requestWalletLink(target, authorizer);
      // Freeze the target before either wallet prompt; connection changes cannot substitute it.
      setPendingLink({ userId: session.data.userId, target, challenge });
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }

  async function signLinkStep() {
    const link = pendingLink;
    if (!link || link.userId !== session.data?.userId) return;
    setBusy(true);
    setError(null);
    try {
      if (Date.parse(link.challenge.expiresAt) <= Date.now()) {
        setPendingLink(null);
        throw new Error('This link request expired. Review the wallets and start linking again.');
      }
      if (!link.authorizerSignature) {
        const signature = await signWallet(link.challenge.authorizer, link.challenge.authorizer.message);
        setPendingLink({ ...link, authorizerSignature: signature });
      } else {
        const signature = await signWallet(link.target, link.challenge.message);
        await verifyWalletLink(link.target, signature, link.challenge.challengeId, link.authorizerSignature);
        setPendingLink(null);
        await queryClient.invalidateQueries({ queryKey: sessionKey, exact: true });
      }
    } catch (cause) {
      if (cause instanceof ApiError && ['challenge_expired', 'challenge_used', 'invalid_link_session', 'unauthenticated', 'untrusted_wallet', 'reauthentication_required', 'invalid_reauthentication'].includes(cause.code)) setPendingLink(null);
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally { setBusy(false); }
  }

  async function endSession() {
    setBusy(true);
    setError(null);
    try { await logout(); await queryClient.invalidateQueries({ queryKey: sessionKey, exact: true }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }

  return <section className="chain-panel" aria-label="Application identity and wallets">
    <h3>Your application account</h3>
    {session.isPending ? <p role="status">Checking your account…</p> : session.isError ? <div className="account-error" role="alert"><p>Your account could not be checked. You can still browse the collection.</p><button onClick={() => void session.refetch()}>Retry account check</button><details><summary>Account diagnostics</summary><p className="error">{session.error.message}</p></details></div> : <p><strong>{session.data ? 'Signed in' : 'Browsing as a guest'}</strong>{session.data && <> · Account <code>{session.data.userId}</code></>}</p>}
    <div className="account-columns">
      <div><h4>Linked login wallets</h4>{session.data?.wallets.length ? <ul>{session.data.wallets.map((wallet) => <li key={`${wallet.ecosystem}:${wallet.address}`}>{wallet.ecosystem.toUpperCase()}: <code>{wallet.address}</code></li>)}</ul> : <p>Sign in with a wallet to establish an account. Additional wallets can then be linked with signed proofs.</p>}</div>
      <div className="browser-wallets"><h4>Connected in this browser</h4><div className="wallet-row"><p>EVM <code>{evmAddress ?? 'Disconnected'}</code></p><ConnectButton chainStatus="none" showBalance={false} /></div><div className="wallet-row"><p>Solana <code>{solana.publicKey?.toBase58() ?? 'Disconnected'}</code></p><WalletMultiButton /></div><details><summary>Solana connection details</summary><p className="muted">RPC: <code>{connection.rpcEndpoint}</code></p></details><div className="wallet-row"><p>Sui <code>{suiAccount?.address ?? 'Disconnected'}</code> {suiWallet?.name && `(${suiWallet.name})`}</p><SuiConnectButton /></div><p className="muted">Sui connection: {suiConnection.status}</p></div>
    </div>
    <div className="account-actions">
      {session.data ? <>
        <label>Already-linked wallet to approve the credential change <select disabled={busy || Boolean(pendingLink)} value={authorizer ? walletKey(authorizer) : ''} onChange={(event) => setAuthorizerKey(event.target.value)}>{wallets.map((wallet) => <option key={walletKey(wallet)} value={walletKey(wallet)}>{wallet.ecosystem.toUpperCase()}: {wallet.address}</option>)}</select></label>
        <button disabled={busy || Boolean(pendingLink) || !authorizer || !evmAddress} onClick={() => void prepareLink('evm')}>Link connected EVM wallet</button>
        <button disabled={busy || Boolean(pendingLink) || !authorizer || !solana.publicKey} onClick={() => void prepareLink('solana')}>Link connected Solana wallet</button>
        <button disabled={busy || Boolean(pendingLink) || !authorizer || !suiAccount} onClick={() => void prepareLink('sui')}>Link connected Sui wallet</button>
        <button disabled={busy} onClick={() => void endSession()}>Logout</button>
      </> : <>
        <button disabled={busy || !evmAddress} onClick={() => void authenticate('evm')}>Login with EVM signature</button>
        <button disabled={busy || !solana.publicKey} onClick={() => void authenticate('solana')}>Login with Solana signature</button>
        <button disabled={busy || !suiAccount} onClick={() => void authenticate('sui')}>Login with Sui signature</button>
      </>}
    </div>
    {pendingLink && <div className="transaction" role="status">
      <p>Add <strong>{pendingLink.target.ecosystem.toUpperCase()}</strong> wallet <code>{pendingLink.target.address}</code> as a login credential.</p>
      <p>Approval must come from your already-linked {pendingLink.challenge.authorizer.ecosystem.toUpperCase()} wallet <code>{pendingLink.challenge.authorizer.address}</code>. Both signatures expire at {new Date(pendingLink.challenge.expiresAt).toLocaleTimeString()}.</p>
      <p>{pendingLink.authorizerSignature ? 'Step 2: connect the exact new wallet above and sign its ownership proof to finish linking.' : 'Step 1: connect the exact approving wallet above and sign authorization for this new credential.'} You can switch accounts between steps. A signature alone does not complete linking.</p>
      <button disabled={busy || !matchesWallet(pendingLink.authorizerSignature ? pendingLink.target : pendingLink.challenge.authorizer, connectedAddress(pendingLink.authorizerSignature ? pendingLink.target.ecosystem : pendingLink.challenge.authorizer.ecosystem))} onClick={() => void signLinkStep()}>{pendingLink.authorizerSignature ? 'Sign ownership proof and finish linking' : 'Authorize this wallet link'}</button>
      <button disabled={busy} onClick={() => { setPendingLink(null); setError(null); }}>Cancel linking</button>
    </div>}
    {error && <p role="alert" className="error">{error}</p>}
  </section>;
}
