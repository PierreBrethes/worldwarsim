/**
 * Bakes `public/region-index.json` — the four facts the **server** needs about a region, and
 * nothing else: its name, the country it belongs to, whether it touches the sea, and the
 * lon/lat point where anything put on it stands.
 *
 * The Convex bundle has no business carrying geometry to decide that a port may not be built in
 * Auvergne. This file is that answer, stripped to what a rule reads — imported straight into the
 * bundle next to `deposits.json`. Every fact is read off the atlas (ADR 0034), the `near` arcs
 * of `public/atlas.json` and `public/atlas-near.json`, so the index, the grids and the hover
 * agree on the same coast.
 *
 * **The coast is the server's own** (ADR 0034): a region is coastal when a quay is accepted for
 * it somewhere (`coastal` below). The sheet says « côtière » exactly where a port is accepted; a
 * lake shore, the Caspian's included, is neither.
 *
 * **The point is a pole of inaccessibility, un-projected**: the largest shape of the region,
 * holes included, so that it stays inside the shape and outside its enclaves. It is what turns
 * a region into a distance: an outpost's reach is measured in kilometres from point to point
 * (ADR 0015), never in regions, and a movement leaves from the point of the region its barracks
 * stands on. A centroid would fall in the sea off Norway. A region that has land cells keeps its
 * point on one of them, or a force put there would stand afloat on a lake: when the pole misses
 * them, the nearest land cell's centre replaces it. A pole that rounding puts outside a region
 * too small for a cell falls back on a shape's centroid.
 *
 * It also bakes `public/country-names.json`, the French name of every country the game can
 * show — 251 codes against the eight nations that have a hand-written label. The names come
 * from CLDR at bake time, so nothing translates at run time and no code ever reaches a screen.
 *
 * Usage: node scripts/generate-region-index.mjs
 */
import isoCountries from 'i18n-iso-countries';
import polylabel from 'polylabel';
import { readFileSync, writeFileSync } from 'node:fs';
import {
  decodeGrid,
  isCoastCell,
  isLandCell,
  lonLatAtProjected,
  projectLonLat,
} from '../src/domain/routing.ts';
import { decodeRegionRaster, pointInRegion } from '../src/domain/region-raster.ts';
import {
  atlas,
  DETAIL,
  frame,
  naturalEarth,
  pairs,
  regionGridAsset,
  regionRaster,
  STEP,
} from './atlas-base.mjs';

const rounded = (value) => Math.round(value * 1000) / 1000;

const areaOf = (flat) => {
  let twice = 0;
  for (let i = 0, n = flat.length / 2; i < n; i++) {
    const j = (i + 1) % n;
    twice += flat[2 * i] * flat[2 * j + 1] - flat[2 * j] * flat[2 * i + 1];
  }
  return Math.abs(twice) / 2;
};

const shapesOf = atlas.shapes((region) => region.id, DETAIL);

const name = {};
const country = {};
const point = {};
for (const region of atlas.regions) {
  name[region.id] = region.name;
  country[region.id] = region.country;
  const shapes = shapesOf.get(region.id) ?? [];
  const largest = shapes.reduce((a, b) => (areaOf(a.outer) >= areaOf(b.outer) ? a : b), shapes[0]);
  if (largest === undefined) continue;
  const [lon, lat] = naturalEarth.invert(
    polylabel([largest.outer, ...largest.holes].map(pairs), 0.005),
  );
  point[region.id] = [rounded(lon), rounded(lat)];
}

const grid = decodeGrid(JSON.parse(readFileSync('public/grid.json', 'utf8')), frame);
const raster = regionRaster();
const cellOf = (lonLat) => {
  const [x, y] = projectLonLat(frame.outline, frame.sphere, lonLat);
  const column = Math.min(
    raster.width - 1,
    Math.max(0, Math.round((x - frame.sphere.minX) / STEP - 0.5)),
  );
  const row = Math.min(
    raster.height - 1,
    Math.max(0, Math.round((y - frame.sphere.minY) / STEP - 0.5)),
  );
  return row * raster.width + column;
};
const centreOf = (cell) => [
  frame.sphere.minX + ((cell % raster.width) + 0.5) * STEP,
  frame.sphere.minY + (Math.floor(cell / raster.width) + 0.5) * STEP,
];
const lonLatOfCell = (cell) => lonLatAtProjected(frame.outline, frame.sphere, centreOf(cell));
const cellsOf = new Map(atlas.regions.map(({ id }) => [id, []]));
raster.regionCells.forEach((code, cell) => {
  if (code !== 0) cellsOf.get(raster.ids[code - 1]).push(cell);
});
const inRegion = (id, lonLat) =>
  atlas.regionAt(projectLonLat(frame.outline, frame.sphere, lonLat), DETAIL)?.id === id;
