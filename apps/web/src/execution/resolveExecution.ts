import { isValidSuiAddress, normalizeSuiAddress } from '@mysten/sui/utils';

export type Ecosystem = 'evm' | 'solana' | 'sui';
export type ExecutionStatus = 'unauthenticated' | 'wallet-not-linked' | 'wallet-not-connected' | 'wallet-mismatch' | 'wrong-network' | 'resource-unavailable' | 'ready';

export interface LinkedWallet { ecosystem: Ecosystem; address: string; }
export interface ExecutionRequirement { ecosystem: Ecosystem; network: string; }
export interface ExecutionContext extends ExecutionRequirement {
  connectedWallet?: string;
  linkedWallet?: string;
  status: ExecutionStatus;
  currentNetwork?: string;
  checks?: { authenticated: boolean; walletLinked: boolean; networkReady: boolean; resourcesReady: boolean };
}

export function resolveExecution(input: {
  requirement: ExecutionRequirement;
  userId?: string;
  linkedWallets: LinkedWallet[];
  connectedWallet?: string;
  networkReady: boolean;
  resourcesReady?: boolean;
  currentNetwork?: string;
}): ExecutionContext {
  const { requirement, userId, linkedWallets, connectedWallet, networkReady, resourcesReady = true } = input;
  const matches = (a: string, b: string) => requirement.ecosystem === 'evm'
    ? a.toLowerCase() === b.toLowerCase()
    : requirement.ecosystem === 'sui'
      ? isValidSuiAddress(a) && isValidSuiAddress(b) && normalizeSuiAddress(a) === normalizeSuiAddress(b)
      : a === b;
  const linked = linkedWallets.filter((wallet) => wallet.ecosystem === requirement.ecosystem);
  const matchingWallet = linked.find((wallet) => connectedWallet && matches(wallet.address, connectedWallet));
  const context = { ...requirement, connectedWallet, linkedWallet: matchingWallet?.address ?? linked[0]?.address, currentNetwork: input.currentNetwork, checks: { authenticated: Boolean(userId), walletLinked: Boolean(matchingWallet), networkReady, resourcesReady } };
  if (!userId) return { ...context, status: 'unauthenticated' };
  if (!linked.length) return { ...context, status: 'wallet-not-linked' };
  if (!connectedWallet) return { ...context, status: 'wallet-not-connected' };
  if (!linked.some((wallet) => matches(wallet.address, connectedWallet))) return { ...context, status: 'wallet-mismatch' };
  if (!networkReady) return { ...context, status: 'wrong-network' };
  if (!resourcesReady) return { ...context, status: 'resource-unavailable' };
  return { ...context, status: 'ready' };
}

export function executionPrompt(context: ExecutionContext): string | null {
  switch (context.status) {
    case 'unauthenticated': return 'Sign in with a wallet to use marketplace actions.';
    case 'wallet-not-linked': return `Link a ${context.ecosystem.toUpperCase()} wallet to this application account.`;
    case 'wallet-not-connected': return `Connect your linked ${context.ecosystem.toUpperCase()} wallet.`;
    case 'wallet-mismatch': return `Connected ${context.ecosystem.toUpperCase()} wallet differs from this account’s linked wallet. Switch wallets or link this one explicitly.`;
    case 'wrong-network': return `Select or start ${context.network} before this action.`;
    case 'resource-unavailable': return `${context.ecosystem.toUpperCase()} marketplace configuration or on-chain resources are unavailable.`;
    case 'ready': return null;
  }
}
