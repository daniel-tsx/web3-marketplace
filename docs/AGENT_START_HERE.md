# Agent start here

Status: **current**. This router covers the implemented H1–H3 boundaries;
verify task-specific facts against source and current verification evidence.
[AGENTS.md](../AGENTS.md) owns behavior,
[docs/README](README.md) owns document routing/lifecycle, and code owns implementation truth.

## Required read order

If your tool already loaded a repository policy, follow it first. Otherwise:

1. This entry point.
2. [AGENTS.md](../AGENTS.md) (Claude Code also enters through [CLAUDE.md](../CLAUDE.md)).
3. The root [README](../README.md).
4. [docs/README](README.md), then its document(s) for the current task only.
5. Actual source and tests from the map below; inspect neighboring code before editing.

Do not read every run guide for every task. For the working sequence and handoff
format, see [AI_WORKFLOW](AI_WORKFLOW.md).

## Current project truth

- **Identity and wallet login/linking:** a UUID user and opaque HttpOnly session,
  with independently signed EVM, Solana, and Sui wallet proofs. Following H2,
  linking needs a live originating session plus fresh trusted-wallet authorization
  and new-wallet ownership proofs for that exact credential change; connection/account switching does not relink
  wallets. Login ecosystem does not select the chain used for a purchase.
- **API persistence:** Fastify plus PostgreSQL stores only users,
  linked wallets, challenges, hashed session tokens and per-request link authorization
  context. Explicit SQL migrations reproduce the schema; an optional read-only
  SQLite importer preserves old identity/session rows. There is no runtime SQLite fallback.
- **EVM:** local Anvil marketplace, ERC-721 vehicles, six-decimal MockUSDC,
  noncustodial listings, NFT approval and ERC-20 allowance, receipt-based results.
- **Solana:** Anchor program with a persistent Listing PDA and escrow ATA, a
  supply-one SPL vehicle mint, six-decimal payment mint enforced by MarketConfig,
  and explicit instruction/account encoding in the TypeScript client.
- **Sui:** Move sources and TypeScript client use an address-owned Vehicle wrapped
  in a new shared Listing, one shared Market discovery slot, and `Coin<MUSDC>`
  payments. Default frontend network is testnet. Move and wallet runtime remain unverified.
- **Execution resolution:** `App.tsx` supplies the resource's ecosystem, session,
  links, connected wallet, network readiness and (for Sui) resource readiness to a
  pure resolver. Separate cards/hooks construct, submit, confirm, and refresh each
  chain's transactions. UI gates do not enforce on-chain access control.
- **H1:** EVM submits token ID + listing version + max price; Solana submits the
  persistent generation + max price and enforces exact payment-mint identity; Sui
  retains the reviewed Listing ID and exact payment construction. No automatic
  retry substitutes newly read terms. [The audit guide](audit-fix-01-purchase-intent.md)
  owns the detailed fix and breaking local deployment compatibility.
- **H2:** [Trust boundaries](architecture/trust-boundaries.md) owns sensitive wallet-link authorization;
  [Audit fix 02](audit-fix-02-wallet-link-reauthentication.md) records the session-bound two-proof protocol.
