# Vercel Services deployment

Status: **current**. This owns the additional Vercel deployment target. The
API uses PostgreSQL for durable identity storage. Native Services routing and
hosted-origin policies pass local checks. The first hosted deployment still needs
to verify Vercel builds, HTTPS browser authentication and database lifecycle.
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
