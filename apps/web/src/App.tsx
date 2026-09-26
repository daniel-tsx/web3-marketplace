import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { useQuery } from '@tanstack/react-query';
import { PublicKey } from '@solana/web3.js';
import { PROGRAM_ID } from '@vehicle/solana';
import { useAccount, useSwitchChain } from 'wagmi';
import { useCurrentAccount, useCurrentClient, useCurrentNetwork, useDAppKit } from '@mysten/dapp-kit-react';
import { AccountPanel } from './auth/AccountPanel';
import { useSession } from './auth/useSession';
import { contractsConfigured } from './contracts/addresses';
import { localChain, rpcUrl } from './contracts/config';
import { SolanaVehicleCard } from './components/SolanaVehicleCard';
import { SuiVehicleCard } from './components/SuiVehicleCard';
import { VehicleCard } from './components/VehicleCard';
import { executionPrompt, resolveExecution } from './execution/resolveExecution';
import { suiConfigured, suiMarketId, suiNetwork, suiPackageId, suiRpcUrl, suiVehicleId } from './web3/sui/config';

const catalog = [
  { ecosystem: 'evm' as const, chainId: 31337, tokenId: 1n, name: 'Vehicle #1' },
  { ecosystem: 'evm' as const, chainId: 31337, tokenId: 2n, name: 'Vehicle #2' },
  { ecosystem: 'evm' as const, chainId: 31337, tokenId: 3n, name: 'Vehicle #3' },
  { ecosystem: 'solana' as const, cluster: 'localnet', mint: import.meta.env.VITE_SOLANA_VEHICLE_MINT as string | undefined, name: 'Solana vehicle token' },
  { ecosystem: 'sui' as const, network: suiNetwork, vehicleId: suiVehicleId, name: 'Sui vehicle object' },
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
  const suiAccount = useCurrentAccount();
  const suiCurrentNetwork = useCurrentNetwork();
  const suiClient = useCurrentClient();
  const dAppKit = useDAppKit();
  const suiResources = useQuery({
    queryKey: ['sui', suiCurrentNetwork, 'resources', suiPackageId, suiMarketId],
    enabled: suiConfigured && suiCurrentNetwork === suiNetwork,
    queryFn: async () => {
      await Promise.all([suiClient.getObject({ objectId: suiPackageId! }), suiClient.getObject({ objectId: suiMarketId! })]);
      return true;
    },
    retry: false,
  });
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
  const suiContext = resolveExecution({
    requirement: { ecosystem: 'sui', network: suiNetwork },
    userId: session.data?.userId,
    linkedWallets: session.data?.wallets ?? [],
    connectedWallet: suiAccount?.address,
    networkReady: suiCurrentNetwork === suiNetwork,
    resourcesReady: suiConfigured && suiResources.isSuccess,
  });

  return <main>
    <header>
      <div>
        <p className="eyebrow">Run 03 · application identity + EVM + Solana + Sui</p>
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
      <p>Sui listing → <strong>{suiContext.status}</strong> · {executionPrompt(suiContext) ?? 'Sui object transaction is ready.'}</p>
      <p className="muted">Anvil RPC: <code>{rpcUrl}</code> · Solana RPC: <code>{connection.rpcEndpoint}</code> · Sui gRPC: <code>{suiRpcUrl}</code></p>
      {isConnected && chainId !== localChain.id && <button disabled={switching} onClick={() => switchChain({ chainId: localChain.id })}>Switch EVM wallet to Anvil</button>}
      {suiCurrentNetwork !== suiNetwork && <button onClick={() => dAppKit.switchNetwork(suiNetwork)}>Select Sui {suiNetwork}</button>}
      {!contractsConfigured && <p role="alert">EVM addresses are missing. Deploy and seed Run 1 contracts, then restart Vite.</p>}
      {!program.data && <p role="alert">Solana program is unavailable on this RPC. Start the local validator and deploy the program.</p>}
      {!suiConfigured && <p role="alert">Sui package, Market, or Vehicle IDs are missing. Set the VITE_SUI_* public configuration and restart Vite.</p>}
      {suiResources.isError && <p role="alert">Sui package or Market cannot be read: {suiResources.error.message}</p>}
    </section>
    <section className="vehicle-grid" aria-label="Mixed on-chain vehicle catalog">
      {catalog.map((item) => item.ecosystem === 'evm'
        ? contractsConfigured && <VehicleCard key={`evm-${item.tokenId}-${address ?? 'none'}-${chainId ?? 'none'}-${session.data?.userId ?? 'guest'}`} tokenId={item.tokenId} account={address} executionReady={evmContext.status === 'ready'} />
        : item.ecosystem === 'solana'
          ? solanaMint && paymentMint && <SolanaVehicleCard key={`solana-${item.mint}-${solanaWallet.publicKey?.toBase58() ?? 'none'}-${session.data?.userId ?? 'guest'}`} vehicleMint={solanaMint} paymentMint={paymentMint} context={solanaContext} />
          : suiConfigured && <SuiVehicleCard key={`sui-${item.vehicleId}-${suiAccount?.address ?? 'none'}-${session.data?.userId ?? 'guest'}`} context={suiContext} />)}
    </section>
    {(!solanaMint || !paymentMint) && <p role="alert">Solana catalog mint addresses are missing. Run the local Solana seed script, then restart Vite.</p>}
    <footer>Catalog names are local metadata. EVM storage, Solana accounts, and Sui objects remain the marketplace sources of truth.</footer>
  </main>;
}
