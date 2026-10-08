import { useRef, useState, type ReactNode } from 'react';
import type { Ecosystem } from '../execution/resolveExecution';

export function Brand({ compact = false }: { compact?: boolean }) {
  return <span className="brand"><img src="/brand/mark.svg" alt="" width="38" height="38" /><span>Vehicle<span className="brand-subtitle">{compact ? 'Marketplace' : 'Marketplace / Multi-chain'}</span></span></span>;
}

export function Arrow({ diagonal = false }: { diagonal?: boolean }) {
  return <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d={diagonal ? 'M6 18 18 6M6 6h12v12' : 'M4 12h16m-6-6 6 6-6 6'} /></svg>;
}

export function EcosystemLabel({ ecosystem }: { ecosystem: Ecosystem }) {
  return <span className="ecosystem-label"><span className={`ecosystem-symbol ${ecosystem}`} aria-hidden="true">{ecosystem === 'evm' ? '◇' : ecosystem === 'solana' ? '≋' : '◊'}</span>{ecosystem === 'evm' ? 'EVM' : ecosystem === 'solana' ? 'Solana' : 'Sui'}</span>;
}

export function VehicleVisual({ image, alt, preview = false }: { image: string; alt: string; preview?: boolean }) {
  return <div className="vehicle-visual"><img src={`/vehicles/${image}.webp`} alt={alt} width="900" height="600" loading="lazy" decoding="async" />{preview && <span className="preview-label">Demo Preview</span>}<span className="image-disclosure">Original concept illustration</span></div>;
}

export function AssetReadError({ children, onRetry, busy }: { children: ReactNode; onRetry?: () => void; busy?: boolean }) {
  return <div className="asset-read-error" role="alert"><p>Current asset data is unavailable. Trading needs verified chain reads.</p>{onRetry && <button disabled={busy} onClick={onRetry}>{busy ? 'Refreshing asset…' : 'Retry asset reads'}</button>}<details><summary>Read diagnostics</summary><p className="error">{children}</p></details></div>;
}

export function useReadRecovery() {
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(read: () => Promise<unknown>) {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(null);
    try { await read(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { pending.current = false; setBusy(false); }
  }
  return { busy, error, run };
}
