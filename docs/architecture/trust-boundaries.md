# Trust boundaries

Status: **current**. This document owns identity, authorization, custody and
transaction-result boundaries. It describes existing code, not a production
security certification. Use [the source map](../AGENT_START_HERE.md#source-of-truth-map)
and chain run guides for detailed implementations.

## Identity and authorization owners

| Layer | Owns | Does not establish |
| --- | --- | --- |
| Wallet libraries | Connected account, signing capability, wallet/network interaction | Application login or a backend link merely by connecting |
| [API server/database](../../apps/api/src/) | Exact challenges, verified wallet-to-user links, sessions and identity rows | On-chain ownership, marketplace permission or custody |
| [Resolver and cards](../../apps/web/src/) | Readiness prompts, reviewed terms, local transaction state | A security boundary against direct chain calls |
| EVM contract / Solana program / Sui Move | Chain-specific ownership, transfer authority, listing/payment validation | Knowledge of the application's UUID, session or login wallet |
| React/TanStack Query | Cached reads, inputs and presentation | Canonical ownership, balances, links or settlement |

The app requires a session and a matching linked/connected execution wallet for
its own buttons. The marketplaces do not receive or validate API sessions;
an actor may call them directly if chain rules permit. Changes to a UI gate do not
create chain-level access control.

## Proofs, replay and persistence

[server.ts](../../apps/api/src/server.ts) verifies the exact stored challenge, bound
to origin, ecosystem, normalized address, purpose and expiry. Linking additionally
binds the stored challenge to the current session user. Challenge consumption and
identity writes occur in an SQLite transaction. A unique ecosystem/address pair
prevents a wallet belonging to two users.

Wallet linking additionally requires fresh authorization from an already-linked
wallet and fresh ownership proof from the new wallet. Both messages bind the
exact target, approving wallet, user, originating session, Origin, purpose,
nonce and expiry. Session validity, trusted-wallet membership and expiry are
rechecked after signature verification, at the atomic link/consumption boundary.
A stolen session alone cannot add a persistent login credential. The
[H2 implementation record](../audit-fix-02-wallet-link-reauthentication.md) describes
the two-proof protocol, failure semantics and backward compatibility.

Proofs remain ecosystem-specific: Viem for EVM messages, detached Ed25519 for
Solana, Mysten personal-message verification for Sui. EVM is lowercase-normalized,
Solana base58 comparisons remain case-sensitive, and Sui addresses are canonicalized.

The browser sends credentials with API requests; JavaScript does not store the
session token. SQLite stores only its hash. The API checks the configured Origin
on POSTs and uses an HttpOnly, SameSite=Lax cookie with Path `/` and no Domain.
Cookies are Secure when the configured frontend origin uses HTTPS; local HTTP
remains supported. [Vercel scaffolding](../operations/vercel.md) preserves these
boundaries but blocks hosted API startup pending durable shared identity storage.
The API's Run 2 → Run 3 migration preserves identity rows rather than deleting the database.

## Custody and purchase intent

EVM rechecks seller NFT ownership and approval for noncustodial listings. Solana
uses a listing-PDA-controlled escrow ATA; cancel/buy close the escrow but retain
the generation record. Sui wraps the Vehicle in a shared Listing and extracts it
on cancel/buy, leaving that Listing inactive.

[H1](../audit-fix-01-purchase-intent.md) owns the exact purchase protections and
compatibility warnings. Allowance, sufficient balance, or a valid connection does
not authorize replacement terms. Reviewed EVM/Solana generations and caps must
reach execution unchanged; Solana also enforces currency identity, while Sui
targets the reviewed object. Cached rereads cannot close an execution-time race.

## Transaction results and partial failures

| Chain | Execution proof and reconciliation reads |
| --- | --- |
| [EVM hook](../../apps/web/src/web3/useTransactionFlow.ts) | Hash is submission; receipt must have success status before reconciliation. Receipt event parsing is diagnostic. Reconciliation reads affected Wagmi contract queries, including the new owner's operator-approval key after a purchase. H1 revert simulation still uses the same arguments for read-only diagnosis. |
| [Solana hook](../../apps/web/src/web3/solana/useSolanaTransaction.ts) | Signature is submission; `confirmTransaction` at `confirmed` commitment must return no execution error. Subsequent metadata/log reads and affected PDA/escrow/ATA reads belong to reconciliation. A metadata RPC failure cannot overwrite successful confirmation. Missing metadata is not a claim of decoded logs; `confirmed` commitment is not finalized commitment. |
| [Sui hook](../../apps/web/src/web3/sui/useSuiTransaction.ts) | `successfulDigest` requires successful wallet execution and rejects `FailedTransaction`. Reconciliation repeats only wait/transaction reads and affected object/balance reads. It rereads Market first, then the current Listing or unwrapped Vehicle; an obsolete inactive Listing is invalidated without being parsed as the active resource. |

### H3: execution success is separate from reconciliation success

Previously each card awaited `invalidateQueries()`, whose default refetch handling
can suppress query errors. A failed RPC reread could therefore resolve refresh and
mark the UI fully confirmed while displaying stale data. Execution failure and
post-execution reads are different failure domains.

The three native flows now enter the shared [read-only reconciliation state](../../apps/web/src/web3/reconciliation.ts)
only after their execution-success checks:

- `reconciling`: execution succeeded; affected reads are pending.
- `confirmed`: execution succeeded and all required reconciliation reads completed.
- `reconciliation-failed`: execution succeeded, but a read failed. The native
  hash/signature/digest and original error (`refreshError.cause`) remain available.

Wallet rejection or unsuccessful/unverified execution remains in the native
failure path and does not start reconciliation. No universal transaction executor
is introduced: each chain still owns signing, submission, confirmation, diagnostics
and its affected read set.

Targeted reads invalidate without automatic refetch, cancel any in-flight
pre-transaction response, then await an explicit `fetchQuery` with `staleTime: 0`
and no automatic retry for that attempt. The promise rejects on RPC/parser errors.
Disabled reads are explicitly fetched when needed; an offline paused read remains
pending rather than becoming a successful no-op. Duplicate keys share one reread.
Only optional recipient balances without cache entries are left invalidated;
required displayed reads cannot silently disappear from the reconciliation set.

The UI says **transaction succeeded; state refresh failed**, retains the native
identifier, and offers **Retry state refresh**. The saved retry job contains only
read callbacks. It cannot request a signature, resend a transaction, rebuild a
purchase or substitute new H1 terms. Repeated clicks share the pending read job.
Marketplace write buttons remain disabled until reconciliation succeeds. A new
transaction discards the old retry job, and older read completions cannot replace
its transaction result.

Reconciliation is a fresh RPC read at the existing chain commitment/read boundary,
not an atomic cross-query snapshot, stronger finality, or protection against a later
actor changing state. Partial refreshes may update some cached fields while others
fail; the transaction remains explicitly unreconciled until the targeted read batch
succeeds. H1 and H2 enforcement remain unchanged.

Regression coverage uses real TanStack Query clients/observers and controlled
read functions: suppressed invalidation errors, success/failure/read-only recovery
for native identifiers, partial failures, concurrent retries, disabled/paused
reads, pre-transaction responses and Sui resource transitions. The EVM status copy
is server-rendered in a test. These tests do not exercise real wallet/RPC execution;
see [verification](../operations/verification.md) for runtime prerequisites.

Do not collapse execution failure, uncertain/read-unavailable results and failed
cache refresh into one claim. A submitted identifier does not justify reporting
successful ownership transfer; event/metadata details do not replace current chain
reads. Offline result-helper tests do not exercise wallet or RPC execution.

## Configuration boundaries

Browser environment values are public endpoints and identifiers. Private keys
stay with wallets; local deterministic fixture keys must stay on development
chains. EVM chain/RPC/addresses, Solana program/accounts/RPC, and Sui network/package/
objects/Coin type must agree within their respective boundaries. See
[local setup notes](../operations/verification.md#local-setup-boundaries) and
[known drift](../AGENT_START_HERE.md#known-documentation-drift) for current limitations.
