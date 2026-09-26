export type Ecosystem = 'evm' | 'solana';
export type ExecutionStatus = 'unauthenticated' | 'wallet-not-linked' | 'wallet-not-connected' | 'wallet-mismatch' | 'wrong-network' | 'ready';

export interface LinkedWallet { ecosystem: Ecosystem; address: string; }
export interface ExecutionRequirement { ecosystem: Ecosystem; network: string; }
export interface ExecutionContext extends ExecutionRequirement {
  connectedWallet?: string;
  linkedWallet?: string;
  status: ExecutionStatus;
}

export function resolveExecution(input: {
  requirement: ExecutionRequirement;
  userId?: string;
  linkedWallets: LinkedWallet[];
  connectedWallet?: string;
  networkReady: boolean;
}): ExecutionContext {
  const { requirement, userId, linkedWallets, connectedWallet, networkReady } = input;
  const matches = (a: string, b: string) => requirement.ecosystem === 'evm'
    ? a.toLowerCase() === b.toLowerCase() : a === b;
  const linked = linkedWallets.filter((wallet) => wallet.ecosystem === requirement.ecosystem);
  const context = { ...requirement, connectedWallet, linkedWallet: linked.find((wallet) => connectedWallet && matches(wallet.address, connectedWallet))?.address ?? linked[0]?.address };
  if (!userId) return { ...context, status: 'unauthenticated' };
  if (!linked.length) return { ...context, status: 'wallet-not-linked' };
  if (!connectedWallet) return { ...context, status: 'wallet-not-connected' };
  if (!linked.some((wallet) => matches(wallet.address, connectedWallet))) return { ...context, status: 'wallet-mismatch' };
  if (!networkReady) return { ...context, status: 'wrong-network' };
  return { ...context, status: 'ready' };
}

export function executionPrompt(context: ExecutionContext): string | null {
  switch (context.status) {
    case 'unauthenticated': return 'Log in with either wallet to use marketplace actions.';
    case 'wallet-not-linked': return `Link a ${context.ecosystem.toUpperCase()} wallet to this application account.`;
    case 'wallet-not-connected': return `Connect your linked ${context.ecosystem.toUpperCase()} wallet.`;
    case 'wallet-mismatch': return `Connected ${context.ecosystem.toUpperCase()} wallet differs from this account’s linked wallet. Switch wallets or link this one explicitly.`;
    case 'wrong-network': return `Select or start ${context.network} before this action.`;
    case 'ready': return null;
  }
}
