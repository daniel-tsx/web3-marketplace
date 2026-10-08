export type AccountStage = 'guest' | 'checking' | 'authenticated' | 'unavailable' | 'expired';
export function AccountStatus({ stage, progress, notice }: { stage: AccountStage; progress?: string | null; notice?: string | null }) {
  const label = stage === 'checking' ? 'Checking your application session' : stage === 'unavailable' ? 'Account service unavailable' : stage === 'authenticated' ? 'Application authenticated' : stage === 'expired' ? 'Your session has expired' : 'Explore first. Sign in when ready.';
  return <div className="account-status" role="status"><p className="eyebrow">Application identity</p><h3>{label}</h3><p>{stage === 'authenticated' ? 'Wallet connection, account linkage and the execution network are checked separately for each asset.' : stage === 'unavailable' ? 'Browsing remains available. Retry the account check before signing in or linking wallets.' : stage === 'checking' ? 'Checking the current session before account actions become available.' : stage === 'expired' ? 'Sign in again with a linked wallet to continue. Wallets can stay connected while your session expires.' : 'Connect a wallet, then sign a one-time message to prove ownership. This sign-in signature does not submit a blockchain transaction or grant token spending approval.'}</p>{progress && <p className="auth-progress" aria-live="polite">{progress}</p>}{notice && <p>{notice}</p>}</div>;
}

export function authErrorMessage(cause: unknown) {
  const code = cause && typeof cause === 'object' && 'code' in cause ? String(cause.code) : '';
  const detail = cause instanceof Error ? cause.message : String(cause);
  if (code === 'unauthenticated' || code === 'invalid_link_session') return 'Your session expired. Sign in again before linking a wallet.';
  if (/reject|declin|cancel|4001/i.test(detail)) return 'Signature cancelled. Your account and wallet links were not changed. You can try again when ready.';
  if (code === 'wallet_owned') return 'This wallet already belongs to another account. Use that wallet to sign in or choose another wallet.';
  if (code === 'invalid_signature' || code === 'invalid_challenge') return 'The signature did not match this wallet and request. Start a fresh request with the exact wallet shown.';
  if (code === 'invalid_reauthentication' || code === 'untrusted_wallet' || code === 'reauthentication_required') return 'Wallet linking requires a fresh approval from a wallet already linked to this account. Review the approving wallet and start linking again.';
  if (code === 'invalid_origin') return 'The account service does not recognize this site’s origin. Check the configured application URL before signing again.';
  if (code === 'challenge_expired' || code === 'challenge_used') return 'This signature request expired or was already used. Start a fresh request.';
  if (/link request expired/i.test(detail)) return 'This link request expired. Review both wallets and start linking again.';
  if (/Connect the requested/.test(detail)) return 'The connected wallet changed. Reconnect the exact wallet shown in this request before signing.';
  if (/not support message/.test(detail)) return 'This wallet cannot sign the login message. Select a wallet that supports message signing.';
  return 'The account request could not be completed. Check your connection and retry the current step.';
}
