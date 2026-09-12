/**
 * Bakes `public/region-grid.json` — the admin-1 region and the host country of every cell of the
 * routing raster, and `public/projection.json` — the frame alone.
 *
 * **Why there is a second raster.** `regions.json` (2.5 MB of contours) and `world.json` (1.3 MB
 * of country polygons) entered the Convex bundle by a plain `import`, so every module touching a
 * map rule carried 34 MB of heap for the life of the isolate — measured, and it is what production
 * was recycling in a loop. The cells answer the same questions off two `Uint16Array` that live
 * outside the heap.
 *
 * **Same functions, one grid.** The region channel is cut with `regionAtPlanePoint`, the host
 * channel with `countryAtPlanePoint` — the very functions the server called at run time — at the
 * centre of each cell of `grid.json`, on the same 1600×832 mesh. So the switch moves no border on
 * purpose: what changes is that a border now falls on a cell edge (ADR 0023).
 *
 * Usage: node scripts/generate-region-grid.mjs — also chained at the end of generate-world.mjs,
 * because a regenerated world leaves a stale raster, which is what the equality test refuses.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { prepareRegionOutlines, regionAtPlanePoint } from '../src/domain/region-crossing.ts';
import { countryAtPlanePoint } from '../src/domain/routing.ts';

const WIDTH = 400;
const STEP = 0.25;

const worldAsset = JSON.parse(readFileSync('public/world.json', 'utf8'));
const regionsAsset = JSON.parse(readFileSync('public/regions.json', 'utf8'));

const world = {
  sphere: worldAsset.meta.sphere,
  outline: worldAsset.meta.outline,
  countries: worldAsset.countries.map((country) => ({
    name: country.n,
    adm0: country.a,
    representativePoint: country.c,
    lonLat: country.ll,
    rings: country.p,
  })),
};

/** Natural Earth occasionally projects a degenerate islet as the whole frame — the same guard
 *  the server carried, kept here because it is a fact about the source, not about the reader. */
const isProjectionFrame = (ring) => {
  const xs = ring.map(([x]) => x);
  const ys = ring.map(([, y]) => y);
  return (
    Math.max(...xs) - Math.min(...xs) > WIDTH * 0.9 &&
    Math.max(...ys) - Math.min(...ys) > worldAsset.meta.sphere.maxY * 0.9
  );
};

const outlines = prepareRegionOutlines(
  regionsAsset.regions.map((region) => ({
    id: region.id,
    rings: region.p.filter((ring) => !isProjectionFrame(ring)),
  })),
);

/**
 * **Le filtrage par boîte englobante n'est pas une approximation.** `regionAtPlanePoint` commence
 * par le même test, et un polygone dont la boîte exclut le point ne peut pas le contenir : les
 * candidats d'une cellule sont exactement ceux que la table entière aurait retenus. L'ordre
 * d'entrée est conservé — `countryAtPlanePoint` rend le **premier** pays qui contient le point,
 * et un panier qui mélangerait l'ordre changerait la réponse là où deux polygones se chevauchent.
 */
const BUCKET = 4;

function bucketsOf(items, boxOf) {
  const columns = Math.ceil(width / BUCKET);
  const rows = Math.ceil(height / BUCKET);
  const baskets = new Map();
  for (const item of items) {
    const box = boxOf(item);
    const firstColumn = Math.max(0, Math.floor((box[0] - world.sphere.minX) / STEP / BUCKET));
    const lastColumn = Math.min(
      columns - 1,
      Math.floor((box[2] - world.sphere.minX) / STEP / BUCKET),
    );
    const firstRow = Math.max(0, Math.floor((box[1] - world.sphere.minY) / STEP / BUCKET));
    const lastRow = Math.min(rows - 1, Math.floor((box[3] - world.sphere.minY) / STEP / BUCKET));
    for (let row = firstRow; row <= lastRow; row += 1) {
      for (let column = firstColumn; column <= lastColumn; column += 1) {
        const key = row * columns + column;
        const found = baskets.get(key);
        if (found === undefined) baskets.set(key, [item]);
        else found.push(item);
      }
    }
  }
  return (column, row) =>
    baskets.get(Math.floor(row / BUCKET) * columns + Math.floor(column / BUCKET));
}

const boxOfCountry = (country) => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const ring of country.rings) {
    for (const [x, y] of ring) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return [minX, minY, maxX, maxY];
};

const width = Math.ceil((world.sphere.maxX - world.sphere.minX) / STEP);
const height = Math.ceil((world.sphere.maxY - world.sphere.minY) / STEP);
const ids = outlines.map((outline) => outline.id);
const hosts = world.countries.map((country) => country.adm0);
const codeOfRegion = new Map(ids.map((id, rank) => [id, rank + 1]));
const codeOfHost = new Map(hosts.map((adm0, rank) => [adm0, rank + 1]));

const regionCells = new Uint16Array(width * height);
const hostCells = new Uint16Array(width * height);
const regionsNear = bucketsOf(outlines, (outline) => outline.box);
const countriesNear = bucketsOf(world.countries, boxOfCountry);

const started = performance.now();
for (let row = 0; row < height; row += 1) {
  const y = world.sphere.minY + (row + 0.5) * STEP;
  for (let column = 0; column < width; column += 1) {
    const x = world.sphere.minX + (column + 0.5) * STEP;
    const cell = row * width + column;

    const nearby = regionsNear(column, row);
    if (nearby !== undefined) {
      const regionId = regionAtPlanePoint(nearby, [x, y], WIDTH);
      if (regionId !== null) regionCells[cell] = codeOfRegion.get(regionId);
    }
    const hosting = countriesNear(column, row);
    if (hosting !== undefined) {
      const adm0 = countryAtPlanePoint(hosting, [x, y]);
      if (adm0 !== null) hostCells[cell] = codeOfHost.get(adm0);
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

const encoded = {
  step: STEP,
  width,
  height,
  ids,
  hosts,
  regionRuns: runsOf(regionCells),
  hostRuns: runsOf(hostCells),
};
const baked = JSON.stringify(encoded);
writeFileSync('public/region-grid.json', baked);

/** The frame, on its own: the server projects a lon/lat and needs nothing else of `world.json`
 *  once the polygons are rastered. 181 samples against 1.3 MB. */
writeFileSync(
  'public/projection.json',
  JSON.stringify({ sphere: worldAsset.meta.sphere, outline: worldAsset.meta.outline }),
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
 * serait inventer une géographie. Elles restent atteignables par leur point
 * (`goalCellsOfRegions`), qui est la seule adresse qu'elles aient jamais eue.
 */
const withCells = new Set(regionCells);
const pointOnly = ids.filter((id) => !withCells.has(codeOfRegion.get(id)));

console.log(
  `${width}×${height} cells in ${((performance.now() - started) / 1000).toFixed(1)} s\n` +
    `${pointOnly.length} regions smaller than a cell, reachable by their point alone\n` +
    `${encoded.regionRuns.length / 2} region runs (${covered(regionCells)} cells over ${ids.length} regions), ` +
    `${encoded.hostRuns.length / 2} host runs (${covered(hostCells)} cells over ${hosts.length} countries)\n` +
    `${(baked.length / 1024).toFixed(0)} Ko`,
);
