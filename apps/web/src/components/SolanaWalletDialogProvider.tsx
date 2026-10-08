import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletModalContext } from '@solana/wallet-adapter-react-ui';

// Keep WalletMultiButton's existing modal context and adapter-selection protocol.
// Native dialog owns modality and Escape; keep keyboard focus within its controls.
export function SolanaWalletDialogProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const { wallets, select } = useWallet();

  useEffect(() => {
    const modal = dialog.current!;
    if (!visible) { if (modal.open) modal.close(); return; }
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    modal.showModal();
    document.body.style.overflow = 'hidden';
    return () => { modal.close(); document.body.style.overflow = previousOverflow; previousFocus?.focus(); };
  }, [visible]);

  return <WalletModalContext.Provider value={{ visible, setVisible }}>
    {children}
    <dialog ref={dialog} className="solana-wallet-dialog" aria-modal="true" aria-labelledby="solana-dialog-title" aria-describedby="solana-dialog-description" onClose={() => setVisible(false)} onCancel={() => setVisible(false)} onKeyDown={(event) => {
      if (event.key !== 'Tab') return;
      const controls = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')].filter(element => element.getClientRects().length > 0);
      const target = event.shiftKey && document.activeElement === controls[0] ? controls.at(-1) : !event.shiftKey && document.activeElement === controls.at(-1) ? controls[0] : undefined;
      if (target) { event.preventDefault(); target.focus(); }
    }} onClick={(event) => {
      if (event.target !== event.currentTarget) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) setVisible(false);
    }}>
      <div className="wallet-dialog-heading"><h2 id="solana-dialog-title">Choose a Solana wallet</h2><button className="wallet-dialog-close" aria-label="Close Solana wallet chooser" onClick={() => setVisible(false)}>×</button></div>
      <p id="solana-dialog-description">Select a wallet, then approve its connection. Signing in is a separate step.</p>
      <ul className="wallet-dialog-list">{wallets.map((wallet) => <li key={wallet.adapter.name}><button onClick={() => { select(wallet.adapter.name); setVisible(false); }}><img src={wallet.adapter.icon} alt="" width="28" height="28" /><span>{wallet.adapter.name}</span><span className="muted">{wallet.readyState === 'Installed' ? 'Detected' : 'Select'}</span></button></li>)}</ul>
      {!wallets.length && <p>No compatible wallets are available. Install a Solana wallet and reopen this chooser.</p>}
    </dialog>
  </WalletModalContext.Provider>;
}
