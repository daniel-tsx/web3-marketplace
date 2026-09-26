import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useSwitchChain } from 'wagmi';
import { contractsConfigured } from './contracts/addresses';
import { localChain, rpcUrl } from './contracts/config';
import { VehicleCard } from './components/VehicleCard';

const vehicleIds = [1n, 2n, 3n];

export default function App() {
  const { address, chainId, isConnected } = useAccount();
  const { switchChain, isPending: switching } = useSwitchChain();
  const wrongChain = isConnected && chainId !== localChain.id;

  return <main>
    <header>
      <div>
        <p className="eyebrow">Run 01 · local EVM</p>
        <h1>Vehicle Marketplace</h1>
        <p>Study NFT approval, on-chain listing, ERC-20 allowance, and purchase receipts.</p>
      </div>
      <ConnectButton />
    </header>
    <section className="chain-panel" aria-label="Connection and chain">
      <p>Expected chain: {localChain.name} ({localChain.id}) · RPC: <code>{rpcUrl}</code></p>
      <p>Wallet: <code>{address ?? 'Disconnected'}</code> · Current chain: {chainId ?? 'none'}</p>
      {wrongChain && <div role="alert"><p>Switch your wallet to local Anvil before any transaction.</p><button disabled={switching} onClick={() => switchChain({ chainId: localChain.id })}>Switch to Anvil</button></div>}
      {!contractsConfigured && <p role="alert">Contract addresses are missing. Start Anvil, deploy and seed contracts, then restart Vite to read the generated apps/web/.env.local.</p>}
    </section>
    {contractsConfigured && !wrongChain && <section className="vehicle-grid" aria-label="Seeded vehicles">
      {vehicleIds.map((tokenId) => <VehicleCard key={`${chainId ?? 'none'}-${address ?? 'disconnected'}-${tokenId}`} tokenId={tokenId} account={address} />)}
    </section>}
    <footer>Reads come from Anvil. Each write waits for its receipt before refreshing affected reads. Local metadata is intentionally minimal.</footer>
  </main>;
}
