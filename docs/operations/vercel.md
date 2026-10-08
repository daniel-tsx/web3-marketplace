# Vercel Services deployment

Status: **current**. This owns the additional Vercel deployment target. The
API uses PostgreSQL for durable identity storage. Native Services routing and
hosted-origin policies pass local checks. Production `ce4e27f` includes the earlier
entrypoint packaging correction, but now fails on a different dependency import:
[CommonJS rpc-websockets requires ESM-only UUID](#production-dependency-loading-failure-after-ce4e27f).
The dependency correction is finalized locally for the existing Git integration.
HTTPS browser authentication and
hosted database lifecycle remain unverified.
This smoke target covers the web shell and authentication; blockchain trading
requires separate deployments and is outside this run.

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
file-based API handlers are needed. The bootstrap directly imports and supplies
Fastify so the native builder discovers the listening entrypoint. `listen()` is
not awaited at module scope because Vercel intercepts it while importing the
application. Ordinary local startup still opens its configured listener.
The API service sets `outputDirectory: "."` so the native Services builder
bundles that source entrypoint instead of promoting `tsc`'s `dist/index.js` to
the function root. Keep this setting even though the API build emits `dist`;
the web service retains its separate `outputDirectory: "dist"`.
Vite uses the CLI-assigned `PORT`. Use CLI **62.7.0 or newer** for Services;
54.11.1 rejects service-object rewrite destinations.

[.vercelignore](../../.vercelignore) explicitly excludes local env files, tooling,
database/chain fixtures, generated outputs and unrelated portfolio artifacts
from CLI uploads. Vercel's default upload filter does not use `.gitignore` as its
secret boundary. Keep only safe `.env.example` files in source control.

| Public request | Service | Application path |
| --- | --- | --- |
| `/api`, `/api/*` | `api` | Service-local `request.path` transforms remove `/api`; `/api/me` reaches Fastify `/me`. |
| All other paths | `web` | File URLs, `/assets/*` and Vite `/@*` requests bypass the SPA rewrite; extensionless application paths serve `index.html`. |

The API rule precedes the web catch-all. API misses stay API responses and cannot
fall through to the SPA. Existing `/auth/*`, `/wallets/link/*`, `/me` and `/logout`
Fastify routes stay unchanged for ordinary local clients. There are no existing
health or operational endpoints to relocate; unauthenticated `/api/me` should
return JSON with HTTP 401 when the API is operational.

The API's explicit path transforms follow [Vercel's service routing rules](https://vercel.com/docs/project-configuration/vercel-json#request-path-transform-in-a-service).
A rewrite changes route selection, while `request.path` changes the path the
runtime reads. The earlier API rewrite alone did not establish that Fastify would
observe `/me`. The web fallback excludes assets, Vite internals and paths containing
a dot, so script/style requests retain their paths. The current application has
no client routes containing dots. Actual local Services checks cover `/api`,
`/api/*`, preserved query strings, API-only JSON 404s, deep links and Vite scripts.
The deployed static asset graph still needs a hosted check.

There are **no bindings**: the web build is static, its browser code calls the
public API, and the API has no calls to another application service. Bindings
exist only in server functions at runtime, not Vite builds or browser code. Do not
create or populate a binding variable for browser API traffic. Both services are
public through the route table; no service is internal-only.

**Required before hosted API use:** configure a PostgreSQL database and apply
the checked-in schema explicitly. [PostgreSQL persistence](postgres.md) owns
migrations, local setup, Neon pooled/direct URLs and the optional read-only SQLite
cutover. The API requires `DATABASE_URL` in every environment and has no SQLite
fallback. Neither service build runs migrations or needs a database connection.
The configured development Neon database passed pooled migration, schema, HTTP
auth/race and process-restart checks; see [the Neon verification record](postgres.md#neon-verification-on-2026-10-07).
That record does not establish Vercel runtime or browser-wallet behavior.

## Environment and communication

The matrix covers all **15 custom web variables**, API runtime configuration,
database administration/test variables, Vite's computed `DEV` flag and chain
configuration writers. The web uses
Vite's default public prefix; no configuration exposes arbitrary server variables.
`DATABASE_URL` is a server-only secret; API tests require a dedicated
`TEST_DATABASE_URL`. API sessions still use random tokens stored as hashes, not
an environment signing key.

### Environment matrix

All web rows are **public browser configuration**; their deployed network values
are deployment-specific. API rows are **server-only**; database URLs containing
credentials are secrets. Defaults are optional to enter; resource identifiers are required for
trading on the corresponding chain, rather than for rendering the web shell.
Preview and Production requirements below describe the intended functional app
**after** setting up the PostgreSQL target and chain resources. A Vercel Production deployment
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
| `DATABASE_URL` | api | Required; local PostgreSQL URL. | Not read by tests. | Required; isolated Neon Preview pooled URL with TLS. | Required; separate Production pooled URL with TLS. | Server-only/secret; required for runtime, never `VITE_*`. |
| `DATABASE_URL_UNPOOLED` | api tools | Optional direct URL for migration/import. | None | Operator/CI direct URL to Preview target. | Operator/CI direct URL to Production target. | Server-only/secret; optional override for tools, absent from runtime dashboard. |
| `TEST_DATABASE_URL` | api tests | Required when running API tests; direct disposable-database URL. | Required; schemas created/migrated/dropped. | No runtime use. | No runtime use. | Server-only/secret/test-only; omit from Vercel. |
| `FRONTEND_ORIGIN` | api | Optional; defaults to `http://localhost:5173`; combined Vercel dev uses `http://localhost:3000`. | Controlled test origins. | Omit; ignored in favor of `VERCEL_URL`. | Required; exact canonical HTTPS origin. | Server-only/deployment; auth trust setting, not just CORS. |
| `API_HOST` | api | Optional; `127.0.0.1`, or `0.0.0.0` in a container. | None | Omit. | Omit. | Server-only/local; preserve platform handling. |
| `API_PORT` | api | Optional; defaults to `3001`. | None | Omit. | Omit. | Server-only/local; `PORT` takes precedence. |
| `PORT` | api | Optional outside Vercel; overrides `API_PORT`. | None | Platform-managed. | Platform-managed. | Server-only/deployment; do not enter manually. |
| `VERCEL` | api | Absent ordinarily; injected by `vercel dev`. | None | Platform-managed. | Platform-managed. | Server-only/deployment; attaches database pool lifecycle handling. |
| `VERCEL_ENV` | api | Platform `development` in `vercel dev`. | Controlled metadata. | Platform `preview`. | Platform `production`. | Server-only/deployment; selects origin policy, never enter manually. |
| `VERCEL_URL` | api | Not needed. | Controlled metadata. | Required platform-generated deployment hostname. | Not used for origin selection. | Server-only/deployment; exact Preview trust source, never enter manually. |

API tests use a real disposable PostgreSQL database supplied by
`TEST_DATABASE_URL`; config tests inject their own settings. Frontend execution
tests supply controlled configuration and mocked fetch/chain reads. Neither suite
needs running blockchain nodes. Chain runtime tests have separate local tool/fixture
prerequisites in [verification](verification.md).

| Related setting | Actual scope |
| --- | --- |
| `SOLANA_RPC_URL` | Local seed and validator-test scripts only; optional localhost default, no Vercel dashboard use. Deterministic fixture accounts are local-only. |
| `VITE_SOLANA_PROGRAM_ID` | Legacy seed output with **no reader**. Public but ineffective; omit from the dashboard. The actual program ID is compiled into the client/Rust/Anchor configuration. |
| `import.meta.env.DEV` | Computed Vite flag used by the API URL fallback, not an environment variable to enter. |
| `NODE_ENV` | Tool-managed; do not force `development` on hosted builds. Both Vercel scopes run `pnpm build` in Vite production mode; Preview does not mean a Vite dev server or an automatic `.env.preview` load. |
| `VERCEL_BRANCH_URL`, `VERCEL_PROJECT_PRODUCTION_URL` | Platform metadata, intentionally not used for auth trust. Branch/custom aliases do not become allowed Preview origins. |
| `DATABASE_PATH` | Removed API setting. Omit in every environment; there is no SQLite fallback. |

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
proxy-header trust is needed. Login and logout use matching cookie attributes;
logout deletes the hashed session and clears the host-only cookie. Cookie lifetime
is seven days; session expiry is also enforced in PostgreSQL. The host-only cookie
does not transfer to another deployment hostname.

The resolved frontend origin owns four behaviors in [server.ts](../../apps/api/src/server.ts):

- Credentialed CORS allows that one origin, never `*` or a reflected request value.
- Every POST requires an exact `Origin`, including challenge, verification,
  sensitive wallet linking and logout. Missing/`null`/foreign Origins are rejected;
  this is CSRF/origin protection in addition to SameSite cookies.
- Both login and H2 wallet-proof messages include that origin. Verification also
  rejects a challenge issued for another origin, even if Preview deployments share
  a database. The exact stored message, nonce, purpose and H2 session binding remain
  mandatory. There are no auth callbacks or callback URL generation.
- HTTPS origins set and clear Secure cookies, independently of Host or proxy headers.

[config.ts](../../apps/api/src/config.ts) resolves exactly one trusted origin:

| Environment | Origin policy |
| --- | --- |
| Ordinary local | `FRONTEND_ORIGIN` or exact `http://localhost:5173`. Use localhost consistently for browser/API cookies. |
| Combined `vercel dev` | Exact `http://localhost:3000` supplied locally; dev browser calls `/api`. |
| Vercel Preview | Exact `https://` plus platform `VERCEL_URL`. No manual `FRONTEND_ORIGIN` needed; it is ignored in this scope. Use the deployment's unique generated URL. |
| Vercel Production | Required manual `FRONTEND_ORIGIN`, the canonical HTTPS browser origin, with no path/trailing slash. Deployment URLs and aliases do not expand trust. |

Enable automatic system environment variable exposure in the Vercel project.
[Vercel's metadata documentation](https://vercel.com/docs/environment-variables/system-environment-variables)
defines `VERCEL_URL` as the generated hostname without a scheme. Missing/invalid
Preview metadata, missing Production origin, non-HTTPS hosted origins, wildcards
and malformed origins fail startup. No incoming Host, forwarded host or Origin is
used to choose trust. A branch alias, custom Preview alias or another deployment
is intentionally rejected for auth POSTs; use the unique URL for this smoke test.

Keep Deployment Protection enabled if selected for Preview. Authenticate to Vercel
in the browser first; then relative `/api` requests stay on that protected host
and carry its protection cookie alongside the app's cookie. `VERCEL_URL` here is
server-side trust metadata, not a fetch destination. See [Vercel's relative-request
guidance](https://vercel.com/docs/deployment-protection#standard-protection).

### Smoke deployment dashboard matrix

These are the complete custom variables for the **auth/web-shell smoke**, before
blockchain work. Both services share project environment settings; only the API
reads database variables and none belong in a public prefix. The existing chain
matrix above describes future trading prerequisites, not smoke requirements.

| Setting | Development | Preview | Production | Dashboard action |
| --- | --- | --- | --- | --- |
| `DATABASE_URL` | Local or isolated development PostgreSQL. Supply privately in the local environment; a Development-scoped dashboard value is optional. | Isolated Preview Neon database/branch, pooled TLS URL. | Separate Production Neon database/branch, pooled TLS URL. | Required secret for each hosted scope, distinct targets/credentials. Never copy a Production URL into Development or Preview. |
| `FRONTEND_ORIGIN` | Optional exact localhost override; `http://localhost:3000` for combined dev. | Absent. | Exact canonical HTTPS browser origin. | Enter only for Production; local override belongs to the local environment. |
| `VITE_API_URL` | Absent for ordinary Vite; local `/api` override for combined dev. | Absent. | Absent. | Do not enter for hosted scopes. |
| `VERCEL`, `VERCEL_ENV`, `VERCEL_URL`, `PORT` | CLI-managed when applicable. | Platform-managed. | Platform-managed. | Enable system variable exposure; never create manual values. |
| `DATABASE_URL_UNPOOLED`, `TEST_DATABASE_URL` | Operator/test environments only; tests require a direct/local disposable database. | Absent from runtime dashboard. | Absent from runtime dashboard. | Migrate the intended target explicitly using operator credentials. No build/startup migration. |
| `DATABASE_PATH`, `API_HOST`, `API_PORT` | No SQLite setting; listener overrides only if needed locally. | Absent. | Absent. | Do not enter for hosted scopes. |
| Blockchain `VITE_*`, `SOLANA_RPC_URL`, `VITE_SOLANA_PROGRAM_ID` | Existing local chain workflow only. | No new values required for auth smoke. | No new values required for auth smoke. | Do not import localhost examples or fabricate deployments; blockchain configuration is a separate task. |

Preview requires **one manual secret: `DATABASE_URL`**. Production requires
**`DATABASE_URL` and `FRONTEND_ORIGIN`**. Database/schema separation is an operator
setup requirement; code cannot verify Vercel scope selection or Neon branch
ownership. No hosted credentials or dashboard settings were changed here.

### Dashboard inputs and functional-deployment blockers

For authentication, use the smoke matrix above. For a **functional marketplace**,
add the public chain resources to the appropriate [Vercel environment scope](https://vercel.com/docs/environment-variables).
For EVM, enter the chain ID, public RPC and all three addresses; for Solana, the
public RPC and both mints; for Sui testnet, all three IDs. Sui network/RPC can use
the defaults and the coin type can derive from the package when that matches the
deployment. Scope resource sets separately when Preview and Production use
different deployments. Keep Preview identity storage isolated from Production,
and apply migrations explicitly to each target using operator/CI credentials.

Intentionally omit `VITE_API_URL`, `VITE_SOLANA_PROGRAM_ID`, `DATABASE_PATH`,
`DATABASE_URL_UNPOOLED`, `TEST_DATABASE_URL`, `API_HOST`, `API_PORT`, manually
supplied `PORT`/`VERCEL`/`VERCEL_ENV`/`VERCEL_URL`, Preview `FRONTEND_ORIGIN`, invented session/signing variables and all
frontend secrets. Database administration/test URLs belong only in their specific
operator or test environments.

The current localhost API/RPC URLs, EVM `31337` and local contract addresses,
local Solana mints/validator, and Sui placeholder/missing deployment IDs are
not hosted resource configuration. In a deployed browser, localhost targets
the visitor's machine. Before a functional deployment:

1. Create the intended isolated Neon databases/branches, configure server-only
   runtime URLs and run migrations. If retaining existing SQLite identities,
   follow the explicit cutover procedure. Verify TLS, pooled transactions,
   cross-instance auth and persistence on an isolated hosted target.
2. Select and deploy the intended testnet resources in separate chain tasks.
   EVM needs compatible MockUSDC (6 decimals), VehicleNFT and Marketplace,
   vehicles matching the catalog's token IDs 1-3 and funded test wallets.
   Solana needs the program at the compiled ID (or consistent client/Rust/Anchor
   alignment), initialized MarketConfig with the payment mint, a 6-decimal mock
   payment mint and a vehicle mint with supply 1. Sui needs a published package,
   shared Market, Vehicle, the correct MUSDC payment type and gas/payment funds.
3. Make the small public-network configuration/metadata adjustments required by
   those chosen deployments. EVM transport and catalog labels read `VITE_CHAIN_ID`,
   but the wallet network name in `contracts/config.ts` remains `Local Anvil`.
   Solana uses a neutral configured-validator label and the compiled program ID;
   environment variables cannot select a different program. An environment-only
   change does not update all network metadata or prove deployment compatibility.
   Never reuse deterministic local fixture keys on public networks or repoint
   the local seed scripts to them.
4. Configure the canonical Production origin, enable system metadata for Preview
   and populate only the necessary public/server settings. Local integration is
   resolved as recorded below; verify deployed routing, HTTPS auth and each actual wallet
   purchase flow. RPC availability/CORS, program/object compatibility and
   persistence across instances cannot be established by this audit.

## Local checks and deployment steps

After [local PostgreSQL setup and migrations](postgres.md#local-postgresql-setup),
the two-terminal `pnpm api:dev` / `pnpm dev` workflow uses exported `DATABASE_URL`.
No Dockerfile or Compose file exists in this checkout. Container-compatible host,
port and API URL overrides remain available; containers now need a PostgreSQL
connection rather than an API-local SQLite volume.

For the combined Vercel route table, use a fresh Command Prompt from the repository
root, with a current Vercel CLI supporting Services:

Export the local `DATABASE_URL` in that terminal first and migrate that database;
the URL is server-only and must not be renamed with a Vite prefix.

```bat
set "FRONTEND_ORIGIN=http://localhost:3000"
set "VITE_API_URL=/api"
vercel dev -L --listen 3000
```

CLI **62.7.0** passes the native Services smoke with the corrected bootstrap and
asset fallback; the previously installed 54.11.1 rejects service-object rewrite
destinations. If this host's existing
modules use `.pnpm-store`, select that same store before Vercel's dependency sync:

```bat
set "npm_config_store_dir=%CD%\.pnpm-store"
```

`-L` avoids cloud authentication. Local Vercel development injects service ports
and uses the explicitly configured local PostgreSQL connection. It may
need to download Vercel runtime tools. Existing API environment files are not
automatically loaded by the ordinary API scripts; see [environment loading](verification.md#environment-examples-and-loading).

Service names/public paths were confirmed in the scaffolding task. Set up the
database/schema and project/environment values before running these commands from the root:

```bat
vercel link
vercel
```

`vercel` creates a preview deployment. Production deployment is a separate,
explicit action (`vercel --prod`). No Vercel deployment or Production database
migration was performed here.

After the first deployment, verify both service builds include workspace packages,
API JSON/404 routing, SPA deep links and real JS/CSS asset responses, exact Origin
rejection, HTTPS cookie login/session/logout and H2 proofs. Verify durable identity
and challenge consumption across cold starts/concurrent instances.
Verify browser-wallet/network interaction separately; local tests and
application builds cannot establish these hosted/runtime results.

## Verification on 2026-10-07

Windows, Node `24.19.0`, pnpm `10.26.0`. This table records the original
scaffolding checks **before the PostgreSQL migration**; the subsequent environment
audit is recorded separately below. SQLite results are historical evidence.

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

This records the audit before PostgreSQL; its reader counts and storage guard
describe that earlier implementation. The current environment matrix above
includes the migration's runtime/admin/test URLs.

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

## Hosted smoke preparation on 2026-10-07

Windows, Node `24.19.0`, pnpm `10.26.0`, cached Vercel CLI `62.7.0` with native
Fastify builder `17.0.0`, and task-owned PostgreSQL `18.6` on loopback. No hosted
database or Vercel project was changed in this run.

The earlier HTTP 500 was reproduced before changing application files. The
native Fastify builder's entrypoint callback scans known filenames for a direct
`fastify` import, including when `src/index.ts` is supplied as the service
entrypoint. The bootstrap lacked that import, so a direct callback probe selected
`src/server.ts`, which exports a factory rather than opening a listener. The Node
adapter imported that module and threw `Can't detect way to handle request`.
The bootstrap now directly imports/passes the real Fastify constructor and calls
`listen()` without awaiting the adapter-intercepted call. The same callback selects
`src/index.ts`, and actual Services HTTP auth succeeds. No framework replacement,
route relocation or persistence redesign was needed.

After the API fix, the web's unconditional SPA fallback reproduced HTML responses
for Vite script URLs. A header-conditioned fallback was also insufficient in this
CLI's service router. The final path-based fallback excludes `/assets/*`, `/@*`
and file URLs; both development scripts and built assets pass. The original
development command was restored after temporarily serving the built output
with `vite preview` for the asset check.

| Check | Result and scope |
| --- | --- |
| `pnpm api:test` | **passed**, 49 tests on disposable local PostgreSQL. Existing proofs/H2/concurrency/persistence coverage plus exact Local/Preview/Production policy, malformed/missing metadata, foreign/missing/null Origin, forged Host headers, cross-origin challenge rejection, CORS preflight, cookie attributes, durable session lookup and logout. |
| `pnpm execution:test` | **passed**, 35 tests including production `/api` default and credentialed browser requests. |
| `pnpm typecheck` / `pnpm lint` | **passed**, recursive workspace TypeScript and web ESLint. API lint **not run** because none is configured. |
| `pnpm build` / `pnpm --dir apps/api build` | **passed**. Existing Vite annotation/chunk warnings remain. No dependency/lockfile changes. |
| Native `vercel dev -L --listen 127.0.0.1:3000` | **passed**, both real services, API prefix/query preservation, API JSON 401/404s, exact Origin rejection, signed HTTP login, session lookup, replay/logout, SPA navigation and Vite script responses. Used only the disposable local database. |
| Built web output through local Services | **passed**, all 75 production output files matched exact bytes, JS/CSS MIME remained correct, and SPA deep links/API separation worked with `vite preview` as the temporary web development command. This does not establish Vercel's hosted static build. |
| Compiled API entrypoint | **passed**, separate real HTTP processes for Local and emulated Preview/Production metadata: exact origins, signed login, cookie flags, session lookup and logout. HTTPS cookie attributes were checked over local HTTP; browser enforcement remains a hosted check. |
| Configuration/credential boundaries | **passed**, native CLI schema/entrypoint validation, asset exclusion checks, actual CLI SDK upload inventory (171 files), no local env/tooling/fixture/artifact uploads or configured database credentials. Real server-only database values supplied privately during the frontend build were absent from all 75 browser outputs; no hosted API URL override was present. |
| Documentation/diff | **passed**, local links/anchors and `git diff --check`. |
| Hosted/browser/runtime proof | **not run**, no deployment. Vercel cloud packaging, matching system metadata, HTTPS browser cookies/wallet signing, Deployment Protection, Fluid Compute pool suspension/cold starts and Neon suspend/resume still require the first isolated hosted smoke. No blockchain testnet deployment or network change occurred. |

The repository is ready for an **authentication/web-shell smoke** after the
operator configures the Preview database/schema and enables system metadata.
Production additionally requires its separate database/schema and canonical
origin. Start from the unique Preview URL and verify `/api/me` returns JSON 401,
then login, session reload, sensitive linking and logout, with rejected foreign
Origins and intact JS/CSS responses. Do not interpret local chain errors as
authentication or Services verification. This run made no commit, push or
deployment; the working tree is left for review.

## Hosted API module-loading failure on 2026-10-08

Status: **historical diagnosis**; the correction shipped in `ce4e27f`. The next
[runtime exception](#production-dependency-loading-failure-after-ce4e27f) is different.
The UI revamp was
committed/pushed before this investigation. The active Production alias
`web3-marketplace-phi.vercel.app` resolves to deployment
`dpl_GrQUiet5cqPovmCyKSCMkHrvPHdg`, built from
`83b134f3ecb3a288731c58254c9be76ee79fdad9`, not the earlier `0f18865` deployment.
Both deployments were Ready; Ready did not establish API runtime health.

### Diagnosis and minimal correction

The sanitized runtime log for `GET /api/me` at **2026-10-08 03:05:55.265 UTC**
shows the Node process exiting while loading the `services/api/index` function:

```text
/var/task/index.js:1
import { attachDatabasePool } from '@vercel/functions';
SyntaxError: Cannot use import statement outside a module
    at wrapSafe (node:internal/modules/cjs/loader:1861:18)
```

This occurs before configuration validation, pool construction, Fastify plugin
registration, route handling, SQL or response serialization. Neon is not the
cause of this observed invocation failure. The earlier bootstrap fix is present
in the deployed commit: direct Fastify import, real constructor injection and
unawaited adapter-intercepted `listen()`.

The cloud build log identifies the native Services `@vercel/backends` builder
and `pnpm build`/`tsc`. With no API output-directory setting, the builder reuses
the detected `dist` entrypoint after the build and flattens its files into the
function root. Local CLI 62.7.0 / builder 17.0.0 reproduced a handler `index.js`,
no root `package.json`, and an API package file still at `apps/api/package.json`.
The emitted ESM imports therefore lose their package scope; repository-relative
dependency locations also no longer match the relocated handler. A local Node
load with automatic module detection disabled reproduced the exact SyntaxError.
The cloud builder version was not exposed in the build log; the local version
is evidence of the same packaging behavior, not a claim about its cloud version.

The correction is **one service configuration line** in [vercel.json](../../vercel.json):
`services.api.outputDirectory = "."`. In the inspected builder this prevents
automatic reuse of `dist`, while keeping `src/index.ts` as the configured native
entrypoint. The corrected native build emits `apps/api/src/index.mjs` and retains
the workspace layout. This matches the workaround described in the
[upstream Services packaging issue](https://github.com/vercel/vercel/issues/17651).
The [service configuration reference](https://vercel.com/docs/services/config-reference#outputdirectory)
documents the setting. No root module-type change, framework replacement,
manual function handler or runtime auth/database change is required.

### Environment and Neon findings

Read-only CLI inspection confirmed repository-root Services, Node `24.x`, workspace
sources enabled, automatic system-variable exposure enabled, `DATABASE_URL`
present as a sensitive variable for Production/Preview, and `FRONTEND_ORIGIN`
scoped to Production. The origin was privately checked with the API's actual
validator and matches `https://web3-marketplace-phi.vercel.app` exactly. Neither
database credentials nor environment values were printed. No manual platform
`VERCEL`, `VERCEL_ENV`, `VERCEL_URL` or `PORT` settings were present.

**No dashboard adjustment is required for the identified module-loading failure.**
Availability of the Production database credential is confirmed; its value was
not decrypted or compared with the local Neon URL. Preview/Production database
isolation remains an operator responsibility under the environment matrix above.

Read-only checks of the already configured local Neon pooled URL passed: the
application's TLS socket is encrypted and its certificate verifies, all six
expected public tables exist, session/wallet SELECTs execute, and connections can
be reused and explicitly closed. The pool is created once per application
instance, uses five connections and a five-second idle timeout, and is attached
to Vercel's lifecycle by the existing `attachDatabasePool` call. There are no
startup migrations or per-request pool shutdowns. Driver TLS behavior was not
weakened. The installed driver warns that `sslmode=require` semantics change in
a future major version; no dependency or connection setting was changed here.

An initial diagnostic incorrectly used `pg_stat_ssl` for the pooler's backend
connection; that does not describe the application's TLS connection. The corrected
socket check passed. Hosted credential correctness, Neon wake-up latency and
Fluid Compute suspension/reuse still require deployed SQL-backed authentication.
No Neon schema/data writes or migrations were performed.

### Verification and remaining limits

[The dated verification record](verification.md#vercel-api-runtime-verification)
contains commands, results and failures. Local Services passed real HTTP auth,
API prefix/query handling, JSON 401/404, Origin rejection, replay/logout and web
navigation/script checks using a task-owned schema in disposable localhost
PostgreSQL. Existing security regressions pass, with one additional test for
session lookup across instances and missing/invalid/expired sessions.

The corrected native handler passes Node syntax checking. Loading a materialized
isolated function on this Windows host **failed** on missing scoped pnpm dependency
aliases (`@mysten/sui`, then `@noble/hashes`); local tracing also omits those aliases
from ordinary compiled-source traces. This leaves the complete Linux/cloud
package unverified. Do not count the source-based Services emulator or syntax
check as a packaged-function runtime pass. No production redeployment was made;
read-only Production probes still return HTTP 500 with the
`FUNCTION_INVOCATION_FAILED` response header, while `/` returns the new UI HTML.

### New-deployment verification procedure

1. Review/commit the configuration, session test and documentation changes, then
   push only when authorized. With the existing Git integration, a push to `main`
   creates a new Production deployment. Redeploying the old `83b134f` source alone
   does not include this fix. Confirm the new deployment's exact commit and both
   service build results in Vercel; keep the checked-in API output setting.
2. From an unauthenticated terminal, run:

   ```bat
   curl.exe -i -H "Accept: application/json" https://web3-marketplace-phi.vercel.app/api/me
   curl.exe -i -H "Accept: text/html" https://web3-marketplace-phi.vercel.app/api/runtime-probe-missing
   ```

   Expect `/api/me` **401**, JSON `error.code = unauthenticated`, `Cache-Control:
   no-store`, and no invocation-error header. Expect the unknown API route **404**
   with JSON even when HTML is accepted. Check that logs have no module-loading
   or dependency-resolution exception. Repeat the read after an idle interval;
   this checks function startup, but no-cookie `/me` still performs no SQL.
3. Load `/`, a SPA deep link, and actual JS/CSS URLs from the new page. Confirm
   200 responses, proper content types and all three wallet controls. Do not
   connect/sign just to establish page rendering.
4. On the intended isolated hosted test target, perform real wallet challenge,
   signed login, session reload, sensitive wallet linking and logout. Use the
   exact Preview deployment origin or canonical Production origin as applicable.
   Confirm Secure/HttpOnly/SameSite=Lax/Path=/ cookies without Domain, rejected
   foreign Origins, replay rejection, invalid/expired-session 401s and persistence
   across independent invocations/idle periods. Never publish cookies or proofs.
   This step exercises Neon; do not replace it with a fabricated auth response.

The initial diagnostic run left the fix ready for review and a new build. That
phase made no commit, push, redeployment, dashboard mutation, production migration
or blockchain change. The subsequent authorized pre-push review approved the
four-file change; [its fresh checks and exclusions](verification.md#pre-push-review-on-2026-10-08)
are recorded separately. Frontend source/branding and production auth logic remain
unchanged. Hosted health still requires the new deployment's runtime checks.

## Production dependency-loading failure after ce4e27f

Status: **current diagnosis; correction finalized; hosted verification pending**. Read-only CLI
inspection confirms Production deployment `dpl_2CQEgJ9vNJbb9XXTCBj8mSNFGeQe`,
`web3-marketplace-3p6l6b9h4-daniel-tsx.vercel.app`, at exact commit
`ce4e27f3f27799a4f5e757d9470895631e422798`. Its canonical alias remains
`https://web3-marketplace-phi.vercel.app`.

### Exact exception and changed failure boundary

The exception for `/api/me` at **2026-10-08 03:38:10.413 UTC**, and
`/api/runtime-probe` at **03:38:17.956 UTC**, is:

```text
Error [ERR_REQUIRE_ESM]: require() of ES Module
/var/task/node_modules/.pnpm/uuid@14.0.2/node_modules/uuid/dist-node/index.js
from /var/task/node_modules/.pnpm/rpc-websockets@9.3.9/node_modules/rpc-websockets/dist/index.cjs not supported.
    at /opt/rust/nodejs.js:2:14648
    at Module.Ro (/opt/rust/nodejs.js:2:15026)
    at e.<computed>.ft._load (/opt/rust/nodejs.js:2:14618)
    at a (/opt/rust/bytecode.js:2:1127)
```

This is **not** the earlier `/var/task/index.js` syntax error. The API imports
`PublicKey` from `@solana/web3.js@1.99.0`; its Node/CommonJS entrypoint requires
`rpc-websockets@9.3.9`, whose CommonJS build unconditionally calls `require('uuid')`.
The lockfile resolves that dependency to UUID `14.0.2`, whose package is ESM-only.
The Vercel CommonJS loader shown in the stack rejects it before application
initialization, configuration/pool creation, routes or SQL. Neon is not implicated
by this exception.

Default local Node 24 can synchronously require eligible ESM modules, and `tsx`
can transform dependencies. Those checks masked the incompatibility. A plain Node
child with `--no-experimental-require-module` reproduces the same exception and
module paths. This reproduces the relevant loader capability; it does not emulate
all of Vercel's Rust launcher.

### Packaging/configuration evidence

The exact deployment metadata retains API root `apps/api`, Fastify,
`entrypoint: src/index.ts`, `buildCommand: pnpm build`, `outputDirectory: .`,
Node 24, the API path transforms and the separate Vite output/SPA rules. Its
build log reports native `@vercel/backends` and
`Build complete — Using src/index.ts as the root entrypoint.` Cloud CLI is 62.1.0;
the backend builder version is not exposed.

The official [Fastify documentation](https://vercel.com/docs/frameworks/backend/fastify)
supports this source listener pattern, and the
[Services reference](https://vercel.com/docs/services/config-reference) supports
service-scoped build/output settings. The inspected native builder's `.` setting
prevents reuse/flattening of `dist`. The new exception is independently reproduced
without that builder; changing these settings does not repair the dependency's
CommonJS import. Both overrides, the entrypoint and all routing remain unchanged.

The deployment file-tree endpoint returned **404**, so the cloud function archive
was not downloaded or inspected. A fresh actual local native build (CLI 62.7.0 /
backend 17.0.0) emits `apps/api/src/index.mjs`, with ESM format and API
`package.json` type `module`. Its corrected dependencies include CommonJS
`rpc-websockets@9.3.8`, UUID `11.1.1`'s `./dist/cjs/index.js` require export and its
nested `type: commonjs` package. These are local artifact findings, not a claim
about the inaccessible cloud archive. Isolated Windows artifact loading still
fails on an omitted scoped `@noble/hashes` alias; the complete cloud package remains
unverified.

### Minimal dependency correction

The root [package.json](../../package.json) adds one scoped pnpm override:
`"@solana/web3.js>rpc-websockets": "9.3.8"`. The regenerated
[lockfile](../../pnpm-lock.yaml) changes only that package `9.3.9 → 9.3.8` and its
UUID `14.0.2 → 11.1.1` dependency, plus the override. It remains within the Solana
SDK's declared `^9.0.2` range. The
[published 9.3.8 manifest](https://raw.githubusercontent.com/elpheria/rpc-websockets/v9.3.8/package.json)
declares UUID `^11.0.0`; UUID 11 supports both CommonJS and ESM, whereas
[UUID 12 onward removes CommonJS support](https://github.com/uuidjs/uuid/blob/main/README.md).
Registry metadata marks 9.3.10 deprecated; it was considered but is not retained.
There is no SDK/major-version upgrade or handwritten dependency patch.

[config.test.ts](../../apps/api/src/config.test.ts) adds the regression: a plain
Node child, without `tsx`, imports the exact API Solana CommonJS dependency while
disabling synchronous `require(ESM)` and automatic module detection. It failed on
9.3.9/UUID 14 before the correction and passes on 9.3.8/UUID 11. The first attempted
`tsx` child masked the error and was corrected before retaining the regression.
API authentication, persistence, bootstrap, UI/branding, transaction and blockchain
deployment sources are unchanged. No private environment value or credential was
printed, tracked or moved to the browser.

### Final dependency and advisory review

The override matches only the direct `@solana/web3.js > rpc-websockets` edge;
there is no global rpc-websockets or UUID override. Both SDK peer-dependency
snapshots resolve rpc-websockets `9.3.8`, whose snapshot resolves UUID `11.1.1`.
A fresh tracked-file snapshot, with no existing `node_modules`, private env files
or generated output, installed using pnpm `10.26.0` and `--frozen-lockfile`.
The lockfile remained byte-for-byte unchanged. Installed API resolution reaches
UUID's CommonJS export. The Services configuration is unchanged.

On **2026-10-08**, `pnpm audit --json` was run against the exact previous
commit's lockfile and the corrected lockfile. Advisory IDs, vulnerable versions
and dependency paths are identical: **zero introduced findings**, and no reported
finding for rpc-websockets `9.3.8` or UUID `11.1.1`. UUID `11.1.1` is the patched
version for [GHSA-w5hq-g745-h8pq](https://github.com/uuidjs/uuid/security/advisories/GHSA-w5hq-g745-h8pq).

The overall audit still **fails** with **12 pre-existing findings: one critical,
four high and seven moderate**. These are unresolved and were not changed by
this runtime fix:

| Dependency/version | Severity | Advisory and existing chain |
| --- | --- | --- |
| shell-quote `1.10.0` | Critical | [GHSA-pqg4-j6r4-53mv](https://github.com/advisories/GHSA-pqg4-j6r4-53mv), React Native/react-devtools-core beneath the web wallet adapter. |
| bigint-buffer `1.1.5` | High | [GHSA-3gc7-fjrx-p6mg](https://github.com/advisories/GHSA-3gc7-fjrx-p6mg), web SPL Token/buffer-layout-utils. |
| ws `8.18.0` | High and moderate | [GHSA-96hv-2xvq-fx4p](https://github.com/advisories/GHSA-96hv-2xvq-fx4p), [GHSA-58qx-3vcg-4xpx](https://github.com/advisories/GHSA-58qx-3vcg-4xpx), older Viem beneath WalletConnect. |
| braces `3.0.3` | High | [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), React Native/Metro/micromatch. |
| source-map-js `1.2.1` | High | [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q), web Vite/PostCSS. |
| uuid `8.3.2` and `9.0.1` | Moderate, two findings | [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq), SDK/Jayson and Gemini/MetaMask respectively; neither is the corrected RPC dependency. |
| decode-uri-component `0.2.2` | Moderate | [GHSA-vcc3-ghjq-m6fr](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr), WalletConnect/query-string. |
| stream-json `1.9.1` | Moderate, three findings | [GHSA-528h-pc64-c93x](https://github.com/advisories/GHSA-528h-pc64-c93x), [GHSA-hqr4-qq8f-hg3x](https://github.com/advisories/GHSA-hqr4-qq8f-hg3x), [GHSA-mjw6-4jj6-33hc](https://github.com/advisories/GHSA-mjw6-4jj6-33hc), SDK/Jayson. |

This comparison is a dependency advisory check, not a reachability assessment or
a claim that the workspace is vulnerability-free. Separate security maintenance
should assess these existing paths and compatible fixes, especially the critical
finding. No unrelated dependency upgrade was bundled into the runtime correction.

### Verification before another deployment

See the [fresh verification record](verification.md#dependency-import-follow-up-on-2026-10-08)
for passed/failed/unverified scopes. Plain compiled API startup now passes with
the same loader restriction, production origin policy/pool attachment and JSON
401/404; SQL-backed authentication tests use dedicated localhost PostgreSQL.
No hosted schema/data writes, migration or dashboard change were performed.
The original investigation did not commit, push or redeploy. The finalization
request authorizes committing and pushing this correction to `origin/main`;
the existing Vercel Git integration handles deployment, with no manual deploy.

Read-only canonical probes still return HTTP 500 with `FUNCTION_INVOCATION_FAILED`
for both paths, while the new UI HTML loads. The immutable deployment URL returns
a platform JSON 401 with `error.code = "401"` and no marketplace UI; it is not the
API's `unauthenticated` response and must not be counted as API health.

After the Git-triggered deployment reaches Ready, confirm its exact pushed commit
and locked rpc-websockets/UUID versions in the build. Then use the
canonical alias (or an authenticated/bypassed protected test target):

```bat
curl.exe -i -H "Accept: application/json" https://web3-marketplace-phi.vercel.app/api/me
curl.exe -i -H "Accept: text/html" https://web3-marketplace-phi.vercel.app/api/runtime-probe
```

Expect API JSON **401**, `error.code = unauthenticated`, `Cache-Control: no-store`,
and API JSON **404**, respectively, without `x-vercel-error`. Check that runtime
logs contain neither the former entrypoint syntax error nor UUID `ERR_REQUIRE_ESM`
or missing-package errors. Repeat after idle; verify homepage/deep links/assets
and wallet controls. On the intended isolated hosted auth target, perform real
signed login, persistent `/api/me` **200**, replay/Origin rejection and logout
followed by **401**, preserving Secure/HttpOnly/SameSite cookies. That SQL-backed
flow, unlike an unauthenticated probe, verifies the hosted Neon connection.
