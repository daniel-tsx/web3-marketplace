import assert from 'node:assert/strict';
import { test } from 'node:test';
import { privateKeyToAccount } from 'viem/accounts';
import { Keypair } from '@solana/web3.js';
import nacl from 'tweetnacl';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Secp256k1Keypair } from '@mysten/sui/keypairs/secp256k1';
import type { Ecosystem } from './db.js';
import { openDatabase } from './db.js';
import { buildServer } from './server.js';

const ORIGIN = 'http://localhost:5173';
const owner = privateKeyToAccount('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
const attacker = privateKeyToAccount('0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');

test('a stolen session plus only the new wallet proof cannot create a login credential', async () => {
  const db = openDatabase(':memory:');
  const app = await buildServer(db);
  const post = (url: string, payload: object, cookie?: string) => app.inject({ method: 'POST', url, headers: { origin: ORIGIN, ...(cookie ? { cookie } : {}) }, payload });
  try {
    const login = (await post('/auth/challenge', { ecosystem: 'evm', address: owner.address })).json();
    const session = await post('/auth/verify', { challengeId: login.challengeId, ecosystem: 'evm', address: owner.address, signature: await owner.signMessage({ message: login.message }) });
    const stolenCookie = session.headers['set-cookie'] as string;
    const issued = await post('/wallets/link/challenge', { ecosystem: 'evm', address: attacker.address }, stolenCookie);
    if (issued.statusCode === 200) {
      const challenge = issued.json();
      const linked = await post('/wallets/link/verify', { challengeId: challenge.challengeId, ecosystem: 'evm', address: attacker.address, signature: await attacker.signMessage({ message: challenge.message }) }, stolenCookie);
      assert.notEqual(linked.statusCode, 200, 'Session theft must not permit linking a new login wallet.');
    } else {
      assert.equal(issued.statusCode, 400);
      assert.equal(issued.json().error.code, 'reauthentication_required');
    }
    const challenge = (await post('/wallets/link/challenge', { ecosystem: 'evm', address: attacker.address, authorizer: { ecosystem: 'evm', address: owner.address } }, stolenCookie)).json();
    const proof = { challengeId: challenge.challengeId, ecosystem: 'evm', address: attacker.address, signature: await attacker.signMessage({ message: challenge.message }) };
    assert.equal((await post('/wallets/link/verify', proof, stolenCookie)).json().error.code, 'reauthentication_required');
    const forged = await post('/wallets/link/verify', { ...proof, authorizerSignature: await attacker.signMessage({ message: challenge.authorizer.message }) }, stolenCookie);
    assert.equal(forged.statusCode, 401);
    assert.equal(forged.json().error.code, 'invalid_reauthentication');
    assert.equal(db.prepare('SELECT id FROM wallets WHERE address = ?').get(attacker.address.toLowerCase()), undefined);
  } finally { await app.close(); }
});

interface SigningWallet { ecosystem: Ecosystem; address: string; sign: (message: string) => Promise<string>; }
interface LinkChallenge { challengeId: string; message: string; expiresAt: string; authorizer: { ecosystem: Ecosystem; address: string; message: string }; }

function signingWallet(ecosystem: Ecosystem, secp = false): SigningWallet {
  if (ecosystem === 'evm') {
    const account = privateKeyToAccount(`0x${Buffer.from(nacl.randomBytes(32)).toString('hex')}`);
    return { ecosystem, address: account.address, sign: (message) => account.signMessage({ message }) };
  }
  if (ecosystem === 'solana') {
    const account = Keypair.generate();
    return { ecosystem, address: account.publicKey.toBase58(), sign: async (message) => Buffer.from(nacl.sign.detached(new TextEncoder().encode(message), account.secretKey)).toString('base64') };
  }
  const account = secp ? new Secp256k1Keypair() : new Ed25519Keypair();
  return { ecosystem, address: account.toSuiAddress(), sign: async (message) => (await account.signPersonalMessage(new TextEncoder().encode(message))).signature };
}

async function fixture() {
  const db = openDatabase(':memory:');
  const app = await buildServer(db);
  const post = (url: string, payload: object, cookie?: string) => app.inject({ method: 'POST', url, headers: { origin: ORIGIN, ...(cookie ? { cookie } : {}) }, payload });
  async function login(wallet: SigningWallet) {
    const challenge = (await post('/auth/challenge', wallet)).json();
    const response = await post('/auth/verify', { ...wallet, challengeId: challenge.challengeId, signature: await wallet.sign(challenge.message) });
    assert.equal(response.statusCode, 200);
    return { cookie: response.headers['set-cookie'] as string, userId: response.json().userId as string };
  }
  async function issue(cookie: string, trusted: SigningWallet, target: SigningWallet): Promise<LinkChallenge> {
    const response = await post('/wallets/link/challenge', { ecosystem: target.ecosystem, address: target.address, authorizer: { ecosystem: trusted.ecosystem, address: trusted.address } }, cookie);
    assert.equal(response.statusCode, 200);
    return response.json();
  }
  async function proofs(challenge: LinkChallenge, trusted: SigningWallet, target: SigningWallet) {
    return { challengeId: challenge.challengeId, ecosystem: target.ecosystem, address: target.address, signature: await target.sign(challenge.message), authorizerSignature: await trusted.sign(challenge.authorizer.message) };
  }
  return { db, app, post, login, issue, proofs };
}

test('fresh trusted and new wallet proofs authorize every ecosystem pairing', async (t) => {
  for (const source of ['evm', 'solana', 'sui'] as const) for (const destination of ['evm', 'solana', 'sui'] as const) {
    await t.test(`${source} authorizes a new ${destination} login wallet`, async () => {
      const f = await fixture();
      try {
        const trusted = signingWallet(source);
        const target = signingWallet(destination, true);
        const session = await f.login(trusted);
        const challenge = await f.issue(session.cookie, trusted, target);
        for (const message of [challenge.message, challenge.authorizer.message]) {
          assert.ok(message.includes(`Application User: ${session.userId}`));
          assert.match(message, /Session: [0-9a-f-]{36}/);
          assert.ok(message.includes(`Origin: ${ORIGIN}`));
          assert.ok(message.includes(`Trusted Wallet: ${trusted.ecosystem} ${challenge.authorizer.address}`));
          assert.ok(message.includes(`New Wallet: ${target.ecosystem} ${target.ecosystem === 'evm' ? target.address.toLowerCase() : target.address}`));
          assert.match(message, /Purpose: link-wallet\n/);
          assert.match(message, /Nonce: [0-9a-f]{48}\nIssued At: .+\nExpires At: /);
          assert.ok(message.includes(`Link Request: ${challenge.challengeId}`));
        }
        assert.notEqual(challenge.message, challenge.authorizer.message);
        const result = await f.post('/wallets/link/verify', await f.proofs(challenge, trusted, target), session.cookie);
        assert.equal(result.statusCode, 200);
        assert.equal(result.json().userId, session.userId);
        assert.equal((await f.app.inject({ url: '/me', headers: { cookie: session.cookie } })).json().wallets.length, 2);
        assert.equal((await f.login(target)).userId, session.userId, 'Only the authorized new wallet becomes a credential for this user.');
      } finally { await f.app.close(); }
    });
  }
});

test('an approval for target A cannot authorize target B or a different request', async () => {
  const f = await fixture();
  try {
    const trusted = signingWallet('evm');
    const targetA = signingWallet('solana');
    const targetB = signingWallet('sui');
    const session = await f.login(trusted);
    const a = await f.issue(session.cookie, trusted, targetA);
    const b = await f.issue(session.cookie, trusted, targetB);
    const proofA = await f.proofs(a, trusted, targetA);
    const proofB = await f.proofs(b, trusted, targetB);
    assert.equal((await f.post('/wallets/link/verify', { ...proofB, authorizerSignature: proofA.authorizerSignature }, session.cookie)).json().error.code, 'invalid_reauthentication');
    assert.equal((await f.post('/wallets/link/verify', { ...proofB, challengeId: a.challengeId }, session.cookie)).json().error.code, 'invalid_challenge');
    assert.equal((await f.app.inject({ url: '/me', headers: { cookie: session.cookie } })).json().wallets.length, 1);
    assert.equal((await f.post('/wallets/link/verify', proofA, session.cookie)).statusCode, 200);
  } finally { await f.app.close(); }
});

test('login, wrong-origin, and wrong-role signatures cannot serve as link approval', async () => {
  const f = await fixture();
  try {
    const trusted = signingWallet('sui');
    const target = signingWallet('sui', true);
    const session = await f.login(trusted);
    const challenge = await f.issue(session.cookie, trusted, target);
    const proof = await f.proofs(challenge, trusted, target);
    const login = (await f.post('/auth/challenge', trusted)).json();
    for (const message of [login.message, challenge.authorizer.message.replace(ORIGIN, 'https://another.example'), challenge.message]) {
      const response = await f.post('/wallets/link/verify', { ...proof, authorizerSignature: await trusted.sign(message) }, session.cookie);
      assert.equal(response.json().error.code, 'invalid_reauthentication');
    }
    const targetWrongRole = await f.post('/wallets/link/verify', { ...proof, signature: await target.sign(challenge.authorizer.message) }, session.cookie);
    assert.equal(targetWrongRole.json().error.code, 'invalid_signature');
    assert.equal((await f.post('/auth/verify', proof)).json().error.code, 'invalid_challenge');
    assert.equal((await f.post('/wallets/link/verify', proof, session.cookie)).statusCode, 200);
  } finally { await f.app.close(); }
});

test('expired and replayed approvals are rejected for all trusted-wallet ecosystems', async (t) => {
  for (const ecosystem of ['evm', 'solana', 'sui'] as const) await t.test(ecosystem, async () => {
    const f = await fixture();
    try {
      const trusted = signingWallet(ecosystem);
      const target = signingWallet('evm');
      const session = await f.login(trusted);
      const expired = await f.issue(session.cookie, trusted, target);
      const expiredProof = await f.proofs(expired, trusted, target);
      f.db.prepare('UPDATE auth_challenges SET expires_at = 0 WHERE id = ?').run(expired.challengeId);
      assert.equal((await f.post('/wallets/link/verify', expiredProof, session.cookie)).json().error.code, 'challenge_expired');
      const fresh = await f.issue(session.cookie, trusted, target);
      const freshProof = await f.proofs(fresh, trusted, target);
      assert.equal((await f.post('/wallets/link/verify', freshProof, session.cookie)).statusCode, 200);
      assert.equal((await f.post('/wallets/link/verify', freshProof, session.cookie)).json().error.code, 'challenge_used');
      const nextTarget = signingWallet('solana');
      const next = await f.issue(session.cookie, trusted, nextTarget);
      assert.equal((await f.post('/wallets/link/verify', { ...await f.proofs(next, trusted, nextTarget), authorizerSignature: freshProof.authorizerSignature }, session.cookie)).json().error.code, 'invalid_reauthentication');
    } finally { await f.app.close(); }
  });
});

test('the approver must belong to this user, and the originating session must remain live', async () => {
  const f = await fixture();
  try {
    const trusted = signingWallet('solana');
    const other = signingWallet('evm');
    const target = signingWallet('sui');
    const session = await f.login(trusted);
    const otherSession = await f.login(other);
    assert.equal((await f.post('/wallets/link/challenge', { ...target, authorizer: other }, session.cookie)).json().error.code, 'untrusted_wallet');
    const request = await f.issue(session.cookie, trusted, target);
    const proof = await f.proofs(request, trusted, target);
    assert.equal((await f.post('/wallets/link/verify', proof, otherSession.cookie)).json().error.code, 'invalid_link_session');
    const anotherSessionForSameUser = await f.login(trusted);
    assert.equal((await f.post('/wallets/link/verify', proof, anotherSessionForSameUser.cookie)).json().error.code, 'invalid_link_session');
    await f.post('/logout', {}, session.cookie);
    assert.equal((await f.post('/wallets/link/verify', proof, session.cookie)).statusCode, 401);
    assert.equal((await f.post('/wallets/link/verify', proof, anotherSessionForSameUser.cookie)).json().error.code, 'reauthentication_required');
  } finally { await f.app.close(); }
});

test('session, trusted-wallet membership and expiry are rechecked at commit time', async (t) => {
  for (const condition of ['session', 'trusted wallet', 'challenge expiry'] as const) await t.test(condition, async (t) => {
    const f = await fixture();
    try {
      const trusted = signingWallet('evm');
      const target = signingWallet('solana');
      const session = await f.login(trusted);
      const challenge = await f.issue(session.cookie, trusted, target);
      const proof = await f.proofs(challenge, trusted, target);
      const exec = f.db.exec.bind(f.db);
      // Deterministically change real DB state after cryptographic verification, at the commit boundary.
      t.mock.method(f.db, 'exec', (sql: string) => {
        if (sql === 'BEGIN IMMEDIATE') {
          if (condition === 'session') f.db.prepare('UPDATE sessions SET expires_at = 0').run();
          if (condition === 'trusted wallet') f.db.prepare('DELETE FROM wallets WHERE user_id = ?').run(session.userId);
          if (condition === 'challenge expiry') f.db.prepare('UPDATE auth_challenges SET expires_at = 0 WHERE id = ?').run(challenge.challengeId);
        }
        exec(sql);
      });
      const result = await f.post('/wallets/link/verify', proof, session.cookie);
      assert.equal(result.json().error.code, condition === 'session' ? 'invalid_link_session' : condition === 'trusted wallet' ? 'untrusted_wallet' : 'challenge_expired');
      assert.equal(f.db.prepare('SELECT id FROM wallets WHERE address = ?').get(target.address), undefined);
      assert.equal((f.db.prepare('SELECT consumed_at FROM auth_challenges WHERE id = ?').get(challenge.challengeId) as { consumed_at: number | null }).consumed_at, null);
    } finally { await f.app.close(); }
  });
});

test('concurrent verification consumes approval once; retries never duplicate credentials', async () => {
  const f = await fixture();
  try {
    const trusted = signingWallet('evm');
    const target = signingWallet('sui', true);
    const session = await f.login(trusted);
    const challenge = await f.issue(session.cookie, trusted, target);
    const proof = await f.proofs(challenge, trusted, target);
    const responses = await Promise.all([f.post('/wallets/link/verify', proof, session.cookie), f.post('/wallets/link/verify', proof, session.cookie)]);
    assert.deepEqual(responses.map((response) => response.statusCode).sort(), [200, 409]);
    assert.equal(responses.find((response) => response.statusCode === 409)!.json().error.code, 'challenge_used');
    const again = await f.issue(session.cookie, trusted, target);
    assert.equal((await f.post('/wallets/link/verify', await f.proofs(again, trusted, target), session.cookie)).statusCode, 200);
    assert.equal((f.db.prepare('SELECT count(*) AS count FROM wallets WHERE user_id = ?').get(session.userId) as { count: number }).count, 2);
  } finally { await f.app.close(); }
});

test('wallet ownership conflicts roll back approval consumption and legacy links fail closed', async () => {
  const f = await fixture();
  try {
    const trusted = signingWallet('solana');
    const target = signingWallet('evm');
    const session = await f.login(trusted);
    const other = await f.login(target);
    const challenge = await f.issue(session.cookie, trusted, target);
    const result = await f.post('/wallets/link/verify', await f.proofs(challenge, trusted, target), session.cookie);
    assert.equal(result.json().error.code, 'wallet_owned');
    assert.equal((f.db.prepare('SELECT consumed_at FROM auth_challenges WHERE id = ?').get(challenge.challengeId) as { consumed_at: number | null }).consumed_at, null);
    assert.equal((await f.login(target)).userId, other.userId);
    f.db.prepare('DELETE FROM wallet_link_requests WHERE challenge_id = ?').run(challenge.challengeId);
    assert.equal((await f.post('/wallets/link/verify', await f.proofs(challenge, trusted, target), session.cookie)).json().error.code, 'reauthentication_required');
  } finally { await f.app.close(); }
});
