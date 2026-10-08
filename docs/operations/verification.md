# Local verification

Status: **current**. This is the command/prerequisite owner. Run commands from the
repository root in Command Prompt unless noted. Root
[package.json](../../package.json) pins pnpm `10.26.0`; use Node 24. PostgreSQL is
required for API runtime/tests; `node:sqlite` is used only by the cutover tool/tests.
Install workspace dependencies before application checks. Chain tools are separate
from `pnpm install`.

## Host evidence and result language

Inspected on 2026-10-06: Node `24.19.0`, pnpm `10.26.0`, and
`.tools\foundry\forge.exe --version` (Foundry `1.8.3`) executed successfully.
Foundry binaries exist locally but are absent from PATH. Anchor, Solana CLI/
validator, Rust/Cargo and Sui were not found by `where`; `wsl --list --quiet`
reported that WSL is not installed. Recheck prerequisites in later sessions.
The ignored `.tools/` directory is host-local, not a guaranteed part of a fresh clone.

| Result | Report it when |
| --- | --- |
| **passed** | The stated command/check completed successfully for the stated scope. |
| **failed** | The command/check ran and returned a failure; include the relevant output. |
| **not run** | It was deliberately not executed, with the reason. |
| **environment unavailable** | A required tool/runtime/deployment is absent; state the missing prerequisite. |

