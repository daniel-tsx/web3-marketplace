import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveExecution, type LinkedWallet } from './resolveExecution';

const wallets: LinkedWallet[] = [
  { ecosystem: 'solana', address: 'SolanaBase58CaseSensitive' },
  { ecosystem: 'evm', address: '0xAbC' },
];
const evm = { ecosystem: 'evm' as const, network: 'Anvil 31337' };
const solana = { ecosystem: 'solana' as const, network: 'localnet' };

test('Solana login can execute EVM, and EVM login can execute Solana', () => {
  assert.equal(resolveExecution({ requirement: evm, userId: 'solana-login-user', linkedWallets: wallets, connectedWallet: '0xabc', networkReady: true }).status, 'ready');
  assert.equal(resolveExecution({ requirement: solana, userId: 'evm-login-user', linkedWallets: wallets, connectedWallet: 'SolanaBase58CaseSensitive', networkReady: true }).status, 'ready');
});

test('EVM status gates actions in sequence', () => {
  const base = { requirement: evm, linkedWallets: wallets, connectedWallet: '0xabc', networkReady: true };
  assert.equal(resolveExecution(base).status, 'unauthenticated');
  assert.equal(resolveExecution({ ...base, userId: 'u', linkedWallets: wallets.slice(0, 1) }).status, 'wallet-not-linked');
  assert.equal(resolveExecution({ ...base, userId: 'u', connectedWallet: undefined }).status, 'wallet-not-connected');
  assert.equal(resolveExecution({ ...base, userId: 'u', connectedWallet: '0xdef' }).status, 'wallet-mismatch');
  assert.equal(resolveExecution({ ...base, userId: 'u', networkReady: false }).status, 'wrong-network');
});

test('Solana addresses stay case sensitive', () => {
  assert.equal(resolveExecution({ requirement: solana, userId: 'u', linkedWallets: wallets, connectedWallet: 'solanabase58casesensitive', networkReady: true }).status, 'wallet-mismatch');
});
