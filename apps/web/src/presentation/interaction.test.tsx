import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { catalogMatches } from '../components/CatalogBrowser';
import { TransactionReview, type ReviewedAction } from '../components/TransactionReview';
import { solanaFailureIsUnverified, TransactionProgress } from '../components/TransactionProgress';
import { WalletRequirement } from '../components/VehicleDetail';
import { AccountStatus, authErrorMessage } from '../auth/AccountStatus';
import { resolveExecution } from '../execution/resolveExecution';
import { suiObjectExplorer } from './explorer';
import { listingPriceError } from '../components/ListingPriceField';
import { TransactionStatus } from '../components/TransactionStatus';

test('catalog filtering combines ecosystem, normalized search and actual active listing state', () => {
  const asset = { name: 'Meridian GT', ecosystem: 'evm' as const, description: 'Grand tourer · Silver' };
  assert.equal(catalogMatches({ ecosystem: 'all', search: '  MERIDIAN  ', listedOnly: false }, asset), true);
  assert.equal(catalogMatches({ ecosystem: 'solana', search: '', listedOnly: false }, asset), false);
  assert.equal(catalogMatches({ ecosystem: 'all', search: 'missing', listedOnly: false }, asset), false);
  assert.equal(catalogMatches({ ecosystem: 'evm', search: 'tourer', listedOnly: true }, asset), false);
  assert.equal(catalogMatches({ ecosystem: 'evm', search: 'tourer', listedOnly: true }, { ...asset, listed: true }), true);
});

test('explorer links require valid real-network identifiers and exclude local/custom/mainnet resources', () => {
  const id = `0x${'ab'.repeat(32)}`;
  assert.equal(suiObjectExplorer('testnet', 'https://fullnode.testnet.sui.io:443', id), `https://suiscan.xyz/testnet/object/${id}`);
  assert.equal(suiObjectExplorer('testnet', 'http://localhost:9000', id), null);
  assert.equal(suiObjectExplorer('mainnet', 'https://fullnode.mainnet.sui.io:443', id), null);
  assert.equal(suiObjectExplorer('devnet', 'https://fullnode.testnet.sui.io:443', id), null);
  assert.equal(suiObjectExplorer('testnet', 'https://fullnode.testnet.sui.io:443', 'illustration'), null);
  assert.equal(suiObjectExplorer('testnet', 'https://fullnode.testnet.sui.io:443', `0x${'0'.repeat(64)}`), null);
});

test('listing prices explain invalid precision, zero amounts and chain-specific bounds', () => {
  assert.equal(listingPriceError('0.000001', 64), null);
  assert.match(listingPriceError('0.0000001', 64)!, /six decimal/);
  assert.match(listingPriceError('0', 64)!, /greater than zero/);
  assert.match(listingPriceError('18446744073709.551616', 64)!, /exceeds/);
  assert.equal(listingPriceError('18446744073709.551616', 256), null);
});

test('a submitted EVM hash with an unknown receipt timeout does not imply execution failure', () => {
  const html = renderToStaticMarkup(createElement(TransactionStatus, { phase: { stage: 'failed', hash: '0x123', error: { kind: 'unknown', message: 'Receipt wait timed out', cause: null } }, retryReconciliation: async () => {} }));
  assert.match(html, /Execution result not verified/);
  assert.match(html, /Check the original transaction/);
  assert.doesNotMatch(html, /Transaction failed/);
});

test('Solana preserves uncertainty for an unreadable submitted signature and distinguishes program failures', () => {
  assert.equal(solanaFailureIsUnverified('Unexpected confirmation error', 'signature'), true);
  assert.equal(solanaFailureIsUnverified('Solana transaction failed: InstructionError', 'signature'), false);
  assert.equal(solanaFailureIsUnverified('This listing changed after you reviewed it. Refresh the listing and confirm the new terms.', 'signature'), false);
  assert.equal(solanaFailureIsUnverified('RPC error before submission'), false);
});

