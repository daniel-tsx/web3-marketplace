import { useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { useQuery } from '@tanstack/react-query';
import { PublicKey } from '@solana/web3.js';
import { PROGRAM_ID } from '@vehicle/solana';
import { useAccount, usePublicClient, useSwitchChain } from 'wagmi';
import { useCurrentAccount, useCurrentClient, useCurrentNetwork, useDAppKit } from '@mysten/dapp-kit-react';
import { AccountPanel } from './auth/AccountPanel';
import { useSession } from './auth/useSession';
import { addresses, contractsConfigured } from './contracts/addresses';
import { localChain, rpcUrl } from './contracts/config';
import { CatalogPreviewCard } from './components/CatalogPreviewCard';
import { Arrow, Brand, EcosystemLabel } from './components/MarketplaceChrome';
import { SolanaVehicleCard } from './components/SolanaVehicleCard';
import { SuiVehicleCard } from './components/SuiVehicleCard';
import { VehicleCard } from './components/VehicleCard';
import { executionPrompt, resolveExecution, type Ecosystem } from './execution/resolveExecution';
import { architectureUrl, catalogMode, catalogStatus, previewVehicles, repositoryUrl } from './presentation/catalog';
import { suiConfigured, suiMarketId, suiNetwork, suiPackageId, suiRpcUrl, suiVehicleId } from './web3/sui/config';

function publicKey(value?: string) { try { return value ? new PublicKey(value) : null; } catch { return null; } }
const solanaMint = publicKey(import.meta.env.VITE_SOLANA_VEHICLE_MINT);
const paymentMint = publicKey(import.meta.env.VITE_SOLANA_PAYMENT_MINT);
const solanaConfigured = Boolean(solanaMint && paymentMint);
const ecosystems = ['evm', 'solana', 'sui'] as const;

export default function App() {
  const [filter, setFilter] = useState<Ecosystem | 'all'>('all');
  const [walletsOpen, setWalletsOpen] = useState(false);
  const [networkOpen, setNetworkOpen] = useState(false);
  const session = useSession();
  const { address, chainId, isConnected } = useAccount();
  const { switchChain, isPending: switching } = useSwitchChain();
  const evmClient = usePublicClient({ chainId: localChain.id });
  const solanaWallet = useWallet();
  const { connection } = useConnection();
  const suiAccount = useCurrentAccount();
  const suiCurrentNetwork = useCurrentNetwork();
  const suiClient = useCurrentClient();
  const dAppKit = useDAppKit();
  // Read-only discovery gates the presentation. It never fabricates chain data.
  const evmResources = useQuery({
    queryKey: ['evm', 'resources', localChain.id, rpcUrl, addresses],
    enabled: contractsConfigured && Boolean(evmClient),
    queryFn: async () => {
      const [network, ...code] = await Promise.all([
        evmClient!.getChainId(),
        ...Object.values(addresses).map((address) => evmClient!.getBytecode({ address })),
      ]);
      return network === localChain.id && code.every((value) => Boolean(value && value !== '0x'));
    },
    retry: false, staleTime: Infinity, refetchOnWindowFocus: false,
  });
  const suiResources = useQuery({
    queryKey: ['sui', suiCurrentNetwork, 'resources', suiPackageId, suiMarketId],
    enabled: suiConfigured && suiCurrentNetwork === suiNetwork,
    queryFn: async () => {
      await Promise.all([suiClient.getObject({ objectId: suiPackageId! }), suiClient.getObject({ objectId: suiMarketId! })]);
      return true;
    },
    retry: false, staleTime: Infinity, refetchOnWindowFocus: false,
  });
  const program = useQuery({
    queryKey: ['solana', 'program', connection.rpcEndpoint],
    enabled: solanaConfigured,
    queryFn: async () => {
      const account = await connection.getAccountInfo(PROGRAM_ID, 'confirmed');
      return account?.executable === true;
    },
    retry: false, staleTime: Infinity, refetchOnWindowFocus: false,
  });
  const modes = {
    evm: catalogMode(contractsConfigured, evmResources),
    solana: catalogMode(solanaConfigured, program),
    sui: suiCurrentNetwork !== suiNetwork && suiConfigured ? 'unavailable' as const : catalogMode(suiConfigured, suiResources),
  };
  const evmContext = resolveExecution({
    requirement: { ecosystem: 'evm', network: `EVM chain ${localChain.id}` },
    userId: session.data?.userId,
    linkedWallets: session.data?.wallets ?? [],
    connectedWallet: address,
    networkReady: chainId === localChain.id,
    resourcesReady: modes.evm === 'native',
  });
  const solanaContext = resolveExecution({
    requirement: { ecosystem: 'solana', network: 'the configured Solana validator' },
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
  const contexts = { evm: evmContext, solana: solanaContext, sui: suiContext };
  const hasPreview = ecosystems.some((ecosystem) => modes[ecosystem] !== 'native');

  function openWorkspace(id: 'wallets' | 'network-details') {
    if (id === 'wallets') setWalletsOpen(true); else setNetworkOpen(true);
    requestAnimationFrame(() => document.getElementById(id)?.querySelector<HTMLElement>('summary')?.focus());
  }

  return <>
    <a className="skip-link" href="#catalog">Skip to vehicle catalog</a>
    <header className="site-nav page-width">
      <a className="brand-link" href="#home" aria-label="Vehicle Marketplace home"><Brand /></a>
      <nav aria-label="Main navigation"><a href="#catalog">Explore</a><a href="#about">The project</a><a className="nav-source" href={repositoryUrl} target="_blank" rel="noreferrer">Source <Arrow diagonal /></a></nav>
      <a className="button wallet-entry" href="#wallets" onClick={() => openWorkspace('wallets')}>Connect wallets <Arrow /></a>
    </header>
    <main id="home">
      <section className="hero page-width" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow"><span className="accent-rule" />The multi-chain automotive showcase</p>
          <h1 id="hero-title">Automotive.<br /><span>Across chains.</span></h1>
          <p className="hero-description">A new perspective on the vehicle marketplace. Explore the collection, then look under the hood of three native blockchain ecosystems.</p>
          <div className="hero-actions"><a className="button button-primary" href="#catalog">Explore vehicles <Arrow /></a><a className="text-link" href={architectureUrl} target="_blank" rel="noreferrer">View architecture <Arrow diagonal /></a></div>
          <div className="hero-ecosystems" aria-label="Supported ecosystems">{ecosystems.map((ecosystem) => <EcosystemLabel key={ecosystem} ecosystem={ecosystem} />)}</div>
        </div>
        <figure className="hero-vehicle">
          <div className="hero-image-topline"><span className="eyebrow">Concept / 01</span><span className="preview-label">Demo Preview</span></div>
          <img src="/vehicles/meridian-hero.webp" alt="Original silver grand touring coupe concept in a graphite studio" width="1440" height="960" fetchPriority="high" />
          <figcaption><span>Meridian GT <span className="muted">/ Design concept</span></span><span className="hero-image-note">Illustration, not a live listing</span></figcaption>
        </figure>
      </section>

      <div className="project-strip page-width"><span className="eyebrow">An engineering case study</span><p>One application identity. Three native execution models.</p><a href="#about">Discover the build <Arrow /></a></div>

      <section className="catalog-section page-width" id="catalog" aria-labelledby="catalog-title">
        <div className="section-heading"><div><p className="eyebrow">The collection</p><h2 id="catalog-title">Explore the vehicles</h2></div><p>Three ecosystems.<br />A shared place to explore.</p></div>
        <div className="catalog-toolbar"><div className="catalog-filters" role="group" aria-label="Filter catalog by ecosystem">{(['all', ...ecosystems] as const).map((value) => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value === 'all' ? 'All ecosystems' : value === 'evm' ? 'EVM' : value === 'solana' ? 'Solana' : 'Sui'}</button>)}</div><span className="catalog-hint">{hasPreview ? 'Preview & chain-backed assets' : 'Chain-backed assets'}</span></div>
        {hasPreview && <aside className="demo-notice"><span className="notice-mark" aria-hidden="true">i</span><p><strong>A showcase you can explore.</strong> Demo Preview cards are fictional design concepts with no owner or sale price. Trading is unavailable for previews. Chain-backed cards appear when configured resources can be read.</p><a href="#network-details" onClick={() => openWorkspace('network-details')}>Network details <Arrow diagonal /></a></aside>}
        <div className="vehicle-grid" aria-live="polite" aria-label="Vehicle catalog">
          {previewVehicles.map((vehicle) => {
            const mode = modes[vehicle.ecosystem];
            // Hide filtered cards without discarding native transaction/reconciliation state.
            return <div className="catalog-slot" key={vehicle.ecosystem} hidden={filter !== 'all' && vehicle.ecosystem !== filter}>
              {mode !== 'native' ? <CatalogPreviewCard vehicle={vehicle} mode={mode} />
                : vehicle.ecosystem === 'evm' ? [1n, 2n, 3n].map((tokenId) => <VehicleCard key={`evm-${tokenId}-${address ?? 'none'}-${chainId ?? 'none'}-${session.data?.userId ?? 'guest'}`} tokenId={tokenId} account={address} executionReady={evmContext.status === 'ready'} />)
                  : vehicle.ecosystem === 'solana' ? <SolanaVehicleCard key={`solana-${solanaMint}-${solanaWallet.publicKey?.toBase58() ?? 'none'}-${session.data?.userId ?? 'guest'}`} vehicleMint={solanaMint!} paymentMint={paymentMint!} context={solanaContext} />
                    : <SuiVehicleCard key={`sui-${suiVehicleId}-${suiAccount?.address ?? 'none'}-${session.data?.userId ?? 'guest'}`} context={suiContext} />}
            </div>;
          })}
        </div>
        <p className="catalog-footnote">Vehicle artwork is original illustrative content. Chain-backed cards identify the actual configured asset; its appearance is not verified by the illustration.</p>
      </section>

      <section className="about-section page-width" id="about" aria-labelledby="about-title">
        <div className="about-intro"><p className="eyebrow">Under the hood</p><h2 id="about-title">Shared identity.<br />Native by design.</h2><p>This project explores how a vehicle marketplace can span EVM, Solana, and Sui while respecting the way each chain owns, lists, and transfers an asset.</p><a className="text-link" href={architectureUrl} target="_blank" rel="noreferrer">Read the engineering story <Arrow diagonal /></a></div>
        <div className="chain-stories"><article><EcosystemLabel ecosystem="evm" /><h3>Ownership stays with the seller.</h3><p>ERC-721 vehicles, marketplace approvals, and purchases bound to the reviewed listing version and price.</p><span className="technical-label">Solidity / ERC-721</span></article><article><EcosystemLabel ecosystem="solana" /><h3>Listings use native escrow.</h3><p>A supply-one SPL asset moves into PDA-controlled escrow. Purchase intent retains its generation and payment mint.</p><span className="technical-label">Anchor / SPL Token</span></article><article><EcosystemLabel ecosystem="sui" /><h3>Assets become listing objects.</h3><p>A Vehicle is wrapped inside a shared Listing. A purchase targets that exact reviewed object.</p><span className="technical-label">Move / Shared objects</span></article></div>
      </section>

      <section className="workspace-section page-width" aria-label="Wallet and network workspace">
        <details className="workspace-disclosure" id="wallets" open={walletsOpen} onToggle={(event) => setWalletsOpen(event.currentTarget.open)}>
          <summary><span><span className="eyebrow">Your workspace</span><span className="disclosure-title">Wallets & application account</span></span><span className="disclosure-caption">Connect, sign in, or link wallets <span aria-hidden="true">+</span></span></summary>
          <div className="disclosure-body"><p className="workspace-intro">Browsing needs no wallet. To trade a chain-backed asset, connect its wallet and sign in. Connecting a wallet does not create an application account or link a login credential.</p><AccountPanel /></div>
        </details>
        <details className="workspace-disclosure" id="network-details" open={networkOpen} onToggle={(event) => setNetworkOpen(event.currentTarget.open)}>
          <summary><span><span className="eyebrow">Advanced</span><span className="disclosure-title">Network & execution details</span></span><span className="disclosure-caption">Readiness, resources, and diagnostics <span aria-hidden="true">+</span></span></summary>
          <div className="disclosure-body">
            <p className="workspace-intro">Resource detection is a read-only check. Trading also requires current asset reads, an authenticated account, a matching linked wallet, and the correct network.</p>
            <div className="network-grid">{ecosystems.map((ecosystem) => <article key={ecosystem}><EcosystemLabel ecosystem={ecosystem} /><h3>{catalogStatus[modes[ecosystem]]}</h3><p>{executionPrompt(contexts[ecosystem]) ?? 'Execution wallet requirements met. Asset and payment checks still apply.'}</p><span className="technical-label">Resolver: {contexts[ecosystem].status}</span></article>)}</div>
            <dl className="network-endpoints"><dt>EVM chain {localChain.id}</dt><dd><code>{rpcUrl}</code></dd><dt>Solana RPC</dt><dd><code>{connection.rpcEndpoint}</code></dd><dt>Sui {suiNetwork} gRPC</dt><dd><code>{suiRpcUrl}</code></dd></dl>
            <div className="account-actions">
              {contractsConfigured && modes.evm !== 'native' && <button disabled={evmResources.isFetching} onClick={() => void evmResources.refetch()}>Recheck EVM resources</button>}
              {solanaConfigured && modes.solana !== 'native' && <button disabled={program.isFetching} onClick={() => void program.refetch()}>Recheck Solana program</button>}
              {suiConfigured && suiCurrentNetwork === suiNetwork && modes.sui !== 'native' && <button disabled={suiResources.isFetching} onClick={() => void suiResources.refetch()}>Recheck Sui resources</button>}
              {isConnected && chainId !== localChain.id && <button disabled={switching} onClick={() => switchChain({ chainId: localChain.id })}>Switch EVM wallet to chain {localChain.id}</button>}
              {suiCurrentNetwork !== suiNetwork && <button onClick={() => dAppKit.switchNetwork(suiNetwork)}>Select Sui {suiNetwork}</button>}
            </div>
            {[evmResources.error, program.error, suiResources.error].some(Boolean) && <details className="read-diagnostics"><summary>Resource read diagnostics</summary>{evmResources.error && <p className="error">EVM: {evmResources.error.message}</p>}{program.error && <p className="error">Solana: {program.error.message}</p>}{suiResources.error && <p className="error">Sui: {suiResources.error.message}</p>}</details>}
            <p className="muted">Public chain deployment and browser-wallet verification are separate setup steps. Source code and resource detection do not establish production readiness.</p>
          </div>
        </details>
      </section>
    </main>
    <footer className="site-footer page-width"><div><Brand compact /><p>An engineering case study by <a href="https://www.eastbase.studio" target="_blank" rel="noreferrer">Eastbase Studio</a>.<br />Original concepts. Explicit trust boundaries.</p></div><div className="footer-links"><a href={repositoryUrl} target="_blank" rel="noreferrer">GitHub <Arrow diagonal /></a><a href={architectureUrl} target="_blank" rel="noreferrer">Architecture <Arrow diagonal /></a><a href="#network-details" onClick={() => openWorkspace('network-details')}>Network details</a></div><span className="footer-note">EVM / Solana / Sui</span></footer>
  </>;
}
