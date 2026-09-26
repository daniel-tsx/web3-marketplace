import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveExecution, type LinkedWallet } from './resolveExecution';

const wallets: LinkedWallet[] = [
  { ecosystem: 'solana', address: 'SolanaBase58CaseSensitive' },
  { ecosystem: 'evm', address: '0xAbC' },
];
const evm = { ecosystem: 'evm' as const, network: 'Anvil 31337' };
const solana = { ecosystem: 'solana' as const, network: 'localnet' };
const sui = { ecosystem: 'sui' as const, network: 'testnet' };
const suiAddress = `0x${'ab'.repeat(32)}`;

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

test('EVM login can execute Sui; Sui login can execute EVM', () => {
  const all = [...wallets, { ecosystem: 'sui' as const, address: suiAddress }];
  assert.equal(resolveExecution({ requirement: sui, userId: 'evm-login', linkedWallets: all, connectedWallet: `0x${'AB'.repeat(32)}`, networkReady: true }).status, 'ready');
  assert.equal(resolveExecution({ requirement: evm, userId: 'sui-login', linkedWallets: all, connectedWallet: '0xabc', networkReady: true }).status, 'ready');
});

test('Sui checks link, connection, canonical address, network, and resources', () => {
  const linkedWallets = [{ ecosystem: 'sui' as const, address: suiAddress }];
  const base = { requirement: sui, userId: 'u', linkedWallets, connectedWallet: suiAddress, networkReady: true };
  assert.equal(resolveExecution({ ...base, linkedWallets: [] }).status, 'wallet-not-linked');
  assert.equal(resolveExecution({ ...base, connectedWallet: undefined }).status, 'wallet-not-connected');
  assert.equal(resolveExecution({ ...base, connectedWallet: `0x${'cd'.repeat(32)}` }).status, 'wallet-mismatch');
  assert.equal(resolveExecution({ ...base, networkReady: false }).status, 'wrong-network');
  assert.equal(resolveExecution({ ...base, resourcesReady: false }).status, 'resource-unavailable');
});
