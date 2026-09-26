import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const broadcast = JSON.parse(readFileSync(resolve(root, 'packages/contracts/broadcast/DeployLocal.s.sol/31337/run-latest.json'), 'utf8'));
const addressFor = (name) => {
  const tx = broadcast.transactions.find((item) => item.transactionType === 'CREATE' && item.contractName === name);
  if (!tx?.contractAddress) throw new Error(`No deployment address for ${name}`);
  return tx.contractAddress;
};
const content = [
  'VITE_CHAIN_ID=31337',
  'VITE_RPC_URL=http://127.0.0.1:8545',
  `VITE_MOCK_USDC_ADDRESS=${addressFor('MockUSDC')}`,
  `VITE_VEHICLE_NFT_ADDRESS=${addressFor('VehicleNFT')}`,
  `VITE_MARKETPLACE_ADDRESS=${addressFor('VehicleMarketplace')}`,
];
const envPath = resolve(root, 'apps/web/.env.local');
const existing = (() => { try { return readFileSync(envPath, 'utf8'); } catch { return ''; } })();
const otherChainLines = existing.split(/\r?\n/).filter((line) => line.startsWith('VITE_SOLANA_') || line.startsWith('VITE_SUI_'));
writeFileSync(envPath, [...content, ...otherChainLines, ''].join('\n'));
console.log('Wrote local deployment addresses to apps/web/.env.local');
