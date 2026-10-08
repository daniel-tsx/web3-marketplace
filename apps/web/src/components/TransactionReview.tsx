import { useEffect, useRef, useState } from 'react';
import { CopyableAddress } from './VehicleDetail';

export interface ReviewedAction {
  title: string;
  action: string;
  asset: string;
  network: string;
  price?: string;
  seller?: string;
  binding?: string;
  note: string;
  scope: string;
  execute: () => void;
}

// Hold the original handler and terms through rerenders. Reopening is an explicit new review.
export function useActionReview() {
  const [review, setReview] = useState<ReviewedAction | null>(null);
  const origin = useRef<HTMLElement | null>(null);
  return { review, start: (action: ReviewedAction) => { origin.current = document.activeElement as HTMLElement | null; setReview(action); }, dismiss: () => { setReview(null); requestAnimationFrame(() => origin.current?.focus()); } };
}

export function TransactionReview({ review, currentScope, currentBinding, allowed, onDismiss }: { review: ReviewedAction | null; currentScope: string; currentBinding?: string; allowed: boolean; onDismiss: () => void }) {
  const submitted = useRef(false);
  const container = useRef<HTMLElement>(null);
  useEffect(() => { if (review) container.current?.focus(); }, [review]);
  const previousReview = useRef(review);
  if (previousReview.current !== review) { previousReview.current = review; submitted.current = false; }
  if (!review) return null;
  const canConfirm = allowed && review.scope === currentScope && (!review.binding || review.binding === currentBinding);
  return <section className="transaction-review" aria-label="Review transaction" tabIndex={-1} ref={container}>
    <p className="eyebrow">Review before signing</p><h3>{review.title}</h3>
    <dl><dt>Asset</dt><dd>{review.asset}</dd><dt>Network</dt><dd>{review.network}</dd>{review.price && <><dt>Amount</dt><dd>{review.price}</dd></>}{review.seller && <><dt>Seller</dt><dd><CopyableAddress value={review.seller} label="reviewed seller" /></dd></>}{review.binding && <><dt>Reviewed listing</dt><dd><code>{review.binding}</code></dd></>}</dl>
    <p>{review.note}</p><p className="muted">Your wallet will ask for approval. Native network fees are paid separately. Nothing has been submitted yet.</p>
    {!canConfirm && <p className="error" role="status">{review.binding && review.binding !== currentBinding ? 'The listing changed after review.' : 'Wallet, session, network or asset readiness changed.'} Close this review, restore readiness and review the terms again.</p>}
    <div className="account-actions"><button className="button-primary" disabled={!canConfirm} onClick={() => { if (!canConfirm || submitted.current) return; submitted.current = true; onDismiss(); review.execute(); }}>{review.action}</button><button onClick={onDismiss}>Back to asset</button></div>
  </section>;
}
