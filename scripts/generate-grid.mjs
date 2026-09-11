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
 * Usage: node scripts/generate-grid.mjs — also chained at the end of generate-world.mjs, because
 * a regenerated world with a stale grid is exactly what the equality test exists to refuse.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { buildGrid, encodeGrid } from '../src/domain/routing.ts';

const asset = JSON.parse(readFileSync('public/world.json', 'utf8'));
const world = {
  sphere: asset.meta.sphere,
  outline: asset.meta.outline,
  countries: asset.countries.map((country) => ({
    name: country.n,
    adm0: country.a,
    representativePoint: country.c,
    lonLat: country.ll,
    rings: country.p,
  })),
};

const grid = buildGrid(world);
const encoded = encodeGrid(grid);
const baked = JSON.stringify(encoded);
writeFileSync('public/grid.json', baked);

console.log(
  `${grid.width}×${grid.height} cells, ${encoded.cells.length / 2} runs, ${(
    baked.length / 1024
  ).toFixed(0)} Ko`,
);
