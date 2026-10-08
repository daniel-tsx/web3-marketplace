import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { darkTheme, RainbowKitProvider } from '@rainbow-me/rainbowkit';
import { WagmiProvider } from 'wagmi';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { DAppKitProvider } from '@mysten/dapp-kit-react';
import '@rainbow-me/rainbowkit/styles.css';
import '@solana/wallet-adapter-react-ui/styles.css';
import App from './App';
import { SolanaWalletDialogProvider } from './components/SolanaWalletDialogProvider';
import { wagmiConfig } from './contracts/config';
import { dAppKit } from './web3/sui/config';
import './styles.css';

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={darkTheme({ accentColor: '#83dccb', accentColorForeground: '#101315', borderRadius: 'small', overlayBlur: 'small' })}>
          <ConnectionProvider endpoint={import.meta.env.VITE_SOLANA_RPC_URL ?? 'http://127.0.0.1:8899'}>
            <WalletProvider wallets={[new PhantomWalletAdapter()]} autoConnect={false}>
              <SolanaWalletDialogProvider><DAppKitProvider dAppKit={dAppKit}><App /></DAppKitProvider></SolanaWalletDialogProvider>
            </WalletProvider>
          </ConnectionProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>,
);
