import { useConfig, useReadContract } from 'wagmi';
import { readContractQueryOptions } from 'wagmi/query';
import { useQueryClient } from '@tanstack/react-query';
import type { Address } from 'viem';
import { MockUSDCAbi, VehicleMarketplaceAbi, VehicleNFTAbi } from '../contracts/abis';
import { addresses, contractsConfigured } from '../contracts/addresses';
import { localChain } from '../contracts/config';
import { fetchReconciledQuery } from './reconciliation';

const zeroAddress: Address = '0x0000000000000000000000000000000000000000';

export function useVehicleState(tokenId: bigint, account?: Address) {
  const config = useConfig();
  const queryClient = useQueryClient();
  const owner = useReadContract({
    chainId: localChain.id,
    address: addresses.nft, abi: VehicleNFTAbi, functionName: 'ownerOf', args: [tokenId],
    query: { enabled: contractsConfigured },
  });
  const listing = useReadContract({
    chainId: localChain.id,
    address: addresses.marketplace, abi: VehicleMarketplaceAbi, functionName: 'listings', args: [tokenId],
    query: { enabled: contractsConfigured },
  });
  const nftApproval = useReadContract({
    chainId: localChain.id,
    address: addresses.nft, abi: VehicleNFTAbi, functionName: 'getApproved', args: [tokenId],
    query: { enabled: contractsConfigured && owner.isSuccess },
  });
  const operatorApproval = useReadContract({
    chainId: localChain.id,
    address: addresses.nft, abi: VehicleNFTAbi, functionName: 'isApprovedForAll',
    args: [owner.data ?? zeroAddress, addresses.marketplace],
    query: { enabled: contractsConfigured && owner.isSuccess },
  });
  const balance = useReadContract({
    chainId: localChain.id,
    address: addresses.usdc, abi: MockUSDCAbi, functionName: 'balanceOf', args: [account ?? zeroAddress],
    query: { enabled: contractsConfigured && Boolean(account) },
  });
  const allowance = useReadContract({
    chainId: localChain.id,
    address: addresses.usdc, abi: MockUSDCAbi, functionName: 'allowance',
    args: [account ?? zeroAddress, addresses.marketplace],
    query: { enabled: contractsConfigured && Boolean(account) },
  });

  const approved = nftApproval.data === addresses.marketplace || operatorApproval.data === true;
  async function refreshOperatorApproval() {
    const currentOwner = queryClient.getQueryData<Address>(owner.queryKey);
    if (!currentOwner) throw new Error('The refreshed vehicle owner is unavailable.');
    // Purchase changes the owner-dependent query key. Read the new owner's
    // operator approval even before React has mounted that observer.
    await fetchReconciledQuery(queryClient, readContractQueryOptions(config, {
      chainId: localChain.id, address: addresses.nft, abi: VehicleNFTAbi,
      functionName: 'isApprovedForAll', args: [currentOwner, addresses.marketplace],
    }));
  }
  return { owner, listing, listingVersion: listing.data?.[3], nftApproval, operatorApproval, balance, allowance, approved, refreshOperatorApproval };
}
