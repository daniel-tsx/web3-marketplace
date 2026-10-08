import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { formatUnits, parseEventLogs, parseUnits, type Address, type TransactionReceipt } from 'viem';
import { usePublicClient, useWriteContract } from 'wagmi';
import { MockUSDCAbi, VehicleMarketplaceAbi, VehicleNFTAbi } from '../contracts/abis';
import { addresses } from '../contracts/addresses';
import { localChain } from '../contracts/config';
import { useTransactionFlow } from '../web3/useTransactionFlow';
import { useVehicleState } from '../web3/useVehicleState';
import { refetchAffectedQueries } from '../web3/reconciliation';
import { TransactionStatus } from './TransactionStatus';
import { AssetReadError, EcosystemLabel, VehicleVisual } from './MarketplaceChrome';

const sameAddress = (a?: Address, b?: Address) => Boolean(a && b && a.toLowerCase() === b.toLowerCase());
const money = (amount?: bigint) => amount === undefined ? '…' : `${formatUnits(amount, 6)} mUSDC`;

export function VehicleCard({ tokenId, account, executionReady }: { tokenId: bigint; account?: Address; executionReady: boolean }) {
  const [priceInput, setPriceInput] = useState('1000');
  const queryClient = useQueryClient();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient({ chainId: localChain.id });
  const tx = useTransactionFlow();
  const data = useVehicleState(tokenId, account);

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

  return <article className="vehicle-card">
    <VehicleVisual image={tokenId === 2n ? 'forma' : tokenId === 3n ? 'atlas' : 'meridian'} alt={`Concept illustration for EVM vehicle ${tokenId}; actual appearance unverified`} />
    <div className="vehicle-content">
    <div className="vehicle-topline"><EcosystemLabel ecosystem="evm" /><span className="technical-label">Chain-backed asset</span></div>
    <h3>Vehicle #{tokenId.toString()}</h3>
    <p className="vehicle-description">EVM chain {localChain.id} / ERC-721</p>
    <p className="native-availability">{readError ? 'Asset reads unavailable' : data.listing.isPending || data.owner.isPending ? 'Reading current asset…' : active ? staleOwner ? 'Listing needs owner review' : `Listed at ${money(price)}` : 'Not listed for sale'}</p>
    <details className="asset-details"><summary>Asset & listing details</summary><dl>
      <dt>Current owner</dt><dd><code>{owner ?? 'Loading…'}</code></dd>
      <dt>Listing</dt><dd>{active ? staleOwner ? 'Stale: NFT changed hands' : 'Active' : 'Inactive'}</dd>
      <dt>Seller</dt><dd><code>{active ? seller : '—'}</code></dd>
      <dt>Price</dt><dd>{active ? money(price) : '—'}</dd>
      <dt>Listing version</dt><dd>{data.listingVersion?.toString() ?? '—'}</dd>
      <dt>Your balance</dt><dd>{account ? money(data.balance.data) : 'Connect wallet'}</dd>
      <dt>Your allowance</dt><dd>{account ? money(data.allowance.data) : 'Connect wallet'}</dd>
      <dt>Marketplace NFT approval</dt><dd>{data.nftApproval.isSuccess && data.operatorApproval.isSuccess ? data.approved ? 'Approved' : 'Not approved' : 'Loading…'}</dd>
    </dl></details>
    {readError && <AssetReadError>{readError.message}</AssetReadError>}
    {!executionReady && <p className="execution-prompt">Connect and sign in with a linked EVM wallet on chain {localChain.id} to manage this asset.</p>}
    {canShowSellerActions && ownListing && <button disabled={tx.busy} onClick={cancelListing}>Cancel listing</button>}
    {canShowSellerActions && ownVehicle && (!active || staleOwner) && !data.approved && <button disabled={tx.busy} onClick={approveNft}>Approve Marketplace for NFT</button>}
    {canShowSellerActions && ownVehicle && (!active || staleOwner) && data.approved && <div className="action-row">
      <label>Price in mUSDC <input value={priceInput} onChange={(event) => setPriceInput(event.target.value)} inputMode="decimal" /></label>
      <button disabled={tx.busy || !/^\d+(\.\d{1,6})?$/.test(priceInput) || Number(priceInput) <= 0} onClick={listVehicle}>List vehicle</button>
    </div>}
    {canShowBuyerActions && (data.balance.data ?? 0n) < (price ?? 0n) && <p>Balance is below the listing price.</p>}
    {canShowBuyerActions && (data.balance.data ?? 0n) >= (price ?? 0n) && (data.allowance.data ?? 0n) < (price ?? 0n) && <button disabled={tx.busy} onClick={approveUsdc}>Approve {money(price)} spending</button>}
    {canShowBuyerActions && (data.balance.data ?? 0n) >= (price ?? 0n) && (data.allowance.data ?? 0n) >= (price ?? 0n) && <button disabled={tx.busy} onClick={buyVehicle}>Buy vehicle</button>}
    {active && !staleOwner && !data.approved && !ownListing && <p>Seller must restore NFT approval before purchase.</p>}
    <TransactionStatus phase={tx.phase} retryReconciliation={tx.retryReconciliation} />
    {tx.phase.stage === 'failed' && tx.phase.error.kind === 'stale-listing' && <button onClick={() => void refresh(data.listing.queryKey, data.owner.queryKey, data.nftApproval.queryKey).catch(console.error)}>Refresh listing and review terms</button>}
    </div>
  </article>;
}
