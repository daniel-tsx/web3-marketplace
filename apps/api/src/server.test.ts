import assert from 'node:assert/strict';
import { test } from 'node:test';
import { privateKeyToAccount } from 'viem/accounts';
import { Keypair } from '@solana/web3.js';
import nacl from 'tweetnacl';
import { openDatabase } from './db.js';
import { buildServer } from './server.js';

const ORIGIN = 'http://localhost:5173';
const evmA = privateKeyToAccount('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
const evmB = privateKeyToAccount('0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
const solA = Keypair.generate();
const solB = Keypair.generate();

test('EVM login, exact challenge, replay and expiry', async () => {
  const db = openDatabase(':memory:');
  const app = await buildServer(db);
  const post = (url: string, payload: object) => app.inject({ method: 'POST', url, headers: { origin: ORIGIN }, payload });
  try {
    const issued = (await post('/auth/challenge', { ecosystem: 'evm', address: evmA.address })).json();
    assert.match(issued.message, /Purpose: login/);
    const bad = await post('/auth/verify', { challengeId: issued.challengeId, ecosystem: 'evm', address: evmA.address, signature: await evmB.signMessage({ message: issued.message }) });
    assert.equal(bad.statusCode, 401);
    assert.equal(bad.json().error.code, 'invalid_signature');
    const good = await post('/auth/verify', { challengeId: issued.challengeId, ecosystem: 'evm', address: evmA.address, signature: await evmA.signMessage({ message: issued.message }) });
    assert.equal(good.statusCode, 200);
    const cookie = good.headers['set-cookie'] as string;
    assert.match(cookie, /HttpOnly/);
    const me = await app.inject({ method: 'GET', url: '/me', headers: { cookie } });
    assert.equal(me.json().wallets[0].address, evmA.address.toLowerCase());
    const replay = await post('/auth/verify', { challengeId: issued.challengeId, ecosystem: 'evm', address: evmA.address, signature: await evmA.signMessage({ message: issued.message }) });
    assert.equal(replay.json().error.code, 'challenge_used');
    const expired = (await post('/auth/challenge', { ecosystem: 'evm', address: evmA.address })).json();
    db.prepare('UPDATE auth_challenges SET expires_at = 0 WHERE id = ?').run(expired.challengeId);
    const expiredResponse = await post('/auth/verify', { challengeId: expired.challengeId, ecosystem: 'evm', address: evmA.address, signature: await evmA.signMessage({ message: expired.message }) });
    assert.equal(expiredResponse.json().error.code, 'challenge_expired');
    const logout = await app.inject({ method: 'POST', url: '/logout', headers: { origin: ORIGIN, cookie } });
    assert.equal(logout.statusCode, 200);
    assert.equal((await app.inject({ method: 'GET', url: '/me', headers: { cookie } })).statusCode, 401);
  } finally { await app.close(); }
});

test('Solana login and invalid Ed25519 signature', async () => {
  const app = await buildServer(openDatabase(':memory:'));
  const post = (url: string, payload: object) => app.inject({ method: 'POST', url, headers: { origin: ORIGIN }, payload });
  try {
    const address = solA.publicKey.toBase58();
    const challenge = (await post('/auth/challenge', { ecosystem: 'solana', address })).json();
    const wrongSignature = Buffer.from(nacl.sign.detached(new TextEncoder().encode(challenge.message), solB.secretKey)).toString('base64');
    assert.equal((await post('/auth/verify', { challengeId: challenge.challengeId, ecosystem: 'solana', address, signature: wrongSignature })).json().error.code, 'invalid_signature');
    const signature = Buffer.from(nacl.sign.detached(new TextEncoder().encode(challenge.message), solA.secretKey)).toString('base64');
    const verified = await post('/auth/verify', { challengeId: challenge.challengeId, ecosystem: 'solana', address, signature });
    assert.equal(verified.statusCode, 200);
    const me = await app.inject({ method: 'GET', url: '/me', headers: { cookie: verified.headers['set-cookie'] as string } });
    assert.equal(me.json().wallets[0].address, address);
  } finally { await app.close(); }
});

test('linking requires session and proof; a wallet cannot belong to two users', async () => {
  const app = await buildServer(openDatabase(':memory:'));
  const post = (url: string, payload: object, cookie?: string) => app.inject({ method: 'POST', url, headers: { origin: ORIGIN, ...(cookie ? { cookie } : {}) }, payload });
  async function login(account: typeof evmA) {
    const issued = (await post('/auth/challenge', { ecosystem: 'evm', address: account.address })).json();
    return post('/auth/verify', { challengeId: issued.challengeId, ecosystem: 'evm', address: account.address, signature: await account.signMessage({ message: issued.message }) });
  }
  try {
    assert.equal((await post('/wallets/link/challenge', { ecosystem: 'solana', address: solA.publicKey.toBase58() })).statusCode, 401);
    const userA = await login(evmA);
    const cookieA = userA.headers['set-cookie'] as string;
    const address = solA.publicKey.toBase58();
    const challenge = (await post('/wallets/link/challenge', { ecosystem: 'solana', address }, cookieA)).json();
    assert.match(challenge.message, /Purpose: link-wallet/);
    const invalid = await post('/wallets/link/verify', { challengeId: challenge.challengeId, ecosystem: 'solana', address, signature: Buffer.from(nacl.sign.detached(new TextEncoder().encode(challenge.message), solB.secretKey)).toString('base64') }, cookieA);
    assert.equal(invalid.json().error.code, 'invalid_signature');
    const signature = Buffer.from(nacl.sign.detached(new TextEncoder().encode(challenge.message), solA.secretKey)).toString('base64');
    assert.equal((await post('/wallets/link/verify', { challengeId: challenge.challengeId, ecosystem: 'solana', address, signature }, cookieA)).statusCode, 200);
    const meA = (await app.inject({ method: 'GET', url: '/me', headers: { cookie: cookieA } })).json();
    assert.equal(meA.wallets.length, 2);
    assert.equal(meA.userId, userA.json().userId);
    const userB = await login(evmB);
    const cookieB = userB.headers['set-cookie'] as string;
    const conflict = (await post('/wallets/link/challenge', { ecosystem: 'solana', address }, cookieB)).json();
    const response = await post('/wallets/link/verify', { challengeId: conflict.challengeId, ecosystem: 'solana', address, signature: Buffer.from(nacl.sign.detached(new TextEncoder().encode(conflict.message), solA.secretKey)).toString('base64') }, cookieB);
    assert.equal(response.json().error.code, 'wallet_owned');
    const noOrigin = await app.inject({ method: 'POST', url: '/auth/challenge', payload: { ecosystem: 'evm', address: evmA.address } });
    assert.equal(noOrigin.statusCode, 403);
  } finally { await app.close(); }
});

test('Solana login links an EVM wallet to the same application user', async () => {
  const app = await buildServer(openDatabase(':memory:'));
  const post = (url: string, payload: object, cookie?: string) => app.inject({ method: 'POST', url, headers: { origin: ORIGIN, ...(cookie ? { cookie } : {}) }, payload });
  try {
    const solanaAddress = solB.publicKey.toBase58();
    const loginChallenge = (await post('/auth/challenge', { ecosystem: 'solana', address: solanaAddress })).json();
    const solanaSignature = Buffer.from(nacl.sign.detached(new TextEncoder().encode(loginChallenge.message), solB.secretKey)).toString('base64');
    const login = await post('/auth/verify', { challengeId: loginChallenge.challengeId, ecosystem: 'solana', address: solanaAddress, signature: solanaSignature });
    assert.equal(login.statusCode, 200);
    const cookie = login.headers['set-cookie'] as string;
    const linkChallenge = (await post('/wallets/link/challenge', { ecosystem: 'evm', address: evmA.address }, cookie)).json();
    const evmSignature = await evmA.signMessage({ message: linkChallenge.message });
    const link = await post('/wallets/link/verify', { challengeId: linkChallenge.challengeId, ecosystem: 'evm', address: evmA.address, signature: evmSignature }, cookie);
    assert.equal(link.statusCode, 200);
    const me = (await app.inject({ method: 'GET', url: '/me', headers: { cookie } })).json();
    assert.equal(me.userId, login.json().userId);
    assert.deepEqual(me.wallets.map((wallet: { ecosystem: string }) => wallet.ecosystem), ['evm', 'solana']);
  } finally { await app.close(); }
});