- **H3:** [Transaction result boundaries](architecture/trust-boundaries.md#h3-execution-success-is-separate-from-reconciliation-success)
  owns the read-only reconciliation state. Successful execution is retained when
  targeted rereads fail; retry refresh never signs/resubmits or replaces H1 terms.

## Stack truth

| Layer | In the repository |
| --- | --- |
| Workspace | pnpm `10.26.0`, Node 24+, TypeScript; manifests in [root](../package.json), [API](../apps/api/package.json), [web](../apps/web/package.json), [contracts](../packages/contracts/package.json), [Solana](../packages/solana/package.json), [Sui](../packages/sui/package.json). |
| Browser | Vite 6 / React 18, TanStack Query 5, Wagmi 2 / Viem 2 / RainbowKit 2; Solana Wallet Adapter (Phantom), web3.js 1 / SPL Token; Mysten Sui SDK 2 / dApp Kit React 1 using gRPC. These are manifest major versions, not exact installed versions. |
| API | Fastify 5, cookie/CORS plugins, `pg`/PostgreSQL; Viem message verification, TweetNaCl Ed25519, Mysten personal-message verification. |
| Chain tools | Foundry + Solidity 0.8.24 + OpenZeppelin 5 / forge-std; Rust + Anchor 0.32.1 / anchor-spl; Sui Move edition 2024. |
| Checks | Node test runner via `tsx`, Foundry tests, Anchor validator tests, Move scenario tests, TypeScript, frontend ESLint 9 and Vite build. |

## Verification truth

[operations/verification.md](operations/verification.md) is the command/prerequisite
source of truth. As inspected on this Windows host: Node `24.19.0`, pnpm `10.26.0`,
and repository-local Foundry `1.8.3` are available. Foundry is absent from PATH;
use the documented local-binary alternatives or a terminal-scoped PATH.
Anchor, Solana CLI/validator, Rust/Cargo, and Sui are absent from PATH; `wsl --list
--quiet` reports that WSL is not installed.

- **Available checks:** Foundry/EVM, API tests, frontend execution tests, recursive
  TypeScript, frontend lint/build, API build, Solana offline client tests, Sui
  TypeScript builder tests. Availability does not mean they were rerun in this task.
- **Environment unavailable:** Anchor build/validator runtime and Sui Move
  build/scenario runtime. Offline tests cannot validate either runtime.
- **Evidence:** [Verification records](operations/verification.md#repository-polish-verification)
  distinguish the latest repository-polish checks from historical H1/H2 results.
  No offline or compiler check establishes a deployed browser-wallet flow.

## Source-of-truth map

Paths are repository-relative links. Each document below owns the named subject;
run guides are deeper, scoped references rather than competing current summaries.

| Area | Implementation | Documentation owner / reference | Ownership notes |
| --- | --- | --- | --- |
| Identity/auth, wallet proofs | [API server](../apps/api/src/server.ts), [auth UI/client](../apps/web/src/auth/), [auth tests](../apps/api/src/server.test.ts) | [Trust boundaries](architecture/trust-boundaries.md); [Run 2](run-02-auth-solana-multichain.md), [Sui proofs in Run 3](run-03-sui-multichain.md#2-sui-authentication-and-application-identity) | API validates exact stored challenge; each attached wallet proves control. |
| Execution resolution | [Resolver/tests](../apps/web/src/execution/), [App](../apps/web/src/App.tsx), [bootstrap](../apps/web/src/bootstrap.tsx) | [Multichain system](architecture/multichain-system.md); [Run 3 orchestration](run-03-sui-multichain.md#4-shared-orchestration-and-chain-specific-code) | Resource selects ecosystem; resolver decides readiness, never submits. |
| EVM contracts/client | [Contracts](../packages/contracts/src/), [Foundry tests](../packages/contracts/test/VehicleMarketplace.t.sol), [VehicleCard](../apps/web/src/components/VehicleCard.tsx), [EVM reads](../apps/web/src/web3/useVehicleState.ts), [ABI exporter](../scripts/export-abis.mjs) | [Run 1](run-01-evm-baseline.md) for EVM baseline; [H1](audit-fix-01-purchase-intent.md#evm-mechanism) for current buy API | Solidity is authoritative; [ABIs](../apps/web/src/contracts/abis.ts) are generated, never hand-edited. |
| Solana program/client | [Rust program](../packages/solana/programs/vehicle_marketplace/src/lib.rs), [client](../packages/solana/src/client.ts), [tests](../packages/solana/tests/), [Solana hooks](../apps/web/src/web3/solana/), [card](../apps/web/src/components/SolanaVehicleCard.tsx) | [Run 2](run-02-auth-solana-multichain.md); [H1](audit-fix-01-purchase-intent.md#solana-mechanism) | Program owns PDA/escrow invariants; manual client layout must match Rust; validator proof pending. |
| Sui Move/client | [Move sources](../packages/sui/move/sources/), [Move tests](../packages/sui/move/tests/), [client/tests](../packages/sui/), [Sui hooks](../apps/web/src/web3/sui/), [card](../apps/web/src/components/SuiVehicleCard.tsx) | [Run 3](run-03-sui-multichain.md); [H1 Sui mechanism](audit-fix-01-purchase-intent.md#sui-mechanism) | Move owns object/payment invariants; manual BCS layouts must match; Move proof pending. |
| Transaction-state UI | [EVM flow](../apps/web/src/web3/useTransactionFlow.ts), [status](../apps/web/src/components/TransactionStatus.tsx), [Solana flow](../apps/web/src/web3/solana/useSolanaTransaction.ts), [Sui flow](../apps/web/src/web3/sui/useSuiTransaction.ts) | [Trust boundaries](architecture/trust-boundaries.md#transaction-results-and-partial-failures); chain run guides | Submission, execution result, and refreshed reads are separate states. |
| API persistence | [Database](../apps/api/src/db.ts), [migrations](../apps/api/migrations/), [migration runner](../apps/api/src/migrate.ts), [SQLite importer](../apps/api/src/sqlite-import.ts), [tests](../apps/api/src/db.test.ts) | [PostgreSQL persistence](operations/postgres.md); [Trust boundaries](architecture/trust-boundaries.md) | PostgreSQL owns identity only; no listings, balances, custody, or settlement. |
| Environment/configuration | [EVM config](../apps/web/src/contracts/config.ts), [addresses](../apps/web/src/contracts/addresses.ts), [Sui config](../apps/web/src/web3/sui/config.ts), [bootstrap](../apps/web/src/bootstrap.tsx), [API startup](../apps/api/src/index.ts), [address sync](../scripts/sync-addresses.mjs), [Solana seed](../packages/solana/scripts/seed.ts), [Anchor config](../packages/solana/Anchor.toml) | [Verification/setup notes](operations/verification.md#local-setup-boundaries); root README and run setup sections | Public browser config only; EVM/Solana scripts target local chains; Sui needs an explicit deployment. |
| Verification/tests | [Root scripts](../package.json), workspace manifests above, [contracts](../packages/contracts/test/), [API](../apps/api/src/server.test.ts), [frontend](../apps/web/package.json), [Solana](../packages/solana/tests/), [Sui](../packages/sui/tests/), [Move](../packages/sui/move/tests/) | [Verification](operations/verification.md) | Distinguish offline, compiler, runtime, and actual wallet evidence. |
| Audit fixes | Chain sources/clients above, [purchase errors/tests](../apps/web/src/web3/purchaseIntent.test.ts), [wallet-link tests](../apps/api/src/wallet-link.test.ts), [reconciliation tests](../apps/web/src/web3/reconciliation.test.ts) | [H1 audit fix](audit-fix-01-purchase-intent.md), [H2 implementation](audit-fix-02-wallet-link-reauthentication.md), [H3 result boundary](architecture/trust-boundaries.md#h3-execution-success-is-separate-from-reconciliation-success) | Preserve purchase intent, credential-change authorization and execution success separately from read reconciliation. |

## Known documentation drift

Existing run guides stay at their current paths for a later historical cleanup.
Use this map and H1 when interpreting them:

- Run 2/3 and H2's original SQLite/init descriptions predate PostgreSQL.
  [The persistence guide](operations/postgres.md) owns the current schema,
  explicit migration/import commands and mandatory server-only database URL.

- [Run 1](run-01-evm-baseline.md) is historical: its future-runs paragraph still
  anticipates already implemented identity/Solana/Sui, provider ownership has
  moved from `main.tsx` to `bootstrap.tsx`, and its purchase trace predates H1's
  version/price arguments. It is not the current whole-application description.
- [Run 2](run-02-auth-solana-multichain.md) labels itself current but its provider
  tree omits Sui, its TypeScript scope omits the Sui package, and it describes
  `execution:test` as resolver-only. Its localnet-only scope does not cover Run 3's
  default Sui testnet integration. Run 3 and current scripts extend these sections.
- Run 1/2/3's transaction descriptions predate H3's explicit `reconciling` and
  `reconciliation-failed` stages and safe read-only retry. Use [the current result boundary](architecture/trust-boundaries.md#transaction-results-and-partial-failures),
  rather than interpreting resolved cache invalidation as successful reconciliation.
- Run 2/3's original wallet-link traces predate H2. Use [Trust boundaries](architecture/trust-boundaries.md#proofs-replay-and-persistence)
  and [the H2 protocol](audit-fix-02-wallet-link-reauthentication.md) for the required trusted-wallet and target-wallet proofs.
- The [Solana seed](../packages/solana/scripts/seed.ts) writes
  `VITE_SOLANA_PROGRAM_ID`, but [the client](../packages/solana/src/client.ts) uses
  hardcoded `PROGRAM_ID`; no frontend code reads that variable. It does not
  select a different program. Record this configuration ambiguity; do not fix it
  incidentally or treat the emitted variable as effective configuration.

## Work rules and completion

Pick the task row in [docs/README](README.md#task-routing), follow its code paths,
and select checks from [verification](operations/verification.md). Purchase changes
always include H1; identity changes include the API's negative-path tests. When a
guide conflicts with code, record the specific drift and update its owning current
document only when the task warrants it.

Before ending a task:

- [ ] Requested invariant/behavior implemented, or remaining work stated explicitly.
- [ ] Appropriate regression coverage added for behavior changes where applicable.
- [ ] Relevant verification executed and results distinguished from prior evidence.
- [ ] Unavailable runtimes and untested wallet flows disclosed.
- [ ] Owning durable docs updated when needed; no duplicate current source of truth.
- [ ] Diff reviewed; no unrelated changes or unrequested external mutations.
- [ ] `git diff --check` passed.
