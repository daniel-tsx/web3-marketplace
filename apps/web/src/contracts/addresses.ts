import type { Address } from 'viem';

const isAddress = (value: string | undefined): value is Address => /^0x[a-fA-F0-9]{40}$/.test(value ?? '');
const usdc = import.meta.env.VITE_MOCK_USDC_ADDRESS;
const nft = import.meta.env.VITE_VEHICLE_NFT_ADDRESS;
const marketplace = import.meta.env.VITE_MARKETPLACE_ADDRESS;

export const contractsConfigured = isAddress(usdc) && isAddress(nft) && isAddress(marketplace);
export const addresses = {
  usdc: (isAddress(usdc) ? usdc : '0x0000000000000000000000000000000000000000') as Address,
  nft: (isAddress(nft) ? nft : '0x0000000000000000000000000000000000000000') as Address,
  marketplace: (isAddress(marketplace) ? marketplace : '0x0000000000000000000000000000000000000000') as Address,
};
