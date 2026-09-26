# Vehicle Marketplace · Run 02

An interview study monorepo for application identity across EVM and Solana wallets. Run 1's Anvil marketplace remains on-chain; Run 2 adds a Fastify/SQLite session API, signed EVM and Solana login, wallet linking, an Anchor escrow marketplace, and a mixed Vite catalog. The database contains identity state only.

Read [the Run 2 implementation guide](docs/run-02-auth-solana-multichain.md) for diagrams, the local run sequence, transaction traces, tests, and known limits. [Run 1's baseline](docs/run-01-evm-baseline.md) remains useful for the EVM contract flow.

## Requirements

- Node.js 24+ and pnpm 10+
- Foundry for Anvil and Solidity tests
- An injected EVM wallet configured for Anvil chain 31337
- A Solana wallet with `signMessage` and localnet transaction support, such as Phantom
- Solana CLI/local validator and Anchor CLI 0.32.1 for the Solana program. On Windows, install these inside WSL; the Solana toolchain is not installed by `pnpm install`.

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

The deterministic Solana accounts in `packages/solana/scripts/local-keys.ts` and Foundry accounts are **local validator fixtures only**. Never fund them on a public network. No private key is sent to the browser or authentication API.

## Checks

```sh
pnpm contracts:test
pnpm api:test
pnpm execution:test
pnpm solana:test
pnpm typecheck
pnpm lint
pnpm build
pnpm --dir apps/api build
```

`pnpm solana:test` needs the validator and deployed program. The Run 2 guide covers the exact setup, source-of-truth boundaries, and Windows toolchain limitation.
