import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useAccount, useSignMessage } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { ConnectButton as SuiConnectButton, useCurrentAccount, useCurrentNetwork, useCurrentWallet, useDAppKit, useWalletConnection } from '@mysten/dapp-kit-react';
import { normalizeSuiAddress } from '@mysten/sui/utils';
import { ApiError, getSession, logout, requestChallenge, requestWalletLink, verifyChallenge, verifyWalletLink, type LinkChallenge } from './api';
import { useSession } from './useSession';
import { clearSession, refreshSession } from './sessionTransitions';
import { AccountStatus, authErrorMessage } from './AccountStatus';
import { CopyableAddress } from '../components/VehicleDetail';
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
  const { address: evmAddress, chainId } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const solana = useWallet();
  const { connection } = useConnection();
  const suiAccount = useCurrentAccount();
  const suiNetwork = useCurrentNetwork();
  const suiWallet = useCurrentWallet();
  const suiConnection = useWalletConnection();
  const dAppKit = useDAppKit();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [authorizerKey, setAuthorizerKey] = useState('');
  const [pendingLink, setPendingLink] = useState<PendingLink | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const previouslyAuthenticated = useRef(false);
  const operationPending = useRef(false);
  const identity = session.isSuccess ? session.data : null;
  const wallets = identity?.wallets ?? [];
  if (identity) previouslyAuthenticated.current = true;
  const authorizer = wallets.find((wallet) => walletKey(wallet) === authorizerKey) ?? wallets[0];

  useEffect(() => {
    setPendingLink((current) => current?.userId === identity?.userId ? current : null);
  }, [identity?.userId, pendingLink?.userId]);

  function begin(message: string) {
    if (operationPending.current) return false;
    operationPending.current = true; setBusy(true); setError(null); setErrorMessage(null); setNotice(null); setProgress(message); return true;
  }
  function finish() { operationPending.current = false; setBusy(false); setProgress(null); }
  async function handleError(cause: unknown) {
    if (cause instanceof ApiError && ['unauthenticated', 'invalid_link_session'].includes(cause.code)) { setPendingLink(null); await clearSession(queryClient); }
    setError(cause instanceof Error ? cause.message : String(cause));
    setErrorMessage(authErrorMessage(cause));
  }

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
    if (!session.isSuccess || identity) return;
    const address = connectedAddress(ecosystem);
    if (!address) { setError(`Connect a ${ecosystem.toUpperCase()} wallet first.`); return; }
    if (ecosystem === 'solana' && !solana.signMessage) { setError('This Solana wallet does not support message signing. Select another wallet.'); return; }
    if (!begin('Preparing your one-time sign-in challenge…')) return;
    try {
      const challenge = await requestChallenge(ecosystem, address);
      setProgress('Action required: sign the login message in your wallet. No blockchain transaction is requested.');
      const signature = await signWallet({ ecosystem, address }, challenge.message);
      setProgress('Verifying your signature and checking the session…');
      await verifyChallenge(ecosystem, address, signature, challenge.challengeId);
      if (!await refreshSession(queryClient, getSession)) throw new ApiError('unauthenticated', 'The verified session could not be read. Sign in again.');
      setNotice('Signed in. Your login wallet is linked to this application account.');
    } catch (cause) { await handleError(cause); }
    finally { finish(); }
  }

  async function prepareLink(ecosystem: Ecosystem) {
    const address = connectedAddress(ecosystem);
    if (!address || !identity || !authorizer || wallets.some((wallet) => wallet.ecosystem === ecosystem && matchesWallet(wallet, address))) return;
    const target = { ecosystem, address };
    if (!begin('Preparing a wallet link with two independent ownership proofs…')) return;
    try {
      const challenge = await requestWalletLink(target, authorizer);
      // Freeze the target before either wallet prompt; connection changes cannot substitute it.
      setPendingLink({ userId: identity.userId, target, challenge });
    } catch (cause) { await handleError(cause); }
    finally { finish(); }
  }

  async function signLinkStep() {
    const link = pendingLink;
    if (!link || link.userId !== identity?.userId) return;
    if (!begin(link.authorizerSignature ? 'Action required: sign the target wallet ownership proof…' : 'Action required: authorize this exact credential change with your linked wallet…')) return;
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
        setProgress('Verifying both proofs and refreshing linked wallets…');
        await verifyWalletLink(link.target, signature, link.challenge.challengeId, link.authorizerSignature);
        setPendingLink(null);
        if (!await refreshSession(queryClient, getSession)) throw new ApiError('unauthenticated', 'The session expired. Sign in again to check wallet links.');
        setNotice('Wallet linked after both proofs were verified.');
      }
    } catch (cause) {
      if (cause instanceof ApiError && ['challenge_expired', 'challenge_used', 'invalid_link_session', 'unauthenticated', 'untrusted_wallet', 'reauthentication_required', 'invalid_reauthentication', 'wallet_owned', 'invalid_challenge'].includes(cause.code)) setPendingLink(null);
      await handleError(cause);
    } finally { finish(); }
  }

  async function endSession() {
    if (!begin('Ending your application session…')) return;
    try { await logout(); await clearSession(queryClient); previouslyAuthenticated.current = false; setPendingLink(null); setNotice('Signed out of the application. Browser wallets remain connected; reconnecting alone will not sign you in.'); }
    catch (cause) { await handleError(cause); }
    finally { finish(); }
  }

  return <section className="chain-panel" aria-label="Application identity and wallets">
    <AccountStatus stage={session.isPending ? 'checking' : session.isError ? 'unavailable' : identity ? 'authenticated' : previouslyAuthenticated.current ? 'expired' : 'guest'} progress={progress} notice={notice} />
    {identity && <p>Account <CopyableAddress value={identity.userId} label="account ID" /></p>}
    {session.isError && <div className="account-error" role="alert"><button disabled={session.isFetching || busy} onClick={() => void session.refetch()}>{session.isFetching ? 'Checking account…' : 'Retry account check'}</button><details><summary>Account diagnostics</summary><p className="error">{session.error.message}</p></details></div>}
    <div className="account-columns">
      <div><h4>Linked login wallets</h4>{wallets.length ? <ul>{wallets.map((wallet) => <li key={`${wallet.ecosystem}:${wallet.address}`}><strong>{wallet.ecosystem.toUpperCase()}</strong> / Linked<CopyableAddress value={wallet.address} label="linked wallet" /></li>)}</ul> : <p>Sign in with a wallet to establish an account. Additional wallets can then be linked with signed proofs.</p>}</div>
      <div className="browser-wallets"><h4>Connected in this browser</h4><div className="wallet-row"><div><p>EVM / {evmAddress ? 'Connected' : 'Disconnected'}</p>{evmAddress && <CopyableAddress value={evmAddress} label="connected EVM wallet" />}<p className="muted">Wallet network: {chainId ?? 'No connected network'}</p></div><ConnectButton chainStatus="none" showBalance={false} /></div><div className="wallet-row"><div><p>Solana / {solana.publicKey ? 'Connected' : 'Disconnected'}</p>{solana.publicKey && <CopyableAddress value={solana.publicKey.toBase58()} label="connected Solana wallet" />}</div><WalletMultiButton /></div><details><summary>Solana connection details</summary><p className="muted">Transactions use the configured RPC. Select the matching network in your wallet. RPC: <code>{connection.rpcEndpoint}</code></p></details><div className="wallet-row"><div><p>Sui / {suiAccount ? 'Connected' : 'Disconnected'} {suiWallet?.name && `(${suiWallet.name})`}</p>{suiAccount && <CopyableAddress value={suiAccount.address} label="connected Sui wallet" />}<p className="muted">Application network: {suiNetwork}</p></div><SuiConnectButton /></div><p className="muted">Sui connection: {suiConnection.status}</p></div>
    </div>
    <div className="account-actions">
      {identity ? <>
        <label>Already-linked wallet to approve the credential change <select disabled={busy || Boolean(pendingLink)} value={authorizer ? walletKey(authorizer) : ''} onChange={(event) => setAuthorizerKey(event.target.value)}>{wallets.map((wallet) => <option key={walletKey(wallet)} value={walletKey(wallet)}>{wallet.ecosystem.toUpperCase()}: {wallet.address}</option>)}</select></label>
        {(['evm', 'solana', 'sui'] as const).map((ecosystem) => { const connected = connectedAddress(ecosystem); const linked = wallets.some((wallet) => wallet.ecosystem === ecosystem && matchesWallet(wallet, connected)); return <button key={ecosystem} disabled={busy || Boolean(pendingLink) || !authorizer || !connected || linked} onClick={() => void prepareLink(ecosystem)}>{linked ? `${ecosystem.toUpperCase()} wallet already linked` : `Link connected ${ecosystem.toUpperCase()} wallet`}</button>; })}
        <button disabled={busy} onClick={() => void endSession()}>Sign out</button>
      </> : <>
        <button disabled={busy || !session.isSuccess || !evmAddress} onClick={() => void authenticate('evm')}>Sign in with EVM</button>
        <button disabled={busy || !session.isSuccess || !solana.publicKey} onClick={() => void authenticate('solana')}>Sign in with Solana</button>
        <button disabled={busy || !session.isSuccess || !suiAccount} onClick={() => void authenticate('sui')}>Sign in with Sui</button>
      </>}
    </div>
    <p className="muted">Connect the corresponding wallet to enable its account action. Connected wallets are linked only after explicit signed verification.</p>
    {identity && <p className="muted">Adding a login wallet needs approval from an already-linked wallet, followed by the new wallet’s ownership proof. Switching accounts or connecting another wallet never links it automatically.</p>}
    {pendingLink && <div className="transaction" role="status">
      <ol className="link-steps"><li>{pendingLink.authorizerSignature ? 'Authorization signed' : 'Awaiting linked-wallet authorization'}</li><li>{pendingLink.authorizerSignature ? 'Awaiting target-wallet proof' : 'Target-wallet ownership proof next'}</li><li>API verifies both proofs before linking</li></ol>
      <p>Add <strong>{pendingLink.target.ecosystem.toUpperCase()}</strong> wallet <code>{pendingLink.target.address}</code> as a login credential.</p>
      <p>Approval must come from your already-linked {pendingLink.challenge.authorizer.ecosystem.toUpperCase()} wallet <code>{pendingLink.challenge.authorizer.address}</code>. Both signatures expire at {new Date(pendingLink.challenge.expiresAt).toLocaleTimeString()}.</p>
      <p>{pendingLink.authorizerSignature ? 'Step 2: connect the exact new wallet above and sign its ownership proof to finish linking.' : 'Step 1: connect the exact approving wallet above and sign authorization for this new credential.'} You can switch accounts between steps. A signature alone does not complete linking.</p>
      <button disabled={busy || !matchesWallet(pendingLink.authorizerSignature ? pendingLink.target : pendingLink.challenge.authorizer, connectedAddress(pendingLink.authorizerSignature ? pendingLink.target.ecosystem : pendingLink.challenge.authorizer.ecosystem))} onClick={() => void signLinkStep()}>{pendingLink.authorizerSignature ? 'Sign ownership proof and finish linking' : 'Authorize this wallet link'}</button>
      <button disabled={busy} onClick={() => { setPendingLink(null); setError(null); }}>Cancel linking</button>
    </div>}
    {error && <div role="alert" className="account-error"><p className="error">{errorMessage ?? authErrorMessage(new Error(error))}</p><details><summary>Signature / account request details</summary><p>{error}</p></details></div>}
  </section>;
}
