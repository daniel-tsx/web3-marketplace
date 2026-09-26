import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buyer, payer, program, seller } from './local-keys.js';

mkdirSync(resolve('.local'), { recursive: true });
mkdirSync(resolve('target/deploy'), { recursive: true });
writeFileSync(resolve('.local/deployer.json'), JSON.stringify(Array.from(payer.secretKey)));
writeFileSync(resolve('.local/seller.json'), JSON.stringify(Array.from(seller.secretKey)));
writeFileSync(resolve('.local/buyer.json'), JSON.stringify(Array.from(buyer.secretKey)));
writeFileSync(resolve('target/deploy/vehicle_marketplace-keypair.json'), JSON.stringify(Array.from(program.secretKey)));
console.log(`Local-only deployer: ${payer.publicKey.toBase58()}`);
console.log(`Program ID: ${program.publicKey.toBase58()}`);
