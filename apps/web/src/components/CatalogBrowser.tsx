import { createContext, useContext, useState, type ReactNode } from 'react';
import type { Ecosystem } from '../execution/resolveExecution';

export interface CatalogFilter { ecosystem: Ecosystem | 'all'; search: string; listedOnly: boolean; }
const initialFilter: CatalogFilter = { ecosystem: 'all', search: '', listedOnly: false };
const FilterContext = createContext(initialFilter);
export function catalogMatches(filter: CatalogFilter, asset: { ecosystem: Ecosystem; name: string; description: string; listed?: boolean }) {
  return (filter.ecosystem === 'all' || filter.ecosystem === asset.ecosystem)
    && (!filter.listedOnly || asset.listed === true)
    && `${asset.name} ${asset.description}`.toLowerCase().includes(filter.search.trim().toLowerCase());
}
export function useCatalogFilter() { return useContext(FilterContext); }

export function CatalogBrowser({ children }: { children: ReactNode }) {
  const [filter, setFilter] = useState(initialFilter);
  return <FilterContext.Provider value={filter}>
    <div className="catalog-toolbar"><div className="catalog-filters" role="group" aria-label="Filter catalog by ecosystem">{(['all', 'evm', 'solana', 'sui'] as const).map((value) => <button key={value} aria-pressed={filter.ecosystem === value} onClick={() => setFilter({ ...filter, ecosystem: value })}>{value === 'all' ? 'All ecosystems' : value === 'evm' ? 'EVM' : value === 'solana' ? 'Solana' : 'Sui'}</button>)}</div><label className="catalog-search">Find a vehicle<input type="search" placeholder="Name or asset type" value={filter.search} onChange={(event) => setFilter({ ...filter, search: event.target.value })} /></label><label className="catalog-listed"><input type="checkbox" checked={filter.listedOnly} onChange={(event) => setFilter({ ...filter, listedOnly: event.target.checked })} />Active listings only</label></div>
    <div className="vehicle-grid" aria-label="Vehicle catalog">{children}</div>
    <div className="catalog-empty" role="status"><p className="eyebrow">The collection</p><h3>No vehicles match these filters</h3><p>{filter.listedOnly ? 'Only readable active chain listings appear here. Concepts and unavailable listings are excluded.' : 'Try another vehicle name or explore all three ecosystems.'}</p><button onClick={() => setFilter(initialFilter)}>Clear filters</button></div>
  </FilterContext.Provider>;
}
