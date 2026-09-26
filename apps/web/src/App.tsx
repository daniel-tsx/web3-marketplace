import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { useQuery } from '@tanstack/react-query';
import { PublicKey } from '@solana/web3.js';
import { PROGRAM_ID } from '@vehicle/solana';
import { useAccount, useSwitchChain } from 'wagmi';
import { AccountPanel } from './auth/AccountPanel';
import { useSession } from './auth/useSession';
import { contractsConfigured } from './contracts/addresses';
import { localChain, rpcUrl } from './contracts/config';
import { SolanaVehicleCard } from './components/SolanaVehicleCard';
import { VehicleCard } from './components/VehicleCard';
import { executionPrompt, resolveExecution } from './execution/resolveExecution';

const catalog = [
  { ecosystem: 'evm' as const, chainId: 31337, tokenId: 1n, name: 'Vehicle #1' },
  { ecosystem: 'evm' as const, chainId: 31337, tokenId: 2n, name: 'Vehicle #2' },
  { ecosystem: 'evm' as const, chainId: 31337, tokenId: 3n, name: 'Vehicle #3' },
  { ecosystem: 'solana' as const, cluster: 'localnet', mint: import.meta.env.VITE_SOLANA_VEHICLE_MINT as string | undefined, name: 'Solana vehicle token' },
];

function publicKey(value?: string) { try { return value ? new PublicKey(value) : null; } catch { return null; } }
const solanaMint = publicKey(import.meta.env.VITE_SOLANA_VEHICLE_MINT);
const paymentMint = publicKey(import.meta.env.VITE_SOLANA_PAYMENT_MINT);

export default function App() {
  const session = useSession();
  const { address, chainId, isConnected } = useAccount();
  const { switchChain, isPending: switching } = useSwitchChain();
  const solanaWallet = useWallet();
  const { connection } = useConnection();
  const program = useQuery({
    queryKey: ['solana', 'program', connection.rpcEndpoint],
    queryFn: async () => {
      const account = await connection.getAccountInfo(PROGRAM_ID, 'confirmed');
      return account?.executable === true;
    },
    retry: false,
  });
  const evmContext = resolveExecution({
    requirement: { ecosystem: 'evm', network: 'Anvil chain 31337' },
    userId: session.data?.userId,
    linkedWallets: session.data?.wallets ?? [],
    connectedWallet: address,
    networkReady: chainId === localChain.id,
  });
  const solanaContext = resolveExecution({
    requirement: { ecosystem: 'solana', network: 'the deployed local Solana validator' },
    userId: session.data?.userId,
    linkedWallets: session.data?.wallets ?? [],
    connectedWallet: solanaWallet.publicKey?.toBase58(),
    networkReady: Boolean(program.data),
  });

  return <main>
    <header>
      <div>
        <p className="eyebrow">Run 02 · application identity + EVM + Solana</p>
        <h1>Vehicle Marketplace</h1>
        <p>A connected wallet, a signed-in user, and the wallet required by a listing are separate decisions.</p>
      </div>
      <ConnectButton />
    </header>
    <AccountPanel />
    <section className="chain-panel" aria-label="Execution requirements">
      <h2>Execution context</h2>
      <p>EVM listing → <strong>{evmContext.status}</strong> · {executionPrompt(evmContext) ?? 'Existing EVM approval and purchase flow is ready.'}</p>
      <p>Solana listing → <strong>{solanaContext.status}</strong> · {executionPrompt(solanaContext) ?? 'Solana instructions are ready.'}</p>
      <p className="muted">Anvil RPC: <code>{rpcUrl}</code> · Solana RPC: <code>{connection.rpcEndpoint}</code></p>
      {isConnected && chainId !== localChain.id && <button disabled={switching} onClick={() => switchChain({ chainId: localChain.id })}>Switch EVM wallet to Anvil</button>}
      {!contractsConfigured && <p role="alert">EVM addresses are missing. Deploy and seed Run 1 contracts, then restart Vite.</p>}
      {!program.data && <p role="alert">Solana program is unavailable on this RPC. Start the local validator and deploy the program.</p>}
    </section>
    <section className="vehicle-grid" aria-label="Mixed on-chain vehicle catalog">
      {catalog.map((item) => item.ecosystem === 'evm'
        ? contractsConfigured && <VehicleCard key={`evm-${item.tokenId}-${address ?? 'none'}-${chainId ?? 'none'}-${session.data?.userId ?? 'guest'}`} tokenId={item.tokenId} account={address} executionReady={evmContext.status === 'ready'} />
        : solanaMint && paymentMint && <SolanaVehicleCard key={`solana-${item.mint}-${solanaWallet.publicKey?.toBase58() ?? 'none'}-${session.data?.userId ?? 'guest'}`} vehicleMint={solanaMint} paymentMint={paymentMint} context={solanaContext} />)}
    </section>
    {(!solanaMint || !paymentMint) && <p role="alert">Solana catalog mint addresses are missing. Run the local Solana seed script, then restart Vite.</p>}
    <footer>Catalog names are local metadata. EVM listings, Solana listing PDAs, ownership, balances, and transaction results are read from their chains.</footer>
  </main>;
}
