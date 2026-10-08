import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useCurrentAccount } from '@mysten/dapp-kit-react';
import { formatUnits, parseUnits } from 'viem';
import { buildBuyVehicleTransaction, buildCancelListingTransaction, buildListVehicleTransaction } from '@vehicle/sui';
import type { ExecutionContext } from '../execution/resolveExecution';
import { suiCoinType, suiMarketId, suiPackageId, suiRpcUrl, suiVehicleId } from '../web3/sui/config';
import { suiObjectExplorer } from '../presentation/explorer';
import { useSuiVehicleState } from '../web3/sui/useSuiVehicleState';
import { reconcileSuiVehicleState } from '../web3/sui/reconcileVehicleState';
import { useSuiTransaction } from '../web3/sui/useSuiTransaction';
import { AssetReadError, useReadRecovery } from './MarketplaceChrome';
import { CopyableAddress, VehicleDetail, WalletRequirement } from './VehicleDetail';
import { TransactionReview, useActionReview } from './TransactionReview';
import { TransactionProgress } from './TransactionProgress';
import { ListingPriceField, listingPriceError } from './ListingPriceField';
import { fetchReconciledQuery } from '../web3/reconciliation';

const money = (amount?: bigint) => amount === undefined ? '…' : `${formatUnits(amount, 6)} mUSDC`;

