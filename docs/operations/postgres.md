# PostgreSQL identity persistence

Status: **current**. This owns the API schema, migrations and SQLite cutover.
[Verification](verification.md) owns check commands; [Vercel deployment](vercel.md)
owns service routing and the complete environment matrix. No database was
provisioned here; the configured Neon development database was subsequently
migrated and verified as recorded below. Production was not touched.

## Storage and invariants

The API uses `pg` and parameterized SQL against a compatible PostgreSQL database.
Neon is the intended hosted provider; no Neon SDK, managed auth or provider API is
part of the application. The same Fastify routes, signed messages, address
normalization, session cookies and H2 two-proof linking protocol remain in place.
PostgreSQL stores identity only; settlement and blockchain state remain on-chain.

[001_identity.sql](../../apps/api/migrations/001_identity.sql) reproduces the five
SQLite entities:

| Table | Relationship and constraint |
| --- | --- |
| `users` | Application user ID primary key and creation time. |
| `wallets` | User foreign key; unique `(ecosystem, address)` enforces one owner. Ecosystem check accepts EVM, Solana and Sui. |
| `auth_challenges` | Exact message, expiry, consumption time, login/link purpose check and optional user foreign key. |
| `sessions` | User foreign key, unique SHA-256 token hash and expiry; raw session tokens are never stored. |
| `wallet_link_requests` | Challenge primary/foreign key, originating session foreign key with delete cascade, trusted wallet and its exact approval message. |

Existing secondary indexes on wallet user, challenge expiry, session expiry and
link session are retained. IDs remain text to preserve existing values;
millisecond timestamps use `BIGINT` with safe-integer decoding. Address columns
use deterministic `C` collation to preserve case-sensitive Solana comparisons.
EVM lowercase and Sui canonical normalization still happen in the API.

SQLite's global `BEGIN IMMEDIATE` writer lock is replaced by PostgreSQL
transactions using one checked-out connection. Challenge rows are locked before
consumption and expiry is evaluated after waiting. Login's unique-conflict path
uses the wallet's winning owner and removes its unneeded candidate user in the
same transaction. A link locks its originating session and trusted membership,
rechecks expiry after signature verification, and atomically consumes the
challenge and inserts the wallet. Foreign ownership rolls back consumption.
Logout deletes the session and cascades pending link context. These guarantees
do not depend on one process or one in-memory lock.

## Connection configuration

| Variable | Scope and requirement |
| --- | --- |
| `DATABASE_URL` | Required by the API in local development, Preview and Production. Server-only secret when it contains credentials. |
| `DATABASE_URL_UNPOOLED` | Optional server/admin secret used by migration and import commands instead of `DATABASE_URL`. Must point to the same intended database. Not needed by the running API or web build. |
| `TEST_DATABASE_URL` | Required by API tests; a direct connection to a dedicated disposable PostgreSQL database with schema-creation permission. Never use a Production database. |
| `DATABASE_PATH` | Removed. There is no SQLite runtime mode or fallback. |