const roundedLonLat = ([lon, lat]) => [rounded(lon), rounded(lat)];

let landed = 0;
let centred = 0;
for (const { id } of atlas.regions) {
  const land = cellsOf.get(id).filter((cell) => isLandCell(grid, lonLatOfCell(cell)));
  if (land.length > 0) {
    if (land.includes(cellOf(point[id])) && inRegion(id, point[id])) continue;
    const [x, y] = projectLonLat(frame.outline, frame.sphere, point[id]);
    const distance = (cell) => Math.hypot(centreOf(cell)[0] - x, centreOf(cell)[1] - y);
    const nearest = land.reduce((a, b) => (distance(a) <= distance(b) ? a : b));
    point[id] = roundedLonLat(lonLatOfCell(nearest));
    landed += 1;
  } else if (!inRegion(id, point[id])) {
    const centroid = (shapesOf.get(id) ?? [])
      .map(({ outer }) => {
        const n = outer.length / 2;
        let [sx, sy] = [0, 0];
        for (let i = 0; i < n; i++) [sx, sy] = [sx + outer[2 * i], sy + outer[2 * i + 1]];
        return roundedLonLat(lonLatAtProjected(frame.outline, frame.sphere, [sx / n, sy / n]));
      })
      .find((lonLat) => inRegion(id, lonLat));
    if (centroid) {
      point[id] = centroid;
      centred += 1;
    }
  }
}
console.log(`${landed} points moved onto a land cell, ${centred} onto a shape's centroid`);

/** A region the server can name but cannot place is a region a rule would refuse to reason
 *  about hours later, without saying why. It fails here instead. */
const pointless = Object.keys(country).filter((id) => !Number.isFinite(point[id]?.[0]));
if (pointless.length > 0) throw new Error(`regions without a point: ${pointless.join(', ')}`);

/**
 * **Coastal is what the server accepts**: a region is coastal when some point takes a quay for
 * it — `isCoastCell` there, and `pointInRegion` for the region, the two checks a port passes
 * (`convex/constructions.ts`). The points tried are a 5 × 5 lattice over each coast cell:
 * `isCoastCell` and the ring of `pointInRegion` answer per cell, only its 60 km slack around the
 * region's point moves within one, and the centres alone missed 56 regions it reaches.
 */
const regionGrid = decodeRegionRaster(regionGridAsset(point).asset, frame);
const anchoredAt = new Map();
for (const [id, cell] of regionGrid.anchorOfRegion)
  (anchoredAt.get(cell) ?? anchoredAt.set(cell, []).get(cell)).push(id);
const pointsByLatitude = new Map();
for (const [id, [, lat]] of Object.entries(point))
  (
    pointsByLatitude.get(Math.floor(lat)) ??
    pointsByLatitude.set(Math.floor(lat), []).get(Math.floor(lat))
  ).push(id);

const nearRegions = (cell, lonLat) => {
  const near = new Set();
  const [column, row] = [cell % raster.width, Math.floor(cell / raster.width)];
  for (let dy = -2; dy <= 2; dy++)
    for (let dx = -2; dx <= 2; dx++) {
      const r = row + dy;
      if (r < 0 || r >= raster.height) continue;
      const other = r * raster.width + ((column + dx + raster.width) % raster.width);
      const code = regionGrid.regions[other];
      if (code !== 0) near.add(regionGrid.ids[code - 1]);
      for (const id of anchoredAt.get(other) ?? []) near.add(id);
    }
  for (let lat = Math.floor(lonLat[1]) - 1; lat <= Math.floor(lonLat[1]) + 1; lat++)
    for (const id of pointsByLatitude.get(lat) ?? []) near.add(id);
  return near;
};

