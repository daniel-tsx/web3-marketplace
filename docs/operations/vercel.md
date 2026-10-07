# Vercel Services deployment

Status: **current**. This owns the additional Vercel deployment target. The
configuration is scaffolding: hosted API startup is intentionally blocked until
identity storage is migrated. Local development continues to use SQLite.

## Deployment model and required work

The root [vercel.json](../../vercel.json) defines `api` (`apps/api`, Fastify) and
`web` (`apps/web`, Vite) as independently built services in one project. Configure
the Vercel project's Root Directory as the repository root, with Node **24.x**;
the service manifests also pin Node 24. pnpm remains pinned by the root manifest.
Keep workspace source files available to both builds, including the web app's
`@vehicle/solana` and `@vehicle/sui` dependencies. No contract/program build or
network deployment runs as part of these application builds.

[Vercel Services](https://vercel.com/docs/services) is in Beta. Its native Fastify
support uses the existing `src/index.ts` listener; no framework migration or
file-based API handlers are needed. Explicit service development commands run
through that entrypoint and Vite using the CLI-assigned `PORT`; local Vercel
integration remains unverified as recorded below.

| Public request | Service | Application path |
| --- | --- | --- |
| `/api`, `/api/*` | `api` | Service-local `request.path` transforms remove `/api`; `/api/me` reaches Fastify `/me`. |
| All other paths | `web` | Vite assets are served by the web service; its SPA fallback serves `index.html` for deep links. |

The API rule precedes the web catch-all. API misses stay API responses and cannot
fall through to the SPA. Existing `/auth/*`, `/wallets/link/*`, `/me` and `/logout`
Fastify routes stay unchanged for ordinary local clients. There are no existing
health or operational endpoints to relocate; unauthenticated `/api/me` should
return JSON with HTTP 401 when the API is operational.

The API's explicit path transforms follow [Vercel's service routing rules](https://vercel.com/docs/project-configuration/vercel-json#request-path-transform-in-a-service).
A rewrite changes route selection, while `request.path` changes the path the
runtime reads. The earlier API rewrite alone did not establish that Fastify would
observe `/me`. The web rewrite remains a static-file SPA fallback. Hosted path,
query-string and asset behavior still require runtime verification.

There are **no bindings**: the web build is static, its browser code calls the
public API, and the API has no calls to another application service. Bindings
exist only in server functions at runtime, not Vite builds or browser code. Do not
create or populate a binding variable for browser API traffic. Both services are
public through the route table; no service is internal-only.

**Required before any hosted API deployment:** replace file-backed identity
storage with durable shared storage in a separately scoped task. Vercel has no
persistent shared filesystem for SQLite. `/tmp`, `:memory:`, container packaging,
or an uploaded database file cannot preserve shared sessions, challenge consumption,
wallet uniqueness and H2 transactions across instances/restarts. See
[Vercel's SQLite limitation](https://vercel.com/kb/guide/is-sqlite-supported-in-vercel).
[API configuration](../../apps/api/src/config.ts) rejects hosted Vercel startup
before opening a database, including attempts to set an ephemeral database path.
Remove that guard only after implementing and verifying durable storage and its
existing identity/authorization invariants. Storage credentials and migrations
are deliberately not invented by this scaffolding.

## Environment and communication

The audit covers all **15 custom web variables**, all **7 API variables**, Vite's
computed `DEV` flag, chain configuration writers and test/CI setup. The web uses
Vite's default public prefix; no configuration exposes arbitrary server variables.
There are **no application secret or test-only environment variables currently
required**. API sessions use random tokens stored as hashes, not an environment
signing key. Future database credentials belong to the separate storage task.

### Environment matrix

All web rows are **public browser configuration**; their deployed network values
are deployment-specific. API rows are **server-only**, but none currently holds a
secret. Defaults are optional to enter; resource identifiers are required for
trading on the corresponding chain, rather than for rendering the web shell.
Preview and Production requirements below describe the intended functional app
**after** resolving the hosted API/storage blocker. A Vercel Production deployment
does not imply a blockchain mainnet deployment; choose the intended networks
explicitly, with testnets for the initial demo.

| Variable | App | Local development | Tests | Vercel Preview | Vercel Production | Classification / requirement |
| --- | --- | --- | --- | --- | --- | --- |
| `VITE_API_URL` | web | Optional; defaults to `http://localhost:3001`. | None | Absent; `/api` default. | Absent; `/api` default. | Public; local override. Set `/api` only for `vercel dev`. |
| `VITE_CHAIN_ID` | web | Optional; defaults to `31337`. | None | Chosen testnet ID. | Chosen network ID. | Public/deployment; required override for hosted EVM. |
| `VITE_RPC_URL` | web | Optional; defaults to `http://127.0.0.1:8545`. | None | Public HTTPS EVM RPC. | Public HTTPS EVM RPC. | Public/deployment; required override for hosted EVM. |
| `VITE_MOCK_USDC_ADDRESS` | web | Local MockUSDC deployment. | None | Same-network deployment. | Same-network deployment. | Public/deployment; required for EVM trading. |
| `VITE_VEHICLE_NFT_ADDRESS` | web | Local VehicleNFT deployment. | None | Same-network deployment. | Same-network deployment. | Public/deployment; required for EVM trading. |
| `VITE_MARKETPLACE_ADDRESS` | web | Local marketplace deployment. | None | Same-network deployment. | Same-network deployment. | Public/deployment; required for EVM trading. |
| `VITE_SOLANA_RPC_URL` | web | Optional; defaults to `http://127.0.0.1:8899`. | None | Public HTTPS Solana RPC. | Public HTTPS Solana RPC. | Public/deployment; required override for hosted Solana. |
| `VITE_SOLANA_VEHICLE_MINT` | web | Local seeded vehicle mint. | None | Same-cluster vehicle mint. | Same-cluster vehicle mint. | Public/deployment; required for Solana trading. |
| `VITE_SOLANA_PAYMENT_MINT` | web | Local seeded payment mint. | None | Same-cluster payment mint. | Same-cluster payment mint. | Public/deployment; required for Solana trading. |
| `VITE_SUI_NETWORK` | web | Optional; defaults to `testnet`. | None | Optional if using testnet. | Optional if using testnet. | Public/deployment; must match RPC/resources. |
| `VITE_SUI_RPC_URL` | web | Optional; public testnet fullnode default. | None | Optional if using default testnet gRPC. | Optional if using default testnet gRPC. | Public/deployment; must support the browser gRPC client. |
| `VITE_SUI_PACKAGE_ID` | web | Actual published package ID. | None | Same-network package. | Same-network package. | Public/deployment; required for Sui trading. |
| `VITE_SUI_MARKETPLACE_OBJECT_ID` | web | Actual shared Market ID. | None | Same-network Market. | Same-network Market. | Public/deployment; required for Sui trading. |
| `VITE_SUI_VEHICLE_OBJECT_ID` | web | Actual Vehicle ID. | None | Same-network Vehicle. | Same-network Vehicle. | Public/deployment; required for Sui trading. |
| `VITE_SUI_PAYMENT_COIN_TYPE` | web | Optional; `<package ID>::musdc::MUSDC`. | None | Optional with that package's MUSDC. | Optional with that package's MUSDC. | Public/deployment; override only to match deployed payment type. |
| `DATABASE_PATH` | api | Optional; `.local/auth.sqlite` relative to API working directory. Containers need persistent storage. | None | Omit; SQLite blocked. | Omit; SQLite blocked. | Server-only/local; not a hosted storage solution. |
| `FRONTEND_ORIGIN` | api | Optional; defaults to `http://localhost:5173`. | None | Exact HTTPS browser origin. | Exact HTTPS browser origin. | Server-only/deployment; required for deployed POSTs/cookies. |
| `API_HOST` | api | Optional; `127.0.0.1`, or `0.0.0.0` in a container. | None | Omit. | Omit. | Server-only/local; preserve platform handling. |
| `API_PORT` | api | Optional; defaults to `3001`. | None | Omit. | Omit. | Server-only/local; `PORT` takes precedence. |
| `PORT` | api | Optional outside Vercel; overrides `API_PORT`. | None | Platform-managed. | Platform-managed. | Server-only/deployment; do not enter manually. |
| `VERCEL` | api | Absent ordinarily; injected by `vercel dev`. | None | Platform-managed. | Platform-managed. | Server-only/deployment; used by storage guard. |
| `VERCEL_ENV` | api | Absent ordinarily; `development` in `vercel dev`. | None | Platform `preview`. | Platform `production`. | Server-only/deployment; do not override guard. |

The API and frontend execution tests supply controlled configuration, mocked
fetch/chain reads and in-memory/temporary databases. They need none of these
variables, real credentials or running blockchain nodes. Chain runtime tests
have separate local tool/fixture prerequisites in [verification](verification.md).

| Related setting | Actual scope |
| --- | --- |
| `SOLANA_RPC_URL` | Local seed and validator-test scripts only; optional localhost default, no Vercel dashboard use. Deterministic fixture accounts are local-only. |
| `VITE_SOLANA_PROGRAM_ID` | Legacy seed output with **no reader**. Public but ineffective; omit from the dashboard. The actual program ID is compiled into the client/Rust/Anchor configuration. |
| `import.meta.env.DEV` | Computed Vite flag used by the API URL fallback, not an environment variable to enter. |
| `NODE_ENV` | Tool-managed; do not force `development` on hosted builds. Both Vercel scopes run `pnpm build` in Vite production mode; Preview does not mean a Vite dev server or an automatic `.env.preview` load. |

### Loading and browser exposure

`VITE_*` settings are public build-time configuration; rebuild after changing
them. The [Vite environment guide](https://vite.dev/guide/env-and-mode) documents
that `.env.local` is loaded in both development and production builds. Its Git
ignore status does not prevent browser exposure. Current ignored web settings
still load Anvil configuration in a local production build; that build is not
evidence of a usable public-network deployment. Vercel Git builds do not receive
ignored local files. Avoid bulk-importing this local example into the dashboard.
The API does not auto-load `.env`; its scripts use exported settings or the
explicit `--env-file` workflow in [verification](verification.md#environment-examples-and-loading).

No private keys, privileged API keys, signing keys or server credentials belong
in `VITE_*`, including inside URLs or interpolated references to server secrets.
The safe examples contain public endpoints and placeholders. A sanitized scan of
the current ignored web file found only the expected local EVM settings, with no
credential-bearing RPC URL; no values were printed. This does not inspect future
dashboard values or make arbitrary future `VITE_*` input safe.

All three RPC endpoints are used directly by browser clients and displayed in
the UI. A provider key in a URL path, query or user-info section would therefore
be public, as would an unrestricted billing/quota credential. Use credential-free
public endpoints, or provider-supported browser/public identifiers with suitable
restrictions. An authenticated private RPC would justify a separately scoped
server-side proxy with fixed upstreams, restricted methods and abuse limits;
credential-free RPCs do not require a proxy merely because the app uses Vercel.
The current API has no RPC proxy or secret RPC reader. Sui uses `SuiGrpcClient`,
so a custom endpoint must support its browser transport, not just JSON-RPC.

### API origin and cookies

Leave `VITE_API_URL` absent in both Preview and Production: the existing browser
client selects `/api` for hosted production builds. The top-level API rule runs
before the SPA rule; the API service transforms the observed path for Fastify.
The frontend continues to send credentials. The API keeps exact POST Origin
validation, credentialed CORS, HttpOnly/SameSite=Lax cookies and `no-store` replies;
HTTPS origins now set and clear **Secure** cookies. Cookie Path remains `/`, and
no Domain is set. With same-origin `/api`, no cross-site cookie workaround or
proxy-header trust is needed. `FRONTEND_ORIGIN` must be an exact origin including
`https://`, without a path/trailing slash. A production origin does not authorize
a preview's POSTs. The current code accepts **one** origin and does not derive it
from Vercel system metadata. A fixed Preview-scoped value cannot authorize every
generated deployment URL: choose a stable preview browser origin, deliberately
set the origin for a specific deployment, or implement a reviewed preview-origin
strategy in a separate task. Do not use wildcard Origin or disable validation.

### Dashboard inputs and functional-deployment blockers

After the separate storage task, enter `FRONTEND_ORIGIN` for the actual browser
origin in each [Vercel environment scope](https://vercel.com/docs/environment-variables).
For EVM, enter the chain ID, public RPC and all three addresses; for Solana, the
public RPC and both mints; for Sui testnet, all three IDs. Sui network/RPC can use
the defaults and the coin type can derive from the package when that matches the
deployment. Scope resource sets separately when Preview and Production use
different deployments. No current dashboard secret is needed by the app, and
adding a speculative `DATABASE_URL` would have no effect today.

Intentionally omit `VITE_API_URL`, `VITE_SOLANA_PROGRAM_ID`, `DATABASE_PATH`,
`API_HOST`, `API_PORT`, manually supplied `PORT`/`VERCEL`/`VERCEL_ENV`, invented
session/signing variables and all frontend secrets. Future database credentials
must remain server-only and will be defined by the storage migration.

The current localhost API/RPC URLs, EVM `31337` and local contract addresses,
local Solana mints/validator, and Sui placeholder/missing deployment IDs are
not hosted resource configuration. In a deployed browser, localhost targets
the visitor's machine. Before a functional deployment:

1. Replace SQLite with durable shared identity storage and verify existing
   identity/H2 invariants before removing the hosted-startup guard.
2. Select and deploy the intended testnet resources in separate chain tasks.
   EVM needs compatible MockUSDC (6 decimals), VehicleNFT and Marketplace,
   vehicles matching the catalog's token IDs 1-3 and funded test wallets.
   Solana needs the program at the compiled ID (or consistent client/Rust/Anchor
   alignment), initialized MarketConfig with the payment mint, a 6-decimal mock
   payment mint and a vehicle mint with supply 1. Sui needs a published package,
   shared Market, Vehicle, the correct MUSDC payment type and gas/payment funds.
3. Make the small public-network configuration/metadata adjustments required by
   those chosen deployments. EVM transport reads `VITE_CHAIN_ID`, but catalog
   chain IDs and Anvil labels remain hardcoded; Solana catalog/labels remain
   `localnet`. An environment-only change does not update all network metadata.
   Never reuse deterministic local fixture keys on public networks or repoint
   the local seed scripts to them.
4. Resolve the recorded Vercel local integration failure, choose the exact
   Preview/Production origins and populate only the necessary public/server
   settings. Then verify deployed routing, HTTPS auth and each actual wallet
   purchase flow. RPC availability/CORS, program/object compatibility and
   persistence across instances cannot be established by this audit.

## Local checks and deployment steps

The ordinary two-terminal `pnpm api:dev` / `pnpm dev` workflow is unchanged. No
Dockerfile or Compose file exists in this checkout. Container-compatible host,
port, API URL and database-volume overrides remain available; no Docker workflow
is replaced.

For the combined Vercel route table, use a fresh Command Prompt from the repository
root, with a current Vercel CLI supporting Services:

```bat
set "FRONTEND_ORIGIN=http://localhost:3000"
set "VITE_API_URL=/api"
vercel dev -L --listen 3000
```

CLI **62.7.0** accepts this Services configuration; the previously installed
54.11.1 rejects service-object rewrite destinations. If this host's existing
modules use `.pnpm-store`, select that same store before Vercel's dependency sync:

```bat
set "npm_config_store_dir=%CD%\.pnpm-store"
```

`-L` avoids cloud authentication. Local Vercel development has
`VERCEL_ENV=development`, permits local SQLite and injects service ports. It may
need to download Vercel runtime tools. Existing API environment files are not
automatically loaded by the ordinary API scripts; see [environment loading](verification.md#environment-examples-and-loading).

After the storage migration, confirm service names/public paths and configure
the project/environment values before running these commands from the root:

```bat
vercel link
vercel
```

`vercel` creates a preview deployment. Production deployment is a separate,
explicit action (`vercel --prod`); this task does not link, deploy or migrate.

After the first deployment, verify both service builds include workspace packages,
API JSON/404 routing, SPA deep links and real JS/CSS asset responses, exact Origin
rejection, HTTPS cookie login/session/logout and H2 proofs. Verify durable identity
and challenge consumption across cold starts/concurrent instances once storage is
implemented. Verify browser-wallet/network interaction separately; local tests and
application builds cannot establish these hosted/runtime results.

## Verification on 2026-10-07

Windows, Node `24.19.0`, pnpm `10.26.0`. This table records the original
scaffolding checks; the subsequent environment audit is recorded separately below.

| Check | Result and scope |
| --- | --- |
| `pnpm api:test` | **passed**, 35 tests including HTTPS/local cookie flags, exact Origin, startup configuration, the hosted SQLite guard and existing identity/H2 regressions. The new HTTPS case first **failed** because `Secure` was absent, then passed after the fix. |
| `pnpm execution:test` | **passed**, 35 tests including Vite-transformed browser API calls for local, production, Vercel dev and explicit API URL overrides; credentials remain included. The first new test harness emitted dependency-scan shutdown errors despite passing assertions; disabling its unnecessary optimizer scan removed those errors on rerun. |
| `pnpm typecheck` | **passed**, API/web/Solana/Sui TypeScript. |
| `pnpm lint` | **passed**, frontend ESLint. API lint is **not run** because no API lint script/configuration exists. |
| `pnpm build` | **passed**, web TypeScript and Vite production bundle; existing dependency annotation and large-chunk warnings remain. |
| `pnpm --dir apps/api build` | **passed**, Fastify TypeScript build. |
| Ordinary local HTTP smoke | **passed**, compiled Fastify listener with exact-Origin challenge and unauthenticated `/me`, plus Vite HTML/JS responses. Temporary ports and a new isolated SQLite file were used; no existing identity database was opened. |
| `vercel dev -L --listen 127.0.0.1:3000` | **failed** integration on this host. Installed CLI 54.11.1 rejects service-object destinations. Temporary CLI 62.7.0 accepts the configuration and detects both frameworks, but the route smoke returns HTTP 500 with `Can't detect way to handle request` before reaching Fastify. Dependency synchronization also hit this checkout's existing pnpm-store reinstallation prompt, which was cancelled. Explicit dev commands and a direct-environment retry did not establish working service routing. |
| Configuration/docs/diff | **passed**, service manifest/build/entrypoint checks, 119 documentation paths/anchors, new-file whitespace and `git diff --check` (with submodule inspection disabled because of sandbox permissions). |
| Docker runtime / hosted Vercel / browser wallets | **environment unavailable** for Docker (no CLI or repository Docker configuration); hosted deployment and wallet interaction are **not run**. |

The temporary CLI and smoke scripts are under ignored `.tools/vercel-readiness`,
outside workspace dependencies. No dependencies/lockfile, chain code, schema,
ABI, existing workflow/AI instructions, or existing untracked portfolio artifacts
were changed. No commit, push, project link, deployment or production migration
was performed during those scaffolding checks. Service names, public paths and
the absence of bindings were subsequently confirmed, and the scaffolding was
committed/pushed. The current deployment prerequisites are listed above.

## Environment/configuration audit on 2026-10-07

Inspected web/API environment readers, Vite configuration and loading, local
configuration writers, auth/origin/cookie handling, service routing, examples,
ignore rules and test/CI setup. The current Vercel routing documentation required
replacing the API's rewrite with explicit runtime path transforms; this is a
configuration correction, not a Fastify/API redesign. Example changes are comments
only. No local environment values or credentials were changed or printed.

| Check | Result and scope |
| --- | --- |
| `pnpm api:test` | **passed**, 35 tests; default/override configuration, hosted guard, exact Origin, HTTPS cookies and identity/H2 behavior. |
| `pnpm execution:test` | **passed**, 35 tests; includes Vite-transformed `/api` production fallback, local overrides and credentials. |
| `pnpm typecheck` / `pnpm lint` | **passed**, workspace TypeScript and web ESLint. API lint is **not run** because no script/configuration exists. |
| `pnpm build` / `pnpm --dir apps/api build` | **passed**, web and API builds. Existing Vite dependency-annotation and chunk-size warnings remain. The web build loads local Anvil settings, not deployed resources. |
| Sanitized environment/ignore audit | **passed**, all 15 web/7 API readers accounted for; examples use recognized names and safe placeholders; local/mode env files are ignored and only examples tracked. Development/production Vite loading was inspected without printing values. |
| Vercel schema/static prefix checks | **passed**, cached CLI 62.7.0's full validator accepts the service transforms. API root/auth/missing-path captures and non-API exclusion were checked statically; this is **not** service runtime evidence. |
| Documentation/diff | **passed**, 120 local documentation paths/anchors and `git diff --check`. |
| `vercel dev` / hosted deployment / wallet-RPC flows | **not run** in this audit. The earlier `vercel dev` integration failure above remains unresolved; hosted routing, asset responses, HTTPS auth and real chain interaction still require verification. |

No dependency, runtime application, database, chain/program or AI workflow changes
were made. No credential setup, storage migration, blockchain deployment, commit,
push or Vercel deployment was performed in this audit. Existing local defaults,
chain scripts and container overrides remain available. The four tracked changes
are this document, the two environment examples and the API service path transform
in `vercel.json`; unrelated untracked portfolio artifacts are untouched.
