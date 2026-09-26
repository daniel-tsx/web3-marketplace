# Vehicle Marketplace · Run 01 EVM baseline

A small, browser-only Web3 interview study project. Three Solidity contracts run on local Anvil. The Vite UI uses Wagmi, Viem, RainbowKit, and TanStack Query to expose every approval, listing, and purchase step.

Start with [the implementation study guide](docs/run-01-evm-baseline.md).

## Requirements

- Node.js 20+ and pnpm 10+
- Foundry (`forge`, `anvil`) on `PATH`
- An injected browser wallet, such as MetaMask, configured for Anvil chain 31337 at `http://127.0.0.1:8545`

## Fresh local run

From the repository root:

```sh
pnpm install
pnpm anvil
```

Keep Anvil running. In another terminal:

```sh
pnpm contracts:build
pnpm contracts:test
pnpm contracts:deploy
pnpm dev
```

Clone with `git clone --recurse-submodules`, or run `git submodule update --init --recursive` before building contracts. `contracts:deploy` deploys and seeds a fresh local chain, then writes `apps/web/.env.local` with addresses from Foundry's broadcast file. Restart Vite after every reset and redeploy. `contracts:build` exports ABIs from Foundry artifacts into `apps/web/src/contracts/abis.ts`.

Anvil's standard account 0 is the deployer, seller of vehicles 1 and 3, and fee recipient. Account 2 owns vehicle 2; account 1 is the buyer with 100,000 mUSDC. Import or select these local accounts in your wallet. They are development accounts only; never send real funds to them. All prices use six decimal places; the marketplace fee is 250 basis points (2.5%).

## Checks

```sh
pnpm typecheck
pnpm lint
pnpm build
pnpm contracts:test
```

`pnpm build` builds the frontend. `pnpm contracts:build` rebuilds Solidity and regenerates the frontend ABIs. This project intentionally has no backend, indexer, or production deployment path.