[H1's verification record](../audit-fix-01-purchase-intent.md#verification) and
[H2's record](../audit-fix-02-wallet-link-reauthentication.md#verification-on-2026-10-06)
retain historical results. The [repository-polish record](#repository-polish-verification)
below records the current pass separately. Anchor and Move build/runtime remain
unverified. No deployment or wallet-interaction result is established by these checks.

## Command matrix

All pnpm commands below resolve to existing root or package scripts. Available
means the check's tools are present here, not that the check has just passed.

| Check | Command | Scope and prerequisite | This host |
| --- | --- | --- | --- |
| Solidity compile + ABI export | `pnpm contracts:build` | Foundry/solc, OpenZeppelin and initialized forge-std submodule; regenerates [abis.ts](../../apps/web/src/contracts/abis.ts). | Available using local Foundry/PATH setup below. |
| EVM tests | `pnpm contracts:test` | [Foundry suite](../../packages/contracts/test/VehicleMarketplace.t.sol), including H1; no Anvil or wallet needed. | Available using local Foundry/PATH setup. |
| API tests | `pnpm api:test` | Real PostgreSQL with dedicated `TEST_DATABASE_URL`; isolated schemas test migrations, import, cryptographic proofs, H2 and concurrent instances. No chain runtime needed. | Available with local PostgreSQL; see [setup](postgres.md#local-postgresql-setup). |
| Frontend execution tests | `pnpm execution:test` | Browser API URL configuration, resolver, Sui result/query/read helpers, purchase-error and [H3 reconciliation tests](../../apps/web/src/web3/reconciliation.test.ts) listed in [web scripts](../../apps/web/package.json); no browser/wallet needed. | Available; uses Vite-transformed API code, real query clients, controlled reads and a server-rendered EVM status. Does not test browser interaction or real wallet/RPC execution. |
| TypeScript | `pnpm typecheck` | Recursive API/web/Solana/Sui typechecks; contracts package has no typecheck script. | Available; does not compile Rust or Move. |
| Lint | `pnpm lint` | ESLint on `apps/web/src` only. | Available; not repository-wide lint. |
| Frontend build | `pnpm build` | Web TypeScript then Vite production bundle. | Available; no API or chain deployment. |
| API build | `pnpm --dir apps/api build` | API TypeScript output to its ignored `dist/`. | Available; separate from root build. |
| Solana offline client | `pnpm --dir packages/solana test` | [Client tests](../../packages/solana/tests/client.test.ts): Borsh layout, reviewed intent encoding, config PDA/mint. | Available; not Anchor execution. |
| Anchor compile | `pnpm solana:build` | Anchor 0.32.1 + Rust/Solana build tools; [Anchor config](../../packages/solana/Anchor.toml). | Environment unavailable. |
| Solana runtime | `pnpm solana:test` | [Validator suite](../../packages/solana/tests/vehicle-marketplace.test.ts); running local validator, current built/deployed program and local fixture preparation. Writes/funds local test accounts. | Environment unavailable; root command is **not** the offline suite. |
| Sui TypeScript client | `pnpm sui:test` | [Builder tests](../../packages/sui/tests/client.test.ts): object inputs and old Listing/payment retention. | Available; no Move compilation/execution. |
| Move compile | `pnpm sui:move:build` | Sui CLI and Move dependencies; package under [packages/sui/move](../../packages/sui/move/). | Environment unavailable. |
| Move scenario tests | `pnpm sui:move:test` | Sui CLI; [Move scenarios](../../packages/sui/move/tests/marketplace_tests.move), including old-object intent. | Environment unavailable; even a pass would not prove deployed wallet flow. |

### Foundry on this Windows host

For this terminal only, expose the existing local binaries if using pnpm scripts:

```bat
set "PATH=%CD%\.tools\foundry;%PATH%"
pnpm contracts:test
```

Alternatively, these direct equivalents need no PATH change:

```bat
.tools\foundry\forge.exe test --root packages/contracts
.tools\foundry\forge.exe build --root packages/contracts
node scripts/export-abis.mjs
```

Build plus exporter corresponds to `contracts:build`; build alone does not refresh
the frontend ABI. Inspect any generated diff. On a fresh clone, install Foundry
separately and initialize forge-std as described in the setup section below.

## Local setup boundaries

The root [README](../../README.md#quick-start),
[Run 1](../run-01-evm-baseline.md#reproduce-locally),
[Run 2](../run-02-auth-solana-multichain.md#7-local-setup-and-commands), and
[Run 3](../run-03-sui-multichain.md#5-configuration-and-real-team-workflow) own the
detailed chain setup sequences. For a fresh clone, initialize the required
forge-std submodule before Solidity checks:

```bat
git submodule update --init --recursive
```

Install Foundry separately if it is not available; `.tools/` is not checked in.
New cmd examples should place one command per line;
the old `sh` blocks' trailing `#` annotations are explanatory, not cmd syntax.

| Configuration | Actual reader/behavior |
| --- | --- |
| API `DATABASE_URL`, `FRONTEND_ORIGIN`, `VERCEL`, `VERCEL_ENV`, `VERCEL_URL`, `API_PORT`, `API_HOST`, `PORT` | [config.ts](../../apps/api/src/config.ts) and [index.ts](../../apps/api/src/index.ts): database URL required; local origin/listener default to `http://localhost:5173`, `127.0.0.1:3001`. Preview origin comes only from platform deployment metadata; Production requires an exact canonical HTTPS origin. Platform `PORT` takes precedence; containers can set `API_HOST=0.0.0.0`. `pnpm api:db` explicitly applies schema; `api:dev` only starts the API. See [PostgreSQL setup/cutover](postgres.md) and [Vercel origin/matrix](vercel.md#api-origin-and-cookies). |
| `VITE_API_URL` | [auth/api.ts](../../apps/web/src/auth/api.ts): defaults to `http://localhost:3001` in Vite development and `/api` in production builds. Explicit URLs remain supported and trailing slashes are removed. Cookies require consistent frontend/API sites and the configured Origin. Keep Vite at 5173 locally and avoid mixing localhost/127.0.0.1 browser sites. See [Vercel communication](vercel.md#environment-and-communication) for combined development/deployment. |
| `VITE_CHAIN_ID`, `VITE_RPC_URL`, EVM address variables | [config.ts](../../apps/web/src/contracts/config.ts) defaults to 31337 / `http://127.0.0.1:8545`; [addresses.ts](../../apps/web/src/contracts/addresses.ts) reads MockUSDC, VehicleNFT and Marketplace public addresses. Local deployment sync writes them to ignored `apps/web/.env.local`. |
| `VITE_SOLANA_RPC_URL`, vehicle/payment mint variables | [bootstrap](../../apps/web/src/bootstrap.tsx) defaults RPC to `http://127.0.0.1:8899`; [App](../../apps/web/src/App.tsx) reads mint IDs. Program ID is compiled into [client.ts](../../packages/solana/src/client.ts), Rust and Anchor config; the seed-emitted `VITE_SOLANA_PROGRAM_ID` is unused. |
| `SOLANA_RPC_URL` | Solana [seed](../../packages/solana/scripts/seed.ts) and [runtime tests](../../packages/solana/tests/vehicle-marketplace.test.ts): defaults to local validator. Fixture accounts must never be used on a public network. |
| `VITE_SUI_*` | [Sui config](../../apps/web/src/web3/sui/config.ts) defaults to testnet/gRPC; package, Market and Vehicle IDs must come from an actual deployment. Coin type defaults to that package's `musdc::MUSDC`. A buyer also needs gas and mock payment funds. |

Restart Vite after public configuration changes. The EVM address sync preserves
Solana/Sui lines; Solana seeding preserves non-Solana lines. Never print `.env`
contents or local key files to diagnose configuration.

### Environment examples and loading

[apps/web/.env.example](../../apps/web/.env.example) contains only public browser
endpoints and placeholder identifiers read by current source. Copy it to
`apps/web/.env.local` before customizing it. Replace placeholders with IDs from
the corresponding deployment/seed workflow; placeholder strings intentionally
fail resource validation. The optional payment Coin type is derived from the Sui
package ID unless explicitly configured. There is no effective Solana program-ID
environment override. The local Solana scripts use `SOLANA_RPC_URL` if exported;
their existing localhost default needs no separate example file.

[apps/api/.env.example](../../apps/api/.env.example) lists the required server-only
database URL, optional server overrides and separate admin/test connections.
Create a local PostgreSQL database and replace the safe connection placeholder;
copying a file alone does not load it because the API has no dotenv loader. To load customized
values explicitly with Node 24/tsx, enter the API directory first so the relative
environment-file path resolves consistently, including through Windows launchers:

```bat
cd apps\api
copy .env.example .env
pnpm exec tsx --env-file=.env src/init-db.ts
pnpm exec tsx watch --env-file=.env src/index.ts
```

The init command applies migrations to the configured PostgreSQL database; the watch
command only starts the API. Database setup is an intentional mutation; there is
no automatic schema creation or SQLite fallback on startup.
Exported server variables also work with the existing `api:db`/`api:dev` scripts.
Local `.env` variants are ignored; `.env.example` files remain trackable.

Starting servers (`pnpm api:dev`, `pnpm dev`, `pnpm anvil`, `pnpm solana:validator`)
is distinct from tests. Preparation/deploy/seed (`pnpm solana:prepare`,
`pnpm contracts:deploy`, `pnpm solana:deploy`, `pnpm solana:seed`) is mutation and
requires task authorization under AGENTS.md. H1 changed the EVM ABI and Solana
layout; follow [compatibility notes](../audit-fix-01-purchase-intent.md#local-deployment-compatibility),
not a ledger reset shortcut. No reset/migration/deployment is authorized by reading a guide.

## GitHub CI

[ci.yml](../../.github/workflows/ci.yml) runs on pushes, pull requests and manual
dispatch with read-only repository permissions. A single Ubuntu job checks out
submodules, installs Node 24 and pnpm from the root `packageManager` pin, and runs
a frozen install. Foundry is pinned to `v1.8.3`, matching local verification.
A disposable PostgreSQL service supplies `TEST_DATABASE_URL` only to the API
test step; no production database credentials enter CI or the frontend build.
The job builds Solidity, exports the frontend ABI and fails on any committed ABI
drift before running contract tests and the frontend build. It also runs API,
execution/reconciliation, Solana offline and Sui TypeScript tests, recursive
TypeScript, frontend lint/build and API build.

CI does not start validators, execute Anchor or Move, interact with wallets,
deploy, seed or mutate external infrastructure. A locally validated workflow is
not a recorded GitHub-hosted run; the first hosted result requires a future push.

## Repository-polish verification

Executed on **2026-10-07**, Windows, Node `24.19.0`, pnpm `10.26.0`, Foundry
`1.8.3`. These are new results, separate from historical H1/H2 evidence.

| Command/check | Result and scope |
| --- | --- |
| `pnpm install --frozen-lockfile --store-dir .pnpm-store` | **passed**; existing local store and locked dependencies reused, no lockfile change. |
| `.tools\foundry\forge.exe build --root packages/contracts` | **passed**; unchanged sources reused the existing compilation cache. |
| `node scripts/export-abis.mjs` | **passed**; regenerated all three frontend ABIs. |
| `git diff --exit-code -- apps/web/src/contracts/abis.ts` | **passed**; no generated ABI drift. |
| `.tools\foundry\forge.exe test --root packages/contracts` | **passed**; 14 EVM marketplace/H1 tests. |
| `pnpm api:test` | **passed**; 31 identity, migration and H2 tests including nested cases. |
| `pnpm execution:test` | **passed**; 30 readiness, H1, Sui result/read and H3 tests including nested cases. |
| `pnpm --dir packages/solana test` | **passed**; 3 offline layout/intent/config tests, no Anchor execution. |
| `pnpm sui:test` | **passed**; 2 TypeScript builder/intent tests, no Move execution. |
| `pnpm typecheck` | **passed**; recursive API, web, Solana and Sui TypeScript. |
| `pnpm lint` | **passed**; frontend ESLint only. |
| `pnpm build` | **passed**; frontend TypeScript and Vite bundle. |
| `pnpm --dir apps/api build` | **passed**; API TypeScript compilation. |
| `pnpm exec tsx --env-file=.env.example <check>` and `pnpm exec tsx watch --env-file=.env.example <check>` from `apps/api` | **passed**; a temporary assertion script verified all three example variables and the working directory without opening a database or server; watcher stopped after verification. |
| `.tools\repository-polish\actionlint\actionlint.exe -shellcheck= -pyflakes= .github/workflows/ci.yml` | **passed**; actionlint `1.7.12` checked workflow syntax, expressions, action inputs and structure. ShellCheck/Pyflakes were not installed; run steps are individual existing commands. |
| JSON/YAML, source reads, links, Mermaid and ABI checks | **passed**; manifests parse; CI commands/order match scripts; all 18 example variables have actual readers; all 234 local links in the README and eight current/reference docs resolve including anchors; the official Mermaid parser accepts the sole README diagram; exported ABIs match Foundry artifacts. |
| `git check-ignore` for local `.env` variants and both examples | **passed**; local files are ignored, examples remain trackable. |
| `git diff --check` plus new-file whitespace inspection | **passed**. |
| `where anchor solana solana-test-validator cargo rustc sui` | **environment unavailable**; none found. Anchor and Sui Move compilation/runtime commands were **not run** in this pass. |
| GitHub-hosted CI and real browser-wallet flows | **not run**; no push, deployment or wallet interaction in this pass. |

The initial plain `pnpm install --frozen-lockfile` **failed** before changing
modules with `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`: this checkout's installed
modules use a workspace-local store. Reusing that store passed; fresh CI uses its
own default store. The first explicit API environment check from the repository
root **failed** with `.env.example: not found`; entering `apps/api` passed and the
documented commands were corrected. Restricted Corepack/submodule reads required
host access for checks; these are local sandbox limitations, not application fixes.

Non-failing warnings remain: pnpm ignored dependency build scripts, Solana's
bigint dependency used its JavaScript fallback, Vite reported dependency annotation
and large-chunk warnings, and sandboxed Foundry could not write its user signature
cache. No runtime source semantics, dependencies, lockfile, contract/program code,
schema or ABI changed. Browser title/description and wallet app-name metadata were
updated. Temporary validation tools live under ignored `.tools/`, outside the
workspace dependency manifests. No commit, push, deployment, seed, ledger reset,
repository-setting change or live database initialization was performed.

## UI revamp verification

Executed on **2026-10-08**, Windows, Node `24.19.0`, pnpm `10.26.0`.
[Marketplace presentation](../features/marketplace-presentation.md) owns behavior,
design, assets and image provenance. These results concern the local implementation,
not a deployment of the revamp.

| Command/check | Result and scope |
| --- | --- |
| `pnpm typecheck` | **passed**, recursive API/web/Solana/Sui TypeScript. |
| `pnpm lint` | **passed**, frontend ESLint. |
| `pnpm execution:test` | **passed**, all 37 tests, including existing API-base/credentials, resolver, H1/H3 and Sui helper coverage plus preview-mode/rendering regressions. No real wallet/RPC execution. |
| `pnpm build` | **passed**, final web TypeScript and production Vite build. Existing Rollup dependency-annotation and large-chunk warnings remain; largest JS chunk about 1.78 MB / 541 KB gzip. No added runtime dependency or lockfile change. |
| `node .tools\ui-revamp\asset-audit.cjs` | **passed**, all 14 public files match built output, OG 1200 × 630, touch icon 180 × 180, ICO 16/32/48, canonical/social URLs and Vercel SPA asset exclusions. Two actual local private configuration values checked privately are absent from browser outputs. This is a scoped leakage check, not an exhaustive secret audit. |
| `pnpm --dir apps/web exec vite preview --host 127.0.0.1 --port 4173` and `node .tools\ui-revamp\http-assets.cjs` | **passed**, production bundle served locally; all 14 public assets returned exact bytes over HTTP with correct image MIME types. Not Vercel Services runtime evidence. |
| Chromium visual/interaction review | **passed**, local Vite/production preview at 1440, 768, 390 and 320 pixels. No visible horizontal overflow or broken images; font loaded; previews browsable with unavailable/unconfigured chains and failed account reads. Ecosystem filters, wallet/network entry links, all three connection pickers and new Solana dialog Escape/focus restoration checked without connecting or signing. |
| Contrast/reduced motion | **passed**, sampled token contrast: body/canvas 16.65:1, muted/dark surfaces 6.66–7.83:1, accent/button 11.3:1, error/surface 8.88:1. Chromium reduced-motion emulation disables smooth scrolling and CSS motion. Not a full accessibility certification. |
| `node .tools\ui-revamp\docs-audit.cjs` / `git -c diff.ignoreSubmodules=all diff --check` | **passed**, 253 local documentation links/anchors, new component whitespace and tracked diff whitespace. Submodule inspection excluded due sandbox access; API/package/lockfile/service-route diff is empty. |
| Production `GET https://web3-marketplace-phi.vercel.app/api/me` | **failed**, unauthenticated read returned HTTP 500, `text/plain`, `FUNCTION_INVOCATION_FAILED`. Cause unverified; hosted authentication/routing health cannot be claimed. No remote mutation or deployment performed. |
| API tests/build, chain runtime suites, real signed wallet flows | **not run**, no backend/chain implementation changes. Dialog opening is not a wallet connection or signed-auth result. Public-chain resources were not deployed; Anchor/Move runtime limitations remain. |

Initial sandboxed pnpm attempts **failed** before checks ran because Corepack could
not access its pinned pnpm cache/download. The installed pinned tooling passed
with host access. Initial sandboxed browser startup also could not write its
socket directory; host access resolved that preview-tool limitation. The first
sandboxed loopback HTTP asset audit returned `fetch failed`; the same audit with
host loopback access passed.
Review screenshots are `artifacts/ui-revamp/desktop.png`, `desktop-full.png`,
`mobile.png` and `mobile-full.png`. Host-local audit scripts are ignored and
not portable repository test prerequisites. Native signing, confirmation,
reauthentication and purchase builders remain unchanged. No deployment,
environment/schema change or chain resource mutation was performed during verification.

## Vercel API runtime verification

Executed on **2026-10-08**, Windows, Node `24.19.0`, pnpm `10.26.0`, cached
Vercel CLI `62.7.0` / native backend builder `17.0.0`. The
[Vercel diagnosis and new-deployment procedure](vercel.md#hosted-api-module-loading-failure-on-2026-10-08)
owns the root cause and correction. Active Production is `83b134f`; the local
configuration fix had not yet been committed, pushed or deployed during this
initial diagnostic phase. The subsequent authorized review is recorded below.

| Command/check | Result and scope |
| --- | --- |
| Read-only Vercel CLI project/deployment/env/log inspection | **passed**, intended Services project, Production alias/commit, Node 24 and exact origin. Sanitized `GET /api/me` trace proves `Cannot use import statement outside a module` before application initialization. Connector deployment reads first **failed** with account-scope 403; the CLI fallback worked after user login. Secrets were not printed and dashboard settings were not changed. |
| Native build regression: `node .tools/api-runtime/build.mjs before` and `node .tools/api-runtime/load.mjs before` before the fix | **passed as a reproduction**, original configuration emits root `index.js` without a root ESM package. Local Node with automatic module detection disabled rejects the first import with the exact hosted SyntaxError. This is a build/loader regression, not a database result. |
| `node .tools/api-runtime/build.mjs fixed` after the fix | **passed**, actual native builder with installed dependencies and localhost-only settings emits `apps/api/src/index.mjs` when API `outputDirectory` is `.`; no deployment. |
| `node --no-experimental-detect-module --check .tools/api-runtime/fixed-function/apps/api/src/index.mjs` | **passed**, generated handler syntax. Does not execute imports or routes. |
| `node .tools/api-runtime/load.mjs after` / `node .tools/api-runtime/load.mjs fixed` | **failed**, isolated Windows function materialization cannot resolve scoped pnpm aliases (`@mysten/sui`, then `@noble/hashes`). Ordinary local NFT traces also omit those aliases. Complete Linux/cloud packaging remains **unverified**; no deployment-runtime pass is inferred from the other checks. |
| `pnpm api:test` via `node .tools/postgres-migration/test.mjs` | **passed**, all 50 tests on dedicated localhost PostgreSQL with per-test schemas. Includes new cross-instance session lookup and missing/invalid/expired-session 401s; cryptographic EVM/Solana/Sui, H2, exact origins, cookie flags, replay, persistence and concurrency regressions remain passing. Earlier 49-test pass preceded the added test. |
| `node .tools/api-runtime/local-db.mjs` launcher | **failed** as a launcher diagnostic: the Windows `pg_ctl` pipe remained open until cleanup, so its deferred availability probe ran after cluster shutdown. Separate database connections, the 50-test suite and HTTP smoke passed while the cluster was running. The task-owned schema was removed and the cluster stopped with its files preserved. |
| `pnpm typecheck` / `pnpm lint` | **passed**, recursive workspace TypeScript and frontend ESLint. Final API build also typechecks the added regression. API lint **not run**, none configured. |
| `pnpm --dir apps/api build` / `pnpm build` | **passed**, final API TypeScript and unchanged web build. Existing Vite annotation/large-chunk warnings remain; no dependency/lockfile change. |
| `pnpm execution:test` | **passed**, all 37 browser API-base/credential, resolver, preview, H1/H3 and Sui helper tests. No real wallet transaction. |
| `node .tools/hosted-smoke/audit.mjs` | **passed**, corrected Services schema, listening Fastify entrypoint, SPA asset exclusions, 191 SDK upload candidates and 89 browser outputs checked against private local database signatures. No private env/tooling/fixtures/artifacts uploaded; no credentials printed. Scoped leakage check, not an exhaustive audit. |
| Native `vercel dev -L --listen 127.0.0.1:3000` via `node .tools/api-runtime/run-dev.mjs`; `node .tools/api-runtime/http-smoke.mjs` | **passed**, both services, real HTTP JSON `/api/me` 401 and API-only 404 (including HTML Accept), preserved query/prefix, foreign/missing Origin rejection, real signed EVM challenge/login, session lookup, replay/logout, SPA deep links and Vite script MIME. Used a task-owned schema in dedicated localhost PostgreSQL. Local migrations/test rows only; no hosted writes. |
| Chromium via `agent-browser --session api-runtime` | **passed**, local Services main page, preview catalogue and all three wallet controls render. Browser-only aborted account request shows the existing account-error/retry surface while browsing remains available. No wallet connection/signature. |
| `node .tools/api-runtime/neon-readonly.mjs` | **passed**, existing configured Neon pooled URL: application TLS encryption and verified certificate, six expected tables, session/wallet SELECTs in a read-only transaction, pool reuse/cleanup. Initial `pg_stat_ssl` assertion **failed** because it measured PgBouncer's backend socket; corrected application socket check passed. Driver reports its existing future-major TLS-mode warning. Vercel's sensitive database value was not read, so target identity/hosted lifecycle are unverified. |
| `node .tools/api-runtime/production-probe.mjs` | **failed** API health as expected before redeployment: `/api/me` and unknown API path return HTTP 500 with `x-vercel-error: FUNCTION_INVOCATION_FAILED`; a fresh matching runtime log has the same ESM exception. `/` **passed** HTTP 200 with UI-revamp HTML. Read-only GETs, no remote auth/data mutation. |
| Diff/docs/scope review | **passed**, local link/anchor validation and `git diff --check`. Changes are the API service output setting, one auth regression and the owning deployment/verification docs; UI/runtime API/database/chain sources, lockfile and existing portfolio artifacts are preserved. |
| Hosted fixed deployment, signed browser auth, Fluid Compute suspension and Neon cold-start lifecycle | **not run**, redeployment is outside this run's authorization. Local Services uses source loaders and does not prove the final Linux cloud package or HTTPS browser cookie enforcement. |

Task-only tooling/artifacts live in ignored `.tools/api-runtime`; they are not new
workspace dependencies or portable test prerequisites. The task-owned Services
server/browser and local smoke schema are cleaned up after verification; the
existing test cluster is stopped without resetting its files. No hosted database
migration, environment change, commit, push or deployment was performed.

### Pre-push review on 2026-10-08

Status: **passed for commit**, with deployed runtime verification still pending.
The user authorized committing and pushing the reviewed fix to `origin/main`.
Review verdict: **Approve with follow-ups**; the follow-up is the exact new-commit
cloud package, `/api/me`, assets and HTTPS/SQL-backed auth verification in the
[deployment procedure](vercel.md#new-deployment-verification-procedure).

- **Passed:** fresh `pnpm api:test` (50 tests, dedicated localhost PostgreSQL),
  `pnpm execution:test` (37), `pnpm typecheck`, `pnpm lint`,
  `pnpm --dir apps/api build` and `pnpm build`. Existing Vite dependency annotation
  and large-chunk warnings remain.
- **Passed:** actual native builder via `node .tools/api-runtime/build.mjs review`
  selects `src/index.ts`, emits `apps/api/src/index.mjs` / `nodejs24.x`, and the
  emitted handler passes Node syntax checking. The isolated Windows package-load
  limitation from the initial investigation remains; no Linux/cloud pass inferred.
- **Passed:** fresh localhost Services HTTP smoke, including signed login, session,
  replay, logout, Origin rejection, API JSON 401/404, prefix/query behavior and web
  deep links/scripts. Test-only schema and server/cluster cleanup completed.
- **Passed:** native schema/entrypoint/upload/browser-output audit (191 upload
  candidates, 89 web outputs), tracked-file audit (139 files; only five safe
  placeholder/localhost/synthetic database examples), 259 local documentation
  links/anchors and `git diff --check`. Initial audit rules flagged public loopback
  examples, synthetic tests and existing UI screenshots; those were inspected and
  correctly classified before the final pass. No actual credential leak found.
- **Scope reviewed:** four modified tracked files (service setting, session test,
  two owning docs) plus four pre-existing untracked portfolio files, eight total
  rather than the requested count of 16. Portfolio Mermaid/PNG/SVG/README describe
  the older SQLite snapshot and are excluded, preserved untouched. No generated
  build/tooling changes, private env files or actual database credentials added.
  Existing UI/branding, API bootstrap/routes/auth/runtime, lockfile and blockchain
  deployment/transaction logic are unchanged. Remote `main` matched local
  `83b134f` before committing; no history rewrite is needed.

### Dependency import follow-up on 2026-10-08

Status: **local correction verified; hosted correction unverified**. This follows
the new exception from exact Production commit `ce4e27f`, deployment
`dpl_2CQEgJ9vNJbb9XXTCBj8mSNFGeQe`. The
[current diagnosis and verification procedure](vercel.md#production-dependency-loading-failure-after-ce4e27f)
own the dependency correction. Native Fastify/Services configuration is unchanged.

| Command/check | Result and scope |
| --- | --- |
| `node .tools/api-runtime/followup.mjs deployment`, `logs`, `build` | **passed**, exact SHA/alias, Node 24, source entrypoint and sanitized `ERR_REQUIRE_ESM` stack. Exception is rpc-websockets 9.3.9 requiring UUID 14, unlike the former root handler syntax error. No env/settings mutation. |
| `node .tools/api-runtime/followup.mjs files` | **failed**, deployment file-tree API returned 404. The cloud function archive was not retrieved; local artifact inspection is explicitly separate. |
| Plain Node reproduction / `pnpm exec tsx --test src/config.test.ts` | **failed before correction** on the exact UUID/rpc-websockets module path, then **passed**, all eight config tests. Retained regression's child uses no `tsx` and disables synchronous require(ESM)/module detection. Initial child using tsx masked the failure and was replaced. |
| `pnpm install --lockfile-only --ignore-scripts --prefer-offline --store-dir .pnpm-store`; `pnpm install --frozen-lockfile --ignore-scripts --prefer-offline --store-dir .pnpm-store` | **passed**, targeted Solana SDK rpc-websockets 9.3.8/UUID 11.1.1 resolution, frozen install. Existing deprecated-wallet-package/peer warnings remain. 9.3.10 deprecation was checked in registry metadata; that candidate is not retained. |
| `pnpm api:test` via dedicated localhost runner | **passed**, all 51 API/auth/database tests, including new loader regression, real wallet proofs, H2, origins/cookies, replay, persistence, expiry and races. Local PostgreSQL only. |
| `pnpm execution:test`; `pnpm typecheck`; `pnpm lint`; API/web builds | **passed**, 37 frontend tests, recursive TypeScript, frontend ESLint, `pnpm --dir apps/api build` and `pnpm build`. Existing Vite annotation/large-chunk warnings remain. No API lint script exists. |
| `node .tools/api-runtime/bootstrap-repro.mjs` | **passed**, plain compiled API startup with synchronous require(ESM) and module detection disabled, production origin configuration and pool-attachment call, real HTTP `/me` JSON 401/no-store and unknown route JSON 404. No-cookie requests perform no SQL; not a cloud launcher/lifecycle test. |
| Native builder `build.mjs followup`; `artifact-metadata.mjs` | **passed**, actual local builder emits source ESM `.mjs` in workspace module scope; artifact contains rpc-websockets 9.3.8 and UUID 11.1.1's CommonJS export/package scope. No build/output overrides changed. |
| `node .tools/api-runtime/load.mjs followup` | **failed**, isolated Windows materialization cannot resolve scoped `@noble/hashes`, the previously observed tracing limitation. Complete Linux/cloud package remains **unverified**. |
| Local-only Services / `node .tools/api-runtime/http-smoke.mjs` | **passed**, prefix/query and JSON 401/404, foreign/missing Origin rejection, signed EVM login/session/replay/logout, deep links and actual web scripts. Task-only localhost schema, no hosted writes. |
| `node .tools/hosted-smoke/audit.mjs` | **passed**, native Services schema/entrypoint, SPA asset exclusions, 191 actual upload candidates and 89 browser outputs; private configured database signatures absent. Scoped leak check, not exhaustive. |
| `node .tools/api-runtime/followup-probe.mjs` | **failed** canonical Production API health as expected for unchanged ce4e27f: both API paths 500 with invocation-error header; UI HTML **passed** 200. Immutable URL returns platform-style 401/code `401`, not API `unauthenticated`; does not prove runtime health. Fresh log rows initially had status 0/empty message; exact-deployment earlier exception rows remain the diagnostic evidence. |
| Scope/secrets/docs/diff | **passed**, five tracked files: root override, lockfile, config regression and two owning docs. No runtime API/UI/branding/blockchain source changes or private env/credentials. Local documentation links/anchors and `git diff --check` passed. Pre-existing portfolio artifacts preserved and excluded. |
| Corrected hosted runtime, protected immutable target, browser signing and Neon lifecycle | **not run**; no commit, push or redeployment authorized for this follow-up. No Neon writes or migrations. |

Task-only scripts/artifacts stay ignored. Local smoke schema, Services process and
the test-started PostgreSQL cluster were cleaned up, with cluster files preserved.

### Dependency correction finalization on 2026-10-08

Status: **local final validation passed; hosted module loading verified**.
The separate [routing correction below](#hosted-routing-correction-on-2026-10-08)
has hosted verification pending. The user
authorized the five-file dependency correction to be committed and pushed to
`origin/main`. Deployment is owned by the existing Vercel Git integration; no
manual deployment, hosted migration or application configuration change is part
of finalization. The original cloud artifact limitations above remain open.

Validation used a fresh ignored snapshot of the 139 tracked regular files,
including the current fix, with no pre-existing `node_modules`, local env files
or generated outputs. The forge-std gitlink is unnecessary for these Node checks.
Node `24.19.0` and pnpm `10.26.0` were retained. PostgreSQL was the dedicated
localhost test cluster, never Neon. Commands below ran from that fresh snapshot
unless a repository-only review is stated.

| Command/check | Result and scope |
| --- | --- |
| `pnpm install --frozen-lockfile --store-dir ../../../.pnpm-store` | **passed**, clean install of all six workspace projects using the existing repository package store. No lockfile change. pnpm's existing default policy skipped unapproved dependency build scripts; Solana offline tests use the pure JS bigint fallback. An initial command with a quoted absolute store path failed Windows argument parsing and was corrected to this relative path. |
| Lockfile and installed dependency review | **passed**, direct-parent scoped `@solana/web3.js>rpc-websockets` override; both SDK snapshots use rpc-websockets `9.3.8`, resolving UUID `11.1.1`'s CommonJS export. No remaining RPC `9.3.9` or UUID `14.0.2` lock entry. SDK remains `1.99.0`. |
| `pnpm --dir apps/api exec tsx --test src/config.test.ts` | **passed**, 8 tests; regression launches plain Node with synchronous require(ESM) and module detection disabled. |
| `pnpm api:test` with dedicated local `TEST_DATABASE_URL` | **passed**, all 51 tests, zero skipped; real SQL, cryptographic proofs, session/H2/Origin/replay/concurrency coverage. |
| `pnpm execution:test`; `pnpm --dir packages/solana test` | **passed**, 37 frontend execution tests and 3 Solana offline tests. No chain deployment or transaction execution. |
| `pnpm typecheck`; `pnpm lint`; `pnpm --dir apps/api build`; `pnpm build` | **passed**, recursive TypeScript, frontend lint and both builds. Existing Vite annotation/large-chunk warnings remain. |
| Plain compiled API startup / localhost HTTP | **passed**, fresh compiled API with both module-loader restrictions, `/me` JSON 401/unauthenticated/no-store and unknown route JSON 404 even with HTML Accept. No database query for guest probes. |
| `pnpm audit --json`, previous and corrected lockfiles | Overall audit **failed** on the same 12 existing findings (1 critical, 4 high, 7 moderate); exact advisory/version/path comparison **passed** with zero introduced findings and none reported for pinned RPC/UUID versions. See [the advisory review](vercel.md#final-dependency-and-advisory-review). Existing findings need a separate reachability/remediation review. |
| Scope, secrets, docs and whitespace review | **passed**, only root manifest/lockfile, loader regression and two owning docs changed; private env/credentials/generated outputs excluded. Services, Fastify bootstrap/routes, persistence, auth, UI/branding and blockchain source preserved. Existing untracked portfolio artifacts remain excluded. |
| Git-integrated hosted runtime / real hosted wallet/Neon flow | **not run** during that finalization. The later routing investigation confirmed hosted module initialization from Fastify JSON, while `/api/me` still returned 404; signed hosted wallet/Neon flow remains unverified. |

### Hosted routing correction on 2026-10-08

Status: **historical implementation checks; hosted correction unverified**. No
commit, push or deployment was performed during that investigation. The
[mount-prefix diagnosis](vercel.md#hosted-api-mount-prefix-mismatch-after-1b7e299)
owns the change and hosted checklist. The only runtime change is Fastify's
Vercel-specific pre-routing mount normalization; service transforms are removed.

| Command/check | Result and scope |
| --- | --- |
| Read-only CLI metadata / canonical GET probes | **passed**, exact Ready Production `1b7e299112f86008d3854f5aed352326fbeb64da`, `dpl_AizNhuosDh6d7cERtNJ2MvNLcBKx`. Metadata retains transforms, but Fastify observes original `/api/me?probe=mount` and returns JSON 404 without invocation-error headers. No hosted POST, SQL write or setting change. |
| Native Fastify original-path regressions before correction | **failed as expected**, 2 new cases: GET 404 versus expected 401; POST challenge 404 versus expected 400. Remaining 52 tests, including ordinary local routing, passed. No Services transform emulator precedes these requests. |
| `pnpm api:test` with dedicated localhost `TEST_DATABASE_URL` | **passed after correction**, all 54 tests, no skips. GET/POST, encoded/repeated queries, exact mount boundaries, `/api` root, unknown routes, CORS preflight, strict Origin checks, signed login/session/replay/logout, secure cookies, H2 and SQL/concurrency tests. |
| `pnpm execution:test`; `pnpm typecheck`; `pnpm lint` | **passed**, 37 frontend tests including same-origin `/api` and credentials, recursive TypeScript and frontend ESLint. |
| `pnpm --dir apps/api build`; `pnpm build` | **passed**, API compilation and production web build; existing Vite annotation/large-chunk warnings remain. No chain deployment/build was needed. |
| `node .tools/api-runtime/routing-bootstrap.mjs` | **passed**, unchanged compiled entrypoint with actual Vercel Production environment, original HTTP paths and no Services preprocessor; GET/POST/query/root/unknown routes, normal 400/401/403 validation and ordinary local unprefixed routes. Both existing module-loader restrictions remain enabled. First attempt timed out on readiness; diagnostic rerun passed without an application change. Guest probes issue no SQL. This is not a hosted launcher test. |
| Local native Services / `routing-services-smoke.mjs` | API flow **passed**, original `/api` GET/POST/query, roots/unknown JSON 404, real signed localhost login/session/replay/logout and exact Origin rejection. Uses one task-owned local schema, never Neon. First built-asset phase **failed** because the CLI still launched Vite development despite an alternate-config preview command. |
| `node .tools/hosted-smoke/static-assets.mjs` through native Services and Vite preview | **passed**, all 89 production output files byte-for-byte, JS/CSS MIME types, SPA deep links, non-API namespace and `/api` separation. CLI debug showed it resolves service settings from the Git root; the local web devCommand was temporarily switched to preview, then restored byte-for-byte. No final web config/source change. |
| `node .tools/hosted-smoke/audit.mjs` | **passed**, native schema/entrypoint, SPA exclusions, 191 SDK upload candidates and 89 browser outputs; private env/tooling/fixtures/artifacts and configured database credentials excluded. |
| Scope/secrets/docs/diff review | **passed**, only server factory, server regressions, API transform removal and the two owning docs changed. Native entrypoint/build/output configuration, auth handlers/security hooks, cookies, persistence, dependency pins/lockfile, frontend/UI/branding and blockchain source preserved. No credentials/private env/generated artifacts included; portfolio artifacts remain untracked. Documentation links and `git diff --check` passed. |
| Corrected hosted routing, browser-wallet signing and hosted Neon lifecycle | **not run**, no deployment authorized. After review, verify GET `/api/me` JSON 401, unknown/root JSON 404 and trusted-Origin POST `/api/auth/challenge` with `{}` JSON 400/invalid_wallet; missing/foreign Origin must remain JSON 403. |

Task-started Services processes and PostgreSQL were stopped; the task-only local
smoke schema was dropped. Test scripts, snapshots and build outputs stay ignored.

### Routing correction final review on 2026-10-08

Status: **fresh final local validation passed; hosted verification pending**.
The final review authorizes the five-file correction to be committed as
`fix: handle Vercel API prefix in Fastify routing` and pushed to `origin/main`.
The existing Git integration handles deployment; no manual deployment is part
of this review. The commands below ran again against the current working tree;
the earlier native Services asset smoke remains historical evidence.

| Command/check | Result and scope |
| --- | --- |
| `pnpm api:test` with dedicated localhost `TEST_DATABASE_URL` | **passed**, all 54 tests, no skips; includes dependency loading, original hosted GET/POST/query/edge paths, ordinary local routes and existing SQL/auth/session/wallet regressions. |
| `pnpm execution:test` | **passed**, all 37 frontend tests, including production same-origin `/api` requests with credentials. |
| `pnpm typecheck`; `pnpm lint` | **passed**, recursive TypeScript checks and frontend ESLint. |
| `pnpm --dir apps/api build`; `pnpm build` | **passed**, fresh API compilation and production frontend build. Existing Rollup annotation and large-chunk warnings remain. |
| `node .tools/api-runtime/routing-bootstrap.mjs` | **passed**, actual freshly compiled entrypoint under both Vercel Production and ordinary local environment settings, direct original HTTP paths, GET/POST/query/root/unknown behavior and strict Origin validation; both module-loader restrictions enabled. No Services transform emulator or database query for guest probes. |
| Scope/secrets, native configuration/upload/browser-output audit, documentation links and `git diff --check` | **passed**, only the intended five files; exactly one Vercel-only mount removal, no API service transforms, unchanged entrypoint/build/output/web routing, existing auth/security/wallet/persistence handlers, dependency pins, UI/branding and blockchain source. Private env/credentials/generated files and existing untracked portfolio artifacts excluded. |
| Corrected Production deployment and signed hosted wallet/Neon flow | **not run**; confirm the deployed commit, then follow [the hosted checklist](vercel.md#hosted-verification-after-review). A local pass does not establish hosted recovery. |

## Marketplace UX verification

Executed on **2026-10-08**, Windows, Node `24.19.0`, pnpm `10.26.0`.
The [current presentation owner](../features/marketplace-presentation.md) describes
behavior. Screenshots and temporary review/debug tooling are local-only and are
excluded from the finalized source commit.

| Check | Result and scope |
| --- | --- |
| `pnpm execution:test` | **passed**, 49 frontend tests: catalog/demo filtering, detail disclosure, frozen review and disabled actions, account presentation, session races/expiry, transport errors, readiness, H1 and H3. Pure/SSR/query tests do not prove wallet or chain execution. |
| `pnpm api:test` via task-local runner | **passed**, 54 API tests, no skips, dedicated localhost PostgreSQL. Existing signed proofs, H2 pairings, origins, sessions, replay and concurrency retained. Test-created schemas were cleaned by the suite; task-started PostgreSQL was stopped. No Neon or production database used. |
| `pnpm typecheck`; `pnpm lint`; `pnpm build`; `pnpm --dir apps/api build` | **passed**, recursive TypeScript, frontend ESLint, Vite production build and API compilation. Existing dependency annotation and 500 KB chunk warnings remain. |
| Local browser, 1440 / 768 / 390 px | **passed**, visual inspection and overflow/image checks; ecosystem/search/active filters, empty recovery, preview detail, account/RPC-unavailable state, Solana chooser, workspace navigation and copy feedback. Reduced motion uses automatic scrolling; measured token contrast is at least 6.66:1 for tested body/status pairs. |
| Detail/chooser keyboard regressions | **failed before fixes**, reverse Tab escaped to the body in both detail and Solana chooser; **passed after fixes**, reverse Tab reaches the last dialog control, Tab returns to close, and Escape restores the card/Select Wallet trigger. Native dialog remains the modality owner. |
| Labeled local synthetic UI harness | **passed**, frozen terms remain version 7 when replaced by version 8; stale/identity changes disable confirmation; newly reviewed version 8 executes once; reconciliation retry increments reads without another execution. Synthetic callbacks only, no API/wallet/chain response mocking in the product. |
| Native handler/protected-path audit; doc targets/new-file whitespace; `git diff --check` | **passed**, original buy/list/cancel/approval/refresh handler bodies and signature dispatch retained; API, schemas, chain builders/hooks, reconciliation engine, dependencies, routing and branding unchanged. Existing portfolio work preserved. |
| Hosted auth, connected browser wallets, EVM/Anchor/Move execution | **not run**, no configured live chain runtime or test wallet in this browser pass. EVM contracts/chain clients were unchanged; no contract deployment or ledger reset. Anchor/Move toolchains remain unavailable from prior host evidence and were not installed. |

The three new session regressions **failed with the previous invalidation-only
strategy**, then passed with explicit cancellation/fresh reads and logout cache
replacement. The first new-code typecheck **failed** on Solana query-key access
and Sui union generic inference; both were corrected before final passes.
Initial sandbox pnpm launch could not access its cached runtime and attempted a
blocked registry request; host-access checks reused pinned pnpm. An initial local
API runner stalled on Windows inherited subprocess handles; the task-owned
runner was stopped, subprocess I/O corrected, and the fresh suite passed with
cleanup. The isolated browser harness first required Vite's development preamble;
it was corrected before interaction assertions. A mistaken `pnpm test:web`
invocation failed because that script does not exist; `pnpm execution:test`
then passed. None required product dependency
or external infrastructure changes.

### Run 2 finalization after visual approval

The operator approved vehicle details, wallet selection and mobile layouts.
Final pre-push runs of `pnpm execution:test` (**49 passed**), `pnpm api:test`
against dedicated localhost PostgreSQL (**54 passed**, no skips),
`pnpm typecheck`, `pnpm lint`, `pnpm build` and `pnpm --dir apps/api build`
all **passed** on 2026-10-08. The task-started test database was stopped.
Existing dependency annotation and large-chunk warnings remain.

The commit includes only intended web source/styles/manifest/tests and the two
owning documents. Artwork is unchanged. Screenshots, synthetic browser harness,
local test tooling, generated builds, environment files and unrelated portfolio
artifacts are excluded. The native action/refresh handler audit retains the
original implementations; authentication API, signature dispatch, chain builders,
confirmation hooks, reconciliation engine and readiness status ordering remain
unchanged. Preview components import no native execution hooks and expose no
trading controls; their regression tests pass.

Credential review covers tracked paths, staged content and known local secret
values without printing them. Only safe `.env.example` files may be tracked;
existing deterministic local-only test fixtures are unchanged. This is a scoped
release check, not a claim that historical Git objects or future dashboard
configuration have been exhaustively audited.

After pushing, follow the [Vercel hosted verification procedure](vercel.md#hosted-verification-after-review)
and verify the Git-integrated deployment's exact commit, Ready status, frontend
assets/detail/wallet/mobile surfaces and guest API responses. Signed hosted auth
and chain execution remain separate unverified scopes. No Run 3 or blockchain
deployment is included.

## Portfolio quality verification

Status: **approved Run 3 evidence**, executed on **2026-10-08**. The measurements
and initial checks below precede release finalization. The
[final release check](#run-3-final-release-check) records the subsequent focused
dependency fixes and fresh regressions authorized for commit/push to `origin/main`.
No chain deployment, schema change or real blockchain transaction is included. The
[presentation owner](../features/marketplace-presentation.md) describes behavior,
asset provenance and the manual GitHub Social Preview upload.

### Baseline, measurement and performance

Baseline is the approved Run 2 commit
`b4792b1699a5c89f5fb3672594d92169a5484277`. Both builds used Windows, Node
`24.19.0`, pnpm `10.26.0`, Vite `6.4.3`, the same public local configuration
and localhost production previews. Audit-only Lighthouse `13.5.0`, axe-core
`4.14.0`, FontTools `4.66.1` and image tooling are ignored under `.tools/run3/`;
none was added to product dependencies. Lighthouse used Chrome `154`;
interaction checks used headless Chromium `150` through agent-browser.

The mobile comparison uses three cold Chrome runs per build and Lighthouse's
default simulated mobile throttling. Values below are medians. Baseline
performance scores ranged **51–68**; final scores ranged **73–75**. These are
local lab measurements, not hosted field Core Web Vitals or a performance SLA.
The local API and configured local chain resources were unavailable; both builds
show the same honest guest/demo fallback. Network conditions and machine load
can affect repeated results.

| Mobile measure | Run 2 baseline | Run 3 final |
| --- | ---: | ---: |
| Lighthouse performance | 67 | 75 |
| First contentful paint | 3,151 ms | 3,051 ms |
| Largest contentful paint | 6,390 ms | 5,103 ms |
| Total blocking time | 221 ms | 110 ms |
| Cumulative layout shift | 0 | 0 |
| Accessibility / SEO | 100 / 100 | 100 / 100 |
| Best practices | 96 | 96 |

One matched desktop sample before the SDK accessibility patches improved
performance **95 → 96**, LCP **1,347 → 1,202 ms**, with CLS **0**. It is
supporting single-sample evidence, not a repeated desktop benchmark. The mobile
final series includes both SDK patches. The final narrow-chooser CSS applies
below 375 px and does not alter Lighthouse's standard mobile viewport. An
additional run against the final written build reports performance 75, LCP
5,092 ms, TBT 110 ms, CLS 0 and accessibility/SEO 100.

Bundle figures count actual written production JavaScript files once. Compression
uses Node's zlib gzip and Brotli, not Vercel transfer headers. Module attribution
uses Rollup `renderedLength` before final minification and must not be interpreted
as exact shares of compressed delivery.

| JavaScript measure, bytes | Baseline | Final |
| --- | ---: | ---: |
| Largest initial chunk, raw | 1,808,777 | 1,738,063 |
| Largest initial chunk, gzip | 548,189 | 531,152 |
| Entry plus largest initial chunk, gzip | 557,727 | 540,691 |
| All emitted JavaScript, raw | 3,460,512 | 3,465,112 |
| All emitted JavaScript, gzip | 789,759 | 796,014 |
| Emitted JavaScript chunks | 73 | 78 |

Initial JavaScript saves **17,036 gzip bytes (3.1%)**. Total emitted gzip size
grows **6,255 bytes (0.8%)** because splitting creates additional independently
compressed chunks. This is an initial-loading improvement, not a reduction in
every output file. Both initial network traces also load the unchanged injected
wallet icon chunk (477 gzip bytes); the table isolates entry plus application
code. Deferred chunks include AccountPanel (16,210 raw / 5,350 gzip
bytes), EVM card (30,685 / 7,311), Solana card (11,410 / 4,104) and Sui card
(9,948 / 3,712).

Account UI loads on first disclosure and stays mounted after closing. Native
cards load when readable native resources reveal them; existing mounted-card
identity is retained through catalog filtering and later read failures. Lazy
definitions are at module scope. Feature loading/failure has status/alert copy,
expandable diagnostics and explicit page reload; reload never retries a
transaction. An actual withheld local account chunk produced the fallback while
all three concept cards remained usable.

Providers, wallet auto-reconnection, hooks, session/query configuration, resource
reads and readiness resolver remain eager and unchanged. SDK contexts still
dominate startup. The largest baseline module contributions are Viem, Sui,
Noble curves, RainbowKit and Solana web3.js. The rendered graph contains Noble
curves **1.9.1 / 1.9.7 / 2.4.0** and hashes **1.8.0 / 2.4.0**; incompatible
cryptographic majors were not forced together. Viem, Ox and bn.js each have one
rendered version. RainbowKit's Google DM Sans stylesheet request remains in both
initial network traces because provider setup stays eager. No query polling,
provider replacement or speculative render optimization was introduced.
Lighthouse still reports unused SDK code (about 306 KiB estimated savings), a
long dependency tree and missing large-bundle source maps. The local run logs
connection-refused errors for unavailable services; these account for the
best-practices console-error finding and are reflected by visible error states.
No diagnostics or readiness failure was suppressed to improve a score.

Manrope was losslessly converted from 164,700-byte TTF to 53,696-byte WOFF2,
retaining all 742 glyphs, character mappings and variable weight axis. The
responsive hero adds a 33,044-byte 720 px derivative beside the original
85,704-byte 1440 px image, with matching HTML preload and image `sizes`.
Three 480 px derivatives total 45,818 bytes; 900 px originals remain available
for larger/high-density displays. WebP quality 90 and screenshot visual review
preserve the art direction. Matching mobile traces reduced font-plus-hero
transfer by approximately **164 KB**. Aspect ratios/dimensions reserve space;
below-the-fold artwork remains lazy. No external image service or cache policy
change was added.

### Accessibility, responsive and interaction checks

Opened wallet choosers revealed issues missed by a homepage Lighthouse score:
RainbowKit exposed three unlabeled decorative images, and Sui's custom wallet
items violated native list semantics. Exact-version pnpm
[UI patches](../../patches/README.md) correct these structures without changing
selection events or SDK versions. All dependency resolutions and peer edges are
identical after excluding patch hashes. Frozen installation verifies the patches
apply. A future SDK upgrade must rerun chooser checks and remove patches only
when the fixes are upstream.

App fixes remove accessible-name/visible-label conflicts from the brand and
vehicle controls, remove a label on a generic container, give the ecosystem
group its intended semantics, and make the catalog skip target focusable.
At 320 px, RainbowKit's 368 px minimum clipped the close control and footer;
a scoped rule below 375 px fits its content to the viewport. Desktop styling
and wallet/provider behavior are preserved.

| Browser check | Result and scope |
| --- | --- |
| axe WCAG A/AA, WCAG 2.1 A/AA and best-practice checks | **passed**, zero violations on final home/workspace, vehicle detail and opened EVM/Solana/Sui choosers. Includes shadow DOM for Sui. Automated passes are not screen-reader certification; image/background and accessible-name review includes manual inspection. |
| 1440 / 768 / 390 / 320 px | **passed**, home, workspace, vehicle dialog, filters, empty recovery, readable identifiers/technical panels and footer; no document horizontal overflow or broken images. All three wallet choosers fit at 320 px after the EVM fix. Large detail content remains scrollable within the viewport. |
| Keyboard | **passed**, skip link focuses catalog; Tab/Shift+Tab containment, Escape and focus restoration in native vehicle/Solana dialogs and SDK choosers. Visible focus indicators retained. No wallet was connected or signed. |
| Account disclosure | **passed**, panel DOM retained through close/reopen; disconnected sign-in controls disabled and API-unavailable status recoverable. Hosted guest has normal explore-first messaging. |
| Contrast/touch/reduced motion | **passed** for tested pairs/controls, body/status contrast 6.66:1 or greater, primary controls generally 44 px; compact SDK controls meet the 24 px minimum. Checkbox has a larger label target; inline prose links are exceptions. Browser-emulated reduced motion reports automatic scrolling and zero transition duration. Contrast over original imagery also needs human visual judgment. |
| Catalog/demo restrictions | **passed**, search/filter/no-match/clear recovery and active-only honest empty state. Concepts have no owner, sale price or native action hooks and cannot initiate a transaction. |
| Local synthetic transaction harness | **passed**, replacement listing leaves reviewed version 7 disabled; explicit new review uses version 8 once; failed reconciliation retry adds reads without execution. Pending/unverified/rejected/confirmed states remain distinct. Synthetic callbacks prove UI behavior only. |
| Lazy feature failure | **passed**, actual missing local account chunk yields alert/diagnostics/reload and retains browsing. No implicit transaction or failed-chunk retry. |

Existing automated presentation, session-race, H1 and H3 tests remain the core
regression coverage. Browser checks cover calm API/network failure, unavailable
resources and synthetic execution progress; real signature rejection and connected
network switching require manual wallets. Static handler/AST comparison preserves
all native approve/list/cancel/buy/read implementations, account authentication
and linking actions, App resource queries and execution resolution. API/schema,
providers/bootstrap, chain builders/hooks, confirmation/reconciliation engine,
H1–H3 mechanisms and Vercel configuration are unchanged. Frontend state is still
not an authorization boundary.

### Hosted, metadata and portfolio evidence

Read-only production checks target
`https://web3-marketplace-phi.vercel.app/`, not the uncommitted local changes.
Vercel reports **Ready Production**, deployment
`dpl_DbDCuYcAAQLw4vzo5FNfkMy4pLgU`, exact Run 2 commit
`b4792b1699a5c89f5fb3672594d92169a5484277`.

Main page and SPA deep link return 200; actual JavaScript/CSS, favicon, brand,
font and three concepts return 200. Guest `/api/me` returns JSON
401/`unauthenticated` with `no-store`; unknown API paths return JSON 404 even
with HTML Accept. These responses have no platform invocation-error header.
Browser checks confirm preview details contain no trade control and the guest
wallet workspace separates connection from disabled sign-in. Public static
responses use existing revalidation (`max-age=0, must-revalidate`); selected
assets/home show Vercel cache hits. Hashed asset policy was not changed.

Hosted signed login, linked account refresh/logout, real wallet rejection and
chain actions were **not run**. Local API tests exercise the authentication,
session refresh/logout, H2 replay/ownership and concurrency paths. The operator's
earlier hosted signed-auth result is historical evidence. Runtime deployment
logs are **environment unavailable** with the current connector permissions
(403); successful probes do not establish every log path or a full wallet flow.
New WOFF2/derivative assets and lazy chunks require post-release hosted checks.

Title/description, Open Graph and Twitter/X fields, SVG/ICO favicon, 180 px Apple
icon, robots/sitemap/llms and absolute canonical/social URLs were **verified**.
Existing 1200 × 630 OG PNG is 635,776 bytes and remains adequate. Canonical stays
the stable production domain; no preview URL becomes primary. Metadata describes
an engineering demonstration. The only HTML changes are font/hero preloads.
GitHub Social Preview upload is a manual repository Settings action using the
existing OG image, as described by the presentation owner.

README now opens with concise product context, live demo, actual desktop image
and explicit hosted-versus-public-chain limitations. Architecture, H1–H3,
PostgreSQL identity, Vercel Services and the AI-assisted workflow retain their
technical depth. Four WebP captures in `docs/assets/marketplace/` total
403,950 bytes: desktop 1440 × 1940, detail 1440 × 1000, hosted guest wallets
1440 × 1100 and mobile 390 × 2200. Desktop/detail/mobile show the local production
preview; wallets show the current hosted guest state. No authenticated identity,
real transaction or private environment data appears. Original concept provenance
and Manrope OFL remain documented. Existing untracked `artifacts/marketplace-ux/`
and `artifacts/portfolio/` are preserved and excluded from Run 3's change set.

### Dependency and secret hygiene

`pnpm audit --json` **failed** with **12 existing affected entries**:
1 critical, 4 high, 7 moderate. `pnpm audit --prod --json` **failed** with
11 entries: 1 critical, 3 high, 7 moderate. There are 11 distinct advisories;
UUID affects two installed versions. All are transitive. pnpm's production label
includes React Native/tooling peers reachable through wallet packages, so it does
not by itself prove browser/API reachability. No product dependencies or versions
were added/upgraded, no advisories introduced, and the existing Zod override and
`@solana/web3.js>rpc-websockets: 9.3.8` pin are retained. The latter resolves
UUID 11.1.1 and preserves the reviewed Vercel loader compatibility fix.

Applicability below is an inference from current source imports, installed code
and rendered production modules; it is not a claim that an advisory is harmless
in every consuming environment. Remediation belongs in a focused follow-up with
the relevant SDK/API/build checks, not a blind global major override.

| Package / severity / advisory | Current applicability and focused recommendation |
| --- | --- |
| `bigint-buffer` 1.1.5, high ([GHSA-3gc7-fjrx-p6mg](https://github.com/advisories/GHSA-3gc7-fjrx-p6mg)) | SPL Token dependency. Browser bundle contains its pure-JS implementation, not the vulnerable native binding. API/tooling native use needs separate input-path review. No fixed release is reported; align the upstream SDK or replace the affected path only with verification. |
| `ws` 8.18.0, moderate / high ([GHSA-58qx-3vcg-4xpx](https://github.com/advisories/GHSA-58qx-3vcg-4xpx), [GHSA-96hv-2xvq-fx4p](https://github.com/advisories/GHSA-96hv-2xvq-fx4p)) | WalletConnect dependency path; no `ws` rendered in browser (native WebSocket). Selected API transport copies are outside these affected ranges. Prefer a consumer-compatible 8.x transport patch; fixes are 8.20.1 / 8.21.0. |
| `uuid` 8.3.2 / 9.0.1, moderate ([GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq)) | Browser includes legacy v3/v5 exports via Jayson; inspected RPC IDs use v4. No app path into affected buffer APIs identified. Upgrade the owning consumers compatibly to a fixed version (11.1.1 or later); retain the separate Solana RPC pin. |
| `decode-uri-component` 0.2.2, moderate ([GHSA-vcc3-ghjq-m6fr](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr)) | WalletConnect/query-string path; absent from rendered browser graph with the current injected connector configuration. Consumer-compatible upgrade to fixed 0.5.0 requires SDK-path review. |
| `stream-json` 1.9.1, three moderate advisories ([GHSA-528h-pc64-c93x](https://github.com/advisories/GHSA-528h-pc64-c93x), [GHSA-hqr4-qq8f-hg3x](https://github.com/advisories/GHSA-hqr4-qq8f-hg3x), [GHSA-mjw6-4jj6-33hc](https://github.com/advisories/GHSA-mjw6-4jj6-33hc)) | API dependency path through web3.js/Jayson; not rendered in browser. API uses PublicKey and no streaming/filter/Assembler input path was identified. Upgrade through its owning consumer; fixes require 3.5.0 / 3.6.0, so this is a major migration. |
| `braces` 3.0.3, high ([GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)) | React Native CLI/Metro peer tooling; absent from browser output. No fixed release reported. Review the owning tooling version/path before accepting untrusted patterns. |
| `source-map-js` 1.2.1, high ([GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q)) | Development-only Vite/PostCSS dependency, absent from browser/API runtime output. Focused patch to 1.2.2 is recommended with a fresh build. |
| `shell-quote` 1.10.0, critical ([GHSA-pqg4-j6r4-53mv](https://github.com/advisories/GHSA-pqg4-j6r4-53mv)) | React Native/react-devtools tooling peer; absent from browser. No app use to quote untrusted commands identified. Prioritize a consumer-compatible tooling update to fixed 1.11.0 with peer/install review. |

Current source/assets and generated web files were scanned privately for known
local secrets and credential markers; no match was found. Local `.env` files are
untracked/ignored, five browser settings contain public configuration only,
public RPC URLs have no userinfo or credential query, and the frontend has no
private PostgreSQL URL. Existing deterministic local-only fixtures are unchanged.
`.gitignore`/`.vercelignore` retain local env, tooling, build, profile and artifact
exclusions. Screenshots were visually inspected. This is a scoped checkout/build
review, not an exhaustive Git-history or external dashboard-secret audit.

### Initial Run 3 validation and remaining work

| Command/check | Result and scope |
| --- | --- |
| `CI=true pnpm install --frozen-lockfile --ignore-scripts` (Windows process env) | **passed**, six workspace projects; both exact-version UI patches apply, with identical dependency/peer graph apart from patch registration. Dependency lifecycle scripts were deliberately not run for this review. |
| `pnpm execution:test` | **passed**, 49 frontend tests, no failures/skips. |
| `pnpm api:test` via isolated local PostgreSQL runner | **passed**, 54 tests, no failures/skips. Dedicated localhost cluster/schema, no Neon or production writes; task-started cluster stopped. |
| `pnpm typecheck`; `pnpm lint` | **passed**, recursive workspace TypeScript and frontend ESLint. |
| `pnpm build`; `pnpm --dir apps/api build` | **passed**, fresh production frontend/API outputs. Existing `@scure`/Ox annotation and over-500-KB chunk warnings remain. |
| `pnpm --filter @vehicle/solana test`; `pnpm sui:test` | **passed**, 3 offline Solana and 2 Sui TypeScript builder tests. Pure-JS bigint fallback warning remains. These do not execute native runtimes. |
| Local `.tools/foundry/forge.exe build --root packages/contracts`; `test --root packages/contracts` | **passed**, compilation and all 14 EVM tests. Generated three-contract ABIs match the committed frontend artifact. No deployment or transaction sent. |
| CI YAML/actionlint, Vercel service manifests/entry/routing, documentation links, asset/metadata audit | **passed**, configured checks and owning references valid; Vercel architecture unchanged. Public files match built output; existing OG/icons/canonical valid. |
| Browser/axe, bundle/Lighthouse, handler/lock comparison, scoped secrets and `git diff --check` | **passed** within the scopes described above. New source/docs/assets/patches reviewed; temporary/generated/unrelated artifacts excluded. |
| `pnpm audit --json`; `pnpm audit --prod --json` | **failed**, exit 1 for the existing advisory set above; not a clean security audit. |
| Anchor/Solana validator and Sui/Move native builds/runtime tests | **environment unavailable**, host lacks the required toolchains; not installed in Run 3. |
| Real connected browser wallets, signed hosted session/link/logout, chain transactions, deployment logs | Wallet/runtime work **not run**; hosted logs **environment unavailable**. These remain explicit manual or environment-dependent scopes. |
| Hosted Run 3 release / GitHub CI for these initial checks | **not run** at the initial review; see the subsequent authorized final release check below. |

An initial sandbox pnpm launch could not access its cached runtime; scoped host
checks reused pinned pnpm. First patch registration aborted because noninteractive
install lacked CI mode, and a lockfile-only attempt re-resolved peer layout.
The final lockfile was corrected to the original graph plus exact patch metadata;
frozen install and graph comparison then passed. A mistaken Solana `test:client`
command was corrected to its actual `test` script. No dependency upgrade or
production change was required. Audit JSON/tool logs, temporary captures and
profiles remain ignored, not portfolio assets.

**Readiness:** suitable for public portfolio review as a browse-first engineering
demonstration, with measured loading improvements and no major accessibility
finding remaining in the tested UI. This does not establish commercial launch,
clean dependency security, native Anchor/Move execution or live on-chain trading.

Manual follow-up is real-device/browser and assistive-technology review, actual
wallet auto-reconnect/signature rejection/login/link/session refresh/logout,
GitHub Social Preview upload, and post-approved-release verification of the new
font/derivative/lazy assets and guest API paths against the exact deployed SHA.
Prioritize the focused tooling/transport advisory follow-ups above.

Before a separately authorized public testnet deployment, compile and execute
Anchor/Move runtime suites, create isolated test credentials/resources without
deterministic development keys, and verify each chain's genuine confirmation and
read reconciliation. Exercise H1 replacement/stale terms, H2 both wallet proofs,
ownership/replay conflicts, wrong network, signature/transaction rejection and H3
failed-read recovery. Deployment, chain writes and production configuration are
separate future work.

## Run 3 final release check

Status: **local release checks passed with documented advisory follow-ups**, on
**2026-10-08**. Run 3 was visually approved and explicitly authorized for commit
and push after this focused dependency review. Git integration owns the web
deployment; no manual deployment, blockchain resource creation, production data
write, environment change or new feature is part of finalization.

### Critical/high dependency review

Fresh pinned-pnpm audits before remediation reported **1 critical, 4 high,
7 moderate**; the production-only audit omitted the build-only source-map finding.
All five critical/high findings are **transitive**. Production dependency labels
include wallet SDK tooling peers and do not establish deployed reachability.
The following applicability conclusions are inferences from source imports,
installed package implementations and the rendered Vite production module graph.
They are scoped conclusions, not proof that the repository is vulnerability-free.

| Affected version / advisory | Dependency path and deployed applicability | Patched version, action and compatibility risk |
| --- | --- | --- |
| `shell-quote` **1.10.0**, critical; [GHSA-pqg4-j6r4-53mv](https://github.com/advisories/GHSA-pqg4-j6r4-53mv), **CVE-2026-102422** | Solana wallet adapter → mobile adapter → React Native → react-devtools-core. Tooling peer, absent from browser output; API has no shell-quote or untrusted shell-command path. The advisory requires quoting mixed comment tokens/newlines into a shell command. | **1.11.0**, applied only to 1.10.0. Within react-devtools-core's `^1.6.1` range. The patched quote function rejects the unsafe comment/newline combination with TypeError; normal quote/parse round trips pass. No shell commands or advisory exploit were executed. |
| `source-map-js` **1.2.1**, high; [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q), **CVE-2026-93749** | Vite → PostCSS. Development/build-only, absent from browser/API runtime. The indexed source-map offset DoS requires processing a crafted map; production routes accept no source maps. | **1.2.2**, applied only to 1.2.1; within PostCSS's `^1.2.1` range. Malformed maps may now throw; ordinary generator/consumer mapping and fresh production builds pass. |
| `ws` **8.18.0**, high; [GHSA-96hv-2xvq-fx4p](https://github.com/advisories/GHSA-96hv-2xvq-fx4p), **CVE-2026-48779**; also moderate [GHSA-58qx-3vcg-4xpx](https://github.com/advisories/GHSA-58qx-3vcg-4xpx) | Wagmi/connectors → WalletConnect/Reown → older Viem **2.23.2**. Browser uses native WebSocket, with no rendered `ws` modules and only the injected EVM connector configured. API imports Solana PublicKey; no app WebSocket server/transport is created. The high finding concerns fragmented-frame memory exhaustion by an external peer. | **8.21.0** fixes both findings, applied only through `viem@2.23.2>ws`. Consumer had pinned 8.18.0; receiver limits/edge behavior can change, so a benign localhost client/server round trip and SDK regressions were run. Other copies remain 7.5.13, 8.21.0 and 8.21.3; no global WebSocket override or SDK major upgrade. |
| `bigint-buffer` **1.1.5**, high; [GHSA-3gc7-fjrx-p6mg](https://github.com/advisories/GHSA-3gc7-fjrx-p6mg), **CVE-2025-3194** | SPL Token → buffer-layout-utils. Browser graph contains the pure-JS `dist/browser.js` implementation; the vulnerable native binding is not bundled. API has no SPL Token/bigint-buffer input path. No deployed path to the affected native conversion was identified. | **No patched release reported**. Retained; a speculative crypto SDK replacement is not a narrow fix. Review upstream remediation and any native seed/tooling use before accepting untrusted native inputs. Reassess if server-side SPL Token processing is introduced. |
| `braces` **3.0.3**, high; [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), **CVE-2026-93687** | Solana mobile adapter → React Native community CLI/Metro → file-map → micromatch. Development/tooling peer, absent from browser/API imports and rendered output. No production input reaches recursive brace-pattern compilation. | **No patched release reported**. Retained with upstream follow-up; avoid untrusted nested patterns in this tooling. A consumer/toolchain update requires its own verification, rather than an invented patch or broad React Native upgrade. |

No demonstrably exploitable critical/high path was found in the deployed
application within this review. The native/tooling findings remain recorded and
must be revisited when their owning consumers publish fixes or those paths change.

The manifest adds just three exact, scoped security overrides. Lockfile comparison
against the approved pre-security Run 3 snapshot confirms only their package
substitutions, integrity records and dependent peer references changed. The first
version-wide WebSocket attempt altered unrelated peers; it was narrowed before
acceptance. Original `@solana/web3.js>rpc-websockets: 9.3.8`, UUID **11.1.1** and
that RPC consumer's `ws` **8.21.3** remain intact. API regressions include the
existing Node compatibility test with experimental require-module/detect-module
disabled. The freshly compiled Fastify entrypoint also starts under these flags.
Legacy UUID copies were not globally forced to a different major.

Both final audit commands still **failed with exit 1**, now reporting **0 critical,
2 high, 6 moderate** (8 affected dependency entries). Remaining moderate follow-up:
legacy `uuid` **8.3.2/9.0.1** ([GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq),
CVE-2026-41907; fixed 11.1.1), `decode-uri-component` **0.2.2**
([GHSA-vcc3-ghjq-m6fr](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr),
CVE-2026-45822; fixed 0.5.0), and `stream-json` **1.9.1**
([GHSA-528h-pc64-c93x](https://github.com/advisories/GHSA-528h-pc64-c93x),
CVE-2026-71429; fixed 3.5.0;
[GHSA-hqr4-qq8f-hg3x](https://github.com/advisories/GHSA-hqr4-qq8f-hg3x),
CVE-2026-104182; and [GHSA-mjw6-4jj6-33hc](https://github.com/advisories/GHSA-mjw6-4jj6-33hc),
CVE-2026-104183; fixed 3.6.0). UUID RPC IDs use v4 rather than the affected v3/v5
buffer path; URI decoding is absent from the active browser graph; API has no
stream-json Filter/Assembler input path. Their earlier table retains the detailed
rationale. Prefer verified owning-consumer updates; stream-json and UUID fixes
cross major boundaries. Audit results are not a clean-security claim.

### Fresh finalization verification

| Command/check | Result and evidence |
| --- | --- |
| `pnpm install --frozen-lockfile --ignore-scripts` with Windows CI process environment | **passed**; exact dependency graph and both approved SDK accessibility patches installed. Existing React Native React/type peers and Jayson optional UTF-8 peer warnings remain; no new global peer constraint introduced. |
| `pnpm execution:test` | **passed**, 49 tests, zero failures/skips; demo assets have no execution identity and cannot become trading cards. |
| `pnpm api:test` via dedicated local PostgreSQL runner | **passed**, 54 tests, zero failures/skips; authentication, two-proof linking, replay/ownership conflicts, session/logout, concurrency and loader regressions. Dedicated localhost cluster stopped afterward; no Neon writes. |
| `pnpm typecheck`; `pnpm lint` | **passed**, recursive workspace TypeScript and frontend ESLint. |
| `pnpm build`; `pnpm --dir apps/api build` | **passed**; existing large wallet SDK chunk and annotation warnings remain. |
| `pnpm --filter @vehicle/solana test`; `pnpm sui:test`; local Forge build/test | **passed**, 3 offline Solana builder tests, 2 Sui builder tests, 14 EVM runtime tests. Native Anchor/validator and Move runtime checks remain **environment unavailable**; these passes do not establish those runtimes. |
| Compiled API entrypoint under local Vercel/ordinary flags | **passed**, unchanged GET/POST/query/root/not-found/origin behavior, without Services emulation or SQL. |
| Protected source/handler/query comparison against Run 2 | **passed**; auth, readiness, H1 purchase intent, H2 linking and H3 reconciliation boundaries, Fastify source/routing, chain builders and deployment configuration unchanged. Demo actions remain disabled; provider/reconnect ownership unchanged. |
| Dependency normal-API smoke and production module graph | **passed**; normal quote/map APIs and local WebSocket round trip; Solana RPC/UUID/WebSocket resolutions retained. Vulnerable native/tooling modules absent from deployed browser paths. |
| Vercel service manifests/rewrites/entrypoint, actionlint, README Mermaid/ABI and documentation links | **passed**; Git-integrated native Services architecture unchanged. |
| Asset/metadata and scoped secrets review | **passed**; all 18 public files match the build; canonical, social image/icons and original vehicle branding preserved. No local env or credential markers tracked; known private values absent from source/browser build. Browser settings remain public, with no private Neon connection string or privileged RPC credential. |

Finalization includes the approved source/style, lazy boundary, WOFF2 font,
responsive WebP derivatives, four curated portfolio screenshots, README and owning
verification documents, two exact-version SDK UI patches, and the three reviewed
security overrides. Temporary captures, audit/tool logs, browser profiles,
generated build/ABI outputs and existing unrelated `artifacts/` stay outside the
commit. This review is scoped to the checkout/build, not exhaustive secret-history
or external dashboard inspection.

The first staged `git diff --check` flagged mandatory unified-diff context prefixes
in the tab-indented Sui SDK patch (space-before-tab and blank context lines).
Ordinary source/docs pass the default check; patch files are checked separately
with only those two syntax-specific whitespace rules disabled. Patch contents and
their verified pnpm hashes are retained; no source whitespace rule is relaxed.

### Git-integrated deployment checklist

After the deployment reaches **Ready** for the pushed commit, verify:

- Main page, original branding, mobile/desktop layout, reduced motion and no horizontal overflow.
- Vehicle filtering/details, loading/error surfaces and clearly labeled non-trading Demo Preview.
- Wallet chooser, connection, network identity, signature rejection and authentication with an actual wallet.
- Signed session persistence after refresh, account switching and logout; local regressions alone do not prove hosted wallet interaction.
- Fastify `/api/me` JSON guest 401, root/unknown JSON 404, and unchanged routing; no secret exposure in responses.
- WOFF2/responsive images/lazy chunks, canonical/social/favicon metadata, and README demo/screenshot links.
- Production function/runtime logs for boot errors, RPC/UUID loading and unexpected route/database failures; mark unavailable dashboard access explicitly.

No blockchain testnet deployment or new feature follows automatically from this checklist.

## Choosing checks

For a code change, select the affected matrix rows and regression coverage; do not
infer one chain's runtime from another's pass. Identity changes need API positive
and negative tests; cross-chain readiness needs execution tests; client layouts
need both offline checks and their chain runtime when available.

For documentation/agent tooling only, validate local links (including anchors),
documented source paths, named package scripts, Cursor rule frontmatter, VS Code
JSON and `git diff --check`. Check untracked new files too, because the default Git
diff excludes them. Run typecheck/lint/build only if configuration affecting those
checks changes; terminal/agent rules alone do not change compilation. Finish with
a diff review confirming no runtime source, dependency, schema or generated ABI changes.
