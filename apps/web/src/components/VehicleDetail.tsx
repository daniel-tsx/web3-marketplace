import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { Ecosystem, ExecutionContext } from '../execution/resolveExecution';
import { executionPrompt } from '../execution/resolveExecution';
import { Arrow, EcosystemLabel, VehicleVisual } from './MarketplaceChrome';
import { catalogMatches, useCatalogFilter } from './CatalogBrowser';

export function CopyableAddress({ value, label = 'address' }: { value: string; label?: string }) {
  const [feedback, setFeedback] = useState('');
  useEffect(() => { setFeedback(''); }, [value]);
  async function copy() {
    try { await navigator.clipboard.writeText(value); setFeedback('Copied'); }
    catch { setFeedback('Copy unavailable. Select the identifier to copy it.'); }
  }
  return <span className="copyable-address"><code>{value}</code><button type="button" onClick={() => void copy()} aria-label={`Copy ${label}`}>Copy</button><span className="copy-feedback" role="status">{feedback}</span></span>;
}

// Native dialog owns modality and Escape. Wrap Tab at the content boundaries.
export function DetailDialog({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current!;
    if (!open) { if (dialog.open) dialog.close(); return; }
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    return () => { dialog.close(); document.body.style.overflow = previousOverflow; previousFocus?.focus(); };
  }, [open]);
  return <dialog ref={ref} className="vehicle-dialog" aria-modal="true" aria-labelledby={titleId} onCancel={onClose} onClose={onClose} onKeyDown={(event) => {
    if (event.key !== 'Tab') return;
    const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), summary, [tabindex="0"]')].filter(element => element.getClientRects().length > 0);
    const target = event.shiftKey && document.activeElement === controls[0] ? controls.at(-1) : !event.shiftKey && document.activeElement === controls.at(-1) ? controls[0] : undefined;
    if (target) { event.preventDefault(); target.focus(); }
  }} onClick={(event) => {
    if (event.target !== event.currentTarget) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
  }}>
    <div className="detail-heading"><h2 id={titleId}>{title}</h2><button type="button" onClick={onClose} aria-label="Close vehicle details">×</button></div>
    {children}
  </dialog>;
}

export function WalletRequirement({ context, onNavigate }: { context: ExecutionContext; onNavigate?: () => void }) {
  const target = context.status === 'wrong-network' || context.status === 'resource-unavailable' ? 'network-details' : 'wallets';
  const label = context.status === 'wrong-network' ? 'Select the required network' : context.status === 'resource-unavailable' ? 'Check network resources' : !context.connectedWallet ? 'Connect a wallet' : context.status === 'unauthenticated' ? 'Sign in with a signature' : context.status === 'wallet-not-linked' ? 'Review wallet linking' : 'Manage connected wallets';
  return <section className="wallet-requirement" aria-label="Transaction readiness">
    <h3>Before you trade</h3><dl><dt>Required wallet</dt><dd>{context.ecosystem.toUpperCase()}</dd><dt>Required network</dt><dd>{context.network}</dd><dt>Current network</dt><dd>{context.currentNetwork ?? 'Check your wallet network'}</dd><dt>Connected wallet</dt><dd>{context.connectedWallet ? <CopyableAddress value={context.connectedWallet} label="connected wallet" /> : 'Disconnected'}</dd>{context.checks && <><dt>Application session</dt><dd>{context.checks.authenticated ? 'Authenticated' : 'Sign-in required'}</dd><dt>Execution wallet</dt><dd>{context.checks.walletLinked ? 'Connected wallet is linked to this account' : 'Matching linked wallet required'}</dd><dt>Network check</dt><dd>{context.checks.networkReady ? 'Required network selected / reachable' : 'Network not ready'}</dd><dt>Chain resources</dt><dd>{context.checks.resourcesReady ? 'Detected; asset reads still required' : 'Unavailable'}</dd></>}</dl>
    <p>{executionPrompt(context) ?? 'Application identity, linked wallet and network requirements met. Asset ownership, payment and listing checks still apply.'}</p>
    {context.status !== 'ready' && <a className="button" href={`#${target}`} onClick={(event) => { event.currentTarget.closest('dialog')?.close(); onNavigate?.(); window.dispatchEvent(new CustomEvent('marketplace-workspace', { detail: target })); }}>{label} <Arrow /></a>}
  </section>;
}

export function VehicleDetail({ name, ecosystem, image, description, availability, preview = false, listed = false, children, status }: {
  name: string; ecosystem: Ecosystem; image: string; description: string; availability: string; preview?: boolean; listed?: boolean; children: ReactNode; status?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const matches = catalogMatches(useCatalogFilter(), { name, ecosystem, description, listed });
  return <>
    <article hidden={!matches} className={`vehicle-card${preview ? ' preview-card' : ''}${open ? ' is-selected' : ''}`}>
      <button className="vehicle-open" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open} aria-label={`Explore ${name}`}>
        <VehicleVisual image={image} alt={`Original concept illustration for ${name}; asset appearance unverified`} preview={preview} />
        <span className="vehicle-content"><span className="vehicle-topline"><EcosystemLabel ecosystem={ecosystem} /><span className="technical-label">{preview ? 'Design concept' : 'Chain-backed asset'}</span></span><span className="vehicle-title">{name}</span><span className="vehicle-description">{description}</span><span className="native-availability">{availability}</span><span className="detail-entry">{preview ? 'Explore concept' : 'View asset & listing'} <Arrow /></span></span>
      </button>
      {status && <div className="card-transaction">{status}</div>}
    </article>
    <DetailDialog open={open && matches} onClose={() => setOpen(false)} title={name}>
      <div className="detail-grid"><div className="detail-presentation"><VehicleVisual image={image} alt={`Original illustrative artwork for ${name}`} preview={preview} /><p className="detail-art-note">Original concept artwork. {preview ? 'This fictional vehicle has no on-chain asset, owner or sale price.' : 'The illustration does not verify the actual asset’s appearance or specifications.'}</p></div><div className="detail-content"><EcosystemLabel ecosystem={ecosystem} /><p className="vehicle-description">{description}</p><p className="native-availability" role="status">{availability}</p>{children}{status}</div></div>
    </DetailDialog>
  </>;
}
