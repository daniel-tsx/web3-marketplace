import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useWallet } from '@solana/wallet-adapter-react';
import type { PublicKey } from '@solana/web3.js';
import { formatUnits, parseUnits } from 'viem';
import { buyVehicleInstruction, cancelListingInstruction, FEE_RECIPIENT, listVehicleInstruction, listingAddress, PROGRAM_ID } from '@vehicle/solana';
import type { ExecutionContext } from '../execution/resolveExecution';
import { solanaKey, useSolanaVehicleState } from '../web3/solana/useSolanaVehicleState';
import { useSolanaTransaction } from '../web3/solana/useSolanaTransaction';
import { refetchAffectedQueries } from '../web3/reconciliation';
import { AssetReadError, useReadRecovery } from './MarketplaceChrome';
import { CopyableAddress, VehicleDetail, WalletRequirement } from './VehicleDetail';
import { TransactionReview, useActionReview } from './TransactionReview';
import { solanaFailureIsUnverified, TransactionProgress } from './TransactionProgress';
import { ListingPriceField, listingPriceError } from './ListingPriceField';

const money = (amount?: bigint) => amount === undefined ? '…' : `${formatUnits(amount, 6)} mUSDC`;

export function SolanaVehicleCard({ vehicleMint, paymentMint, context, identityKey }: { vehicleMint: PublicKey; paymentMint: PublicKey; context: ExecutionContext; identityKey?: string }) {
  const wallet = useWallet();
  const queryClient = useQueryClient();
  const tx = useSolanaTransaction();
  const state = useSolanaVehicleState(vehicleMint, paymentMint, wallet.publicKey ?? undefined);
  const [priceInput, setPriceInput] = useState('12000');
  const review = useActionReview();
  const recovery = useReadRecovery();
  const mint = vehicleMint.toBase58();
  const owner = wallet.publicKey?.toBase58();
  const listing = state.listing.data?.active ? state.listing.data : null;
  const isSeller = Boolean(listing && wallet.publicKey?.equals(listing.seller));
  const ready = context.status === 'ready' && state.paymentMintMatches;
  const readError = [state.listing, state.escrow, state.vehicleBalance, state.paymentBalance, state.config].find((query) => query.isError)?.error;
  const readable = !readError && state.listing.isSuccess && state.escrow.isSuccess && state.config.isSuccess;
  const scope = `${identityKey}:${owner}:${context.network}`;
  const binding = listing ? `Generation ${listing.version} / ${listing.price} / ${listing.paymentMint.toBase58()}` : undefined;

  async function refresh(keys: readonly (readonly unknown[])[], recipientKeys: readonly (readonly unknown[])[] = []) {
    // Recipient balances may have no observer/cache entry in this card. Keep
    // those invalidated; every displayed account must actually finish its reread.
    await Promise.all(recipientKeys.map((queryKey) => queryClient.invalidateQueries({ queryKey, exact: true, refetchType: 'none' })));
    await refetchAffectedQueries(queryClient, [...keys, ...recipientKeys.filter((queryKey) => queryClient.getQueryCache().find({ queryKey, exact: true }))]);
  }

  function list() {
    if (!ready || !wallet.publicKey || listing || state.vehicleBalance.data !== 1n) return;
    let price: bigint;
    try { price = parseUnits(priceInput, 6); if (price <= 0n || price > (1n << 64n) - 1n) return; } catch { return; }
    void tx.run(listVehicleInstruction(wallet.publicKey, vehicleMint, paymentMint, price), () => refresh([
      solanaKey.listing(mint), solanaKey.escrow(mint), solanaKey.token(mint, owner!),
    ]));
  }

  function cancel() {
    if (!ready || !wallet.publicKey || !isSeller) return;
    void tx.run(cancelListingInstruction(wallet.publicKey, vehicleMint), () => refresh([
      solanaKey.listing(mint), solanaKey.escrow(mint), solanaKey.token(mint, owner!),
    ]));
  }

  function buy() {
    if (!ready || !wallet.publicKey || !listing || isSeller || (state.paymentBalance.data ?? 0n) < listing.price) return;
    // Bind the instruction to this rendered listing, without substituting a fresh read.
    const intent = { expectedVersion: listing.version, maxPrice: listing.price };
    void tx.run(buyVehicleInstruction(wallet.publicKey, listing, intent), () => refresh([
      solanaKey.listing(mint), solanaKey.escrow(mint),
      solanaKey.token(mint, owner!),
      solanaKey.token(paymentMint.toBase58(), owner!),
    ], [
      solanaKey.token(paymentMint.toBase58(), listing.seller.toBase58()),
      solanaKey.token(paymentMint.toBase58(), FEE_RECIPIENT.toBase58()),
    ]));
  }

  function requestReview(title: string, action: string, execute: () => void, note: string, amount?: string, listingBinding?: string) {
    review.start({ title, action, execute, note, asset: mint, network: context.network, price: amount, seller: listingBinding ? listing?.seller.toBase58() : undefined, binding: listingBinding, scope });
  }
  const status = tx.phase.stage === 'idle' ? undefined : <TransactionProgress ecosystem="solana" stage={tx.phase.stage} identifier={'signature' in tx.phase ? tx.phase.signature : undefined} message={'message' in tx.phase ? tx.phase.message : tx.phase.stage === 'reconciliation-failed' ? tx.phase.refreshError.message : undefined} details={'logs' in tx.phase ? tx.phase.logs?.join('\n') : undefined} unverified={tx.phase.stage === 'failed' && solanaFailureIsUnverified(tx.phase.message, tx.phase.signature)} retryReconciliation={tx.retryReconciliation} />;
  return <VehicleDetail name="Vehicle token" ecosystem="solana" image="forma" description="Supply-one SPL asset / configured Solana RPC" availability={readError ? 'Asset reads unavailable' : state.listing.isPending ? 'Reading current listing…' : listing ? state.paymentMintMatches ? `Listed at ${money(listing.price)}` : 'Payment asset not verified' : 'Not listed for sale'} listed={Boolean(state.listing.isSuccess && listing)} status={status}>
    <dl><dt>Asset mint</dt><dd><CopyableAddress value={mint} label="vehicle mint" /></dd><dt>Seller</dt><dd>{listing ? <CopyableAddress value={listing.seller.toBase58()} label="listing seller" /> : 'No active listing'}</dd><dt>Listing price</dt><dd>{state.listing.isSuccess && listing && state.paymentMintMatches ? money(listing.price) : 'No verified active price'}</dd><dt>Custody</dt><dd>{listing ? 'PDA-controlled escrow' : 'Token holder; owner not resolved by these reads'}</dd></dl>
    <details className="asset-details"><summary>Asset & listing details</summary>
    <p className="muted">Unique SPL mint, supply 1 · <code>{mint}</code></p>
    <dl>
      <dt>Listing PDA</dt><dd>{state.listing.isPending ? 'Loading…' : listing ? 'Active' : 'Inactive'}</dd>
      <dt>Seller</dt><dd><code>{listing?.seller.toBase58() ?? '—'}</code></dd>
      <dt>Price</dt><dd>{listing ? state.paymentMintMatches ? money(listing.price) : 'Payment asset not verified' : '—'}</dd>
      <dt>Listing version</dt><dd>{state.listing.data?.version.toString() ?? '—'}</dd>
      <dt>Payment mint</dt><dd><code>{state.config.data?.paymentMint.toBase58() ?? 'Loading…'}</code></dd>
      <dt>Escrow units</dt><dd>{state.escrow.data?.toString() ?? '…'}</dd>
      <dt>Your vehicle units</dt><dd>{owner ? state.vehicleBalance.data?.toString() ?? '…' : 'Connect wallet'}</dd>
      <dt>Your payment balance</dt><dd>{!state.paymentMintMatches ? 'Payment configuration not verified' : owner ? money(state.paymentBalance.data) : 'Connect wallet'}</dd>
      <dt>Listing address</dt><dd><CopyableAddress value={listingAddress(vehicleMint).toBase58()} label="listing PDA" /></dd><dt>Program</dt><dd><CopyableAddress value={PROGRAM_ID.toBase58()} label="program address" /></dd><dt>Execution model</dt><dd>Persistent listing generation, PDA escrow and exact payment mint. Confirmation uses confirmed commitment.</dd>
    </dl>
    </details>
    {readError && <AssetReadError busy={recovery.busy} onRetry={() => void recovery.run(async () => { await Promise.all([state.config.refetch({ throwOnError: true }), state.listing.refetch({ throwOnError: true }), state.escrow.refetch({ throwOnError: true }), ...(owner ? [state.vehicleBalance.refetch({ throwOnError: true }), state.paymentBalance.refetch({ throwOnError: true })] : [])]); })}>{readError.message}</AssetReadError>}
    <WalletRequirement context={context} />
    {state.config.isSuccess && !state.paymentMintMatches && <p role="alert" className="error">Payment mint mismatch. This card's mUSDC configuration does not match the marketplace. Trading is disabled.</p>}
    {ready && !listing && state.vehicleBalance.data === 1n && <div className="action-row">
      <ListingPriceField value={priceInput} onChange={setPriceInput} bits={64} disabled={tx.busy || Boolean(review.review)} />
      <button disabled={tx.busy || !readable || Boolean(review.review) || Boolean(listingPriceError(priceInput, 64))} onClick={() => requestReview('List this vehicle', 'Confirm Solana listing', list, 'Move the supply-one vehicle token into listing-PDA escrow at this price.', `${priceInput} mUSDC`)}>Review Solana listing</button>
    </div>}
    {ready && listing && isSeller && <button disabled={tx.busy || !readable || Boolean(review.review)} onClick={() => requestReview('Cancel this listing', 'Confirm cancellation', cancel, 'Return the vehicle from PDA escrow to your token account.')}>Cancel Solana listing</button>}
    {ready && listing && !isSeller && (state.paymentBalance.data ?? 0n) < listing.price && <p>Insufficient SPL payment token balance.</p>}
    {ready && listing && !isSeller && (state.paymentBalance.data ?? 0n) >= listing.price && <button className="button-primary" disabled={tx.busy || !readable || state.escrow.data !== 1n || Boolean(review.review)} onClick={() => requestReview('Review your purchase', 'Confirm purchase in wallet', buy, 'Purchase this exact generation using the verified SPL payment mint and reviewed price. No ERC-20 allowance step is needed.', money(listing.price), binding)}>Review Solana purchase</button>}
    {listing && state.escrow.isSuccess && state.escrow.data !== 1n && <p className="error">Escrow is unavailable. Refresh the listing before trading.</p>}
    <TransactionReview review={review.review} currentScope={scope} currentBinding={binding} allowed={ready && readable && !tx.busy} onDismiss={review.dismiss} />
    {tx.busy && <p className="muted">Trading is paused while this transaction or its state refresh is pending.</p>}
    {tx.phase.stage === 'failed' && <button disabled={recovery.busy} onClick={() => void recovery.run(() => refresh([solanaKey.listing(mint), solanaKey.escrow(mint), ...(owner ? [solanaKey.token(paymentMint.toBase58(), owner)] : [])]))}>Refresh listing and review terms</button>}
    {recovery.error && <AssetReadError>{recovery.error}</AssetReadError>}
  </VehicleDetail>;
}
