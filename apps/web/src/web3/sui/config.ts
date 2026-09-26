import { createDAppKit } from '@mysten/dapp-kit-react';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { isValidSuiAddress, normalizeSuiAddress } from '@mysten/sui/utils';

export const suiNetwork = import.meta.env.VITE_SUI_NETWORK ?? 'testnet';
export const suiRpcUrl = import.meta.env.VITE_SUI_RPC_URL ?? 'https://fullnode.testnet.sui.io:443';
export const suiPackageId = validId(import.meta.env.VITE_SUI_PACKAGE_ID);
export const suiMarketId = validId(import.meta.env.VITE_SUI_MARKETPLACE_OBJECT_ID);
export const suiVehicleId = validId(import.meta.env.VITE_SUI_VEHICLE_OBJECT_ID);
export const suiCoinType = import.meta.env.VITE_SUI_PAYMENT_COIN_TYPE ?? (suiPackageId ? `${suiPackageId}::musdc::MUSDC` : null);
export const suiConfigured = Boolean(suiPackageId && suiMarketId && suiVehicleId && suiCoinType);

function validId(value?: string): string | null {
  return value && isValidSuiAddress(value) ? normalizeSuiAddress(value) : null;
}

export const dAppKit = createDAppKit({
  networks: [suiNetwork, ...['testnet', 'devnet', 'mainnet'].filter((name) => name !== suiNetwork)],
  createClient: (network) => new SuiGrpcClient({ network, baseUrl: network === suiNetwork ? suiRpcUrl : `https://fullnode.${network}.sui.io:443` }),
});

declare module '@mysten/dapp-kit-react' {
  interface Register { dAppKit: typeof dAppKit; }
}
