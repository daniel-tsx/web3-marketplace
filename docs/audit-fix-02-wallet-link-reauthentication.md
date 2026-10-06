# Audit fix 02: wallet-linking reauthentication

Status: **shipped** implementation record for H2. [Trust boundaries](architecture/trust-boundaries.md) owns current identity/authorization policy. This change is present in code, not deployed; browser-wallet interaction remains unverified. H1 is preserved and H3 is outside this change.

## Original finding and invariant

Previously, an authenticated session plus a signature from a new wallet could link that wallet to the session's user. Since any linked wallet can log in, an attacker with a stolen session could add their own permanent credential. This is application-account takeover; it does not grant the attacker signatures from the victim's blockchain wallets.

Wallet linking is now a sensitive credential change. A link requires a live application session, fresh authorization from a wallet already linked to that user, and fresh ownership proof from the exact new wallet. Both proofs authorize one request only. The session alone cannot add a credential.

The API owns this invariant for EVM, Solana and Sui equally. Their message-signature verification remains native: Viem EVM verification, detached Solana Ed25519, and Mysten Sui personal-message verification, including supported non-Ed25519 schemes. Marketplace programs and execution readiness do not own this identity change.

## Concrete protocol

1. `POST /wallets/link/challenge` receives the new wallet's `ecosystem` and `address`, plus `authorizer: { ecosystem, address }`, with the session cookie. The API requires the authorizer to already belong to the session user.
2. It atomically stores one five-minute target challenge and its `wallet_link_requests` context. The response contains `challengeId`, the target ownership `message`, `expiresAt`, and `authorizer: { ecosystem, address, message }`.
3. The already-linked wallet signs the authorization message. The new wallet signs the separate ownership message. Neither signature alone changes identity state.
4. `POST /wallets/link/verify` receives the original `challengeId`, target `ecosystem`/`address`, target `signature`, and `authorizerSignature`, with the same session cookie.
5. The API verifies both exact stored messages. In an SQLite transaction it rechecks session validity/identity, trusted-wallet membership, and challenge expiry, conditionally consumes the challenge, checks exclusive target-wallet ownership, and inserts the wallet link. No asynchronous signature verification occurs inside this transaction.

Both messages explicitly name:

- Configured application Origin, `Purpose: link-wallet`, and their distinct proof role.
- Application user UUID and originating session ID.
- Trusted wallet ecosystem/address and new wallet ecosystem/exact normalized address.
- Link request ID, random nonce, issue time, and expiry.

The signed session ID is a non-authenticating database identifier; the bearer cookie and token hash are never included. The two messages share one expiry and consumption record but differ in signer and proof role. A login signature, ownership signature, approval for another target/request, or signature with a different Origin cannot replace the trusted authorization.

## Frontend and failure semantics

The account panel lets the user select an already-linked approving wallet and capture a connected target wallet. It shows both identities before signing, then uses two explicit steps: authorize the credential change, and prove the new wallet's ownership. Account switching between steps supports two wallets in the same ecosystem. The target and approving wallet are fixed for that request; changes in browser connection cannot substitute a different target.

Wallet rejection leaves the current request available for a deliberate retry until expiry. Expired, consumed, invalid-session, or invalid-approval requests are cleared so the user can start again. No automatic signature request or retry substitutes new terms. The server remains authoritative if an account changes during a wallet prompt.

Requests from another session are rejected even for the same user. Logout deletes that session's link-request context, and verification rechecks session liveness after cryptographic work. Lost trusted-wallet membership prevents commit. Existing ownership conflicts roll back challenge consumption and the attempted link. Concurrent verification permits one completion; reuse reports `challenge_used`. A fresh, fully authorized request for an already-linked wallet is idempotent and does not duplicate credentials.

If a successful response is lost, replay still reports a used challenge. Check the current application account before starting again; there is no automatic retry or session-wide approval window. This fix does not implement unlink, recovery, or session-compromise remediation.

## Persistence and compatibility

Schema version 4 adds `wallet_link_requests` and a session lookup index. Existing users, wallets, sessions and challenges remain intact. Run 2's Sui migration still runs first where needed. Initialization is idempotent; no database reset or data migration command was run against a real application database.

Login endpoints and existing linked-wallet credentials remain compatible. The link endpoints deliberately require the new authorizer fields and signature. Pre-H2 link challenges have no request context and fail closed: clients must create a new two-proof request. Deploy the API and frontend together; an old frontend cannot perform an unsafe one-proof link against the updated API.

H1 purchase arguments, versions, payment-mint checks, chain clients, and transaction/cache hooks are unchanged. H2 never modifies canonical blockchain state.

## Regression evidence

The original regression first failed because the old link endpoint returned HTTP 200 with only a session and new-wallet proof. It now rejects that path and forged trusted-wallet signatures.

API coverage also includes all nine trusted/target ecosystem pairings, target substitution, request substitution, role/login/Origin confusion, expiry and replay across all three trusted-wallet ecosystems, session switching/logout, trusted-wallet membership, commit-time invalidation, concurrent verification, duplicate-link idempotency, ownership-conflict rollback, legacy challenge rejection, and preservation of existing identity rows.

[Verification](operations/verification.md) owns the reproducible commands and prerequisites. Native API signatures are verified in-process with real cryptography; that is separate from browser signing and chain execution. No production-readiness claim follows from offline or TypeScript checks.

## Verification on 2026-10-06

| Command | Result and scope |
| --- | --- |
| `.tools\foundry\forge.exe build --root packages/contracts` | **passed**, unchanged source reused the existing compilation cache. |
| `node scripts/export-abis.mjs` | **passed**, generated ABI has no diff. |
| `.tools\foundry\forge.exe test --root packages/contracts` | **passed**, 14 EVM/H1 tests. |
| `pnpm api:test` | **passed**, 31 tests including nested H2 cases and the existing identity/migration suite. |
| `pnpm execution:test` | **passed**, 10 existing execution/H1/result tests. |
| `pnpm --dir packages/solana test` | **passed**, 3 offline H1 client tests; dependency used its pure-JavaScript bigint fallback. |
| `pnpm sui:test` | **passed**, 2 offline builder/H1 tests. |
| `pnpm typecheck` | **passed**, recursive workspace TypeScript. |
| `pnpm lint` | **passed**, frontend ESLint. |
| `pnpm build` | **passed**, frontend production bundle; dependency annotation and large-chunk warnings remain. |
| `pnpm --dir apps/api build` | **passed**, API TypeScript compilation. |
| `pnpm solana:build` | **environment unavailable**, attempted; `anchor` executable is missing. |
| `pnpm solana:test` | **not run**, Solana validator/CLI and built/deployed program prerequisites are unavailable. |
| `pnpm sui:move:build` | **environment unavailable**, attempted; `sui` executable is missing. |
| `pnpm sui:move:test` | **environment unavailable**, attempted; `sui` executable is missing. |
| `git diff --check` | **passed**; new files also checked for whitespace errors. |

All 144 local links in the four changed documentation files resolve. A Git diff check confirms no changes to the packages, generated ABI, marketplace components or transaction/cache hooks. The initial security regression failed as intended; intermediate test-cleanup/schema errors were corrected before the final successful runs. Browser-wallet prompts and same-ecosystem account switching were not exercised with real wallets. No commit, push, deployment, ledger reset, repository-setting change, dependency change, or live database initialization was performed.

The design follows the [OWASP guidance on reauthentication for sensitive features](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html#require-re-authentication-for-sensitive-features) and [binding authorization to the exact operation](https://cheatsheetseries.owasp.org/cheatsheets/Transaction_Authorization_Cheat_Sheet.html).
