# Marketplace presentation

Status: **current**. Owns the browse-first catalog, detail/review UX, visual identity and branding.
[Multichain system](../architecture/multichain-system.md) and
[trust boundaries](../architecture/trust-boundaries.md) own native execution and
identity. [Verification](../operations/verification.md#marketplace-ux-verification)
records the latest UX pass and its limits.

## Signature and implementation

An automotive studio: graphite display bays, sea-glass teal lane accents, large
Manrope typography, mono asset readouts and hairline divisions. The converging-lanes
mark suggests vehicles and three distinct execution paths. Tokens, spacing,
responsive rules, focus states and reduced motion live in
[styles.css](../../apps/web/src/styles.css).

| Component | Responsibility |
| --- | --- |
| [App](../../apps/web/src/App.tsx) | Navigation, concept hero, ecosystem filters, catalog, engineering explanation, wallet/network disclosures and footer. |
| [MarketplaceChrome](../../apps/web/src/components/MarketplaceChrome.tsx) | Brand, Arrow, EcosystemLabel, VehicleVisual and calm AssetReadError primitives. |
| [CatalogBrowser](../../apps/web/src/components/CatalogBrowser.tsx) | Local ecosystem/search/active-listing filters and recoverable empty state. |
| [CatalogPreviewCard](../../apps/web/src/components/CatalogPreviewCard.tsx) | Fictional concepts and architecture explanations, with no transaction controls or invented terms. |
| [VehicleDetail](../../apps/web/src/components/VehicleDetail.tsx) | Interactive card, native detail dialog, artwork disclosure, copy feedback and independent wallet/session/network requirements. |
| Native VehicleCard / SolanaVehicleCard / SuiVehicleCard | Actual chain reads, owner/payment/listing gates and unchanged native action/refresh handlers. |
| [TransactionReview](../../apps/web/src/components/TransactionReview.tsx) | Frozen terms and original action callback; changed listing, identity, wallet or readiness disables confirmation. |
| [TransactionProgress](../../apps/web/src/components/TransactionProgress.tsx) | Shared presentation of native phases, identifiers, uncertainty and read-only recovery. EVM TransactionStatus is a thin adapter. |
| [ListingPriceField](../../apps/web/src/components/ListingPriceField.tsx) | Six-decimal positive prices, EVM uint256 / Solana-Sui uint64 limits and accessible validation. |
| [AccountPanel](../../apps/web/src/auth/AccountPanel.tsx), [AccountStatus](../../apps/web/src/auth/AccountStatus.tsx) | Signed login, two-proof linking, progress, rejection, expiration, logout and service recovery. |
| [SolanaWalletDialogProvider](../../apps/web/src/components/SolanaWalletDialogProvider.tsx) | Native dialog using existing WalletModalContext and adapter selection. WalletMultiButton still owns connection; explicit keyboard containment, Escape/backdrop dismissal, focus restoration and scroll locking. |

## Preview versus native assets

[presentation/catalog.ts](../../apps/web/src/presentation/catalog.ts) contains
three fictional concepts with no owners, listing IDs, prices or history. They
never enter chain hooks, caches or transaction builders.

| Resource state | Catalog surface |
| --- | --- |
| Unconfigured | Demo Preview; resources not configured; trading unavailable. |
| Initial read pending | Demo Preview; checking resources; trading unavailable. |
| Failed/negative read | Demo Preview; resources unavailable; trading unavailable. |
| Successful configured check | Existing native cards, with their own asset/payment reads and identity/network gates. |

EVM checks RPC chain ID and nonempty bytecode at all three configured addresses.
Solana checks executable program presence when both mints are configured. Sui
retains its package/Market read and network check. These are discovery, not
compatibility, asset existence, sale availability, security or production proof.

Resource probes do not poll or refetch on focus. Failed checks have read-only
recheck buttons in Network details. Native asset hooks keep their existing
refresh behavior. Filters hide mounted cards rather than discard transaction or
reconciliation state. Native cards use resource-based keys; account/session
changes no longer remount them. Once detected, a native card remains mounted
through network/resource discovery failures so its transaction result and saved
read-only reconciliation job remain available. Readiness still blocks writes.
No automatic signing, transaction retry or replacement purchase terms are added.

The hero always says Demo Preview. Native artwork is also illustrative and does
not verify an asset's appearance. Discovery still covers three known EVM token
IDs, one configured Solana mint and one configured Sui Vehicle/Market; there is
no general indexer or off-chain listing store.

## Detail, review and recovery

This Vite app has no page router. Each card opens a native dialog while its
chain hooks stay in the card. The detail surface includes the large concept
visual, verified available listing/owner data, required and current network,
connected wallet, application session and linked-wallet checks. Solana's idle
token holder is not resolved by the existing reads and is explicitly described
as unresolved. Contract/mint/object identifiers and execution semantics remain
in expandable details. No production vehicle specifications are invented.

Search matches the displayed name and description. Active-listing filtering
requires an actual readable active listing; concepts never qualify. Payment or
approval problems remain visible on an active asset rather than hiding its sale
offer. Unconfigured/unavailable resources keep their explicit diagnostics and
recheck controls, including when an active-listing filter has no results.

All native approvals, listings, cancellations and purchases require a separate
review before the wallet prompt. The review stores the original callback and
rendered terms. EVM retains token/version/price, Solana retains generation/price/
payment mint, and Sui retains Listing object/price. A changed binding or session/
execution-wallet scope disables confirmation. Closing and reopening review is
an explicit review of new terms; there is no automatic purchase retry.

Transaction presentation differentiates wallet approval, submitted identifiers,
pending execution, successful execution with reads pending, successful execution
with failed reads, and fully refreshed confirmation. Unreadable post-submission
results remain unverified. Solana's confirmed commitment is not labeled finalized.
Failed reconciliation offers only the existing read retry, and native write
buttons stay disabled until it succeeds. Native confirmation hooks are unchanged.

Copy controls keep full selectable identifiers, announce success/fallback and
clear old feedback when an identifier changes. Asset/API/network/transaction
errors use calm primary copy, optional diagnostics and safe recovery actions.
The detail dialog and Solana wallet chooser contain Tab/Shift+Tab, close on
Escape/close/backdrop, restore focus and lock background scrolling. Detail
workspace navigation also closes its dialog. Reduced
motion remains supported. No animation, routing or state-library dependency was added.

Explorer links are restricted to valid nonzero Sui object IDs read on the standard
public Testnet endpoint. Local/custom endpoints and other networks get no assumed
public explorer. The Testnet URL follows the
[Sui Foundation workshop](https://github.com/sui-foundation/sui-object-model-workshop#exercise-1-handling-returned-sui-nft).

## Application account transitions

Connection remains independent of authentication and linkage. The account panel
explains the one-time ownership signature and two-proof linking steps, freezes
the target before signing, disables already-linked targets and labels the
connected EVM/Sui networks and configured Solana RPC separately.

Session reads share one TanStack Query key. They remain deduplicated with the
existing 30-second stale time and normal focus/reconnect behavior; no polling
is introduced. After login/link verification, a cancelled-old-read/fresh-read
transition explicitly fetches `/me` with zero stale time and no retry. A failed
session read blocks execution/account actions rather than using cached identity
as current readiness. Expiration is shown after the API reports guest state.
Successful logout cancels prior reads and sets the cache to guest, clears pending
linking and explains that connected wallets remain connected. API proofs,
cookies, Origin validation and authorization are unchanged.

## Assets and metadata

All paths below are under `apps/web/public`; Vite serves them locally with no
external font/image CDN or new runtime dependency.

| Path | Deliverable |
| --- | --- |
| `brand/mark.svg` | Reusable converging-lanes mark. |
| `favicon.svg`, `favicon.ico` | SVG and 16/32/48 PNG-backed ICO variants. |
| `apple-touch-icon.png` | 180 × 180 icon. |
| `og-image.png` | 1200 × 630 cover; suitable for manual GitHub Social Preview upload. |
| `vehicles/meridian-hero.webp` | 1440 × 960 original silver concept, about 84 KB. |
| `vehicles/meridian.webp`, `vehicles/forma.webp`, `vehicles/atlas.webp` | Three 900 × 600 concepts, about 96 KB total. |
| `fonts/manrope-variable.ttf`, `fonts/OFL.txt` | Self-hosted Manrope and SIL Open Font License from [Google Fonts](https://github.com/google/fonts/tree/main/ofl/manrope). |
| `robots.txt`, `sitemap.xml`, `llms.txt` | Discovery and honest preview/engineering description. |

[index.html](../../apps/web/index.html) defines title/description, icons, font
preload, Open Graph, Twitter/X, canonical and absolute social URLs using the
operator-confirmed `https://web3-marketplace-phi.vercel.app/`. Update HTML, robots
and sitemap together if the stable domain changes. Review screenshots live in
`artifacts/ui-revamp/`, separate from runtime assets.

## Original image provenance and prompts

Three fictional, unbranded concepts were generated with the built-in imagegen
tool on 2026-10-08, then resized/encoded locally. They are illustrations, not
photos of real listings. The mark is repo-native SVG; the social cover composes
the silver render, mark and honest copy. Originals/intermediates remain in ignored
`.tools/ui-revamp` and Codex's generated-image folder. Runtime outputs are self-contained.

### Meridian prompt

```text
Use case: product-mockup. Asset type: original vehicle concept render for a premium automotive Web3 marketplace portfolio showcase, later used in a hero and a catalog card. Primary request: an entirely original, unbranded metallic silver grand touring coupe, low wide stance, clean sophisticated bodywork, slim restrained teal daytime running lights, graphite wheels. Do not resemble any identifiable existing production car or include badges. Scene: a dark charcoal automotive photography studio with a matte floor, soft pool of overhead light and a crisp side light picking out sculpted bodywork. Composition: wide landscape 3:2 image, whole vehicle visible with comfortable room around its edges, front three-quarter view facing left, car sits in lower center, suitable to crop to 16:10. Style: extremely refined cinematic product concept rendering, realistic materials, highly detailed, calm premium atmosphere, subtle multi-chain feel solely through a restrained teal edge light. No typography, no logos, no watermark, no UI, no people. This is fictional illustrative design content, never a photo of a real listing. Background should be nearly black graphite, no neon glow, no decorative gradients.
```

### Forma prompt

```text
Use case: product-mockup. Asset: original fictional unbranded automotive concept render for a premium marketplace catalog. An original pearl white two-seat sports coupe with compact, sculpted bodywork, slim headlights and graphite multi-spoke wheels, low stance. No resemblance to identifiable production brands, no badges. Dark charcoal photography studio, matte floor, elegant overhead softbox highlights. Full car in a front three-quarter view facing left, center lower in a wide landscape 3:2 frame, comfortable crop room around all edges. Realistic materials, premium restrained cinematography, tiny cool teal reflection, crisp body detail, no glare, no neon glow. No words, logos, watermark, people or UI. Purely fictional concept illustration, not an actual vehicle for sale. Consistent dark graphite background nearly black.
```

### Atlas prompt

```text
Use case: product-mockup. Asset: original fictional unbranded automotive concept render for a premium marketplace catalog. An original deep muted petrol teal luxury touring estate, long sculpted bodywork with practical hatchback profile, graphite wheels and slim front lighting. No resemblance to identifiable production brands, no badges. Dark charcoal photography studio with matte floor and overhead softbox highlights. Full car in a front three-quarter view facing left, center lower in wide landscape 3:2 framing, comfortable cropping room around every edge. Realistic materials, premium restrained cinematography, subtle teal body color, precise elegant body detail, no glare, no neon glow. No words, logos, watermark, people or UI. Purely fictional concept illustration, not an actual vehicle for sale. Consistent nearly black graphite background.
```

## Handoff and Run 3

The earlier visual-redesign API failure is historical; the operator reports
hosted challenge, verification and session lookup now return 200. Hosted auth
was not rerun during this UX pass. See [Vercel operations](../operations/vercel.md)
for that separate runtime history.

Run 2's vehicle detail, wallet selector and mobile layouts passed operator visual
review. The approved source, styles, tests and owning documentation are finalized
for the requested commit and push. Review screenshots and temporary tooling stay
local and are excluded from the commit; existing portfolio artifacts are preserved.
No chain resource creation, production/mainnet data mutation, schema/environment
change or GitHub Social Preview upload is part of this finalization.

Run 3 should verify real browser-wallet login/linking and native actions on
explicitly authorized test resources, including stale terms, network changes,
rejections and failed-read recovery. Anchor and Move runtime verification still
need their toolchains. Measure wallet SDK startup cost before code splitting;
the existing large bundle warning remains. Social Preview upload is human-only.
