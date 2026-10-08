import { catalogStatus, type CatalogMode, type previewVehicles } from '../presentation/catalog';
import { VehicleDetail } from './VehicleDetail';

const flow = {
  evm: 'A seller keeps the ERC-721 vehicle and grants marketplace approval. A buyer reviews the listing version and price, grants a bounded token allowance, then authorizes that exact purchase.',
  solana: 'Listing moves a supply-one SPL vehicle into PDA-controlled escrow. A buyer reviews the persistent listing generation, exact payment mint and price before signing an instruction.',
  sui: 'Listing wraps a Vehicle inside a new shared Listing object. A buyer reviews that specific object and exact payment amount before authorizing the transaction.',
};

export function CatalogPreviewCard({ vehicle, mode }: { vehicle: typeof previewVehicles[number]; mode: Exclude<CatalogMode, 'native'> }) {
  return <VehicleDetail name={vehicle.name} ecosystem={vehicle.ecosystem} image={vehicle.image} description={`${vehicle.body} · ${vehicle.finish}`} availability={catalogStatus[mode]} preview>
    <dl><dt>Body concept</dt><dd>{vehicle.body}</dd><dt>Illustrated finish</dt><dd>{vehicle.finish}</dd><dt>Marketplace</dt><dd>Demo Preview</dd><dt>Listing</dt><dd>No on-chain listing, owner, or sale price</dd></dl>
    <p className="preview-explanation">Illustrative design only. Trading unavailable for this concept.</p>
    <details className="asset-details"><summary>How a real {vehicle.ecosystem.toUpperCase()} purchase works</summary><p>{flow[vehicle.ecosystem]}</p><p>After chain-specific execution succeeds, affected reads refresh. A failed refresh can be retried without resubmitting a transaction.</p><p className="muted">Architecture explanation only. No transaction is being simulated, submitted or confirmed here.</p></details>
    <a className="button" href="#network-details" onClick={(event) => { event.currentTarget.closest('dialog')?.close(); window.dispatchEvent(new CustomEvent('marketplace-workspace', { detail: 'network-details' })); }}>View network readiness</a>
  </VehicleDetail>;
}