const coastal = new Set();
/** Where a quay is tried within a coast cell, in steps from its centre. */
const OFFSETS = [-0.49, -0.245, 0, 0.245, 0.49];
for (let cell = 0; cell < raster.width * raster.height; cell++) {
  if (!isCoastCell(grid, lonLatOfCell(cell))) continue;
  const [cx, cy] = centreOf(cell);
  const samples = OFFSETS.flatMap((dx) =>
    OFFSETS.map((dy) =>
      lonLatAtProjected(frame.outline, frame.sphere, [cx + dx * STEP, cy + dy * STEP]),
    ),
  );
  for (const id of nearRegions(cell, samples[12])) {
    if (coastal.has(id)) continue;
    const region = { id, point: point[id] };
    if (
      samples.some(
        (lonLat) => isCoastCell(grid, lonLat) && pointInRegion(regionGrid, lonLat, region),
      )
    )
      coastal.add(id);
  }
}

const output = {
  name,
  country,
  coastal: atlas.regions.map((r) => r.id).filter((id) => coastal.has(id)),
  point,
};
writeFileSync('public/region-index.json', JSON.stringify(output));

const size = (JSON.stringify(output).length / 1024).toFixed(0);
console.log(`${Object.keys(country).length} regions, ${output.coastal.length} coastal, ${size} Ko`);

/**
 * Natural Earth does not key a country quite like ISO: these four are the same country under
 * another code, and borrow ISO's name below. Aliasing them rather than naming them keeps the
 * hand-written list to what nothing can derive.
 */
const ISO_ALPHA2 = { ALD: 'AX', PSX: 'PS', SAH: 'EH', SDS: 'SS' };

/**
 * The thirteen places ISO codes nowhere — disputed grounds, leases, atolls with no state. They
 * are the only country labels in this repository written by hand, and they are a defect list,
 * not a world list: everything ISO knows is derived.
 */
const OUTSIDE_ISO = {
  ATC: 'Îles Ashmore-et-Cartier',
  CLP: 'Île Clipperton',
  CSI: 'Îles de la mer de Corail',
  CYN: 'Chypre du Nord',
  ESB: 'Dhekelia',
  IOA: 'Territoires australiens de l’océan Indien',
  KAB: 'Cosmodrome de Baïkonour',
  KAS: 'Cachemire',
  KOS: 'Kosovo',
  PGA: 'Îles Spratleys',
  SOL: 'Somaliland',
  USG: 'Baie de Guantánamo',
  WSB: 'Akrotiri',
};

/**
 * CLDR rather than `i18n-iso-countries`, whose French table title-cases what French does not
 * ("Arabie Saoudite") and spells the long form where the map wants the short one ("États-Unis
 * d'Amérique"). The package is still the one that turns an alpha-3 into the alpha-2 CLDR reads.
 */
const french = new Intl.DisplayNames(['fr'], { type: 'region' });

function frenchName(adm0) {
  const named = OUTSIDE_ISO[adm0];
  if (named !== undefined) return named;
  const alpha2 = ISO_ALPHA2[adm0] ?? isoCountries.alpha3ToAlpha2(adm0);
  if (alpha2 === undefined) return undefined;
  const label = french.of(alpha2);
  return label === alpha2 ? undefined : label;
}

/** Everything the screen can name: the countries the regions belong to. */
const codes = [...new Set(Object.values(country))].sort();

const countryNames = {};
const unnamed = [];
for (const code of codes) {
  const label = frenchName(code);
  if (label === undefined) unnamed.push(code);
  else countryNames[code] = label;
}

/**
 * A country without a name is a data defect repaired once, never a degraded label discovered
 * mid-season. The run stops here rather than letting a code through to a French screen.
 */
if (unnamed.length > 0) throw new Error(`countries without a French name: ${unnamed.join(', ')}`);

writeFileSync('public/country-names.json', JSON.stringify(countryNames));
console.log(`${codes.length} countries named`);
