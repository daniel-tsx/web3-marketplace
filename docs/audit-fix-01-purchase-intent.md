# Audit fix 01: purchase intent

Status: implemented for the local study project. EVM runtime and TypeScript checks passed; Anchor and Move runtime verification remain unavailable on this host. Scope is H1 only, including Solana payment-mint identity. H2 and H3 are unchanged.

## The original bug

Read listing A → buyer reviews its seller and price → seller cancels and relists B → pending purchase reads whatever listing exists at execution time. Previously, EVM keyed the purchase only by token ID, and Solana could recreate a listing at the same PDA. An old authorization could therefore purchase a different logical listing, even when B had exactly the same seller and price.

## Why frontend checks are insufficient

Balances, allowances and listing reads describe an earlier moment. The seller can change state after a read, during a wallet prompt, or before transaction execution. Rechecking immediately before submission only narrows that window; it does not close it. Silently substituting newly read terms also changes what the buyer authorized.

## The fix

Purchase authorization binds to the terms used to render the Buy action. EVM and Solana submit the reviewed listing version and reviewed price as the maximum spend. Each chain rejects stale intent during execution. There is no automatic purchase retry with replacement terms. The UI explains stale-listing failures and offers a refresh so the buyer can review and sign again.

## EVM mechanism

`Listing` now contains `seller`, `price`, `active`, and `version`. Every successful `listVehicle` increments the previous version with checked arithmetic. Cancel and purchase mark it inactive without deleting its version. A new NFT owner replacing an old owner's stale listing also increments the counter.

`buyVehicle(tokenId, expectedVersion, maxPrice)` checks active status, version equality, the price cap, buyer/seller separation, current ownership, and NFT approval before transfers. `ListingVersionMismatch` and `PriceExceedsMaximum` are distinct custom errors. Marketplace listing, cancellation, and purchase events include the version. The existing Foundry artifact → `scripts/export-abis.mjs` workflow generates the frontend ABI.

`VehicleCard` captures version and price from its rendered listing. For a mined revert, a read-only simulation of the same arguments at the receipt block helps recover a useful error; it never sends another transaction. Block-end simulation is diagnostic rather than a transaction trace, and an unavailable historical read can leave a generic error. The receipt still determines execution failure.

## Solana mechanism

The listing PDA remains `["listing", vehicleMint]`, but is now persistent. `init_if_needed` creates it once; each successful listing requires it to be inactive and increments its checked `u64` version. Cancellation and purchase close the escrow ATA and mark the listing inactive. They never close the listing PDA, reset its version, or return its rent. This small permanent account is the cost of preserving generation history at a deterministic address.

`buy_vehicle(expected_version, max_price)` checks equality and the price cap before token transfers. Its errors include `ListingVersionMismatch`, `PriceExceedsMaximum`, and `ListingNotActive`. The client exposes the intent explicitly rather than hiding it in an executor. Buy instruction data is the 8-byte discriminator followed by two little-endian `u64` values. The Listing account is now 122 bytes including its discriminator: existing fields followed by `active: bool` and `version: u64`.

`SolanaVehicleCard` distinguishes an inactive persistent record from an active listing. It submits the version and price it rendered. Preflight logs and confirmed program error codes map stale intent to the review message. A canceled listing's missing escrow can produce Anchor's `AccountNotInitialized` before the custom active constraint runs; logs identify that case. If failed-transaction logs are unavailable, the original execution error is retained instead of guessing that every missing account is a stale listing.

### Payment mint identity

One `MarketConfig` PDA at `["market"]` stores the exact payment mint. `initialize_market` requires the existing fixed fee-recipient authority's signature, so an arbitrary first caller cannot select the currency. Initialization is one-time; there is no config update or close instruction. The existing deterministic authority keys remain local study fixtures, not public-network credentials.

Both listing and purchase require the payment mint to equal the config's public key. Purchase additionally checks it against the listing's stored mint. Six decimals remain a formatting requirement, not currency identity. Another six-decimal SPL token is rejected with `InvalidPaymentMint`.

