import { connectorsForWallets } from '@rainbow-me/rainbowkit';
import { injectedWallet } from '@rainbow-me/rainbowkit/wallets';
import { defineChain } from 'viem';
import { createConfig, http } from 'wagmi';

export const chainId = Number(import.meta.env.VITE_CHAIN_ID ?? 31337);
export const rpcUrl = import.meta.env.VITE_RPC_URL ?? 'http://127.0.0.1:8545';

export const localChain = defineChain({
  id: chainId,
  name: 'Local Anvil',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
  testnet: true,
});

const connectors = connectorsForWallets(
  [{ groupName: 'Browser wallet', wallets: [injectedWallet] }],
  { appName: 'Vehicle Marketplace Study', projectId: 'local-injected-only' },
);

export const wagmiConfig = createConfig({
  chains: [localChain],
  connectors,
  transports: { [localChain.id]: http(rpcUrl) },
  ssr: false,
});
