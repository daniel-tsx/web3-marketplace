# Multichain system

Status: **current**. This document owns the current system overview. See
[AGENT_START_HERE](../AGENT_START_HERE.md#source-of-truth-map) for implementation
paths, [trust boundaries](trust-boundaries.md) for authorization/custody, and the
run guides for detailed transaction walkthroughs.

## Boundaries and data flow

The pnpm workspace contains two applications and three chain packages:

| Boundary | Responsibility |
| --- | --- |
| [apps/web](../../apps/web/) | Vite/React SPA; application session query, wallet connection/signing, readiness resolution, chain-specific cards, reads and transaction UI. |
| [apps/api](../../apps/api/) | Fastify identity service with PostgreSQL; challenges, signature proofs, user/wallet associations and opaque sessions. No marketplace persistence. |
| [packages/contracts](../../packages/contracts/) | Solidity contracts, Foundry tests and local Anvil deployment. Build artifacts supply generated frontend ABIs. |
| [packages/solana](../../packages/solana/) | Anchor Rust program, manual TypeScript client, local preparation/seeding, offline encoding and validator tests. |
| [packages/sui](../../packages/sui/) | Move package/scenarios and TypeScript BCS parsers/transaction builders. Deployment is external to the frontend/API. |

The browser first reads the API's session and linked wallets. For each catalog
resource, [App](../../apps/web/src/App.tsx) combines those with the relevant
connected wallet and network/resource readiness. The pure
[resolver](../../apps/web/src/execution/resolveExecution.ts) selects readiness in
this order: session → ecosystem link → connection → address match → network →
resources → ready. It never signs or broadcasts.

The selected chain's card then uses its own client and transaction hook. Signing
and submission happen through that chain's wallet library; chain results and
targeted rereads drive the UI. The login wallet has no privileged execution role.
Identity queries and chain reads share TanStack Query infrastructure, not state authority.

[main.tsx](../../apps/web/src/main.tsx) installs Buffer before dynamically loading
[bootstrap.tsx](../../apps/web/src/bootstrap.tsx), which owns Wagmi → TanStack Query
→ RainbowKit → Solana connection/wallet/modal → Sui dApp Kit → App providers.

## Shared intent, different execution models

| | EVM | Solana | Sui |
| --- | --- | --- | --- |
| Canonical listing | Contract mapping, persistent version | Persistent Listing PDA, active flag/version | Shared Listing object, new ID per listing |
| Vehicle while listed | Seller-owned ERC-721; approval checked at purchase | Supply-one SPL token in listing-PDA escrow ATA | Vehicle nested in Listing |
| Payment authorization | ERC-20 allowance and `transferFrom` | Buyer signer and SPL Token CPI/account constraints | Buyer-controlled `Coin<MUSDC>` input |
| H1 purchase binding | Token ID + expected version + max price | Expected version + max price + exact configured mint | Reviewed Listing ID + exact Coin construction |
| Result/read boundary | Receipt status/logs, contract rereads | RPC `confirmed`, metadata/logs, account rereads | Execution result, wait/effects, object/balance rereads |
| Deeper reference | [Run 1](../run-01-evm-baseline.md) + [H1](../audit-fix-01-purchase-intent.md#evm-mechanism) | [Run 2](../run-02-auth-solana-multichain.md) + [H1](../audit-fix-01-purchase-intent.md#solana-mechanism) | [Run 3](../run-03-sui-multichain.md) + [H1](../audit-fix-01-purchase-intent.md#sui-mechanism) |

Keep builders, account/object layouts, confirmation and failure decoding in their
chain-specific boundaries. A common action name does not imply equivalent permission
or transaction mechanics. ABI changes regenerate the EVM client artifact; Rust
layout changes require matching manual Solana encoding; Move layout changes require
matching BCS parsing. Static client agreement still needs the relevant runtime evidence.

## Discovery and current limits

The catalog is three known EVM token IDs, one configured Solana vehicle mint and
one configured Sui Vehicle. Sui follows the shared Market's single active-listing
slot. Discovery is intentionally limited to these configured assets; there is no
general indexer. The API does not
mirror any listings, balances or settlement outcomes.

EVM/Solana fixtures target local chains; the Sui frontend defaults to testnet and
needs public identifiers from an actual deployed package plus funded demo assets.
Source availability does not imply deployment, real-wallet compatibility or
production readiness. [Verification](../operations/verification.md) records which
layers can run on this host and which remain unavailable.
