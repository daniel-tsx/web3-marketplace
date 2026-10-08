import { catalogStatus, type CatalogMode, type previewVehicles } from '../presentation/catalog';
import { EcosystemLabel, VehicleVisual } from './MarketplaceChrome';

export function CatalogPreviewCard({ vehicle, mode }: { vehicle: typeof previewVehicles[number]; mode: Exclude<CatalogMode, 'native'> }) {
  return <article className="vehicle-card preview-card">
    <VehicleVisual image={vehicle.image} alt={`Fictional ${vehicle.finish.toLowerCase()} ${vehicle.body.toLowerCase()} concept`} preview />
    <div className="vehicle-content">
      <div className="vehicle-topline"><EcosystemLabel ecosystem={vehicle.ecosystem} /><span className="catalog-number">/{vehicle.number}</span></div>
      <h3>{vehicle.name}</h3>
      <p className="vehicle-description">{vehicle.body} <span aria-hidden="true">·</span> {vehicle.finish}</p>
      <div className="preview-availability"><span className="status-dot" aria-hidden="true" /><span>{catalogStatus[mode]}</span></div>
      <p className="preview-explanation">Illustrative design only. No on-chain listing, owner, or sale price.</p>
      <button className="preview-action" disabled>Trading unavailable</button>
    </div>
  </article>;
}
