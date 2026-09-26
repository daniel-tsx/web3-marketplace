import { useQuery } from '@tanstack/react-query';
import { useCurrentClient, useCurrentNetwork } from '@mysten/dapp-kit-react';
import { parseListing, parseMarket, parseVehicle } from '@vehicle/sui';
import { suiCoinType, suiMarketId, suiVehicleId } from './config';
import { suiKey } from './queryKeys';

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
  const market = useQuery({
    queryKey: suiKey.market(network, suiMarketId ?? 'unconfigured'),
    enabled: Boolean(suiMarketId),
    queryFn: async () => {
      const { object } = await client.getObject({ objectId: suiMarketId!, include: { content: true } });
      return parseMarket(object.content);
    },
  });
  const listingId = market.data?.listingId;
  const listing = useQuery({
    queryKey: suiKey.listing(network, listingId ?? 'inactive'),
    enabled: Boolean(listingId),
    queryFn: async () => {
      const { object } = await client.getObject({ objectId: listingId!, include: { content: true } });
      const parsed = parseListing(object.content);
      if (!parsed.vehicleId) throw new Error('Market points to an inactive Sui listing.');
      if (parsed.vehicleId !== suiVehicleId) throw new Error('Market listing contains a different Vehicle object than this catalog entry.');
      return parsed;
    },
  });
  const vehicle = useQuery({
    queryKey: suiKey.vehicle(network, suiVehicleId ?? 'unconfigured'),
    enabled: Boolean(suiVehicleId && market.isSuccess && !listingId),
    queryFn: async () => {
      const { object } = await client.getObject({ objectId: suiVehicleId!, include: { content: true } });
      return { ...parseVehicle(object.content), owner: object.owner.$kind === 'AddressOwner' ? object.owner.AddressOwner : null };
    },
  });
  const buyerBalance = useSuiBalance(network, connected);
  const sellerBalance = useSuiBalance(network, listing.data?.seller);
  const feeBalance = useSuiBalance(network, market.data?.feeRecipient);
  return { market, listing, vehicle, buyerBalance, sellerBalance, feeBalance, network };
}
