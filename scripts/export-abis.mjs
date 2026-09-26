import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const names = ['MockUSDC', 'VehicleNFT', 'VehicleMarketplace'];
const entries = names.map((name) => {
  const artifact = JSON.parse(readFileSync(resolve(root, 'packages/contracts/out', `${name}.sol`, `${name}.json`), 'utf8'));
  return `export const ${name}Abi = ${JSON.stringify(artifact.abi, null, 2)} as const;`;
});
writeFileSync(resolve(root, 'apps/web/src/contracts/abis.ts'), `// Generated from Foundry artifacts by scripts/export-abis.mjs. Do not edit.\n${entries.join('\n\n')}\n`);
console.log('Exported three Foundry ABIs to apps/web/src/contracts/abis.ts');
