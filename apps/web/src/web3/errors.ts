import {
  BaseError, ChainMismatchError, ContractFunctionRevertedError, decodeErrorResult, HttpRequestError, InsufficientFundsError,
  RpcRequestError, UserRejectedRequestError,
} from 'viem';
import { MockUSDCAbi } from '../contracts/abis';

export type Web3ErrorKind = 'rejected' | 'revert' | 'balance' | 'allowance' | 'approval' | 'wrong-chain' | 'network' | 'stale-listing' | 'unknown';
export type Web3ActionError = { kind: Web3ErrorKind; message: string; cause: unknown };

export function explainWeb3Error(cause: unknown): Web3ActionError {
  if (cause instanceof BaseError) {
    const rejected = cause.walk((error) => error instanceof UserRejectedRequestError);
    if (rejected instanceof UserRejectedRequestError) {
      return { kind: 'rejected', message: 'Wallet request rejected.', cause };
    }
    const reverted = cause.walk((error) => error instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError) {
      let errorName = reverted.data?.errorName;
      if (!errorName && reverted.raw) {
        try { errorName = decodeErrorResult({ abi: MockUSDCAbi, data: reverted.raw }).errorName; }
        catch { /* The revert may be a marketplace or wallet error. */ }
      }
      if (errorName === 'ERC20InsufficientBalance') return { kind: 'balance', message: 'Not enough mUSDC to pay this price.', cause };
      if (errorName === 'ERC20InsufficientAllowance') return { kind: 'allowance', message: 'Marketplace mUSDC allowance is too low.', cause };
      if (errorName === 'ListingVersionMismatch' || errorName === 'PriceExceedsMaximum' || errorName === 'ListingNotActive' || errorName === 'NotTokenOwner') {
        return { kind: 'stale-listing', message: 'This listing changed after you reviewed it. Refresh the listing and confirm the new terms.', cause };
      }
      if (errorName === 'NftNotApproved') return { kind: 'approval', message: 'Marketplace NFT approval is missing or was revoked.', cause };
      return { kind: 'revert', message: reverted.reason || reverted.shortMessage, cause };
    }
    const chain = cause.walk((error) => error instanceof ChainMismatchError);
    if (chain instanceof ChainMismatchError) return { kind: 'wrong-chain', message: 'Switch to the local Anvil chain.', cause };
    const funds = cause.walk((error) => error instanceof InsufficientFundsError);
    if (funds instanceof InsufficientFundsError) {
      return { kind: 'balance', message: 'Not enough native ETH to pay transaction gas.', cause };
    }
    const network = cause.walk((error) => error instanceof HttpRequestError || error instanceof RpcRequestError);
    if (network instanceof HttpRequestError || network instanceof RpcRequestError) {
      return { kind: 'network', message: network.shortMessage, cause };
    }
    return { kind: 'unknown', message: cause.shortMessage, cause };
  }
  if (cause instanceof Error) return { kind: 'unknown', message: cause.message, cause };
  return { kind: 'unknown', message: 'Unexpected Web3 error.', cause };
}
