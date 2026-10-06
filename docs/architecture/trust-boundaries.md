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
on POSTs and uses an HttpOnly, SameSite=Lax cookie. Its existing `secure: false`
setting is for local HTTP; an HTTPS deployment needs a separate reviewed change.
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

| Chain | Existing result behavior |
| --- | --- |
| [EVM hook](../../apps/web/src/web3/useTransactionFlow.ts) | Hash is submission; receipt must have success status. Receipt event parsing is diagnostic. Refresh failure preserves confirmed execution with a separate `refreshError`. H1 revert simulation is read-only diagnosis using the same arguments, not a retry. |
| [Solana hook](../../apps/web/src/web3/solana/useSolanaTransaction.ts) | Signature is submission; `confirmTransaction` uses `confirmed` commitment and checks its error, then inspects available transaction metadata/logs. Missing metadata is not a claim of decoded logs. Refresh failure is reported separately. This is not a promise of finalized commitment. |
| [Sui hook](../../apps/web/src/web3/sui/useSuiTransaction.ts) | `successfulDigest` rejects `FailedTransaction`; successful wallet execution is followed by wait/transaction reads. Read/inspection failure yields `executed` with a read error; verified reads then refresh affected queries and yield `confirmed`, retaining any refresh error. |

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
