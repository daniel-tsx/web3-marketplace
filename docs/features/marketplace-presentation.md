# Marketplace presentation

Status: **current**. Owns the browse-first catalog, visual identity and branding.
[Multichain system](../architecture/multichain-system.md) and
[trust boundaries](../architecture/trust-boundaries.md) own native execution and
identity. [Verification](../operations/verification.md#ui-revamp-verification)
records this task's results and limits.

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
| [CatalogPreviewCard](../../apps/web/src/components/CatalogPreviewCard.tsx) | Fictional design content, disclosure and disabled trading control. |
| Native VehicleCard / SolanaVehicleCard / SuiVehicleCard | Shared image/card treatment, expandable asset details and actual native availability/price reads; existing handlers retained. |
| [AccountPanel](../../apps/web/src/auth/AccountPanel.tsx) | Existing signed login, two-proof linking/logout; EVM connection entry and calm account error/retry. |
| [SolanaWalletDialogProvider](../../apps/web/src/components/SolanaWalletDialogProvider.tsx) | Native dialog using existing WalletModalContext and adapter selection. WalletMultiButton still owns connection; native focus containment, Escape dismissal and focus restoration. |

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
reconciliation state. Account changes retain the existing native card keys.
No automatic signing, transaction retry or replacement purchase terms are added.

The hero always says Demo Preview. Native artwork is also illustrative and does
not verify an asset's appearance. Discovery still covers three known EVM token
IDs, one configured Solana mint and one configured Sui Vehicle/Market; there is
no general indexer or off-chain listing store.

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

## Handoff and Run 2

No deployment, blockchain resource creation, schema/environment
change or GitHub Social Preview upload was performed. Existing `artifacts/portfolio`
was preserved. API/database code, wallet-proof protocol, purchase builders and
transaction hooks are unchanged; the resolver only changes its guest prompt copy.

The production `/api/me` GET returned HTTP 500 `FUNCTION_INVOCATION_FAILED` during
this task. Its cause is unverified. Inspect deployed API logs and server-only
configuration in a separate troubleshooting task. The account error surface
preserves browsing but cannot make hosted authentication succeed.

Run 2 priorities: resolve that API failure; verify real signed login/linking;
review native loading/inactive/stale/payment-mismatch and post-execution refresh
states with actual configured resources; update public-network metadata before
authorized chain deployments. Consider wallet SDK code splitting using measured
performance evidence. Upload `og-image.png` as GitHub Social Preview manually.
