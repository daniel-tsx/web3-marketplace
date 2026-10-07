import type { SuiGrpcClient } from '@mysten/sui/grpc';
import type { QueryClient } from '@tanstack/react-query';
import { parseListing, parseMarket, parseVehicle } from '@vehicle/sui';
import { fetchReconciledQuery, refetchAffectedQueries } from '../reconciliation';
import { affectedSuiKeys, suiKey } from './queryKeys';

// The observer and the post-execution reads use the same parsers/validation.
export function suiVehicleQueries(client: Pick<SuiGrpcClient, 'getObject'>, network: string, marketId: string, vehicleId: string) {
  return {
    market: {
      queryKey: suiKey.market(network, marketId),
      queryFn: async () => {
        const { object } = await client.getObject({ objectId: marketId, include: { content: true } });
        return parseMarket(object.content);
      },
    },
    listing: (listingId: string) => ({
      queryKey: suiKey.listing(network, listingId),
      queryFn: async () => {
        const { object } = await client.getObject({ objectId: listingId, include: { content: true } });
        const parsed = parseListing(object.content);
        if (!parsed.vehicleId) throw new Error('Market points to an inactive Sui listing.');
        if (parsed.vehicleId !== vehicleId) throw new Error('Market listing contains a different Vehicle object than this catalog entry.');
        return parsed;
      },
    }),
    vehicle: {
      queryKey: suiKey.vehicle(network, vehicleId),
      queryFn: async () => {
        const { object } = await client.getObject({ objectId: vehicleId, include: { content: true } });
        return { ...parseVehicle(object.content), owner: object.owner.$kind === 'AddressOwner' ? object.owner.AddressOwner : null };
      },
    },
  };
}

export async function reconcileSuiVehicleState(
  client: QueryClient,
  queries: ReturnType<typeof suiVehicleQueries>,
  input: Parameters<typeof affectedSuiKeys>[0],
) {
  const keys = affectedSuiKeys(input);
  await Promise.all(keys.map((queryKey) => client.invalidateQueries({ queryKey, exact: true, refetchType: 'none' })));
  // After wrapping/unwrapping, the pre-transaction observer can be disabled or
  // point to the old Listing. Reconcile the freshly read Market's current branch.
  const market = await fetchReconciledQuery(client, queries.market);
  if (market.listingId) await fetchReconciledQuery(client, queries.listing(market.listingId));
  else await fetchReconciledQuery(client, queries.vehicle);
  await refetchAffectedQueries(client, keys.filter((key) => key[2] === 'balance'));
}
