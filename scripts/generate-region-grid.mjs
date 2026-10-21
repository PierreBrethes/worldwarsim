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
import { projectLonLat } from '../src/domain/routing.ts';
import { atlas, DETAIL, frame, STEP } from './atlas-base.mjs';

const indexAsset = JSON.parse(readFileSync('public/region-index.json', 'utf8'));
const world = frame;

const width = Math.ceil((world.sphere.maxX - world.sphere.minX) / STEP);
const height = Math.ceil((world.sphere.maxY - world.sphere.minY) / STEP);
const ids = atlas.regions.map((region) => region.id);
const hosts = [...new Set(atlas.regions.map((region) => region.country))];
const codeOfRegion = new Map(ids.map((id, rank) => [id, rank + 1]));
const codeOfHost = new Map(hosts.map((adm0, rank) => [adm0, rank + 1]));

const regionCells = new Uint16Array(width * height);
const hostCells = new Uint16Array(width * height);

/**
 * Even-odd scanlines, as `contains` of the atlas counts: a cell is in a region when its centre
 * has an odd number of crossings to its right. The first region to claim a cell keeps it, as
 * `regionAt` answers the first of the table.
 */
const started = performance.now();
const shapesOf = atlas.shapes((region) => region.id, DETAIL);
const countryOf = new Map(atlas.regions.map((region) => [region.id, region.country]));
for (const id of ids) {
  const crossings = new Map();
  for (const { outer, holes } of shapesOf.get(id) ?? []) {
    for (const ring of [outer, ...holes]) {
      const n = ring.length / 2;
      for (let i = 0; i < n; i++) {
        const j = (i + n - 1) % n;
        const [ax, ay, bx, by] = [ring[2 * i], ring[2 * i + 1], ring[2 * j], ring[2 * j + 1]];
        if (ay === by) continue;
        const rowMin = Math.max(0, Math.ceil((Math.min(ay, by) - world.sphere.minY) / STEP - 0.5));
        const rowMax = Math.min(
          height - 1,
          Math.floor((Math.max(ay, by) - world.sphere.minY) / STEP - 0.5),
        );
        for (let row = rowMin; row <= rowMax; row++) {
          const y = world.sphere.minY + (row + 0.5) * STEP;
          if (!(ay > y !== by > y)) continue;
          const x = ((bx - ax) * (y - ay)) / (by - ay) + ax;
          (crossings.get(row) ?? crossings.set(row, []).get(row)).push(x);
        }
      }
    }
  }
  const code = codeOfRegion.get(id);
  const host = codeOfHost.get(countryOf.get(id));
  for (const [row, xs] of crossings) {
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      // x in [xs[k], xs[k+1]): the centres to the left of an odd number of crossings.
      const start = Math.max(0, Math.ceil((xs[k] - world.sphere.minX) / STEP - 0.5));
      const end = Math.min(width - 1, Math.ceil((xs[k + 1] - world.sphere.minX) / STEP - 0.5) - 1);
      for (let column = start; column <= end; column++) {
        const cell = row * width + column;
        if (regionCells[cell] !== 0) continue;
        regionCells[cell] = code;
        hostCells[cell] = host;
      }
    }
  }
}

const runsOf = (cells) => {
  const runs = [];
  let value = cells[0];
  let length = 0;
  for (const cell of cells) {
    if (cell === value) {
      length += 1;
      continue;
    }
    runs.push(value, length);
    value = cell;
    length = 1;
  }
  runs.push(value, length);
  return runs;
};

/**
 * **Le troisième canal : l'ancrage** (ADR 0023). Neuf cent soixante-et-onze régions sont plus
 * petites qu'une cellule — aucun centre ne tombe dedans, donc aucune cellule ne porte leur code —
 * et la direction région → cellules s'arrêtait là. Elle est totale désormais : chacune reçoit
 * **la cellule qui contient son point intérieur**, le pôle d'inaccessibilité que
 * `generate-region-index.mjs` a déjà calculé et cuit. Rien n'est recalculé ici, et rien n'est
 * inventé : l'ancrage ne dit pas que la cellule *est* la région, il dit par où l'on y entre.
 *
 * **Plusieurs régions ancrent la même cellule** — les quarante-cinq régions maltaises tiennent
 * dans une seule — et c'est la raison pour laquelle un but est une liste et non une valeur.
 *
 * La cellule est refaite ici plutôt que lue avec `cellAt` : le serveur importe `./geo` en valeur,
 * et le déshabillage de types de Node ne résout pas un chemin sans extension — ce script ne peut
 * pas charger `region-raster.ts`. C'est `convex/invariants.test.ts` qui referme la boucle, en
 * exigeant que chaque ancrage cuit soit **exactement** la cellule où `cellAt` fait tomber le
 * point : même contrat que l'égalité cuisson/calcul de `grid.json`, on recuit ou la CI refuse.
 */
const withCells = new Set(regionCells);
const anchors = [];
for (const id of ids) {
  if (withCells.has(codeOfRegion.get(id))) continue;
  const lonLat = indexAsset.point[id];
  if (lonLat === undefined) throw new Error(`region without an interior point: ${id}`);
  const [x, y] = projectLonLat(world.outline, world.sphere, lonLat);
  const column = Math.min(width - 1, Math.max(0, Math.round((x - world.sphere.minX) / STEP - 0.5)));
  const row = Math.min(height - 1, Math.max(0, Math.round((y - world.sphere.minY) / STEP - 0.5)));
  anchors.push(row * width + column, codeOfRegion.get(id));
}

const encoded = {
  step: STEP,
  width,
  height,
  ids,
  hosts,
  regionRuns: runsOf(regionCells),
  hostRuns: runsOf(hostCells),
  anchors,
};
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