export function SuiVehicleCard({ context, identityKey }: { context: ExecutionContext; identityKey?: string }) {
  const account = useCurrentAccount();
  const queryClient = useQueryClient();
  const tx = useSuiTransaction();
  const state = useSuiVehicleState(account?.address);
  const [priceInput, setPriceInput] = useState('12000');
  const review = useActionReview();
  const recovery = useReadRecovery();
  const ids = suiPackageId && suiMarketId ? { packageId: suiPackageId, marketId: suiMarketId } : null;
  const owner = account?.address;
  const listing = state.listing.data;
  const isSeller = Boolean(listing && owner?.toLowerCase() === listing.seller.toLowerCase());
  const ready = context.status === 'ready';
  const readError = [state.market, state.listing, state.vehicle, state.buyerBalance, state.sellerBalance, state.feeBalance].find((query) => query.isError)?.error;
  const readable = !readError && state.market.isSuccess && (state.market.data.listingId ? state.listing.isSuccess : state.vehicle.isSuccess);
  const scope = `${identityKey}:${owner}:${state.network}`;
  const binding = listing ? `${listing.id} / ${listing.price}` : undefined;

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

  async function retryReads() {
    const market = await fetchReconciledQuery(queryClient, state.queries.market);
    if (market.listingId) await fetchReconciledQuery(queryClient, state.queries.listing(market.listingId));
    else await fetchReconciledQuery(queryClient, state.queries.vehicle);
    if (owner && suiCoinType) await state.buyerBalance.refetch({ throwOnError: true });
    if (listing && suiCoinType) await state.sellerBalance.refetch({ throwOnError: true });
    if (market.feeRecipient && suiCoinType) await state.feeBalance.refetch({ throwOnError: true });
  }
  function requestReview(title: string, action: string, execute: () => void, note: string, amount?: string, listingBinding?: string) {
    review.start({ title, action, execute, note, asset: suiVehicleId!, network: context.network, price: amount, seller: listingBinding ? listing?.seller : undefined, binding: listingBinding, scope });
  }
  const status = tx.phase.stage === 'idle' ? undefined : <TransactionProgress ecosystem="sui" stage={tx.phase.stage} identifier={'digest' in tx.phase ? tx.phase.digest : undefined} message={'message' in tx.phase ? tx.phase.message : tx.phase.stage === 'reconciliation-failed' ? tx.phase.refreshError.message : undefined} details={'details' in tx.phase ? tx.phase.details : undefined} retryReconciliation={tx.retryReconciliation} />;
  return <VehicleDetail name={listing?.vehicleName ?? state.vehicle.data?.name ?? 'Vehicle object'} ecosystem="sui" image="atlas" description={`Sui ${state.network} / native Move object`} availability={readError ? 'Asset reads unavailable' : state.market.isPending || (state.market.data?.listingId && state.listing.isPending) || (!state.market.data?.listingId && state.vehicle.isPending) ? 'Reading current asset…' : listing ? `Listed at ${money(listing.price)}` : 'Not listed for sale'} listed={Boolean(state.market.isSuccess && state.listing.isSuccess && listing)} status={status}>
    <dl><dt>Vehicle object</dt><dd>{suiVehicleId && <CopyableAddress value={suiVehicleId} label="vehicle object" />}</dd><dt>Listing price</dt><dd>{state.listing.isSuccess && listing ? money(listing.price) : 'No verified active price'}</dd><dt>Seller / owner</dt><dd>{listing?.seller || state.vehicle.data?.owner ? <CopyableAddress value={listing?.seller ?? state.vehicle.data!.owner!} label="seller or owner" /> : 'Not yet readable'}</dd></dl>
    <details className="asset-details"><summary>Asset & listing details</summary>
    <p className="muted">Address-owned when idle, held inside a shared Listing while for sale · <code>{suiVehicleId}</code></p>
    <dl>
      <dt>Market object</dt><dd><code>{suiMarketId}</code></dd>
      <dt>Listing</dt><dd>{state.market.isPending ? 'Loading…' : listing ? <code>{listing.id}</code> : state.market.data?.listingId ? 'Loading…' : 'Inactive'}</dd>
      <dt>Vehicle</dt><dd>{listing?.vehicleName ?? state.vehicle.data?.name ?? '…'}</dd>
      <dt>Seller</dt><dd><code>{listing?.seller ?? '—'}</code></dd>
      <dt>Price</dt><dd>{listing ? money(listing.price) : '—'}</dd>
      <dt>Ownership</dt><dd>{listing ? 'Wrapped in shared Listing' : state.vehicle.data?.owner ?? '…'}</dd>
      <dt>Your payment balance</dt><dd>{owner ? money(state.buyerBalance.data) : 'Connect wallet'}</dd>
      <dt>Package</dt><dd>{suiPackageId && <CopyableAddress value={suiPackageId} label="package object" />}</dd><dt>Payment coin</dt><dd><code>{suiCoinType}</code></dd><dt>Execution model</dt><dd>A new shared Listing wraps the Vehicle. Purchase targets that exact Listing object and reviewed payment amount.</dd>
    </dl>
    {readable && <div className="asset-explorer-links">{[['Vehicle', suiVehicleId], ['Market', suiMarketId], ['Listing', listing?.id]].map(([label, id]) => { const href = suiObjectExplorer(state.network, suiRpcUrl, id); return href ? <a className="text-link" key={label} href={href} target="_blank" rel="noreferrer">View {label} on Suiscan</a> : null; })}</div>}
    </details>
    {readError && <AssetReadError busy={recovery.busy} onRetry={() => void recovery.run(retryReads)}>{readError.message}</AssetReadError>}
    <WalletRequirement context={context} />
    {ready && state.market.isSuccess && !state.market.data.listingId && !listing && state.vehicle.data?.owner?.toLowerCase() === owner?.toLowerCase() && <div className="action-row">
      <ListingPriceField value={priceInput} onChange={setPriceInput} bits={64} disabled={tx.busy || Boolean(review.review)} />
      <button disabled={tx.busy || !readable || Boolean(review.review) || Boolean(listingPriceError(priceInput, 64))} onClick={() => requestReview('List this vehicle', 'Confirm Sui listing', list, 'Wrap your Vehicle inside a new shared Listing at this price.', `${priceInput} mUSDC`)}>Review Sui listing</button>
    </div>}
    {ready && listing && isSeller && <button disabled={tx.busy || !readable || Boolean(review.review)} onClick={() => requestReview('Cancel this listing', 'Confirm cancellation', cancel, 'Unwrap the Vehicle from this Listing and return it to your wallet.')}>Cancel Sui listing</button>}
    {ready && listing && !isSeller && (state.buyerBalance.data ?? 0n) < listing.price && <p>Insufficient Sui mUSDC balance.</p>}
    {ready && listing && !isSeller && (state.buyerBalance.data ?? 0n) >= listing.price && <button className="button-primary" disabled={tx.busy || !readable || Boolean(review.review)} onClick={() => requestReview('Review your purchase', 'Confirm purchase in wallet', buy, 'Purchase this exact shared Listing object with the reviewed payment amount. No ERC-20 allowance step is needed.', money(listing.price), binding)}>Review Sui purchase</button>}
    <TransactionReview review={review.review} currentScope={scope} currentBinding={binding} allowed={ready && readable && !tx.busy} onDismiss={review.dismiss} />
    {tx.busy && <p className="muted">Trading is paused while this transaction or its state refresh is pending.</p>}
    {tx.phase.stage === 'failed' && <button disabled={recovery.busy} onClick={() => void recovery.run(retryReads)}>Refresh listing and review terms</button>}
    {recovery.error && <AssetReadError>{recovery.error}</AssetReadError>}
  </VehicleDetail>;
}
