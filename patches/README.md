# Wallet UI accessibility patches

Status: **current**. pnpm applies these exact-version patches during a frozen
install. They change presentation only; no SDK versions, provider configuration,
wallet-selection events, authentication proofs or transaction handlers change.

- `@rainbow-me/rainbowkit@2.2.11`: `AsyncImage` retains image semantics when it
  has alternative text and hides unlabeled decorative images from assistive
  technology. Patch the main and split component exports consistently.
- `@mysten/dapp-kit-core@1.6.33`: the wallet list owns native `li` children;
  the custom item’s internal wrapper is a `div`. The wallet button, autofocus
  behavior and composed `wallet-selected` event remain unchanged. Source and
  distributed web entry are patched consistently.

These fix axe findings from the opened SDK choosers, not from the homepage.
After any intentional SDK upgrade, inspect the upstream implementation, rerun
chooser keyboard/axe checks and remove a patch only when its fix is upstream.
Keep the separate `@solana/web3.js>rpc-websockets: 9.3.8` override until its
original Vercel compatibility issue has an independently verified replacement.

[Run 3 verification and limits](../docs/operations/verification.md#portfolio-quality-verification).
