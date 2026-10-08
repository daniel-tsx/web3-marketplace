import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { formatUnits, parseEventLogs, parseUnits, type Address, type TransactionReceipt } from 'viem';
import { usePublicClient, useWriteContract } from 'wagmi';
import { MockUSDCAbi, VehicleMarketplaceAbi, VehicleNFTAbi } from '../contracts/abis';
import { addresses } from '../contracts/addresses';
import { localChain } from '../contracts/config';
import type { ExecutionContext } from '../execution/resolveExecution';
import { useTransactionFlow } from '../web3/useTransactionFlow';
import { useVehicleState } from '../web3/useVehicleState';
import { refetchAffectedQueries } from '../web3/reconciliation';
import { TransactionStatus } from './TransactionStatus';
import { AssetReadError, useReadRecovery } from './MarketplaceChrome';
import { CopyableAddress, VehicleDetail, WalletRequirement } from './VehicleDetail';
import { TransactionReview, useActionReview } from './TransactionReview';
import { ListingPriceField, listingPriceError } from './ListingPriceField';

const sameAddress = (a?: Address, b?: Address) => Boolean(a && b && a.toLowerCase() === b.toLowerCase());
const money = (amount?: bigint) => amount === undefined ? '…' : `${formatUnits(amount, 6)} mUSDC`;

