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
