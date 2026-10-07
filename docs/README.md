# Documentation index

Status: **current**. Start with [AGENT_START_HERE](AGENT_START_HERE.md) for project
truth and source paths; follow [AGENTS.md](../AGENTS.md) for behavioral policy.
[AI_WORKFLOW](AI_WORKFLOW.md) explains how engineers and agents use this context.

## Current document ownership

| Subject | Owning document |
| --- | --- |
| Shared agent behavior | [AGENTS.md](../AGENTS.md); [CLAUDE.md](../CLAUDE.md) is an entry point only. |
| Project orientation, source map, known drift | [AGENT_START_HERE](AGENT_START_HERE.md) |
| Documentation routing and lifecycle | This index |
| Engineering sequence and multi-agent handoffs | [AI_WORKFLOW](AI_WORKFLOW.md) |
| Current system boundaries and chain comparison | [Multichain system](architecture/multichain-system.md) |
| Identity, custody, authorization and result boundaries | [Trust boundaries](architecture/trust-boundaries.md) |
| Verification commands, prerequisites and host limitations | [Verification](operations/verification.md) |
| Vercel Services target, environment and storage blocker | [Vercel deployment](operations/vercel.md) |
| H1 intent invariant and deployment compatibility | [Audit fix 01](audit-fix-01-purchase-intent.md) |
| H2 credential-change invariant | [Trust boundaries](architecture/trust-boundaries.md#proofs-replay-and-persistence); [Audit fix 02](audit-fix-02-wallet-link-reauthentication.md) records the implementation. |
| H3 execution/reconciliation invariant | [Trust boundaries](architecture/trust-boundaries.md#h3-execution-success-is-separate-from-reconciliation-success) |

The root [README](../README.md) is the human engineering overview and quick start.
The [CI workflow](../.github/workflows/ci.yml) and location-specific
[web](../apps/web/.env.example)/[API](../apps/api/.env.example) examples are described
by the verification/setup owner. The run guides below
own detailed explanations within their run/chain scope; current cross-cutting docs
link to them rather than duplicating transaction walkthroughs.

## Task routing

After the required entry reads, load only the relevant row. Implementation paths
and tests are linked in [the source-of-truth map](AGENT_START_HERE.md#source-of-truth-map).

| Task | Read next | Inspect next |
| --- | --- | --- |
| EVM contracts/client | [Run 1](run-01-evm-baseline.md), [H1](audit-fix-01-purchase-intent.md), relevant [verification row](operations/verification.md#command-matrix) | Solidity and Foundry tests; VehicleCard/read/transaction hooks; ABI exporter when signatures change. |
| Solana program/client | [Run 2](run-02-auth-solana-multichain.md), [H1](audit-fix-01-purchase-intent.md), [verification](operations/verification.md) | Anchor Rust/accounts, manual TypeScript encoder, offline and validator suites, Solana hooks/card. |
| Sui Move/client | [Run 3](run-03-sui-multichain.md), [H1 Sui section](audit-fix-01-purchase-intent.md#sui-mechanism), [verification](operations/verification.md) | Move sources/scenarios, BCS parsers/builders, Sui result handling, query keys and card. |
| Authentication/identity | [Trust boundaries](architecture/trust-boundaries.md), [Run 2 identity/proofs](run-02-auth-solana-multichain.md), [Run 3 Sui proofs/migration](run-03-sui-multichain.md#2-sui-authentication-and-application-identity) | API server/database/tests; auth browser client, session query and AccountPanel. |
| Frontend cross-chain execution | [Multichain system](architecture/multichain-system.md), [Trust boundaries](architecture/trust-boundaries.md), relevant run's flow (plus H1 for purchases) | App, bootstrap, resolver/tests, affected chain's card/reads/confirmation hook. |
| Setup or check failures | [Verification](operations/verification.md), affected run's setup section | Relevant manifests/config, public configuration readers and local scripts; never print env/key files. |
| Workflow/documentation | [AI_WORKFLOW](AI_WORKFLOW.md), this lifecycle, [known drift](AGENT_START_HERE.md#known-documentation-drift) | Owning document, referenced source, package scripts and local links. |

## Run and audit references

| Document | Lifecycle and scope |
| --- | --- |
| [Run 01: EVM baseline](run-01-evm-baseline.md) | **historical** baseline. Deep EVM transaction/state reference; its whole-app and future-work descriptions predate Runs 2/3 and its buy trace predates H1. |
| [Run 02: identity and Solana](run-02-auth-solana-multichain.md) | **shipped** implementation reference, with Anchor runtime **unverified**. Identity/Solana details remain useful; its two-chain overview is extended by Run 3 and listing semantics by H1. |
| [Run 03: Sui and three chains](run-03-sui-multichain.md) | **shipped** implementation reference, with Move build/runtime, deployment and wallet flow **unverified**. Includes Sui setup, objects, proofs and identity migration. |
| [Audit fix 01: purchase intent](audit-fix-01-purchase-intent.md) | **current** H1 source of truth. EVM runtime/TypeScript passes are recorded there; Anchor/Move remain unverified. |
| [Audit fix 02: wallet-linking reauthentication](audit-fix-02-wallet-link-reauthentication.md) | **shipped** H2 implementation record. Requires a live session and fresh trusted/new-wallet proofs. Browser-wallet interaction remains unverified; H3 is unchanged. |

Here **shipped** means present in repository code, not deployed or production-ready.
The index classifies these documents without rewriting their original status text.
Read [known drift](AGENT_START_HERE.md#known-documentation-drift) before treating a
run reference as a description of the entire current system.

## Documentation lifecycle

Use a `Status:` line near the top of new or substantively updated documents:

| Status | Meaning and handling |
| --- | --- |
| **current** | Maintained source of truth for a defined subject; verify it against code when changing that subject. |
| **planned** | Proposed work with acceptance criteria; not evidence of implemented behavior. |
| **shipped** | Implemented change/run record with its verification limits; link to current ownership and stop treating it as an active plan. |
| **historical** | Earlier scoped snapshot kept for learning/provenance; does not override current docs/code. |
| **superseded** | Replaced document; identify the replacement and stop routing new work to it. |

Create a current document only when a subject lacks an owner. Prefer updating the
existing owner or linking to a run guide. Record meaningful drift in
AGENT_START_HERE with the conflicting claim, actual code path, and applicable
replacement; fix the owning current doc within authorized scope. Archive stale
plans/reviews under `docs/archive/` when superseded, preserve useful evidence, and
update inbound links. Do not keep two current documents claiming the same subject.

## Directory categories

- `docs/AGENT_START_HERE.md`, `README.md`, `AI_WORKFLOW.md`: entry, routing, workflow.
- `docs/architecture/`: maintained system and trust-boundary explanations.
- `docs/features/`: feature/invariant owners when needed; no directory is created yet
  because H1 already has its own guide at the existing path.
- `docs/operations/`: reproducible commands and prerequisites.
- `docs/archive/`: replaced plans/reviews when needed; no empty archive is created.

Existing run/audit files remain where they are. Historical reorganization is a
separate task; moving them is not necessary to establish this workflow.
