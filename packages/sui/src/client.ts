import { bcs } from '@mysten/sui/bcs';
import { Transaction } from '@mysten/sui/transactions';
import { normalizeSuiAddress } from '@mysten/sui/utils';

const UID = bcs.struct('UID', { id: bcs.Address });
const Vehicle = bcs.struct('Vehicle', { id: UID, name: bcs.string() });
const Market = bcs.struct('Market', {
  id: UID, fee_recipient: bcs.Address, current_listing: bcs.option(bcs.Address),
});
const Listing = bcs.struct('Listing', {
  id: UID, market: bcs.Address, seller: bcs.Address,
  price: bcs.u64(), vehicle: bcs.option(Vehicle),
});

export function parseMarket(bytes: Uint8Array) {
  const market = Market.parse(bytes);
  return {
    id: normalizeSuiAddress(market.id.id),
    feeRecipient: normalizeSuiAddress(market.fee_recipient),
    listingId: market.current_listing ? normalizeSuiAddress(market.current_listing) : null,
  };
}

export function parseListing(bytes: Uint8Array) {
  const listing = Listing.parse(bytes);
  return {
    id: normalizeSuiAddress(listing.id.id),
    marketId: normalizeSuiAddress(listing.market),
    seller: normalizeSuiAddress(listing.seller),
    price: BigInt(listing.price),
    vehicleId: listing.vehicle ? normalizeSuiAddress(listing.vehicle.id.id) : null,
    vehicleName: listing.vehicle?.name ?? null,
  };
}

export function parseVehicle(bytes: Uint8Array) {
  const vehicle = Vehicle.parse(bytes);
  return { id: normalizeSuiAddress(vehicle.id.id), name: vehicle.name };
}

export interface SuiMarketplaceIds { packageId: string; marketId: string; }

export function buildListVehicleTransaction(ids: SuiMarketplaceIds, vehicleId: string, price: bigint) {
  const tx = new Transaction();
  tx.moveCall({
    target: `${ids.packageId}::marketplace::list`,
    arguments: [tx.object(ids.marketId), tx.object(vehicleId), tx.pure.u64(price)],
  });
  return tx;
}

export function buildCancelListingTransaction(ids: SuiMarketplaceIds, listingId: string) {
  const tx = new Transaction();
  tx.moveCall({
    target: `${ids.packageId}::marketplace::cancel`,
    arguments: [tx.object(ids.marketId), tx.object(listingId)],
  });
  return tx;
}

export function buildBuyVehicleTransaction(ids: SuiMarketplaceIds, listingId: string, price: bigint, coinType: string) {
  const tx = new Transaction();
  tx.moveCall({
    target: `${ids.packageId}::marketplace::buy`,
    arguments: [tx.object(ids.marketId), tx.object(listingId), tx.coin({ balance: price, type: coinType })],
  });
  return tx;
}
