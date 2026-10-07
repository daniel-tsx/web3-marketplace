import { useQuery } from '@tanstack/react-query';
import { useCurrentClient, useCurrentNetwork } from '@mysten/dapp-kit-react';
import { suiCoinType, suiMarketId, suiVehicleId } from './config';
import { suiKey } from './queryKeys';
import { suiVehicleQueries } from './reconcileVehicleState';

function useSuiBalance(network: string, owner?: string) {
  const client = useCurrentClient();
  return useQuery({
    queryKey: suiKey.balance(network, suiCoinType ?? 'unconfigured', owner ?? 'disconnected'),
    enabled: Boolean(suiCoinType && owner),
    queryFn: async () => {
      const { balance } = await client.getBalance({ owner: owner!, coinType: suiCoinType! });
      return BigInt(balance.balance);
    },
  });
}

export function useSuiVehicleState(connected?: string) {
  const client = useCurrentClient();
  const network = useCurrentNetwork();
  const queries = suiVehicleQueries(client, network, suiMarketId ?? 'unconfigured', suiVehicleId ?? 'unconfigured');
  const market = useQuery({
    ...queries.market,
    enabled: Boolean(suiMarketId),
  });
  const listingId = market.data?.listingId;
  const listing = useQuery({
    ...queries.listing(listingId ?? 'inactive'),
    enabled: Boolean(listingId),
  });
  const vehicle = useQuery({
    ...queries.vehicle,
    enabled: Boolean(suiVehicleId && market.isSuccess && !listingId),
  });
  const buyerBalance = useSuiBalance(network, connected);
  const sellerBalance = useSuiBalance(network, listing.data?.seller);
  const feeBalance = useSuiBalance(network, market.data?.feeRecipient);
  return { market, listing, vehicle, buyerBalance, sellerBalance, feeBalance, network, queries };
}
