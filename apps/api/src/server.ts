import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import { PublicKey } from '@solana/web3.js';
import nacl from 'tweetnacl';
import { getAddress, isAddress, verifyMessage } from 'viem';
import { isValidSuiAddress, normalizeSuiAddress } from '@mysten/sui/utils';
import { verifyPersonalMessageSignature } from '@mysten/sui/verify';
import { type Database, type Challenge, type Ecosystem, type Purpose, type WalletLinkRequest, type WalletRow } from './db.js';

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

async function verifyWalletSignature(ecosystem: Ecosystem, address: string, message: string, signature: string): Promise<boolean> {
  try {
    if (ecosystem === 'evm') return await verifyMessage({ address: address as `0x${string}`, message, signature: signature as `0x${string}` });
    if (ecosystem === 'sui') {
      await verifyPersonalMessageSignature(new TextEncoder().encode(message), signature, { address });
      return true;
    }
    const bytes = decodeSignature(signature);
    return Boolean(bytes && nacl.sign.detached.verify(new TextEncoder().encode(message), bytes, new PublicKey(address).toBytes()));
  } catch { return false; }
}

export async function buildServer(db: Database, frontendOrigin = 'http://localhost:5173', createApp: typeof Fastify = Fastify) {
  const secureCookie = new URL(frontendOrigin).protocol === 'https:';
  const app = createApp({ logger: false, bodyLimit: 16_384 });
  await app.register(cookie);
  await app.register(cors, { origin: frontendOrigin, credentials: true });

  app.addHook('onRequest', async (request, reply) => {
    if (request.method === 'POST' && request.headers.origin !== frontendOrigin) {
      return reply.code(403).send(error('invalid_origin', 'This request must come from the configured frontend origin.'));
    }
    reply.header('Cache-Control', 'no-store');
  });

  async function currentUser(token?: string, client: Pick<Database, 'query'> = db, lock = false) {
    if (!token) return null;
    const session = (await client.query<{ id: string; user_id: string; expires_at: number }>(
      `SELECT id, user_id, expires_at FROM sessions WHERE token_hash = $1${lock ? ' FOR UPDATE' : ''}`, [hash(token)],
    )).rows[0];
    return session && session.expires_at > Date.now() ? session : null;
  }

  async function issueChallenge(ecosystem: unknown, address: unknown, purpose: Purpose, userId: string | null, link?: { sessionId: string; authorizer: WalletRow }, client: Pick<Database, 'query'> = db) {
    if ((ecosystem !== 'evm' && ecosystem !== 'solana' && ecosystem !== 'sui') || typeof address !== 'string') return null;
    const normalized = normalizeAddress(ecosystem, address);
    if (!normalized) return null;
    const id = randomUUID();
    const now = Date.now();
    const expires = now + CHALLENGE_MS;
    const nonce = randomBytes(24).toString('hex');
    const binding = link ? [
      `Application User: ${userId}`,
      `Session: ${link.sessionId}`,
      `Trusted Wallet: ${link.authorizer.ecosystem} ${link.authorizer.address}`,
      `New Wallet: ${ecosystem} ${normalized}`,
      `Link Request: ${id}`,
    ] : [];
    const message = [
      link ? 'Vehicle Marketplace wallet linking' : 'Vehicle Marketplace local authentication',
      `Origin: ${frontendOrigin}`,
      `Ecosystem: ${ecosystem}`,
      `Address: ${normalized}`,
      `Purpose: ${purpose}`,
      ...binding,
      ...(link ? ['Proof: new-wallet-ownership', 'This wallet will become a login credential for the application user above.'] : []),
      `Nonce: ${nonce}`,
      `Issued At: ${new Date(now).toISOString()}`,
      `Expires At: ${new Date(expires).toISOString()}`,
    ].join('\n');
    await client.query('INSERT INTO auth_challenges (id, ecosystem, address, purpose, user_id, message, expires_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [id, ecosystem, normalized, purpose, userId, message, expires]);
    if (link) {
      const authorizationMessage = [
        'Vehicle Marketplace wallet linking',
        `Origin: ${frontendOrigin}`,
        `Ecosystem: ${link.authorizer.ecosystem}`,
        `Address: ${link.authorizer.address}`,
        'Purpose: link-wallet',
        ...binding,
        'Proof: authorize-new-login-wallet',
        'Approve adding exactly the New Wallet above as a login credential to your application account.',
        `Nonce: ${nonce}`,
        `Issued At: ${new Date(now).toISOString()}`,
        `Expires At: ${new Date(expires).toISOString()}`,
      ].join('\n');
      await client.query('INSERT INTO wallet_link_requests (challenge_id, session_id, authorizer_ecosystem, authorizer_address, authorization_message) VALUES ($1, $2, $3, $4, $5)',
        [id, link.sessionId, link.authorizer.ecosystem, link.authorizer.address, authorizationMessage]);
      return { challengeId: id, message, expiresAt: new Date(expires).toISOString(), authorizer: { ...link.authorizer, message: authorizationMessage } };
    }
    return { challengeId: id, message, expiresAt: new Date(expires).toISOString() };
  }

  async function verifyChallenge(challengeId: unknown, ecosystem: unknown, address: unknown, signature: unknown, purpose: Purpose, userId: string | null) {
    if (typeof challengeId !== 'string' || typeof signature !== 'string' || typeof address !== 'string' ||
      (ecosystem !== 'evm' && ecosystem !== 'solana' && ecosystem !== 'sui')) return { failure: error('invalid_request', 'Invalid verification request.'), status: 400 };
    const normalized = normalizeAddress(ecosystem, address);
    if (!normalized) return { failure: error('invalid_address', 'Invalid wallet address.'), status: 400 };
    const challenge = (await db.query<Challenge>('SELECT * FROM auth_challenges WHERE id = $1', [challengeId])).rows[0];
    if (!challenge || challenge.ecosystem !== ecosystem || challenge.address !== normalized || challenge.purpose !== purpose || challenge.user_id !== userId ||
      !challenge.message.split('\n').includes(`Origin: ${frontendOrigin}`))
      return { failure: error('invalid_challenge', 'Challenge does not match this wallet and request.'), status: 400 };
    if (challenge.consumed_at !== null) return { failure: error('challenge_used', 'This challenge has already been used.'), status: 409 };
    if (challenge.expires_at <= Date.now()) return { failure: error('challenge_expired', 'This challenge has expired.'), status: 410 };
    const valid = await verifyWalletSignature(ecosystem, normalized, challenge.message, signature);
    if (!valid) return { failure: error('invalid_signature', 'Wallet signature did not verify.'), status: 401 };
    return { challenge, normalized, ecosystem };
  }

  async function consumeChallenge(client: PoolClient, id: string) {
    const pending = (await client.query<Challenge>('SELECT * FROM auth_challenges WHERE id = $1 FOR UPDATE', [id])).rows[0];
    const now = Date.now(); // Evaluate expiry after any lock wait, not before it.
    if (!pending || pending.consumed_at !== null) throw new Error('challenge_used');
    if (pending.expires_at <= now) throw new Error('challenge_expired');
    await client.query('UPDATE auth_challenges SET consumed_at = $1 WHERE id = $2', [now, id]);
    return now;
  }

  app.post('/auth/challenge', async (request, reply) => {
    const body = request.body as { ecosystem?: unknown; address?: unknown } | null;
    const result = await issueChallenge(body?.ecosystem, body?.address, 'login', null);
    return result ?? reply.code(400).send(error('invalid_wallet', 'Provide a valid ecosystem and wallet address.'));
  });

  app.post('/auth/verify', async (request, reply) => {
    const body = request.body as { challengeId?: unknown; ecosystem?: unknown; address?: unknown; signature?: unknown } | null;
    const result = await verifyChallenge(body?.challengeId, body?.ecosystem, body?.address, body?.signature, 'login', null);
    if ('failure' in result) return reply.code(result.status ?? 400).send(result.failure);
    const { challenge, normalized, ecosystem } = result;
    const sessionToken = randomBytes(32).toString('base64url');
    let userId: string;
    try {
      userId = await db.transaction(async (client) => {
        const now = await consumeChallenge(client, challenge.id);
        const wallet = (await client.query<{ user_id: string }>('SELECT user_id FROM wallets WHERE ecosystem = $1 AND address = $2 FOR KEY SHARE', [ecosystem, normalized])).rows[0];
        let id = wallet?.user_id ?? randomUUID();
        if (!wallet) {
          await client.query('INSERT INTO users (id, created_at) VALUES ($1, $2)', [id, now]);
          const inserted = await client.query('INSERT INTO wallets (id, user_id, ecosystem, address, created_at, verified_at) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (ecosystem, address) DO NOTHING RETURNING user_id',
            [randomUUID(), id, ecosystem, normalized, now, now]);
          if (!inserted.rowCount) {
            // Another instance claimed this wallet while its login proof was verified.
            const existing = (await client.query<{ user_id: string }>('SELECT user_id FROM wallets WHERE ecosystem = $1 AND address = $2 FOR KEY SHARE', [ecosystem, normalized])).rows[0];
            if (!existing) throw new Error('Wallet ownership changed during login; retry with a fresh challenge.');
            await client.query('DELETE FROM users WHERE id = $1', [id]);
            id = existing.user_id;
          }
        }
        await client.query('INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at) VALUES ($1, $2, $3, $4, $5)',
          [randomUUID(), id, hash(sessionToken), now, now + SESSION_MS]);
        return id;
      });
    } catch (cause) {
      if (cause instanceof Error && cause.message === 'challenge_used') return reply.code(409).send(error('challenge_used', 'This challenge has already been used.'));
      if (cause instanceof Error && cause.message === 'challenge_expired') return reply.code(410).send(error('challenge_expired', 'This challenge has expired.'));
      throw cause;
    }
    reply.setCookie(COOKIE, sessionToken, { httpOnly: true, sameSite: 'lax', secure: secureCookie, path: '/', maxAge: SESSION_MS / 1000 });
    return { userId };
  });

  app.get('/me', async (request, reply) => {
    const user = await currentUser(request.cookies[COOKIE]);
    if (!user) return reply.code(401).send(error('unauthenticated', 'Log in with a wallet signature.'));
    const wallets = (await db.query<WalletRow>('SELECT ecosystem, address FROM wallets WHERE user_id = $1 ORDER BY ecosystem, created_at', [user.user_id])).rows;
    return { userId: user.user_id, wallets };
  });

  app.post('/wallets/link/challenge', async (request, reply) => {
    const user = await currentUser(request.cookies[COOKIE]);
    if (!user) return reply.code(401).send(error('unauthenticated', 'Log in before linking a wallet.'));
    const body = request.body as { ecosystem?: unknown; address?: unknown; authorizer?: { ecosystem?: unknown; address?: unknown } } | null;
    const authorizer = body?.authorizer;
    if (!authorizer || (authorizer.ecosystem !== 'evm' && authorizer.ecosystem !== 'solana' && authorizer.ecosystem !== 'sui') || typeof authorizer.address !== 'string')
      return reply.code(400).send(error('reauthentication_required', 'Choose an already-linked wallet to authorize this credential change.'));
    const address = normalizeAddress(authorizer.ecosystem, authorizer.address);
    if (!address || !(await db.query('SELECT id FROM wallets WHERE user_id = $1 AND ecosystem = $2 AND address = $3', [user.user_id, authorizer.ecosystem, address])).rowCount)
      return reply.code(403).send(error('untrusted_wallet', 'The approving wallet must already belong to this application user.'));
    const trusted: WalletRow = { ecosystem: authorizer.ecosystem, address };
    try {
      const result = await db.transaction(async (client) => {
        const liveSession = await currentUser(request.cookies[COOKIE], client, true);
        if (!liveSession || liveSession.id !== user.id) throw new Error('invalid_link_session');
        if (!(await client.query('SELECT id FROM wallets WHERE user_id = $1 AND ecosystem = $2 AND address = $3 FOR SHARE', [user.user_id, authorizer.ecosystem, address])).rowCount) throw new Error('untrusted_wallet');
        return issueChallenge(body?.ecosystem, body?.address, 'link-wallet', user.user_id, { sessionId: user.id, authorizer: trusted }, client);
      });
      return result ?? reply.code(400).send(error('invalid_wallet', 'Provide a valid ecosystem and wallet address.'));
    } catch (cause) {
      if (cause instanceof Error && cause.message === 'invalid_link_session') return reply.code(401).send(error('invalid_link_session', 'This session is no longer valid.'));
      if (cause instanceof Error && cause.message === 'untrusted_wallet') return reply.code(403).send(error('untrusted_wallet', 'The approving wallet must already belong to this application user.'));
      throw cause;
    }
  });

  app.post('/wallets/link/verify', async (request, reply) => {
    const user = await currentUser(request.cookies[COOKIE]);
    if (!user) return reply.code(401).send(error('unauthenticated', 'Log in before linking a wallet.'));
    const body = request.body as { challengeId?: unknown; ecosystem?: unknown; address?: unknown; signature?: unknown; authorizerSignature?: unknown } | null;
    if (typeof body?.challengeId !== 'string') return reply.code(400).send(error('invalid_request', 'Invalid verification request.'));
    const link = (await db.query<WalletLinkRequest>('SELECT * FROM wallet_link_requests WHERE challenge_id = $1', [body.challengeId])).rows[0];
    // Pre-H2 challenges and a new-wallet proof alone cannot authorize credential changes.
    if (!link || typeof body.authorizerSignature !== 'string') return reply.code(400).send(error('reauthentication_required', 'A fresh signature from an already-linked wallet is required.'));
    if (link.session_id !== user.id) return reply.code(403).send(error('invalid_link_session', 'This link request belongs to a different session. Start linking again.'));
    const result = await verifyChallenge(body?.challengeId, body?.ecosystem, body?.address, body?.signature, 'link-wallet', user.user_id);
    if ('failure' in result) return reply.code(result.status ?? 400).send(result.failure);
    if (!await verifyWalletSignature(link.authorizer_ecosystem, link.authorizer_address, link.authorization_message, body.authorizerSignature))
      return reply.code(401).send(error('invalid_reauthentication', 'The already-linked wallet did not authorize this link request.'));
    const { challenge, normalized, ecosystem } = result;
    try {
      await db.transaction(async (client) => {
        // Lock session/membership before consumption; logout/revocation cannot interleave.
        const liveSession = await currentUser(request.cookies[COOKIE], client, true);
        if (!liveSession || liveSession.id !== link.session_id || liveSession.user_id !== user.user_id) throw new Error('invalid_link_session');
        if (!(await client.query('SELECT id FROM wallets WHERE user_id = $1 AND ecosystem = $2 AND address = $3 FOR SHARE', [user.user_id, link.authorizer_ecosystem, link.authorizer_address])).rowCount) throw new Error('untrusted_wallet');
        const now = await consumeChallenge(client, challenge.id);
        await client.query('INSERT INTO wallets (id, user_id, ecosystem, address, created_at, verified_at) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (ecosystem, address) DO NOTHING',
          [randomUUID(), user.user_id, ecosystem, normalized, now, now]);
        const existing = (await client.query<{ user_id: string }>('SELECT user_id FROM wallets WHERE ecosystem = $1 AND address = $2 FOR KEY SHARE', [ecosystem, normalized])).rows[0];
        if (!existing || existing.user_id !== user.user_id) throw new Error('wallet_owned');
        if (liveSession.expires_at <= Date.now()) throw new Error('invalid_link_session');
        if (challenge.expires_at <= Date.now()) throw new Error('challenge_expired');
      });
    } catch (cause) {
      if (cause instanceof Error && cause.message === 'invalid_link_session') return reply.code(401).send(error('invalid_link_session', 'The session is no longer valid. Log in and start linking again.'));
      if (cause instanceof Error && cause.message === 'untrusted_wallet') return reply.code(403).send(error('untrusted_wallet', 'The approving wallet no longer belongs to this application user.'));
      if (cause instanceof Error && cause.message === 'challenge_expired') return reply.code(410).send(error('challenge_expired', 'This link request has expired. Start linking again.'));
      if (cause instanceof Error && cause.message === 'wallet_owned') return reply.code(409).send(error('wallet_owned', 'This wallet belongs to another application user.'));
      if (cause instanceof Error && cause.message === 'challenge_used') return reply.code(409).send(error('challenge_used', 'This challenge has already been used.'));
      throw cause;
    }
    return { userId: user.user_id, ecosystem, address: normalized };
  });

  app.post('/logout', async (request, reply) => {
    const token = request.cookies[COOKIE];
    if (token) await db.query('DELETE FROM sessions WHERE token_hash = $1', [hash(token)]);
    reply.clearCookie(COOKIE, { httpOnly: true, sameSite: 'lax', secure: secureCookie, path: '/' });
    return { ok: true };
  });

  app.addHook('onClose', async () => db.close());
  return app;
}