The seed script initializes the config with its mUSDC mint, and refuses an existing config with a different mint. The frontend reads the program-owned config, compares it to its configured payment mint and any active listing, and disables trading and mUSDC labeling on mismatch. Balances and execution therefore refer to the same configured asset.

## Sui mechanism

Production Sui code is unchanged. Every listing gets a new `Listing` object ID. Cancel extracts its Vehicle, leaving that old object inactive. Relisting creates a different object; no function refills or reprices the old listing. A purchase built with the old ID still targets that exact inactive object and aborts. The client also constructs the payment coin from the reviewed price.

An offline transaction-construction regression checks that an old transaction retains the old object ID and amount. A Move regression cancels, relists at the same price, asserts a different object ID, and expects the old-object purchase to abort in the marketplace. The latter still requires execution with a Sui toolchain.

## Important principle

Approval/allowance is token authorization, not purchase intent. An unlimited allowance must not let a marketplace spend against a replacement listing the buyer never reviewed. Balance checks likewise do not authorize a different Solana price or currency.

All three chains preserve the same invariant using their own mechanics:

| Chain | Purchase binding |
| --- | --- |
| EVM | Token ID + persistent listing version + maximum price |
| Solana | Persistent listing generation + maximum price + enforced payment mint |
| Sui | Distinct Listing object identity + exact payment construction |

Before: buyer reviews A; seller relists B; old transaction may buy B.

After: buyer reviews version N; seller relists version N+1; old transaction reverts, even at the same price. For Sui, the old object ID remains inactive while the new listing has another ID.

## Local deployment compatibility

This is a breaking EVM ABI and Solana instruction/account-layout change. Deploy the updated EVM contract and sync its addresses using the existing deployment workflow before using this frontend. Existing EVM contract deployments do not acquire these checks from an ABI update.

For the local Solana fixture, use a fresh isolated validator ledger, then the existing prepare → build → deploy → seed sequence. Do not point this client at old 113-byte Listing accounts. Do not reset or delete a ledger containing assets you need; no ledger reset, migration, or deployment was performed in this iteration. A public deployment with existing escrow would need a separately designed asset-preserving migration. There is no migration in this learning-project fix.

Run seed before the Anchor runtime tests if using the same ledger for the UI. The tests reuse an existing config mint; on an empty deployment they initialize a fresh test mint instead. That mint must be controlled by the local test payer for test funding.

## Verification

- `.tools/foundry/forge.exe build --root packages/contracts` and `node scripts/export-abis.mjs`: passed.
- `.tools/foundry/forge.exe test --root packages/contracts`: 14 passed. Includes same-price relisting, increased-price relisting with unlimited allowance, an independently enforced lower cap, current-intent success, and version persistence across purchase/new ownership.
- `pnpm --dir packages/solana test`: 3 offline client tests passed (Borsh layout, explicit intent encoding, config identity).
- `pnpm execution:test`: 10 passed, including resolver/Sui flow regressions and 3 purchase-error tests.
- `pnpm api:test`: 7 passed; authentication implementation unchanged.
- `pnpm sui:test`: 2 client tests passed, including old Listing identity/payment retention.
- `pnpm typecheck` and `pnpm lint`: passed after correcting new-code type/syntax errors found by the initial checks.
- `pnpm build`: passed. Vite reported dependency annotation and large-chunk warnings; Solana client tests used the dependency's pure-JavaScript bigint fallback. These warnings did not fail verification.
- `pnpm solana:build`: attempted; `anchor` is unavailable. The updated validator suite includes stale same-price intent, raised-price intent, an independent cap failure, current intent success, version persistence, unauthorized config initialization, and wrong-six-decimal-mint rejection for both listing and purchase. It was not runtime-executed.
- `pnpm sui:move:build` and `pnpm sui:move:test`: attempted; `sui` is unavailable. Move compilation and runtime tests remain unverified.

Query refresh behavior, wallet-linking authentication, providers, and shared execution architecture are unchanged.
