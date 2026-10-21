/**
 * Bakes `public/region-grid.json` — the admin-1 region and the host country of every cell of the
 * routing raster, and `public/projection.json` — the frame alone.
 *
 * **Why there is a second raster.** The contours entered the Convex bundle by a plain `import`,
 * so every module touching a map rule carried 34 MB of heap for the life of the isolate —
 * measured, and it is what production was recycling in a loop. The cells answer the same
 * questions off two `Uint16Array` that live outside the heap.
 *
 * **Same atlas, one grid** (ADR 0034). The region of a cell is the one `regionAt` of
 * `src/domain/atlas.ts` answers at the cell's centre, on the `near` arcs — the function of the
 * hover. It is cut here by scanlines over the region shapes, not by calling `regionAt` 1.3 M
 * times (4 605 boxes each); `convex/invariants.test.ts` checks a sample of cells against
 * `regionAt` itself. The host is the country of that region. A border falls on a cell edge
 * (ADR 0023).
 *
 * A region the simplification folded to a point has no shape at this level: no cell carries its
 * code, and it is anchored like any region smaller than a cell.
 *
 * Usage: node scripts/generate-region-grid.mjs, after generate-atlas.mjs and
 * generate-region-index.mjs (the anchors read the interior points it baked).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { frame, regionGridAsset } from './atlas-base.mjs';

const indexAsset = JSON.parse(readFileSync('public/region-index.json', 'utf8'));
const world = frame;

const started = performance.now();
const { asset: encoded, regionCells, hostCells } = regionGridAsset(indexAsset.point);
const { width, height, ids, hosts, anchors } = encoded;

const baked = JSON.stringify(encoded);
writeFileSync('public/region-grid.json', baked);

/** The frame, on its own: the server projects a lon/lat and needs nothing else
 *  once the polygons are rastered. 181 samples. */
writeFileSync(
  'public/projection.json',
  JSON.stringify({ sphere: world.sphere, outline: world.outline }),
);

const covered = (channel) => {
  let count = 0;
  for (const code of channel) if (code !== 0) count += 1;
  return count;
};

/**
 * **Une région plus petite qu'une cellule n'est pas une surface, c'est un point** — aucun centre
 * de cellule ne tombe dedans, et rien n'est forcé pour le lui faire croire : les arrondissements
 * d'une capitale tiennent tous dans la même cellule de 28 km, et leur en attribuer une chacun
 * serait inventer une géographie. Elles sont **ancrées** à cette cellule commune, ce qui les rend
 * atteignables sans prétendre qu'elles la couvrent.
 */
const anchorCells = new Set();
for (let pair = 0; pair < anchors.length; pair += 2) anchorCells.add(anchors[pair]);

console.log(
  `${width}×${height} cells in ${((performance.now() - started) / 1000).toFixed(1)} s\n` +
    `${anchors.length / 2} regions smaller than a cell, anchored on ${anchorCells.size} cells\n` +
    `${encoded.regionRuns.length / 2} region runs (${covered(regionCells)} cells over ${ids.length} regions), ` +
    `${encoded.hostRuns.length / 2} host runs (${covered(hostCells)} cells over ${hosts.length} countries)\n` +
    `${(baked.length / 1024).toFixed(0)} Ko`,
);
