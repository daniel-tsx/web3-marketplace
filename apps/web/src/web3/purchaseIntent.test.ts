import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BaseError, ContractFunctionRevertedError, encodeErrorResult } from 'viem';
import { VehicleMarketplaceAbi, MockUSDCAbi } from '../contracts/abis';
import { explainWeb3Error } from './errors';
import { explainSolanaError, solanaExecutionError } from './solana/errors';

test('EVM stale intent errors ask for review and retain the original cause', () => {
  for (const errorName of ['ListingVersionMismatch', 'PriceExceedsMaximum', 'ListingNotActive'] as const) {
    const cause = new BaseError('Execution reverted', { cause: new ContractFunctionRevertedError({ abi: VehicleMarketplaceAbi, data: encodeErrorResult({ abi: VehicleMarketplaceAbi, errorName }), functionName: 'buyVehicle' }) });
    const result = explainWeb3Error(cause);
    assert.equal(result.kind, 'stale-listing');
    assert.match(result.message, /Refresh the listing and confirm the new terms/);
    assert.equal(result.cause, cause);
  }
});

test('EVM payment balance and allowance failures remain distinct', () => {
  for (const [errorName, kind] of [['ERC20InsufficientBalance', 'balance'], ['ERC20InsufficientAllowance', 'allowance']] as const) {
    const cause = new ContractFunctionRevertedError({ abi: MockUSDCAbi, data: encodeErrorResult({ abi: MockUSDCAbi, errorName, args: ['0x0000000000000000000000000000000000000001', 0n, 1000n] }), functionName: 'transferFrom' });
    assert.equal(explainWeb3Error(cause).kind, kind);
  }
});

test('Solana stale intent maps both confirmation errors and preflight logs', () => {
  for (const code of [6005, 6007, 6008]) {
    const original = { InstructionError: [0, { Custom: code }] } as const;
    const error = solanaExecutionError({ InstructionError: [0, { Custom: code }] });
    assert.deepEqual(error.cause, original);
    assert.match(explainSolanaError(error), /Refresh the listing/);
  }
  const preflight = Object.assign(new Error('Simulation failed'), { logs: ['Program log: AnchorError caused by account: listing. Error Code: ListingVersionMismatch.'] });
  assert.match(explainSolanaError(preflight), /confirm the new terms/);
  const missing = Object.assign(new Error('Simulation failed'), { logs: ['Program log: AnchorError caused by account: escrow. Error Code: AccountNotInitialized.'] });
  assert.match(explainSolanaError(missing), /confirm the new terms/);
  const confirmedMissing = solanaExecutionError({ InstructionError: [0, { Custom: 3012 }] }, missing.logs);
  assert.match(explainSolanaError(confirmedMissing), /confirm the new terms/);
  assert.match(explainSolanaError(solanaExecutionError({ InstructionError: [0, { Custom: 6002 }] })), /Payment mint/);
  assert.match(explainSolanaError(solanaExecutionError({ InstructionError: [0, { Custom: 6004 }] })), /Not enough/);
  assert.equal(explainSolanaError(new Error('User rejected request')), 'User rejected request');
  assert.equal(explainSolanaError(new Error('RPC unavailable')), 'RPC unavailable');
});