test('review shows exact original terms and blocks changed identity, listing or readiness', () => {
  let executions = 0;
  const review: ReviewedAction = { title: 'Review purchase', action: 'Confirm purchase in wallet', asset: 'Vehicle #1', network: 'Local test network', price: '10 mUSDC', seller: 'seller', binding: 'version 7 / 10000000', scope: 'identity:wallet:network', note: 'Purchase this exact listing.', execute: () => { executions++; } };
  for (const scenario of [{ allowed: true, currentScope: review.scope, currentBinding: review.binding, disabled: false }, { allowed: false, currentScope: review.scope, currentBinding: review.binding, disabled: true }, { allowed: true, currentScope: 'another-identity', currentBinding: review.binding, disabled: true }, { allowed: true, currentScope: review.scope, currentBinding: 'version 8 / 10000000', disabled: true }]) {
    const html = renderToStaticMarkup(createElement(TransactionReview, { review, ...scenario, onDismiss: () => {} }));
    assert.match(html, /version 7 \/ 10000000/);
    assert.match(html, /Nothing has been submitted yet/);
    assert.equal(/<button[^>]*disabled=""[^>]*>Confirm purchase in wallet/.test(html), scenario.disabled);
    assert.equal(executions, 0);
  }
});

test('transaction stages separate submission, successful execution and failed reconciliation on each chain', () => {
  for (const ecosystem of ['evm', 'solana', 'sui'] as const) {
    const render = (stage: 'wallet' | 'pending' | 'confirmed' | 'reconciling' | 'reconciliation-failed' | 'failed') => renderToStaticMarkup(createElement(TransactionProgress, { ecosystem, stage, identifier: 'original-identifier', message: 'RPC unavailable', retryReconciliation: async () => {} }));
    assert.match(render('wallet'), /Approve in your wallet/);
    assert.match(render('pending'), /submission, not confirmation/);
    assert.match(render('reconciling'), /Successful execution is verified/);
    assert.match(render('confirmed'), /affected reads refreshed/);
    const failure = render('reconciliation-failed');
    assert.match(failure, /Transaction succeeded; state refresh failed/);
    assert.match(failure, /original-identifier/);
    assert.match(failure, /Retry state refresh/);
    assert.doesNotMatch(failure, /Transaction failed|Confirm purchase/);
    assert.match(render('failed'), /Technical transaction details/);
  }
});

test('connected, authenticated, linked and network states remain independently visible', () => {
  const context = resolveExecution({ requirement: { ecosystem: 'evm', network: 'chain 31337' }, connectedWallet: '0xabc', linkedWallets: [], networkReady: false, resourcesReady: false, currentNetwork: 'chain 1' });
  const html = renderToStaticMarkup(createElement(WalletRequirement, { context }));
  assert.match(html, /0xabc/);
  assert.match(html, /Sign-in required/);
  assert.match(html, /Matching linked wallet required/);
  assert.match(html, /Network not ready/);
  assert.match(html, /chain 1/);
  assert.equal(context.status, 'unauthenticated');
});

test('account UI distinguishes guest, expired, authenticated and unavailable without implying wallet connection is login', () => {
  assert.match(renderToStaticMarkup(createElement(AccountStatus, { stage: 'guest' })), /does not submit a blockchain transaction/);
  assert.match(renderToStaticMarkup(createElement(AccountStatus, { stage: 'expired' })), /Sign in again with a linked wallet/);
  assert.match(renderToStaticMarkup(createElement(AccountStatus, { stage: 'authenticated' })), /checked separately/);
  assert.match(renderToStaticMarkup(createElement(AccountStatus, { stage: 'unavailable' })), /Retry the account check/);
  assert.match(authErrorMessage(new Error('User rejected request (4001)')), /Signature cancelled/);
  assert.match(authErrorMessage({ code: 'invalid_link_session' }), /session expired/);
  assert.match(authErrorMessage(new Error('Connect the requested EVM wallet')), /exact wallet/);
});