export function VehicleCard({ tokenId, account, context, identityKey }: { tokenId: bigint; account?: Address; context: ExecutionContext; identityKey?: string }) {
  const [priceInput, setPriceInput] = useState('1000');
  const queryClient = useQueryClient();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient({ chainId: localChain.id });
  const tx = useTransactionFlow();
  const data = useVehicleState(tokenId, account);
  const recovery = useReadRecovery();
  const review = useActionReview();
  const executionReady = context.status === 'ready';
  const scope = `${identityKey}:${account}:${context.network}`;

  const owner = data.owner.data;
  const listing = data.listing.data;
  const seller = listing?.[0];
  const price = listing?.[1];
  const active = listing?.[2] ?? false;
  const staleOwner = active && !sameAddress(owner, seller);
  const buyerReady = data.balance.isSuccess && data.allowance.isSuccess;
  const readError = [data.owner, data.listing, data.nftApproval, data.operatorApproval, data.balance, data.allowance]
    .find((query) => query.isError)?.error;

  async function refresh(...keys: readonly (readonly unknown[])[]) {
    await refetchAffectedQueries(queryClient, keys);
  }

  function approveNft() {
    if (!executionReady || !account || !sameAddress(account, owner)) return;
    void tx.run(
      () => writeContractAsync({ address: addresses.nft, abi: VehicleNFTAbi, functionName: 'approve', args: [addresses.marketplace, tokenId], account, chainId: localChain.id }),
      () => refresh(data.nftApproval.queryKey),
    );
  }

  function listVehicle() {
    if (!executionReady || !account || !sameAddress(account, owner) || !data.approved || (active && !staleOwner)) return;
    let listingPrice: bigint;
    try {
      listingPrice = parseUnits(priceInput, 6);
      if (listingPrice <= 0n) return;
    } catch { return; }
    void tx.run(
      () => writeContractAsync({ address: addresses.marketplace, abi: VehicleMarketplaceAbi, functionName: 'listVehicle', args: [tokenId, listingPrice], account, chainId: localChain.id }),
      () => refresh(data.listing.queryKey),
    );
  }

  function cancelListing() {
    if (!executionReady || !account || !active || !sameAddress(account, seller)) return;
    void tx.run(
      () => writeContractAsync({ address: addresses.marketplace, abi: VehicleMarketplaceAbi, functionName: 'cancelListing', args: [tokenId], account, chainId: localChain.id }),
      () => refresh(data.listing.queryKey),
    );
  }

  function approveUsdc() {
    if (!executionReady || !account || !active || !price || !buyerReady || (data.balance.data ?? 0n) < price) return;
    void tx.run(
      () => writeContractAsync({ address: addresses.usdc, abi: MockUSDCAbi, functionName: 'approve', args: [addresses.marketplace, price], account, chainId: localChain.id }),
      () => refresh(data.allowance.queryKey),
    );
  }

  function describePurchase(receipt: TransactionReceipt) {
    const event = parseEventLogs({ abi: VehicleMarketplaceAbi, logs: receipt.logs.filter((log) => sameAddress(log.address, addresses.marketplace)), eventName: 'VehiclePurchased' })[0];
    if (!event) return 'Receipt succeeded; VehiclePurchased event was not found.';
    return `VehiclePurchased: #${event.args.tokenId}, version ${event.args.version}, ${event.args.seller} → ${event.args.buyer}; fee ${money(event.args.fee)}.`;
  }

  function buyVehicle() {
    if (!executionReady || !account || !active || staleOwner || !data.approved || !price || !buyerReady || sameAddress(account, seller)) return;
    if ((data.balance.data ?? 0n) < price || (data.allowance.data ?? 0n) < price) return;
    if (data.listingVersion === undefined) return;
    // Preserve the terms that rendered this Buy action; never silently reread/retry new terms.
    const args = [tokenId, data.listingVersion, price] as const;
    void tx.run(
      () => writeContractAsync({ address: addresses.marketplace, abi: VehicleMarketplaceAbi, functionName: 'buyVehicle', args, account, chainId: localChain.id }),
      // Only these reads can change for the currently displayed account/card.
      async () => {
        await refresh(data.listing.queryKey, data.owner.queryKey, data.nftApproval.queryKey, data.balance.queryKey, data.allowance.queryKey);
        await data.refreshOperatorApproval();
      },
      describePurchase,
      // A mined revert has no error data in its receipt. Replay the same intent for diagnostics only.
      (blockNumber) => publicClient!.simulateContract({ address: addresses.marketplace, abi: VehicleMarketplaceAbi, functionName: 'buyVehicle', args, account, blockNumber }),
    );
  }

  const ownVehicle = sameAddress(account, owner);
  const ownListing = active && sameAddress(account, seller);
  const canShowSellerActions = executionReady && account && data.owner.isSuccess && data.listing.isSuccess && data.nftApproval.isSuccess && data.operatorApproval.isSuccess;
  const canShowBuyerActions = executionReady && account && active && !ownListing && !staleOwner && data.approved && buyerReady;
  const binding = active ? `Token ${tokenId} / version ${data.listingVersion} / ${price}` : undefined;
  const readable = !readError && data.owner.isSuccess && data.listing.isSuccess && data.nftApproval.isSuccess && data.operatorApproval.isSuccess;
  function requestReview(title: string, action: string, execute: () => void, note: string, amount?: string, listingBinding?: string) {
    review.start({ title, action, execute, note, asset: `ERC-721 vehicle #${tokenId}`, network: context.network, price: amount, seller: listingBinding ? seller : undefined, binding: listingBinding, scope });
  }
  const availability = readError ? 'Asset reads unavailable' : data.listing.isPending || data.owner.isPending ? 'Reading current asset…' : active ? staleOwner ? 'Listing needs owner review' : `Listed at ${money(price)}` : 'Not listed for sale';

  return <VehicleDetail name={`Vehicle #${tokenId}`} ecosystem="evm" image={tokenId === 2n ? 'forma' : tokenId === 3n ? 'atlas' : 'meridian'} description={`EVM chain ${localChain.id} / ERC-721`} availability={availability} listed={Boolean(data.listing.isSuccess && data.owner.isSuccess && active && !staleOwner)} status={tx.phase.stage === 'idle' ? undefined : <TransactionStatus phase={tx.phase} retryReconciliation={tx.retryReconciliation} />}>
    <dl><dt>Current owner</dt><dd>{owner ? <CopyableAddress value={owner} label="vehicle owner" /> : 'Not yet readable'}</dd><dt>Listing price</dt><dd>{data.listing.isSuccess && active ? money(price) : 'No verified active price'}</dd><dt>Seller</dt><dd>{active && seller ? <CopyableAddress value={seller} label="listing seller" /> : 'No active listing'}</dd></dl>
    <details className="asset-details"><summary>Asset & listing details</summary><dl>
      <dt>Current owner</dt><dd><code>{owner ?? 'Loading…'}</code></dd>
      <dt>Listing</dt><dd>{active ? staleOwner ? 'Stale: NFT changed hands' : 'Active' : 'Inactive'}</dd>
      <dt>Seller</dt><dd><code>{active ? seller : '—'}</code></dd>
      <dt>Price</dt><dd>{active ? money(price) : '—'}</dd>
      <dt>Listing version</dt><dd>{data.listingVersion?.toString() ?? '—'}</dd>
      <dt>Your balance</dt><dd>{account ? money(data.balance.data) : 'Connect wallet'}</dd>
      <dt>Your allowance</dt><dd>{account ? money(data.allowance.data) : 'Connect wallet'}</dd>
      <dt>Marketplace NFT approval</dt><dd>{data.nftApproval.isSuccess && data.operatorApproval.isSuccess ? data.approved ? 'Approved' : 'Not approved' : 'Loading…'}</dd>
      <dt>NFT contract</dt><dd><CopyableAddress value={addresses.nft} label="NFT contract" /></dd><dt>Marketplace</dt><dd><CopyableAddress value={addresses.marketplace} label="marketplace contract" /></dd><dt>Payment token</dt><dd><CopyableAddress value={addresses.usdc} label="payment contract" /></dd><dt>Execution model</dt><dd>Seller retains NFT custody. Approval permits the marketplace transfer. Buy retains the reviewed version and price cap.</dd>
    </dl></details>
    {readError && <AssetReadError busy={recovery.busy} onRetry={() => void recovery.run(() => refresh(data.owner.queryKey, data.listing.queryKey, data.nftApproval.queryKey, data.operatorApproval.queryKey, ...(account ? [data.balance.queryKey, data.allowance.queryKey] : [])))}>{readError.message}</AssetReadError>}
    <WalletRequirement context={context} />
    {canShowSellerActions && ownListing && <button disabled={tx.busy || !readable || Boolean(review.review)} onClick={() => requestReview('Cancel this listing', 'Confirm cancellation', cancelListing, 'This removes the current sale offer. The vehicle stays in your wallet.')}>Cancel listing</button>}
    {canShowSellerActions && ownVehicle && (!active || staleOwner) && !data.approved && <button disabled={tx.busy || !readable || Boolean(review.review)} onClick={() => requestReview('Approve vehicle transfer', 'Confirm NFT approval', approveNft, 'Authorize this marketplace to transfer this vehicle. This approval does not list or sell the vehicle.')}>Approve Marketplace for NFT</button>}
    {canShowSellerActions && ownVehicle && (!active || staleOwner) && data.approved && <div className="action-row">
      <ListingPriceField value={priceInput} onChange={setPriceInput} bits={256} disabled={tx.busy || Boolean(review.review)} />
      <button disabled={tx.busy || !readable || Boolean(review.review) || Boolean(listingPriceError(priceInput, 256))} onClick={() => requestReview('List this vehicle', 'Confirm listing', listVehicle, 'Create an on-chain sale offer at this price. The vehicle remains in your wallet until purchased.', `${priceInput} mUSDC`)}>Review listing</button>
    </div>}
    {canShowBuyerActions && (data.balance.data ?? 0n) < (price ?? 0n) && <p>Balance is below the listing price.</p>}
    {canShowBuyerActions && (data.balance.data ?? 0n) >= (price ?? 0n) && (data.allowance.data ?? 0n) < (price ?? 0n) && <button disabled={tx.busy || !readable || Boolean(review.review)} onClick={() => requestReview('Approve payment spending', 'Confirm spending approval', approveUsdc, 'Allow the marketplace to spend this amount of mUSDC. Approval is a separate transaction and does not purchase the vehicle.', money(price), binding)}>Review {money(price)} spending approval</button>}
    {canShowBuyerActions && (data.balance.data ?? 0n) >= (price ?? 0n) && (data.allowance.data ?? 0n) >= (price ?? 0n) && <button className="button-primary" disabled={tx.busy || !readable || Boolean(review.review)} onClick={() => requestReview('Review your purchase', 'Confirm purchase in wallet', buyVehicle, 'Purchase this exact listing version with the reviewed maximum price. Changed or replacement terms require a new review.', money(price), binding)}>Review purchase</button>}
    {active && !staleOwner && !data.approved && !ownListing && <p>Seller must restore NFT approval before purchase.</p>}
    <TransactionReview review={review.review} currentScope={scope} currentBinding={binding} allowed={executionReady && readable && !tx.busy} onDismiss={review.dismiss} />
    {tx.busy && <p className="muted">Trading is paused while this transaction or its state refresh is pending.</p>}
    {tx.phase.stage === 'failed' && tx.phase.error.kind === 'stale-listing' && <button disabled={recovery.busy} onClick={() => void recovery.run(() => refresh(data.listing.queryKey, data.owner.queryKey, data.nftApproval.queryKey))}>Refresh listing and review terms</button>}
    {recovery.error && <AssetReadError>{recovery.error}</AssetReadError>}
  </VehicleDetail>;
}
