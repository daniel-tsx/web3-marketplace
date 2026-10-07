import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useCurrentAccount } from '@mysten/dapp-kit-react';
import { formatUnits, parseUnits } from 'viem';
import { buildBuyVehicleTransaction, buildCancelListingTransaction, buildListVehicleTransaction } from '@vehicle/sui';
import { executionPrompt, type ExecutionContext } from '../execution/resolveExecution';
import { suiCoinType, suiMarketId, suiPackageId, suiVehicleId } from '../web3/sui/config';
import { useSuiVehicleState } from '../web3/sui/useSuiVehicleState';
import { reconcileSuiVehicleState } from '../web3/sui/reconcileVehicleState';
import { useSuiTransaction } from '../web3/sui/useSuiTransaction';

const money = (amount?: bigint) => amount === undefined ? '…' : `${formatUnits(amount, 6)} mUSDC`;

export function SuiVehicleCard({ context }: { context: ExecutionContext }) {
  const account = useCurrentAccount();
  const queryClient = useQueryClient();
  const tx = useSuiTransaction();
  const state = useSuiVehicleState(account?.address);
  const [priceInput, setPriceInput] = useState('12000');
  const ids = suiPackageId && suiMarketId ? { packageId: suiPackageId, marketId: suiMarketId } : null;
  const owner = account?.address;
  const listing = state.listing.data;
  const isSeller = Boolean(listing && owner?.toLowerCase() === listing.seller.toLowerCase());
  const ready = context.status === 'ready';
  const readError = [state.market, state.listing, state.vehicle, state.buyerBalance, state.sellerBalance, state.feeBalance].find((query) => query.isError)?.error;

  async function refresh(action: 'list' | 'cancel' | 'buy', seller?: string, feeRecipient?: string) {
    await reconcileSuiVehicleState(queryClient, state.queries, { action, network: state.network, marketId: suiMarketId!, vehicleId: suiVehicleId!, listingId: listing?.id, coinType: suiCoinType ?? undefined, buyer: owner, seller, feeRecipient });
  }

  function list() {
    if (!ready || !ids || !owner || !state.market.isSuccess || state.market.data.listingId || listing || state.vehicle.data?.owner?.toLowerCase() !== owner.toLowerCase()) return;
    let price: bigint;
    try { price = parseUnits(priceInput, 6); if (price <= 0n || price > (1n << 64n) - 1n) return; } catch { return; }
    void tx.run(buildListVehicleTransaction(ids, suiVehicleId!, price), () => refresh('list'));
  }

  function cancel() {
    if (!ready || !ids || !listing || !isSeller) return;
    void tx.run(buildCancelListingTransaction(ids, listing.id), () => refresh('cancel'));
  }

  function buy() {
    if (!ready || !ids || !suiCoinType || !listing || !owner || isSeller || (state.buyerBalance.data ?? 0n) < listing.price) return;
    void tx.run(buildBuyVehicleTransaction(ids, listing.id, listing.price, suiCoinType), () => refresh('buy', listing.seller, state.market.data?.feeRecipient));
  }

  return <article className="vehicle-card">
    <p className="eyebrow">Sui · {state.network}</p>
    <h2>Vehicle object</h2>
    <p className="muted">Address-owned when idle, held inside a shared Listing while for sale · <code>{suiVehicleId}</code></p>
    <dl>
      <dt>Market object</dt><dd><code>{suiMarketId}</code></dd>
      <dt>Listing</dt><dd>{state.market.isPending ? 'Loading…' : listing ? <code>{listing.id}</code> : state.market.data?.listingId ? 'Loading…' : 'Inactive'}</dd>
      <dt>Vehicle</dt><dd>{listing?.vehicleName ?? state.vehicle.data?.name ?? '…'}</dd>
      <dt>Seller</dt><dd><code>{listing?.seller ?? '—'}</code></dd>
      <dt>Price</dt><dd>{listing ? money(listing.price) : '—'}</dd>
      <dt>Ownership</dt><dd>{listing ? 'Wrapped in shared Listing' : state.vehicle.data?.owner ?? '…'}</dd>
      <dt>Your payment balance</dt><dd>{owner ? money(state.buyerBalance.data) : 'Connect wallet'}</dd>
    </dl>
    {readError && <p role="alert" className="error">Sui read failed: {readError.message}</p>}
    {!ready && <p className="execution-prompt">{executionPrompt(context)}</p>}
    {ready && state.market.isSuccess && !state.market.data.listingId && !listing && state.vehicle.data?.owner?.toLowerCase() === owner?.toLowerCase() && <div className="action-row">
      <label>Price in mUSDC <input value={priceInput} onChange={(event) => setPriceInput(event.target.value)} inputMode="decimal" /></label>
      <button disabled={tx.busy || !/^\d+(\.\d{1,6})?$/.test(priceInput) || Number(priceInput) <= 0} onClick={list}>List on Sui</button>
    </div>}
    {ready && listing && isSeller && <button disabled={tx.busy} onClick={cancel}>Cancel Sui listing</button>}
    {ready && listing && !isSeller && (state.buyerBalance.data ?? 0n) < listing.price && <p>Insufficient Sui mUSDC balance.</p>}
    {ready && listing && !isSeller && (state.buyerBalance.data ?? 0n) >= listing.price && <button disabled={tx.busy} onClick={buy}>Buy on Sui</button>}
    {tx.phase.stage !== 'idle' && <div className="transaction" role="status">
      <strong>Sui: {tx.phase.stage}</strong>
      {'digest' in tx.phase && tx.phase.digest && <p>Digest: <code>{tx.phase.digest}</code></p>}
      {tx.phase.stage === 'wallet' && <p>Approve in your Sui wallet.</p>}
      {tx.phase.stage === 'reconciling' && <p>Transaction succeeded. Waiting for transaction reads and refreshing affected objects…</p>}
      {tx.phase.stage === 'reconciliation-failed' && <><p className="error">Transaction succeeded; state refresh failed: {tx.phase.refreshError.message}. Retry refresh safely; do not resubmit the transaction.</p><button onClick={() => void tx.retryReconciliation()}>Retry state refresh</button></>}
      {tx.phase.stage === 'confirmed' && <><p>Confirmed. Affected Sui reads refreshed.</p><details><summary>Effects, events, and balance changes</summary><pre>{tx.phase.details}</pre></details></>}
      {(tx.phase.stage === 'failed' || tx.phase.stage === 'rejected') && <p className="error">{tx.phase.message}</p>}
    </div>}
  </article>;
}
