import assert from 'node:assert/strict';
import { test } from 'node:test';
import Fastify from 'fastify';
import { privateKeyToAccount } from 'viem/accounts';
import { Keypair } from '@solana/web3.js';
import nacl from 'tweetnacl';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Secp256k1Keypair } from '@mysten/sui/keypairs/secp256k1';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTestDatabase } from './test-db.js';
import { importSQLite } from './sqlite-import.js';
import { buildServer } from './server.js';
import { readFrontendOrigin } from './config.js';

const ORIGIN = 'http://localhost:5173';
const evmA = privateKeyToAccount('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
const evmB = privateKeyToAccount('0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
const solA = Keypair.generate();
const solB = Keypair.generate();
const suiA = new Ed25519Keypair();
const suiB = new Secp256k1Keypair();

test('Vercel original /api paths reach native Fastify routes with query strings intact', async (t) => {
  const app = await buildServer((await createTestDatabase(t)).db, 'https://marketplace.example', Fastify, true);
  t.after(() => app.close());
  app.get('/query-test', (request) => ({ url: request.url, query: request.query }));
  for (const url of ['/api/me', '/api/me?next=%2Fapi%2Fme', '/me']) {
    const response = await app.inject({ url });
    assert.equal(response.statusCode, 401, url);
    assert.equal(response.json().error.code, 'unauthenticated');
    assert.equal(response.headers['cache-control'], 'no-store');
  }
  const query = await app.inject({ url: '/api/query-test?value=a%2Bb&value=c&next=%2Fapi%2Fme' });
  assert.equal(query.statusCode, 200);
  assert.equal(query.json().url, '/query-test?value=a%2Bb&value=c&next=%2Fapi%2Fme');
  assert.deepEqual(query.json().query, { value: ['a+b', 'c'], next: '/api/me' });
  for (const url of ['/api', '/api/', '/api?probe=1', '/api/?probe=1', '/api/runtime-probe', '/api/api/me', '/apiculture', '/apiary/me', '/API/me', '/api%2Fme']) {
    const response = await app.inject({ url, headers: { accept: 'text/html' } });
    assert.equal(response.statusCode, 404, url);
    assert.match(response.headers['content-type'] as string, /application\/json/);
  }
});

test('Vercel /api POST routes retain origin checks, validation, signed sessions and logout', async (t) => {
  const origin = 'https://marketplace.example';
  const app = await buildServer((await createTestDatabase(t)).db, origin, Fastify, true);
  t.after(() => app.close());
  const post = (path: string, payload: object, cookie?: string) => app.inject({ method: 'POST', url: `/api${path}`, payload, headers: { origin, ...(cookie ? { cookie } : {}) } });
  for (const foreign of [undefined, 'null', ORIGIN, `${origin}.attacker.example`]) {
    const response = await app.inject({ method: 'POST', url: '/api/auth/challenge?probe=1', payload: {}, headers: foreign ? { origin: foreign } : {} });
    assert.equal(response.statusCode, 403);
    assert.equal(response.json().error.code, 'invalid_origin');
  }
  for (const [path, status, code] of [
    ['/auth/challenge?probe=1', 400, 'invalid_wallet'],
    ['/auth/verify', 400, 'invalid_request'],
    ['/wallets/link/challenge', 401, 'unauthenticated'],
    ['/wallets/link/verify', 401, 'unauthenticated'],
  ] as const) {
    const response = await post(path, {});
    assert.equal(response.statusCode, status, path);
    assert.equal(response.json().error.code, code);
  }
  const preflight = await app.inject({ method: 'OPTIONS', url: '/api/auth/challenge', headers: { origin, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' } });
  assert.equal(preflight.statusCode, 204);
  assert.equal(preflight.headers['access-control-allow-origin'], origin);
  const issued = await post('/auth/challenge?next=%2Fapi%2Fme', { ecosystem: 'evm', address: evmA.address });
  assert.equal(issued.statusCode, 200);
  const challenge = issued.json();
  const proof = { ecosystem: 'evm', address: evmA.address, challengeId: challenge.challengeId, signature: await evmA.signMessage({ message: challenge.message }) };
  const loggedIn = await post('/auth/verify', proof);
  assert.equal(loggedIn.statusCode, 200);
  const cookie = loggedIn.headers['set-cookie'] as string;
  for (const flag of [/; Secure/, /; HttpOnly/, /; SameSite=Lax/, /; Path=\//]) assert.match(cookie, flag);
  const me = await app.inject({ url: '/api/me?probe=1', headers: { cookie } });
  assert.equal(me.statusCode, 200);
  assert.equal(me.json().userId, loggedIn.json().userId);
  assert.equal((await post('/auth/verify', proof)).statusCode, 409);
  const forbiddenLogout = await app.inject({ method: 'POST', url: '/api/logout', headers: { cookie, origin: ORIGIN } });
  assert.equal(forbiddenLogout.statusCode, 403);
  assert.equal((await app.inject({ url: '/api/me', headers: { cookie } })).statusCode, 200);
  assert.equal((await post('/logout', {}, cookie)).statusCode, 200);
  assert.equal((await app.inject({ url: '/api/me', headers: { cookie } })).statusCode, 401);
  for (const url of ['/api', '/api/runtime-probe', '/api/api/auth/challenge']) {
    const response = await app.inject({ method: 'POST', url, payload: {}, headers: { origin } });
    assert.equal(response.statusCode, 404, url);
    assert.match(response.headers['content-type'] as string, /application\/json/);
  }
});

test('ordinary local API routes keep their unprefixed paths', async (t) => {
  const app = await buildServer((await createTestDatabase(t)).db, ORIGIN, Fastify, false);
  t.after(() => app.close());
  assert.equal((await app.inject({ url: '/me' })).statusCode, 401);
  assert.equal((await app.inject({ method: 'POST', url: '/auth/challenge', payload: {}, headers: { origin: ORIGIN } })).statusCode, 400);
  for (const url of ['/api/me', '/api/me?probe=1']) assert.equal((await app.inject({ url })).statusCode, 404);
  assert.equal((await app.inject({ method: 'POST', url: '/api/auth/challenge', payload: {}, headers: { origin: ORIGIN } })).statusCode, 404);
});

test('EVM login, exact challenge, replay and expiry', async (t) => {
  const db = (await createTestDatabase(t)).db;
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
    assert.doesNotMatch(cookie, /; Secure/);
    const me = await app.inject({ method: 'GET', url: '/me', headers: { cookie } });
    assert.equal(me.json().wallets[0].address, evmA.address.toLowerCase());
    const replay = await post('/auth/verify', { challengeId: issued.challengeId, ecosystem: 'evm', address: evmA.address, signature: await evmA.signMessage({ message: issued.message }) });
    assert.equal(replay.json().error.code, 'challenge_used');
    const expired = (await post('/auth/challenge', { ecosystem: 'evm', address: evmA.address })).json();
    await db.query('UPDATE auth_challenges SET expires_at = 0 WHERE id = $1', [expired.challengeId]);
    const expiredResponse = await post('/auth/verify', { challengeId: expired.challengeId, ecosystem: 'evm', address: evmA.address, signature: await evmA.signMessage({ message: expired.message }) });
    assert.equal(expiredResponse.json().error.code, 'challenge_expired');
    const logout = await app.inject({ method: 'POST', url: '/logout', headers: { origin: ORIGIN, cookie } });
    assert.equal(logout.statusCode, 200);
    assert.equal((await app.inject({ method: 'GET', url: '/me', headers: { cookie } })).statusCode, 401);
  } finally { await app.close(); }
});

test('session lookup survives a new API instance and rejects missing, invalid and expired sessions', async (t) => {
  const { db, connect } = await createTestDatabase(t);
  const first = await buildServer(db);
  const second = await buildServer(connect());
  const admin = connect();
  t.after(async () => { await Promise.all([first.close(), second.close(), admin.close()]); });
  const challenge = (await first.inject({ method: 'POST', url: '/auth/challenge', headers: { origin: ORIGIN }, payload: { ecosystem: 'evm', address: evmA.address } })).json();
  const verified = await first.inject({ method: 'POST', url: '/auth/verify', headers: { origin: ORIGIN }, payload: {
    ecosystem: 'evm', address: evmA.address, challengeId: challenge.challengeId, signature: await evmA.signMessage({ message: challenge.message }),
  } });
  assert.equal(verified.statusCode, 200);
  const cookie = verified.headers['set-cookie'] as string;
  await first.close();
  const restored = await second.inject({ url: '/me', headers: { cookie } });
  assert.equal(restored.statusCode, 200);
  assert.equal(restored.json().userId, verified.json().userId);
  assert.equal(restored.json().wallets[0].address, evmA.address.toLowerCase());
  await admin.query('UPDATE sessions SET expires_at = 0 WHERE user_id = $1', [verified.json().userId]);
  for (const value of [undefined, 'vehicle_session=invalid-session', cookie]) {
    const rejected = await second.inject({ url: '/me', headers: value ? { cookie: value } : {} });
    assert.equal(rejected.statusCode, 401);
    assert.match(rejected.headers['content-type'] as string, /application\/json/);
    assert.equal(rejected.json().error.code, 'unauthenticated');
    assert.equal(rejected.headers['cache-control'], 'no-store');
  }
});

test('HTTPS origin uses secure cookies and rejects other origins', async (t) => {
  const origin = 'https://marketplace.example';
  const app = await buildServer((await createTestDatabase(t)).db, origin);
  const post = (url: string, payload: object) => app.inject({ method: 'POST', url, headers: { origin }, payload });
  try {
    const forbidden = await app.inject({ method: 'POST', url: '/auth/challenge', headers: { origin: ORIGIN }, payload: { ecosystem: 'evm', address: evmA.address } });
    assert.equal(forbidden.statusCode, 403);
    assert.equal(forbidden.json().error.code, 'invalid_origin');
    const issued = (await post('/auth/challenge', { ecosystem: 'evm', address: evmA.address })).json();
    assert.ok(issued.message.includes(`Origin: ${origin}`));
    const verified = await post('/auth/verify', { challengeId: issued.challengeId, ecosystem: 'evm', address: evmA.address, signature: await evmA.signMessage({ message: issued.message }) });
    assert.equal(verified.statusCode, 200);
    const cookie = verified.headers['set-cookie'] as string;
    assert.match(cookie, /; Secure/);
    assert.match(cookie, /; HttpOnly/);
    assert.match(cookie, /; SameSite=Lax/);
    assert.match(cookie, /; Path=\//);
    assert.equal(verified.headers['access-control-allow-origin'], origin);
    assert.equal(verified.headers['access-control-allow-credentials'], 'true');
    assert.equal(verified.headers['cache-control'], 'no-store');
    assert.equal((await app.inject({ method: 'GET', url: '/me', headers: { cookie } })).statusCode, 200);
    const loggedOut = await app.inject({ method: 'POST', url: '/logout', headers: { origin, cookie } });
    assert.match(loggedOut.headers['set-cookie'] as string, /; Secure/);
    assert.equal((await app.inject({ method: 'GET', url: '/me', headers: { cookie } })).statusCode, 401);
  } finally { await app.close(); }
});

test('Preview and Production enforce exact origins, HTTPS cookies and session-bound wallet proofs', async (t) => {
  const { db, connect } = await createTestDatabase(t);
  const preview = readFrontendOrigin({ VERCEL: '1', VERCEL_ENV: 'preview', VERCEL_URL: 'vehicle-preview-123.vercel.app' });
  const production = readFrontendOrigin({ VERCEL: '1', VERCEL_ENV: 'production', FRONTEND_ORIGIN: 'https://marketplace.example' });
  const apps = [await buildServer(db, preview), await buildServer(connect(), production)];
  t.after(async () => { await Promise.all(apps.map((app) => app.close())); });
  for (const [index, origin] of [preview, production].entries()) {
    const app = apps[index];
    const post = (url: string, payload: object, cookie?: string) => app.inject({ method: 'POST', url, payload, headers: { origin, ...(cookie ? { cookie } : {}) } });
    for (const foreign of [undefined, 'null', 'http://localhost:5173', 'https://unrelated.vercel.app', 'https://vehicle-git-feature.vercel.app', `${origin}.attacker.example`, index === 0 ? production : preview]) {
      const rejected = await app.inject({ method: 'POST', url: '/auth/challenge', payload: { ecosystem: 'evm', address: evmA.address }, headers: { ...(foreign ? { origin: foreign } : {}), host: new URL(origin).host, 'x-forwarded-host': new URL(origin).host } });
      assert.equal(rejected.statusCode, 403);
      assert.equal(rejected.json().error.code, 'invalid_origin');
      assert.notEqual(rejected.headers['access-control-allow-origin'], '*');
    }
    const preflight = await app.inject({ method: 'OPTIONS', url: '/auth/challenge', headers: { origin, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' } });
    assert.equal(preflight.statusCode, 204);
    assert.equal(preflight.headers['access-control-allow-origin'], origin);
    assert.equal(preflight.headers['access-control-allow-credentials'], 'true');
    const challenge = (await post('/auth/challenge', { ecosystem: 'evm', address: evmA.address })).json();
    assert.ok(challenge.message.includes(`Origin: ${origin}\n`));
    const proof = { ecosystem: 'evm', address: evmA.address, challengeId: challenge.challengeId, signature: await evmA.signMessage({ message: challenge.message }) };
    // Even a shared Preview database cannot accept a proof issued for another origin.
    const crossed = await apps[1 - index].inject({ method: 'POST', url: '/auth/verify', payload: proof, headers: { origin: index === 0 ? production : preview } });
    assert.equal(crossed.statusCode, 400);
    assert.equal(crossed.json().error.code, 'invalid_challenge');
    const loggedIn = await post('/auth/verify', proof);
    assert.equal(loggedIn.statusCode, 200);
    const cookie = loggedIn.headers['set-cookie'] as string;
    for (const flag of [/; Secure/, /; HttpOnly/, /; SameSite=Lax/, /; Path=\//, /Max-Age=604800/]) assert.match(cookie, flag);
    assert.doesNotMatch(cookie, /; Domain=/i);
    assert.equal((await app.inject({ url: '/me', headers: { cookie } })).statusCode, 200);
    const link = (await post('/wallets/link/challenge', { ecosystem: 'evm', address: evmB.address, authorizer: { ecosystem: 'evm', address: evmA.address } }, cookie)).json();
    assert.ok(link.message.includes(`Origin: ${origin}\n`));
    assert.ok(link.authorizer.message.includes(`Origin: ${origin}\n`));
    const foreignLogout = await app.inject({ method: 'POST', url: '/logout', headers: { cookie, origin: 'https://unrelated.vercel.app' } });
    assert.equal(foreignLogout.statusCode, 403);
    assert.equal((await app.inject({ url: '/me', headers: { cookie } })).statusCode, 200);
    const loggedOut = await post('/logout', {}, cookie);
    assert.equal(loggedOut.statusCode, 200);
    assert.match(loggedOut.headers['set-cookie'] as string, /; Secure/);
    assert.doesNotMatch(loggedOut.headers['set-cookie'] as string, /; Domain=/i);
    assert.equal((await app.inject({ url: '/me', headers: { cookie } })).statusCode, 401);
  }
});

test('Solana login and invalid Ed25519 signature', async (t) => {
  const app = await buildServer((await createTestDatabase(t)).db);
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

test('linking requires session and proof; a wallet cannot belong to two users', async (t) => {
  const app = await buildServer((await createTestDatabase(t)).db);
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
    const challenge = (await post('/wallets/link/challenge', { ecosystem: 'solana', address, authorizer: { ecosystem: 'evm', address: evmA.address } }, cookieA)).json();
    const authorizerSignature = await evmA.signMessage({ message: challenge.authorizer.message });
    assert.match(challenge.message, /Purpose: link-wallet/);
    const invalid = await post('/wallets/link/verify', { challengeId: challenge.challengeId, ecosystem: 'solana', address, signature: Buffer.from(nacl.sign.detached(new TextEncoder().encode(challenge.message), solB.secretKey)).toString('base64'), authorizerSignature }, cookieA);
    assert.equal(invalid.json().error.code, 'invalid_signature');
    const signature = Buffer.from(nacl.sign.detached(new TextEncoder().encode(challenge.message), solA.secretKey)).toString('base64');
    assert.equal((await post('/wallets/link/verify', { challengeId: challenge.challengeId, ecosystem: 'solana', address, signature, authorizerSignature }, cookieA)).statusCode, 200);
    const meA = (await app.inject({ method: 'GET', url: '/me', headers: { cookie: cookieA } })).json();
    assert.equal(meA.wallets.length, 2);
    assert.equal(meA.userId, userA.json().userId);
    const userB = await login(evmB);
    const cookieB = userB.headers['set-cookie'] as string;
    const conflict = (await post('/wallets/link/challenge', { ecosystem: 'solana', address, authorizer: { ecosystem: 'evm', address: evmB.address } }, cookieB)).json();
    const response = await post('/wallets/link/verify', { challengeId: conflict.challengeId, ecosystem: 'solana', address, signature: Buffer.from(nacl.sign.detached(new TextEncoder().encode(conflict.message), solA.secretKey)).toString('base64'), authorizerSignature: await evmB.signMessage({ message: conflict.authorizer.message }) }, cookieB);
    assert.equal(response.json().error.code, 'wallet_owned');
    const noOrigin = await app.inject({ method: 'POST', url: '/auth/challenge', payload: { ecosystem: 'evm', address: evmA.address } });
    assert.equal(noOrigin.statusCode, 403);
  } finally { await app.close(); }
});

test('Solana login links an EVM wallet to the same application user', async (t) => {
  const app = await buildServer((await createTestDatabase(t)).db);
  const post = (url: string, payload: object, cookie?: string) => app.inject({ method: 'POST', url, headers: { origin: ORIGIN, ...(cookie ? { cookie } : {}) }, payload });
  try {
    const solanaAddress = solB.publicKey.toBase58();
    const loginChallenge = (await post('/auth/challenge', { ecosystem: 'solana', address: solanaAddress })).json();
    const solanaSignature = Buffer.from(nacl.sign.detached(new TextEncoder().encode(loginChallenge.message), solB.secretKey)).toString('base64');
    const login = await post('/auth/verify', { challengeId: loginChallenge.challengeId, ecosystem: 'solana', address: solanaAddress, signature: solanaSignature });
    assert.equal(login.statusCode, 200);
    const cookie = login.headers['set-cookie'] as string;
    const linkChallenge = (await post('/wallets/link/challenge', { ecosystem: 'evm', address: evmA.address, authorizer: { ecosystem: 'solana', address: solanaAddress } }, cookie)).json();
    const evmSignature = await evmA.signMessage({ message: linkChallenge.message });
    const link = await post('/wallets/link/verify', { challengeId: linkChallenge.challengeId, ecosystem: 'evm', address: evmA.address, signature: evmSignature, authorizerSignature: Buffer.from(nacl.sign.detached(new TextEncoder().encode(linkChallenge.authorizer.message), solB.secretKey)).toString('base64') }, cookie);
    assert.equal(link.statusCode, 200);
    const me = (await app.inject({ method: 'GET', url: '/me', headers: { cookie } })).json();
    assert.equal(me.userId, login.json().userId);
    assert.deepEqual(me.wallets.map((wallet: { ecosystem: string }) => wallet.ecosystem), ['evm', 'solana']);
  } finally { await app.close(); }
});

test('Sui login verifies exact personal message, rejects replay, and can link EVM', async (t) => {
  const app = await buildServer((await createTestDatabase(t)).db);
  const post = (url: string, payload: object, cookie?: string) => app.inject({ method: 'POST', url, headers: { origin: ORIGIN, ...(cookie ? { cookie } : {}) }, payload });
  const address = suiA.toSuiAddress();
  try {
    assert.equal((await post('/auth/challenge', { ecosystem: 'sui', address: 'not-sui' })).statusCode, 400);
    const challenge = (await post('/auth/challenge', { ecosystem: 'sui', address })).json();
    const wrong = await suiB.signPersonalMessage(new TextEncoder().encode(challenge.message));
    assert.equal((await post('/auth/verify', { challengeId: challenge.challengeId, ecosystem: 'sui', address, signature: wrong.signature })).json().error.code, 'invalid_signature');
    const signed = await suiA.signPersonalMessage(new TextEncoder().encode(challenge.message));
    const login = await post('/auth/verify', { challengeId: challenge.challengeId, ecosystem: 'sui', address, signature: signed.signature });
    assert.equal(login.statusCode, 200);
    assert.equal((await post('/auth/verify', { challengeId: challenge.challengeId, ecosystem: 'sui', address, signature: signed.signature })).json().error.code, 'challenge_used');
    const cookie = login.headers['set-cookie'] as string;
    const linkChallenge = (await post('/wallets/link/challenge', { ecosystem: 'evm', address: evmA.address, authorizer: { ecosystem: 'sui', address } }, cookie)).json();
    const link = await post('/wallets/link/verify', { challengeId: linkChallenge.challengeId, ecosystem: 'evm', address: evmA.address, signature: await evmA.signMessage({ message: linkChallenge.message }), authorizerSignature: (await suiA.signPersonalMessage(new TextEncoder().encode(linkChallenge.authorizer.message))).signature }, cookie);
    assert.equal(link.statusCode, 200);
    const me = (await app.inject({ method: 'GET', url: '/me', headers: { cookie } })).json();
    assert.equal(me.userId, login.json().userId);
    assert.deepEqual(me.wallets.map((wallet: { ecosystem: string }) => wallet.ecosystem), ['evm', 'sui']);
  } finally { await app.close(); }
});

test('EVM session links Sui once; another user cannot claim it', async (t) => {
  const app = await buildServer((await createTestDatabase(t)).db);
  const post = (url: string, payload: object, cookie?: string) => app.inject({ method: 'POST', url, headers: { origin: ORIGIN, ...(cookie ? { cookie } : {}) }, payload });
  async function login(account: typeof evmA) {
    const challenge = (await post('/auth/challenge', { ecosystem: 'evm', address: account.address })).json();
    return post('/auth/verify', { challengeId: challenge.challengeId, ecosystem: 'evm', address: account.address, signature: await account.signMessage({ message: challenge.message }) });
  }
  async function link(cookie: string, authorizer: typeof evmA) {
    const address = suiB.toSuiAddress();
    const challenge = (await post('/wallets/link/challenge', { ecosystem: 'sui', address, authorizer: { ecosystem: 'evm', address: authorizer.address } }, cookie)).json();
    const { signature } = await suiB.signPersonalMessage(new TextEncoder().encode(challenge.message));
    return post('/wallets/link/verify', { challengeId: challenge.challengeId, ecosystem: 'sui', address, signature, authorizerSignature: await authorizer.signMessage({ message: challenge.authorizer.message }) }, cookie);
  }
  try {
    const userA = await login(evmA);
    const cookieA = userA.headers['set-cookie'] as string;
    assert.equal((await link(cookieA, evmA)).statusCode, 200);
    const me = (await app.inject({ method: 'GET', url: '/me', headers: { cookie: cookieA } })).json();
    assert.equal(me.userId, userA.json().userId);
    assert.equal(me.wallets.find((wallet: { ecosystem: string }) => wallet.ecosystem === 'sui').address, suiB.toSuiAddress());
    const userB = await login(evmB);
    assert.equal((await link(userB.headers['set-cookie'] as string, evmB)).json().error.code, 'wallet_owned');
  } finally { await app.close(); }
});

test('Run 2 SQLite identity rows import into PostgreSQL without a reset', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'vehicle-auth-'));
  const path = join(directory, 'auth.sqlite');
  try {
    const old = new DatabaseSync(path);
    old.exec(`
      CREATE TABLE users (id TEXT PRIMARY KEY, created_at INTEGER NOT NULL);
      CREATE TABLE wallets (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), ecosystem TEXT NOT NULL CHECK(ecosystem IN ('evm','solana')), address TEXT NOT NULL, created_at INTEGER NOT NULL, verified_at INTEGER NOT NULL, UNIQUE(ecosystem,address));
      CREATE TABLE auth_challenges (id TEXT PRIMARY KEY, ecosystem TEXT NOT NULL, address TEXT NOT NULL, purpose TEXT NOT NULL CHECK(purpose IN ('login','link-wallet')), user_id TEXT REFERENCES users(id), message TEXT NOT NULL, expires_at INTEGER NOT NULL, consumed_at INTEGER);
      CREATE TABLE sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), token_hash TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL);
      INSERT INTO users VALUES ('u',1);
      INSERT INTO wallets VALUES ('w','u','evm','0xabc',1,1);
      INSERT INTO sessions VALUES ('s','u','hash',1,9999999999999);
    `);
    old.close();
    const { db: migrated } = await createTestDatabase(t);
    await importSQLite(migrated, path);
    assert.equal((await migrated.query('SELECT address FROM wallets WHERE id = $1', ['w'])).rows[0].address, '0xabc');
    assert.equal((await migrated.query('SELECT user_id FROM sessions WHERE id = $1', ['s'])).rows[0].user_id, 'u');
    await migrated.query("INSERT INTO wallets VALUES ('new','u','sui',$1,2,2)", [suiA.toSuiAddress()]);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
