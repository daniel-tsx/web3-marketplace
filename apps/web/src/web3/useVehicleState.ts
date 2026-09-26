import { useReadContract } from 'wagmi';
import type { Address } from 'viem';
import { MockUSDCAbi, VehicleMarketplaceAbi, VehicleNFTAbi } from '../contracts/abis';
import { addresses, contractsConfigured } from '../contracts/addresses';

const zeroAddress: Address = '0x0000000000000000000000000000000000000000';

export function useVehicleState(tokenId: bigint, account?: Address) {
  const owner = useReadContract({
    address: addresses.nft, abi: VehicleNFTAbi, functionName: 'ownerOf', args: [tokenId],
    query: { enabled: contractsConfigured },
  });
  const listing = useReadContract({
    address: addresses.marketplace, abi: VehicleMarketplaceAbi, functionName: 'listings', args: [tokenId],
    query: { enabled: contractsConfigured },
  });
  const nftApproval = useReadContract({
    address: addresses.nft, abi: VehicleNFTAbi, functionName: 'getApproved', args: [tokenId],
    query: { enabled: contractsConfigured && owner.isSuccess },
  });
  const operatorApproval = useReadContract({
    address: addresses.nft, abi: VehicleNFTAbi, functionName: 'isApprovedForAll',
    args: [owner.data ?? zeroAddress, addresses.marketplace],
    query: { enabled: contractsConfigured && owner.isSuccess },
  });
  const balance = useReadContract({
    address: addresses.usdc, abi: MockUSDCAbi, functionName: 'balanceOf', args: [account ?? zeroAddress],
    query: { enabled: contractsConfigured && Boolean(account) },
  });
  const allowance = useReadContract({
    address: addresses.usdc, abi: MockUSDCAbi, functionName: 'allowance',
    args: [account ?? zeroAddress, addresses.marketplace],
    query: { enabled: contractsConfigured && Boolean(account) },
  });

  const approved = nftApproval.data === addresses.marketplace || operatorApproval.data === true;
  return { owner, listing, nftApproval, operatorApproval, balance, allowance, approved };
}
