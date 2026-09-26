import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import { PublicKey } from '@solana/web3.js';
import nacl from 'tweetnacl';
import { getAddress, isAddress, verifyMessage } from 'viem';
import { isValidSuiAddress, normalizeSuiAddress } from '@mysten/sui/utils';
import { verifyPersonalMessageSignature } from '@mysten/sui/verify';
import { type Challenge, type Ecosystem, type Purpose, type WalletRow } from './db.js';

const CHALLENGE_MS = 5 * 60_000;
const SESSION_MS = 7 * 24 * 60 * 60_000;
const COOKIE = 'vehicle_session';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const error = (code: string, message: string) => ({ error: { code, message } });

function normalizeAddress(ecosystem: Ecosystem, address: string): string | null {
  if (ecosystem === 'evm') return isAddress(address) ? getAddress(address).toLowerCase() : null;
  if (ecosystem === 'sui') return isValidSuiAddress(address) ? normalizeSuiAddress(address) : null;
  try { return new PublicKey(address).toBase58(); } catch { return null; }
}

function decodeSignature(signature: string): Uint8Array | null {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(signature)) return null;
  const bytes = Buffer.from(signature, 'base64');
  return bytes.length === 64 && bytes.toString('base64') === signature ? bytes : null;
}

export async function buildServer(db: DatabaseSync, frontendOrigin = 'http://localhost:5173') {
  const app = Fastify({ logger: false, bodyLimit: 16_384 });
  await app.register(cookie);
  await app.register(cors, { origin: frontendOrigin, credentials: true });

  app.addHook('onRequest', async (request, reply) => {
    if (request.method === 'POST' && request.headers.origin !== frontendOrigin) {
      return reply.code(403).send(error('invalid_origin', 'This request must come from the configured frontend origin.'));
    }
    reply.header('Cache-Control', 'no-store');
  });

  function currentUser(token?: string) {
    if (!token) return null;
    return db.prepare('SELECT user_id FROM sessions WHERE token_hash = ? AND expires_at > ?')
      .get(hash(token), Date.now()) as { user_id: string } | undefined ?? null;
  }

  function issueChallenge(ecosystem: unknown, address: unknown, purpose: Purpose, userId: string | null) {
    if ((ecosystem !== 'evm' && ecosystem !== 'solana' && ecosystem !== 'sui') || typeof address !== 'string') return null;
    const normalized = normalizeAddress(ecosystem, address);
    if (!normalized) return null;
    const id = randomUUID();
    const now = Date.now();
    const expires = now + CHALLENGE_MS;
    const message = [
      'Vehicle Marketplace local authentication',
      `Origin: ${frontendOrigin}`,
      `Ecosystem: ${ecosystem}`,
      `Address: ${normalized}`,
      `Purpose: ${purpose}`,
      `Nonce: ${randomBytes(24).toString('hex')}`,
      `Issued At: ${new Date(now).toISOString()}`,
      `Expires At: ${new Date(expires).toISOString()}`,
    ].join('\n');
    db.prepare('INSERT INTO auth_challenges (id, ecosystem, address, purpose, user_id, message, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, ecosystem, normalized, purpose, userId, message, expires);
    return { challengeId: id, message, expiresAt: new Date(expires).toISOString() };
  }

  async function verifyChallenge(challengeId: unknown, ecosystem: unknown, address: unknown, signature: unknown, purpose: Purpose, userId: string | null) {
    if (typeof challengeId !== 'string' || typeof signature !== 'string' || typeof address !== 'string' ||
      (ecosystem !== 'evm' && ecosystem !== 'solana' && ecosystem !== 'sui')) return { failure: error('invalid_request', 'Invalid verification request.'), status: 400 };
    const normalized = normalizeAddress(ecosystem, address);
    if (!normalized) return { failure: error('invalid_address', 'Invalid wallet address.'), status: 400 };
    const challenge = db.prepare('SELECT * FROM auth_challenges WHERE id = ?').get(challengeId) as Challenge | undefined;
    if (!challenge || challenge.ecosystem !== ecosystem || challenge.address !== normalized || challenge.purpose !== purpose || challenge.user_id !== userId)
      return { failure: error('invalid_challenge', 'Challenge does not match this wallet and request.'), status: 400 };
    if (challenge.consumed_at !== null) return { failure: error('challenge_used', 'This challenge has already been used.'), status: 409 };
    if (challenge.expires_at <= Date.now()) return { failure: error('challenge_expired', 'This challenge has expired.'), status: 410 };
    let valid = false;
    try {
      if (ecosystem === 'evm') {
        valid = await verifyMessage({ address: normalized as `0x${string}`, message: challenge.message, signature: signature as `0x${string}` });
      } else if (ecosystem === 'sui') {
        await verifyPersonalMessageSignature(new TextEncoder().encode(challenge.message), signature, { address: normalized });
        valid = true;
      } else {
        const bytes = decodeSignature(signature);
        valid = Boolean(bytes && nacl.sign.detached.verify(new TextEncoder().encode(challenge.message), bytes, new PublicKey(normalized).toBytes()));
      }
    } catch { valid = false; }
    if (!valid) return { failure: error('invalid_signature', 'Wallet signature did not verify.'), status: 401 };
    return { challenge, normalized, ecosystem };
  }

  app.post('/auth/challenge', async (request, reply) => {
    const body = request.body as { ecosystem?: unknown; address?: unknown } | null;
    const result = issueChallenge(body?.ecosystem, body?.address, 'login', null);
    return result ?? reply.code(400).send(error('invalid_wallet', 'Provide a valid ecosystem and wallet address.'));
  });

  app.post('/auth/verify', async (request, reply) => {
    const body = request.body as { challengeId?: unknown; ecosystem?: unknown; address?: unknown; signature?: unknown } | null;
    const result = await verifyChallenge(body?.challengeId, body?.ecosystem, body?.address, body?.signature, 'login', null);
    if ('failure' in result) return reply.code(result.status ?? 400).send(result.failure);
    const { challenge, normalized, ecosystem } = result;
    const now = Date.now();
    const sessionToken = randomBytes(32).toString('base64url');
    let userId: string;
    try {
      db.exec('BEGIN IMMEDIATE');
      const consumed = db.prepare('UPDATE auth_challenges SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL AND expires_at > ?').run(now, challenge.id, now);
      if (consumed.changes !== 1) throw new Error('challenge_used');
      const wallet = db.prepare('SELECT user_id FROM wallets WHERE ecosystem = ? AND address = ?').get(ecosystem, normalized) as { user_id: string } | undefined;
      userId = wallet?.user_id ?? randomUUID();
      if (!wallet) {
        db.prepare('INSERT INTO users (id, created_at) VALUES (?, ?)').run(userId, now);
        db.prepare('INSERT INTO wallets (id, user_id, ecosystem, address, created_at, verified_at) VALUES (?, ?, ?, ?, ?, ?)')
          .run(randomUUID(), userId, ecosystem, normalized, now, now);
      }
      db.prepare('INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)')
        .run(randomUUID(), userId, hash(sessionToken), now, now + SESSION_MS);
      db.exec('COMMIT');
    } catch (cause) {
      db.exec('ROLLBACK');
      if (cause instanceof Error && cause.message === 'challenge_used') return reply.code(409).send(error('challenge_used', 'This challenge has already been used.'));
      throw cause;
    }
    reply.setCookie(COOKIE, sessionToken, { httpOnly: true, sameSite: 'lax', secure: false, path: '/', maxAge: SESSION_MS / 1000 });
    return { userId };
  });

  app.get('/me', async (request, reply) => {
    const user = currentUser(request.cookies[COOKIE]);
    if (!user) return reply.code(401).send(error('unauthenticated', 'Log in with a wallet signature.'));
    const wallets = db.prepare('SELECT ecosystem, address FROM wallets WHERE user_id = ? ORDER BY ecosystem, created_at').all(user.user_id) as unknown as WalletRow[];
    return { userId: user.user_id, wallets };
  });

  app.post('/wallets/link/challenge', async (request, reply) => {
    const user = currentUser(request.cookies[COOKIE]);
    if (!user) return reply.code(401).send(error('unauthenticated', 'Log in before linking a wallet.'));
    const body = request.body as { ecosystem?: unknown; address?: unknown } | null;
    const result = issueChallenge(body?.ecosystem, body?.address, 'link-wallet', user.user_id);
    return result ?? reply.code(400).send(error('invalid_wallet', 'Provide a valid ecosystem and wallet address.'));
  });

  app.post('/wallets/link/verify', async (request, reply) => {
    const user = currentUser(request.cookies[COOKIE]);
    if (!user) return reply.code(401).send(error('unauthenticated', 'Log in before linking a wallet.'));
    const body = request.body as { challengeId?: unknown; ecosystem?: unknown; address?: unknown; signature?: unknown } | null;
    const result = await verifyChallenge(body?.challengeId, body?.ecosystem, body?.address, body?.signature, 'link-wallet', user.user_id);
    if ('failure' in result) return reply.code(result.status ?? 400).send(result.failure);
    const { challenge, normalized, ecosystem } = result;
    const now = Date.now();
    try {
      db.exec('BEGIN IMMEDIATE');
      const consumed = db.prepare('UPDATE auth_challenges SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL AND expires_at > ?').run(now, challenge.id, now);
      if (consumed.changes !== 1) throw new Error('challenge_used');
      const existing = db.prepare('SELECT user_id FROM wallets WHERE ecosystem = ? AND address = ?').get(ecosystem, normalized) as { user_id: string } | undefined;
      if (existing && existing.user_id !== user.user_id) throw new Error('wallet_owned');
      if (!existing) db.prepare('INSERT INTO wallets (id, user_id, ecosystem, address, created_at, verified_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(randomUUID(), user.user_id, ecosystem, normalized, now, now);
      db.exec('COMMIT');
    } catch (cause) {
      db.exec('ROLLBACK');
      if (cause instanceof Error && cause.message === 'wallet_owned') return reply.code(409).send(error('wallet_owned', 'This wallet belongs to another application user.'));
      if (cause instanceof Error && cause.message === 'challenge_used') return reply.code(409).send(error('challenge_used', 'This challenge has already been used.'));
      throw cause;
    }
    return { userId: user.user_id, ecosystem, address: normalized };
  });

  app.post('/logout', async (request, reply) => {
    const token = request.cookies[COOKIE];
    if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hash(token));
    reply.clearCookie(COOKIE, { path: '/' });
    return { ok: true };
  });

  app.addHook('onClose', async () => db.close());
  return app;
}
