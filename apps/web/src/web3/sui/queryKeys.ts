export const suiKey = {
  market: (network: string, market: string) => ['sui', network, 'market', market] as const,
  listing: (network: string, id: string) => ['sui', network, 'listing', id] as const,
  vehicle: (network: string, id: string) => ['sui', network, 'vehicle', id] as const,
  balance: (network: string, coin: string, owner: string) => ['sui', network, 'balance', coin, owner] as const,
};

export function affectedSuiKeys(input: {
  action: 'list' | 'cancel' | 'buy'; network: string; marketId: string; vehicleId: string;
  listingId?: string; coinType?: string; buyer?: string; seller?: string; feeRecipient?: string;
}) {
  const keys: (readonly unknown[])[] = [suiKey.market(input.network, input.marketId), suiKey.vehicle(input.network, input.vehicleId)];
  if (input.listingId) keys.push(suiKey.listing(input.network, input.listingId));
  if (input.action === 'buy' && input.coinType) {
    for (const owner of [input.buyer, input.seller, input.feeRecipient]) {
      if (owner) keys.push(suiKey.balance(input.network, input.coinType, owner));
    }
  }
  return keys;
}
