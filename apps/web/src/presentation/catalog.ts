import type { Ecosystem } from '../execution/resolveExecution';

// Presentation concepts only. Never feed these into chain hooks or transaction builders.
export const previewVehicles = [
  { ecosystem: 'evm', name: 'Meridian GT', body: 'Grand tourer', finish: 'Liquid silver', image: 'meridian', number: '01' },
  { ecosystem: 'solana', name: 'Forma Coupe', body: 'Sports coupe', finish: 'Pearl white', image: 'forma', number: '02' },
  { ecosystem: 'sui', name: 'Atlas Touring', body: 'Touring estate', finish: 'Deep petrol', image: 'atlas', number: '03' },
] as const satisfies readonly { ecosystem: Ecosystem; name: string; body: string; finish: string; image: string; number: string }[];

export type CatalogMode = 'preview' | 'checking' | 'unavailable' | 'native';
export function catalogMode(configured: boolean, probe: { isPending: boolean; isSuccess: boolean; data?: boolean }): CatalogMode {
  if (!configured) return 'preview';
  if (probe.isSuccess && probe.data === true) return 'native';
  return probe.isPending ? 'checking' : 'unavailable';
}

export const catalogStatus: Record<CatalogMode, string> = {
  preview: 'Chain resources not configured',
  checking: 'Checking chain resources…',
  unavailable: 'Chain resources unavailable',
  native: 'Chain resources detected',
};

export const repositoryUrl = 'https://github.com/daniel-tsx/web3-marketplace';
export const architectureUrl = `${repositoryUrl}/blob/main/docs/architecture/multichain-system.md`;
