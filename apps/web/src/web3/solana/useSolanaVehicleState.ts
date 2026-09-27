import { useQuery } from '@tanstack/react-query';
import { useConnection } from '@solana/wallet-adapter-react';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { PublicKey } from '@solana/web3.js';
import { decodeListing, decodeMarketConfig, escrowAddress, listingAddress, marketConfigAddress, PROGRAM_ID } from '@vehicle/solana';

export const solanaKey = {
  listing: (mint: string) => ['solana', 'listing', mint] as const,
  token: (mint: string, owner: string) => ['solana', 'token', mint, owner] as const,
  escrow: (mint: string) => ['solana', 'escrow', mint] as const,
};

export function useSolanaVehicleState(vehicleMint: PublicKey, paymentMint: PublicKey, connected?: PublicKey) {
  const { connection } = useConnection();
  const mint = vehicleMint.toBase58();
  const owner = connected?.toBase58();
  const config = useQuery({
    queryKey: ['solana', 'market-config', connection.rpcEndpoint, PROGRAM_ID.toBase58()],
    queryFn: async () => {
      const account = await connection.getAccountInfo(marketConfigAddress(), 'confirmed');
      if (!account || !account.owner.equals(PROGRAM_ID)) throw new Error('Solana marketplace configuration is unavailable. Initialize the payment mint before trading.');
      return decodeMarketConfig(account.data);
    },
  });
  const listing = useQuery({
    queryKey: solanaKey.listing(mint),
    queryFn: async () => {
      const account = await connection.getAccountInfo(listingAddress(vehicleMint), 'confirmed');
      return account ? decodeListing(account.data) : null;
    },
  });
  const escrow = useQuery({
    queryKey: solanaKey.escrow(mint),
    queryFn: async () => {
      const account = await connection.getParsedAccountInfo(escrowAddress(vehicleMint), 'confirmed');
      const data = account.value?.data;
      return data && 'parsed' in data ? BigInt(data.parsed.info.tokenAmount.amount) : 0n;
    },
  });
  const vehicleBalance = useQuery({
    queryKey: solanaKey.token(mint, owner ?? 'disconnected'), enabled: Boolean(owner),
    queryFn: () => tokenBalance(connection, vehicleMint, connected!),
  });
  const paymentBalance = useQuery({
    queryKey: solanaKey.token(paymentMint.toBase58(), owner ?? 'disconnected'), enabled: Boolean(owner),
    queryFn: () => tokenBalance(connection, paymentMint, connected!),
  });
  const paymentMintMatches = config.isSuccess && config.data.paymentMint.equals(paymentMint) &&
    (!listing.data?.active || listing.data.paymentMint.equals(paymentMint));
  return { listing, escrow, vehicleBalance, paymentBalance, config, paymentMintMatches };
}

async function tokenBalance(connection: ReturnType<typeof useConnection>['connection'], mint: PublicKey, owner: PublicKey) {
  const address = getAssociatedTokenAddressSync(mint, owner);
  const account = await connection.getParsedAccountInfo(address, 'confirmed');
  const data = account.value?.data;
  return data && 'parsed' in data ? BigInt(data.parsed.info.tokenAmount.amount) : 0n;
}
