# Vehicle Marketplace · Run 03

An interview study monorepo for application identity across EVM, Solana, and Sui wallets. Run 1's Anvil marketplace and Run 2's Fastify/SQLite identity plus Anchor escrow marketplace remain in place. Run 3 adds Sui signed login/linking, object-centric listing and payment flows, and a three-chain Vite catalog. The database contains identity state only.

Read [the Run 3 implementation guide](docs/run-03-sui-multichain.md) for the Sui setup, object flow, three-chain comparison, and verification limits. [Run 2](docs/run-02-auth-solana-multichain.md) and [Run 1](docs/run-01-evm-baseline.md) remain the detailed Solana and EVM references.

## Requirements

- Node.js 24+ and pnpm 10+
- Foundry for Anvil and Solidity tests
- An injected EVM wallet configured for Anvil chain 31337
- A Solana wallet with `signMessage` and localnet transaction support, such as Phantom
- Solana CLI/local validator and Anchor CLI 0.32.1 for the Solana program. On Windows, install these inside WSL; the Solana toolchain is not installed by `pnpm install`.
- A Sui wallet supporting personal-message signing and testnet transactions. Sui CLI is needed to build/test or deploy the Move package; frontend development can use an already deployed testnet package.

## Local sequence

Run `pnpm install` and `pnpm api:db` from the repository root. Start `pnpm api:dev`, `pnpm anvil`, and `pnpm solana:validator` in separate terminals. Then run:

```sh
pnpm contracts:build
pnpm contracts:deploy
pnpm solana:prepare
pnpm solana:build
pnpm solana:deploy
pnpm solana:seed
pnpm dev
```

`solana:seed` creates local-only mint/accounts, a 12,000 mUSDC escrow listing, and writes public Solana addresses to `apps/web/.env.local` while preserving EVM addresses. `contracts:deploy` preserves these Solana lines on later EVM redeploys. Restart Vite after either chain's seed/deploy script changes `.env.local`. Keep API origin at `http://localhost:5173` and Vite at its default port for cookie and Origin checks.

For the Sui card, add the public `VITE_SUI_*` values from a deployed testnet package to `apps/web/.env.local` as shown in the Run 3 guide. The EVM and Solana local scripts preserve these values. The Run 2 SQLite database migrates automatically on `pnpm api:db` or API startup.

The deterministic Solana accounts in `packages/solana/scripts/local-keys.ts` and Foundry accounts are **local validator fixtures only**. Never fund them on a public network. No private key is sent to the browser or authentication API.

## Checks

```sh
pnpm contracts:test
pnpm api:test
pnpm execution:test
pnpm solana:test
pnpm sui:test
pnpm sui:move:build
pnpm sui:move:test
pnpm typecheck
pnpm lint
pnpm build
pnpm --dir apps/api build
```

`pnpm solana:test` needs the validator and deployed program. The Sui Move commands require Sui CLI. Neither chain's runtime result should be inferred from TypeScript checks alone.
