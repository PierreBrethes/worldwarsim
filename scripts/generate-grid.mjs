/**
 * Bakes `public/grid.json` — the routing raster of ADR 0012, run-length encoded.
 *
 * A Convex query has one second, and rasterising 1.33 M cells from the country polygons costs
 * that much cold, without a JIT: `view:playerView` reads `afloat` and `coastal` off this grid,
 * and the first call of a fresh isolate was paying for the raster. So the raster is cut here,
 * once, and the server only decodes it.
 *
 * `buildGrid` in `src/domain/routing.ts` stays the reference — this script imports it rather than
 * reimplementing it, and the verifier compares the bake to it byte for byte. Node strips the
 * types of the module on its own (24.x), so no build step stands between the two.
 *
 * The land is the atlas (ADR 0034): the countries merged from the `near` arcs of
 * `public/atlas.json` and `public/atlas-near.json`, the very coast the hover reads. A new atlas
 * leaves a stale grid, which is what the equality test refuses: run this script after
 * `generate-atlas.mjs`, then `generate-region-grid.mjs`.
 *
 * Usage: node scripts/generate-grid.mjs
 */
import { writeFileSync } from 'node:fs';
import { buildGrid, encodeGrid } from '../src/domain/routing.ts';
import { atlasWorld, STEP } from './atlas-base.mjs';

const world = atlasWorld();

const grid = buildGrid(world, STEP);
const encoded = encodeGrid(grid);
const baked = JSON.stringify(encoded);
writeFileSync('public/grid.json', baked);

console.log(
  `${grid.width}×${grid.height} cells, ${encoded.cells.length / 2} runs, ${(
    baked.length / 1024
  ).toFixed(0)} Ko`,
);
