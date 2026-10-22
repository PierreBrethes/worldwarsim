/**
 * Bakes `public/deposit-basins.json` — **the basin drawn around each deposit** (#239): its
 * outline as `basinsOf` (`src/domain/deposit-basins.ts`) traces it, one per point of
 * `public/deposits.json`, in its order. Decor only: no rule reads it.
 *
 * Usage: node scripts/generate-deposit-basins.mjs (after generate-deposits)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { basinsOf } from '../src/domain/deposit-basins.ts';

const deposits = JSON.parse(readFileSync('public/deposits.json', 'utf8'));
const basins = basinsOf(
  deposits.map(({ id, deposit, lon, lat }) => ({ id, deposit, lonLat: [lon, lat] })),
);
const json = JSON.stringify(basins);
writeFileSync('public/deposit-basins.json', json);
console.log(
  `deposit-basins.json : ${basins.length} bassins, ${(json.length / 1024).toFixed(1)} Kio, ` +
    `${(gzipSync(json).length / 1024).toFixed(1)} Kio gzip`,
);
