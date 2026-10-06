# Local verification

Status: **current**. This is the command/prerequisite owner. Run commands from the
repository root in Command Prompt unless noted. Root
[package.json](../../package.json) pins pnpm `10.26.0`; Node 24+ supplies `node:sqlite`.
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

[H1's verification record](../audit-fix-01-purchase-intent.md#verification) contains
previous EVM and TypeScript passes. They were not rerun for the workflow/documentation
change. Anchor and Move build/runtime remain unverified. No new deployment or
wallet-interaction result is established by this document.

## Command matrix

All pnpm commands below resolve to existing root or package scripts. Available
means the check's tools are present here, not that the check has just passed.

| Check | Command | Scope and prerequisite | This host |
| --- | --- | --- | --- |
| Solidity compile + ABI export | `pnpm contracts:build` | Foundry/solc, OpenZeppelin and initialized forge-std submodule; regenerates [abis.ts](../../apps/web/src/contracts/abis.ts). | Available using local Foundry/PATH setup below. |
| EVM tests | `pnpm contracts:test` | [Foundry suite](../../packages/contracts/test/VehicleMarketplace.t.sol), including H1; no Anvil or wallet needed. | Available using local Foundry/PATH setup. |
| API tests | `pnpm api:test` | [Server tests](../../apps/api/src/server.test.ts), in-memory/temporary SQLite and cryptographic proofs/migration; no HTTP server or chain runtime needed. | Available. |
| Frontend execution tests | `pnpm execution:test` | Resolver, Sui result/query-key helpers, purchase-error tests listed in [web scripts](../../apps/web/package.json); no browser/wallet needed. | Available; does not test rendered UI or real transactions. |
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
separately and initialize the forge-std submodule per the root README.

## Local setup boundaries

The root [README](../../README.md#local-sequence),
[Run 1](../run-01-evm-baseline.md#reproduce-locally),
[Run 2](../run-02-auth-solana-multichain.md#7-local-setup-and-commands), and
[Run 3](../run-03-sui-multichain.md#5-configuration-and-real-team-workflow) own the
detailed setup sequences. New cmd examples should place one command per line;
the old `sh` blocks' trailing `#` annotations are explanatory, not cmd syntax.

| Configuration | Actual reader/behavior |
| --- | --- |
| API `DATABASE_PATH`, `FRONTEND_ORIGIN`, `API_PORT` | [index.ts](../../apps/api/src/index.ts): defaults to package-local `.local/auth.sqlite`, `http://localhost:5173`, port 3001. `pnpm api:db` and `pnpm api:dev` initialize/migrate identity storage; they are setup mutations, not documentation checks. |
| `VITE_API_URL` | [auth/api.ts](../../apps/web/src/auth/api.ts): defaults to `http://localhost:3001`; cookies require consistent frontend/API sites and the configured Origin. Keep Vite at 5173 locally and avoid mixing localhost/127.0.0.1 browser sites. |
| `VITE_CHAIN_ID`, `VITE_RPC_URL`, EVM address variables | [config.ts](../../apps/web/src/contracts/config.ts) defaults to 31337 / `http://127.0.0.1:8545`; [addresses.ts](../../apps/web/src/contracts/addresses.ts) reads MockUSDC, VehicleNFT and Marketplace public addresses. Local deployment sync writes them to ignored `apps/web/.env.local`. |
| `VITE_SOLANA_RPC_URL`, vehicle/payment mint variables | [bootstrap](../../apps/web/src/bootstrap.tsx) defaults RPC to `http://127.0.0.1:8899`; [App](../../apps/web/src/App.tsx) reads mint IDs. Program ID is compiled into [client.ts](../../packages/solana/src/client.ts), Rust and Anchor config; the seed-emitted `VITE_SOLANA_PROGRAM_ID` is unused. |
| `SOLANA_RPC_URL` | Solana [seed](../../packages/solana/scripts/seed.ts) and [runtime tests](../../packages/solana/tests/vehicle-marketplace.test.ts): defaults to local validator. Fixture accounts must never be used on a public network. |
| `VITE_SUI_*` | [Sui config](../../apps/web/src/web3/sui/config.ts) defaults to testnet/gRPC; package, Market and Vehicle IDs must come from an actual deployment. Coin type defaults to that package's `musdc::MUSDC`. A buyer also needs gas and mock payment funds. |

Restart Vite after public configuration changes. The EVM address sync preserves
Solana/Sui lines; Solana seeding preserves non-Solana lines. Never print `.env`
contents or local key files to diagnose configuration.

Starting servers (`pnpm api:dev`, `pnpm dev`, `pnpm anvil`, `pnpm solana:validator`)
is distinct from tests. Preparation/deploy/seed (`pnpm solana:prepare`,
`pnpm contracts:deploy`, `pnpm solana:deploy`, `pnpm solana:seed`) is mutation and
requires task authorization under AGENTS.md. H1 changed the EVM ABI and Solana
layout; follow [compatibility notes](../audit-fix-01-purchase-intent.md#local-deployment-compatibility),
not a ledger reset shortcut. No reset/migration/deployment is authorized by reading a guide.

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
