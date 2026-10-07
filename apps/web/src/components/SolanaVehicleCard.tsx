import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useWallet } from '@solana/wallet-adapter-react';
import type { PublicKey } from '@solana/web3.js';
import { formatUnits, parseUnits } from 'viem';
import { buyVehicleInstruction, cancelListingInstruction, FEE_RECIPIENT, listVehicleInstruction } from '@vehicle/solana';
import { executionPrompt, type ExecutionContext } from '../execution/resolveExecution';
import { solanaKey, useSolanaVehicleState } from '../web3/solana/useSolanaVehicleState';
import { useSolanaTransaction } from '../web3/solana/useSolanaTransaction';
import { refetchAffectedQueries } from '../web3/reconciliation';

const money = (amount?: bigint) => amount === undefined ? '…' : `${formatUnits(amount, 6)} mUSDC`;

export function SolanaVehicleCard({ vehicleMint, paymentMint, context }: { vehicleMint: PublicKey; paymentMint: PublicKey; context: ExecutionContext }) {
  const wallet = useWallet();
  const queryClient = useQueryClient();
  const tx = useSolanaTransaction();
  const state = useSolanaVehicleState(vehicleMint, paymentMint, wallet.publicKey ?? undefined);
  const [priceInput, setPriceInput] = useState('12000');
  const mint = vehicleMint.toBase58();
  const owner = wallet.publicKey?.toBase58();
  const listing = state.listing.data?.active ? state.listing.data : null;
  const isSeller = Boolean(listing && wallet.publicKey?.equals(listing.seller));
  const ready = context.status === 'ready' && state.paymentMintMatches;
  const readError = [state.listing, state.escrow, state.vehicleBalance, state.paymentBalance, state.config].find((query) => query.isError)?.error;

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

  return <article className="vehicle-card">
    <p className="eyebrow">Solana · localnet</p>
    <h2>Vehicle token</h2>
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
    </dl>
    {readError && <p role="alert" className="error">Solana read failed: {readError.message}</p>}
    {context.status !== 'ready' && <p className="execution-prompt">{executionPrompt(context)}</p>}
    {state.config.isSuccess && !state.paymentMintMatches && <p role="alert" className="error">Payment mint mismatch. This card's mUSDC configuration does not match the marketplace. Trading is disabled.</p>}
    {ready && !listing && state.vehicleBalance.data === 1n && <div className="action-row">
      <label>Price in mUSDC <input value={priceInput} onChange={(event) => setPriceInput(event.target.value)} inputMode="decimal" /></label>
      <button disabled={tx.busy || !/^\d+(\.\d{1,6})?$/.test(priceInput) || Number(priceInput) <= 0} onClick={list}>List on Solana</button>
    </div>}
    {ready && listing && isSeller && <button disabled={tx.busy} onClick={cancel}>Cancel Solana listing</button>}
    {ready && listing && !isSeller && (state.paymentBalance.data ?? 0n) < listing.price && <p>Insufficient SPL payment token balance.</p>}
    {ready && listing && !isSeller && (state.paymentBalance.data ?? 0n) >= listing.price && <button disabled={tx.busy} onClick={buy}>Buy on Solana</button>}
    {tx.phase.stage !== 'idle' && <div className="transaction" role="status">
      <strong>Solana: {tx.phase.stage}</strong>
      {'signature' in tx.phase && <p>Signature: <code>{tx.phase.signature}</code></p>}
      {tx.phase.stage === 'wallet' && <p>Approve in your wallet.</p>}
      {tx.phase.stage === 'pending' && <p>Signature returned; waiting for confirmation.</p>}
      {tx.phase.stage === 'reconciling' && <p>Transaction succeeded. Refreshing affected account reads…</p>}
      {tx.phase.stage === 'confirmed' && <p>Confirmed. Affected account reads refreshed.</p>}
      {tx.phase.stage === 'reconciliation-failed' && <><p className="error">Transaction succeeded; state refresh failed: {tx.phase.refreshError.message}. Retry refresh safely; do not resubmit the transaction.</p><button onClick={() => void tx.retryReconciliation()}>Retry state refresh</button></>}
      {(tx.phase.stage === 'failed' || tx.phase.stage === 'rejected') && <p className="error">{tx.phase.message}</p>}
      {tx.phase.stage === 'failed' && <button onClick={() => void refresh([solanaKey.listing(mint), solanaKey.escrow(mint), solanaKey.token(paymentMint.toBase58(), owner ?? 'disconnected')]).catch(console.error)}>Refresh listing and review terms</button>}
    </div>}
  </article>;
}
