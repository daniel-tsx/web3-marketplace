import { useReadContract } from 'wagmi';
import type { Address } from 'viem';
import { MockUSDCAbi, VehicleMarketplaceAbi, VehicleNFTAbi } from '../contracts/abis';
import { addresses, contractsConfigured } from '../contracts/addresses';
import { localChain } from '../contracts/config';

const zeroAddress: Address = '0x0000000000000000000000000000000000000000';

export function useVehicleState(tokenId: bigint, account?: Address) {
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
  return { owner, listing, listingVersion: listing.data?.[3], nftApproval, operatorApproval, balance, allowance, approved };
}
