import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { createHash, randomBytes } from 'node:crypto';
import type { PoolClient, QueryResult } from 'pg';
import { privateKeyToAccount } from 'viem/accounts';
import { buildServer } from './server.js';
import { createTestDatabase } from './test-db.js';

const ORIGIN = 'http://localhost:5173';
const wallet = () => privateKeyToAccount(`0x${randomBytes(32).toString('hex')}`);

async function fixture(t: TestContext) {
  const { db, connect } = await createTestDatabase(t);
  const other = connect();
  const apps = [await buildServer(db), await buildServer(other)];
  t.after(async () => { await Promise.all(apps.map((app) => app.close())); });
  const post = (index: number, url: string, payload: object, cookie?: string) => apps[index].inject({ method: 'POST', url, payload, headers: { origin: ORIGIN, ...(cookie ? { cookie } : {}) } });
  async function loginProof(index: number, account: ReturnType<typeof wallet>) {
    const issued = (await post(index, '/auth/challenge', { ecosystem: 'evm', address: account.address })).json();
    return { ecosystem: 'evm', address: account.address, challengeId: issued.challengeId, signature: await account.signMessage({ message: issued.message }) };
  }
  return { db, databases: [db, other], apps, post, loginProof, connect };
}

test('independent API instances consume a login challenge once', async (t) => {
  const f = await fixture(t);
  const proof = await f.loginProof(0, wallet());
  const responses = await Promise.all([f.post(0, '/auth/verify', proof), f.post(1, '/auth/verify', proof)]);
  assert.deepEqual(responses.map((r) => r.statusCode).sort(), [200, 409]);
  assert.equal(responses.find((r) => r.statusCode === 409)!.json().error.code, 'challenge_used');
  for (const table of ['users', 'wallets', 'sessions']) assert.equal((await f.db.query(`SELECT count(*) AS count FROM ${table}`)).rows[0].count, 1);
});

test('concurrent distinct login challenges for one wallet create one durable identity', async (t) => {
  const f = await fixture(t);
  const account = wallet();
  const proofs = await Promise.all([f.loginProof(0, account), f.loginProof(1, account)]);
  // Hold both transactions after their empty lookup to exercise the unique-conflict path.
  let arrivals = 0;
  let release!: () => void;
  const barrier = new Promise<void>((resolve) => { release = resolve; });
  for (const database of f.databases) {
    const transaction = database.transaction.bind(database);
    t.mock.method(database, 'transaction', async (work: (client: PoolClient) => Promise<unknown>) => transaction(async (client) => {
      const query = client.query;
      const runQuery = query.bind(client) as (sql: string, values?: unknown[]) => Promise<QueryResult>;
      client.query = (async (sql: string, values?: unknown[]) => {
        const result = await runQuery(sql, values);
        if (sql === 'SELECT user_id FROM wallets WHERE ecosystem = $1 AND address = $2 FOR KEY SHARE' && result.rowCount === 0) {
          if (++arrivals === 2) release();
          await barrier;
        }
        return result;
      }) as typeof query;
      try { return await work(client); } finally { client.query = query; }
    }));
  }
  const responses = await Promise.all(proofs.map((proof, i) => f.post(i, '/auth/verify', proof)));
  assert.equal(arrivals, 2);
  assert.deepEqual(responses.map((r) => r.statusCode), [200, 200]);
  assert.equal(responses[0].json().userId, responses[1].json().userId);
  assert.equal((await f.db.query('SELECT count(*) AS count FROM users')).rows[0].count, 1);
  assert.equal((await f.db.query('SELECT count(*) AS count FROM wallets')).rows[0].count, 1);
  assert.equal((await f.db.query('SELECT count(*) AS count FROM sessions')).rows[0].count, 2);
  const cookie = responses[0].headers['set-cookie'] as string;
  const token = cookie.split(';')[0].split('=')[1];
  const stored = (await f.db.query('SELECT token_hash FROM sessions')).rows.map((row) => row.token_hash);
  assert.ok(stored.includes(createHash('sha256').update(token).digest('hex')));
  assert.ok(!stored.includes(token));
  const pending = await f.loginProof(0, account);
  await Promise.all(f.apps.map((app) => app.close()));
  const restarted = await buildServer(f.connect());
  try {
    assert.equal((await restarted.inject({ url: '/me', headers: { cookie } })).json().userId, responses[0].json().userId);
    assert.equal((await restarted.inject({ method: 'POST', url: '/auth/verify', payload: proofs[0], headers: { origin: ORIGIN } })).statusCode, 409);
    const resumed = await restarted.inject({ method: 'POST', url: '/auth/verify', payload: pending, headers: { origin: ORIGIN } });
    assert.equal(resumed.statusCode, 200);
    assert.equal(resumed.json().userId, responses[0].json().userId);
    assert.equal((await restarted.inject({ method: 'POST', url: '/logout', headers: { origin: ORIGIN, cookie } })).statusCode, 200);
    assert.equal((await restarted.inject({ url: '/me', headers: { cookie } })).statusCode, 401);
  } finally { await restarted.close(); }
});

test('two independent users racing to link one wallet cannot share ownership', async (t) => {
  const f = await fixture(t);
  const owners = [wallet(), wallet()];
  const target = wallet();
  const sessions = await Promise.all(owners.map(async (account, i) => f.post(i, '/auth/verify', await f.loginProof(i, account))));
  const cookies = sessions.map((r) => r.headers['set-cookie'] as string);
  const issued = await Promise.all(owners.map(async (account, i) => (await f.post(i, '/wallets/link/challenge', { ecosystem: 'evm', address: target.address, authorizer: { ecosystem: 'evm', address: account.address } }, cookies[i])).json()));
  const proofs = await Promise.all(issued.map(async (challenge, i) => ({ ecosystem: 'evm', address: target.address, challengeId: challenge.challengeId, signature: await target.signMessage({ message: challenge.message }), authorizerSignature: await owners[i].signMessage({ message: challenge.authorizer.message }) })));
  const responses = await Promise.all(proofs.map((proof, i) => f.post(i, '/wallets/link/verify', proof, cookies[i])));
  assert.deepEqual(responses.map((r) => r.statusCode).sort(), [200, 409]);
  const loser = responses.findIndex((r) => r.statusCode === 409);
  assert.equal(responses[loser].json().error.code, 'wallet_owned');
  assert.equal((await f.db.query('SELECT consumed_at FROM auth_challenges WHERE id = $1', [issued[loser].challengeId])).rows[0].consumed_at, null);
  assert.equal((await f.db.query('SELECT count(*) AS count FROM wallets WHERE address = $1', [target.address.toLowerCase()])).rows[0].count, 1);
});
