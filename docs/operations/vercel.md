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
| `/api`, `/api/*` | `api` | Service-local rewrite removes `/api`; `/api/me` reaches Fastify `/me`. |
| All other paths | `web` | Vite assets are served by the web service; its SPA fallback serves `index.html` for deep links. |

The API rule precedes the web catch-all. API misses stay API responses and cannot
fall through to the SPA. Existing `/auth/*`, `/wallets/link/*`, `/me` and `/logout`
Fastify routes stay unchanged for ordinary local clients. There are no existing
health or operational endpoints to relocate; unauthenticated `/api/me` should
return JSON with HTTP 401 when the API is operational.

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

| Variable | Ordinary local / container use | Vercel use |
| --- | --- | --- |
| `VITE_API_URL` | Defaults to `http://localhost:3001` in Vite development; an explicit public URL remains supported. | Set `/api`, or omit for production builds, which default to `/api`. Set `/api` explicitly for `vercel dev`. |
| `FRONTEND_ORIGIN` | Defaults to `http://localhost:5173`. | Required: exact browser origin including `https://`, with no trailing slash/path. Set for each production/custom domain or preview being tested. No wildcard Origin is accepted. |
| `API_PORT` | Defaults to 3001. | `PORT` injected by the platform takes precedence. |
| `API_HOST` | Defaults to `127.0.0.1`; set `0.0.0.0` for a container listener. | Existing Fastify entrypoint is retained. |
| `DATABASE_PATH` | Defaults to package-relative `.local/auth.sqlite`; containers need a persistent volume. | Cannot solve hosted persistence; storage migration is required. |
| `VITE_*` chain configuration | Existing examples and local chain scripts remain authoritative. | Public HTTPS RPC endpoints and deployed identifiers must match the intended networks. Never put private RPC credentials or keys in browser variables. |

`VITE_*` settings are build-time public configuration; rebuild after changing
them. Avoid copying the examples' localhost API/RPC values into a hosted build.
The frontend continues to send credentials. The API keeps exact POST Origin
validation, credentialed CORS, HttpOnly/SameSite=Lax cookies and `no-store` replies;
HTTPS origins now set and clear **Secure** cookies. Cookie Path remains `/`, and
no Domain is set. With same-origin `/api`, no cross-site cookie workaround or
proxy-header trust is needed. Preview deployments need their own exact
`FRONTEND_ORIGIN`; a production origin does not authorize a preview's POSTs.

The on-chain clients remain browser-to-RPC clients, not Vercel services. EVM and
Solana defaults/fixtures target local chains; the Solana program ID is compiled
into the client. Hosting the application does not deploy marketplace resources
or establish public-network compatibility. Follow the existing chain guides and
[local setup boundaries](verification.md#local-setup-boundaries).

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

Windows, Node `24.19.0`, pnpm `10.26.0`. These are new checks for this change.

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
was performed. The next steps are service/routing confirmation, a separate durable
identity-storage task, and resolving the Vercel local integration failure before
the first preview deployment.