Use the Neon **pooled** URL for hosted runtime connections. Prefer a **direct**
URL for general administrative tools that require persistent session state. This
repository's migration runner uses one transaction and a transaction-scoped lock;
it was verified through the pooled URL without `DATABASE_URL_UNPOOLED`. The import
tool also accepts that fallback, but a real Neon data import has not been tested.
Preserve TLS and provider-required connection
options; `sslmode=verify-full` enables certificate and hostname verification with
`pg`. Do not disable certificate verification. See [Neon connection guidance](https://github.com/neondatabase/website/blob/main/content/docs/get-started/connect-neon.md)
and [node-postgres SSL](https://node-postgres.com/features/ssl).

The module-level pool has a maximum of five connections per API instance and a
five-second idle timeout. On Vercel it is attached to
[`attachDatabasePool`](https://vercel.com/kb/guide/connection-pooling-with-functions)
to release idle connections before suspension. Local development uses the same
driver without the Vercel lifecycle hook. Total connections can still grow with
instance count; verify limits on the chosen Neon plan.

No database variable belongs in `VITE_*`. The frontend continues to call the
same-origin `/api` and does not import API storage code. API scripts do not load
`.env` automatically; examples below use explicit Node environment-file loading.

## Local PostgreSQL setup

Install PostgreSQL (verification used 18.6). Create a local login role named
`vehicle` and database `vehicle` owned by it, using pgAdmin or an existing local
administrator. Choose a local password interactively; do not put it in tracked
files or command history. For example, in an administrator `psql` session:

```sql
CREATE ROLE vehicle LOGIN;
\password vehicle
CREATE DATABASE vehicle OWNER vehicle;
CREATE DATABASE vehicle_test OWNER vehicle;
```

From the repository root, install dependencies, then customize the ignored API
environment file with the local connection URL from the safe example:

```bat
pnpm install --frozen-lockfile
cd apps\api
copy .env.example .env
pnpm exec tsx --env-file=.env src/init-db.ts
pnpm exec tsx watch --env-file=.env src/index.ts
```

In another terminal run `pnpm dev` from the repository root. Frontend/API defaults
remain `http://localhost:5173` and `http://localhost:3001`. Exporting `DATABASE_URL`
instead also supports the existing root `pnpm api:db` / `pnpm api:dev` scripts.
The API no longer initializes schema on startup: run migrations explicitly.

If PostgreSQL runs in a local container, expose its database port to the host API,
or use the database container's hostname when the API also runs in that network.
Use persistent PostgreSQL storage, `API_HOST=0.0.0.0` for a containerized API and
the browser-reachable API URL. No repository Dockerfile/Compose workflow exists;
this migration does not introduce or replace one.

For tests, set `TEST_DATABASE_URL` in the ignored API environment file to the
separate `vehicle_test` database, then run:

```bat
cd apps\api
pnpm exec tsx --env-file=.env --test src/*.test.ts
```

Alternatively export `TEST_DATABASE_URL` and run `pnpm api:test` from the root.
Tests create randomly named schemas, migrate them and drop only those schemas.
They do not fall back to `DATABASE_URL` or SQLite. CI supplies a disposable
PostgreSQL service specifically for the API test step.
The test helper sets startup `search_path` through connection `options`; the
tested Neon pooled endpoint rejects that parameter with `08P01`. Use a direct
Neon connection or local PostgreSQL for this existing automated suite. This is
a test-isolation requirement, not a runtime or migration requirement.

## Migrations and existing SQLite data

`pnpm api:db` applies ordered SQL files in one transaction. A transaction-scoped
advisory lock serializes competing migration runners; `schema_migrations` stores
filename, SHA-256 checksum (normalized line endings) and application time. Re-running is safe; changing an
applied file is rejected. Add a new migration for subsequent schema changes.
Migrations run as an explicit setup/release step, never in Vite builds or API
request startup. A role needs DDL permission for migrations; the runtime needs
only identity-table reads/writes after setup.

To retain an existing SQLite identity database:

1. Stop the old API's writes and take a consistent SQLite backup. Preserve any
   WAL state through SQLite's backup mechanism or a clean shutdown; copying only
   the main file while it is active can omit committed rows.
2. Configure the intended PostgreSQL target and run `pnpm api:db` against it.
   Double-check Preview/Production selection before any administrative command.
3. Run `pnpm api:db:import <absolute-snapshot-path>` with exported server variables,
   or use the explicit environment-file equivalent:

   ```bat
   cd apps\api
   pnpm exec tsx --env-file=.env src/import-sqlite.ts C:\backups\auth.sqlite
   ```

4. Start the new API against PostgreSQL and verify the imported identity/session
   data before retiring the old setup. Keep a backup; there is no reverse importer.

The importer opens SQLite read-only, reads a consistent snapshot and copies all
five tables in one PostgreSQL transaction. It requires empty identity tables and
rejects invalid references/constraints without leaving partial rows. It preserves
IDs, session hashes, timestamps, consumed challenges and pending H2 context.
Pre-H2 snapshots without link context remain supported; legacy link challenges
still fail closed. An imported cookie is usable only while valid and presented
on the same browser host; changing a deployment domain does not transfer cookies.
`node:sqlite` remains only in this explicit cutover tool and synthetic import
tests, never in the API runtime. No existing local snapshot was imported here.

## Preview, Production and remaining verification

Use an isolated Neon branch/database and credentials for Preview, separate from
Production. Configure server-only `DATABASE_URL` per Vercel environment, apply
schema explicitly to each target, and configure that deployment's exact
`FRONTEND_ORIGIN`. Keep the direct administrative URL in operator/CI secrets;
it does not need to be entered in the Vercel runtime dashboard. Builds need no
database access. A fresh target requires schema even when no data is imported.

Local PostgreSQL verification covers clean/repeated/concurrent migration,
constraint/rollback behavior, all ecosystem proofs and H2 pairs, separate-instance
races, session/challenge persistence across API reconnects and synthetic SQLite
cutover. The subsequent Neon record verifies TLS, pooled transactions, required
operations, bounded client pools and real HTTP process restarts. Neon suspend/resume,
capacity under load and Vercel cold-start behavior remain unverified. Verify these on
an isolated hosted Preview target before promoting the configuration. Existing
Vercel routing/origin and blockchain deployment prerequisites remain in
[the deployment guide](vercel.md#dashboard-inputs-and-functional-deployment-blockers).

## Verification on 2026-10-07

Windows, Node `24.19.0`, pnpm `10.26.0`, task-owned PostgreSQL `18.6` bound only
to loopback. All database checks used disposable databases/schemas and synthetic
identities, not existing local accounts or a hosted database.

| Check | Result and scope |
| --- | --- |
| `pnpm api:test` with isolated `TEST_DATABASE_URL` | **passed**, 45 tests: EVM/Solana/Sui login, all nine H2 pairings, invalid signatures/origins/roles/sessions, expiry/replay, ownership conflicts and rollback, separate-instance races, hashed sessions/pending/consumed challenges across API reconnects, schema constraints and read-only import. |
| `pnpm execution:test` | **passed**, 35 web tests including existing local/hosted `/api` URL resolution and credentialed requests. |
| `pnpm typecheck` | **passed**, API/web/Solana/Sui. API check rerun after the checksum portability change. Initial development checks found TypeScript narrowing/overload errors in the conversion/test harness; these were fixed before the final pass. |
| `pnpm lint` | **passed**, frontend ESLint. API lint **not run**: no API lint script/configuration exists. |
| `pnpm build` / `pnpm --dir apps/api build` | **passed**, web/API. Existing Vite annotation and chunk-size warnings remain. API rebuilt after the checksum change. |
| Source and compiled migration CLI | **passed**, an entirely clean PostgreSQL database, repeat application and direct administrative URL precedence; concurrent runners, checksum tampering and Windows/Linux line endings also pass in API tests. |
| Compiled API HTTP smoke | **passed**, login, cookie-backed `/me`, logout/rejection and JSON route miss against the clean migrated database. No real wallet/RPC involved. |
| Browser credential isolation | **passed**, synthetic server-only runtime/admin/test database values absent from all 75 web output files. Source audit finds no frontend database reader/import or custom Vite secret exposure. |
| Frozen install / dependency audit | **passed**, lockfile consistent; all 1,072 pre-existing locked package versions retained. Only the PostgreSQL driver/types and Vercel pool lifecycle dependencies were added. |
| CI/config/docs/diff | **passed**, actionlint, unchanged Vercel routing, 245 local documentation paths/anchors, environment/ignore boundaries and `git diff --check`. New test/tooling files also checked for whitespace. |
| Hosted Neon / Vercel integration / browser chain flows | **not run**; no hosted database provisioned, secrets configured or deployment performed. The earlier Vercel dev integration failure remains in the deployment guide. Docker runtime **environment unavailable** on this host. |

No blockchain, frontend behavior, business logic or Vercel route changes were
made. The preceding environment audit was committed as `747dfde`; these
persistence changes are separate. This verification does not validate live data
cutover, hosted database settings or a Vercel deployment.

## Neon verification on 2026-10-07

The user authorized verification against the configured Neon development database.
A read-only inventory found **no application tables or data** before migration.
Only the supplied **pooled** connection was used; no direct URL was configured or
fabricated. The PostgreSQL server reported 18.6. Credentials, endpoint names,
database URLs, session cookies and synthetic signing keys are omitted from this
record. The existing ignored environment file was not changed.

| Check | Result and scope |
| --- | --- |
| Runtime connection | **passed**, TLS encrypted with an authorized certificate and certificate rejection enabled. The current driver emits a non-fatal warning about future `sslmode=require` semantics; explicitly choosing `verify-full` preserves strict validation across future driver upgrades. No dependency or credential change was made. |
| Clean migration and drift | **passed**, compiled migration CLI applied `001_identity.sql` to the inspected empty database through the pooled URL. Repeated and concurrent runners retained one checksum-matched ledger entry. Actual catalog matches six tables, 29 columns with correct types/nullability/defaults/collations, 17 key/foreign/check constraints plus 27 PostgreSQL 18 NOT NULL entries, and 12 ready/valid indexes. No schema drift found. |
| Migration atomicity | **passed**, an intentional failure in a two-file chain rolled back its ledger, earlier DDL and inserted data. Transaction-local schema isolation worked through the pooler; only that run's generated probe schema was removed. |
| Real Fastify HTTP flows | **passed**, independent Node processes used the configured Neon runtime connection for challenge/proof login, identity creation, hashed sessions, authenticated lookup, trusted/target proof linking, login through a linked wallet, ownership conflict, expiry/replay and logout. The unmodified compiled `src/index.ts` entrypoint also passed HTTP login/lookup/logout. Synthetic keys were generated in memory; no blockchain operation occurred. |
| Deterministic races | **passed**, two processes consumed one challenge once. Verification-only barriers forced both empty-wallet lookups and competing link inserts before release; real SQL constraints/transactions produced one wallet owner, no orphan users and rollback of the losing link's challenge consumption. Direct duplicate insertion was rejected with `23505`. |
| Process restart durability | **passed**, a stopped API was replaced with fresh Node processes. Identity, linked wallets, valid session and pending challenge survived; consumed challenges, expired challenges/sessions and logged-out sessions stayed invalid. This establishes API-process durability, not browser or Vercel cold-start behavior. |
| Pool lifecycle/reconnect | **passed**, concurrent queries respected the five-connection app maximum, released waiting clients, closed TLS sockets and reconnected with a fresh pool. `max_connections` reported 901 during inspection; provider capacity/load limits were not stress-tested. Pooler backend reuse is distinct from leaked app client connections. |
| Failure output | **passed**, an unavailable synthetic local connection produced credential-free HTTP/CLI errors; migration CLI returned corrective connectivity/permission/history guidance. No invalid credentials were tried against Neon. |
| Ordinary API suite | **passed**, `pnpm api:test`, 45 tests on disposable local PostgreSQL. A read-only Neon probe confirmed pooled startup `options` are rejected (`08P01`), so this existing suite needs a direct/local `TEST_DATABASE_URL`. It was not rewritten to use public tables or remote production data. |
| Other repository checks | **passed**, `pnpm execution:test` (35), `pnpm typecheck`, `pnpm lint`, `pnpm --dir apps/api build`, `pnpm build`, actionlint, documentation links and `git diff --check`. API lint **not run** because no script/configuration exists; existing Vite annotation/chunk warnings remain. |
| Secret boundaries | **passed**, real server-only database values were present during a frontend build and absent from all 75 output files. Tracked/reviewable source, helpers and the Git index contained no configured credentials/endpoint. Only placeholder env examples are tracked; real env files remain ignored; no database secret entered `VITE_*`. |
| Cleanup | **passed**, only run-generated identity/session/challenge/link rows and temporary probe schemas were removed. The migrated schema and ledger remain; all five identity tables are empty. API/admin pools and local verification processes were closed. |

Initial verification-harness assertions needed corrections for PostgreSQL 18's
explicit NOT NULL catalog entries and asynchronous TLS close events after pool
bookkeeping completes. Both checks passed after those harness corrections; no
Neon-specific application fix, ORM change, schema change or routing change was
required. Verification helpers are generic and ignored under `.tools/neon-verification`;
they contain no configured Neon connection values.

The migration is **ready to commit for review**. No commit, push, Vercel dashboard
configuration or deployment was performed in this verification run. Hosted
verification must still cover Vercel builds/routing/assets, HTTPS browser cookies,
Fluid Compute pool suspension, Neon suspend/resume and suitable connection capacity.
Before a Vercel smoke deployment, configure the intended isolated deployment database
and server-only runtime URL, its schema and the exact browser origin; resolve the
recorded Services integration failure. Preview's multi-origin strategy remains
separate. A functional marketplace additionally needs the public blockchain
deployments/configuration listed in [the deployment guide](vercel.md#dashboard-inputs-and-functional-deployment-blockers).
