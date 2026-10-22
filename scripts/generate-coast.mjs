/**
 * Bakes `public/coast.json` — **the open-sea coast of every region** (#221), read off the atlas at
 * the `near` level: the arcs with a region on one side and the sea on the other, the land on
 * their left — and **the rings of the regions no cell carries** (#224). It is the one piece of the
 * atlas the server holds (ADR 0023, amended): a port goes up within reach of the coast, in its own
 * region, and the land and the region under a point are read off both where the grid drowns them
 * (`src/domain/coast.ts`); `generate-region-index.mjs` calls a region coastal when it has some.
 *
 * Open sea only: a lake shore (`borders` marks it `lake`), the shore of a hole of the land (the
 * Caspian, the Patagonian ice field) and of an island standing in such water are no coast, and
 * the antimeridian cut is no shore at all — its segments go, as the engine drops them.
 *
 * The points are the atlas's own, in thousandths of a map unit, delta-coded and packed as
 * little-endian `Int32` in base64: `[region rank, point count, dx, dy, dx, dy…]` per arc. As JSON
 * numbers the server's view module would carry ten mebibytes at import (`mesure-isolat.mjs`).
 *
 * Usage: node scripts/generate-coast.mjs (after generate-atlas, before generate-region-index)
 */
import { writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { lonLatAtProjected } from '../src/domain/routing.ts';
import { atlas, DETAIL, frame, naturalEarth, regionRaster } from './atlas-base.mjs';

const QUANTUM = 0.001;
/** As `SEAM_TOLERANCE` of the engine: the cut's own points sit within four thousandths. */
const SEAM_TOLERANCE = 0.01;

const onSeam = (x, y) => {
  const [, latitude] = lonLatAtProjected(frame.outline, frame.sphere, [200, y]);
  const [westX] = naturalEarth([-180, latitude]);
  const [eastX] = naturalEarth([180, latitude]);
  return Math.min(Math.abs(x - westX), Math.abs(x - eastX)) < SEAM_TOLERANCE;
};

const land = [...atlas.shapes(() => 'land', DETAIL).values()].flat();
const holeVertices = new Set(
  land.flatMap(({ holes }) =>
    holes.flatMap((hole) => Array.from({ length: hole.length / 2 }, (_, i) => key(hole, 2 * i))),
  ),
);
function key(points, i) {
  return `${points[i]},${points[i + 1]}`;
}

const inlandWaters = [...land.flatMap(({ holes }) => holes), ...atlas.lakes(DETAIL)].map((ring) => {
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  for (let i = 0; i < ring.length; i += 2) {
    [minX, maxX] = [Math.min(minX, ring[i]), Math.max(maxX, ring[i])];
    [minY, maxY] = [Math.min(minY, ring[i + 1]), Math.max(maxY, ring[i + 1])];
  }
  return { ring, box: [minX, minY, maxX, maxY] };
});

function inRing(ring, x, y) {
  let inside = false;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const [xi, yi, xj, yj] = [ring[i], ring[i + 1], ring[j], ring[j + 1]];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const inInlandWater = (x, y) =>
  inlandWaters.some(
    ({ ring, box }) =>
      x >= box[0] && x <= box[2] && y >= box[1] && y <= box[3] && inRing(ring, x, y),
  );

/** The shore of a hole of the land, or of an island standing in inland water. */
function isInlandShore(points) {
  const last = points.length - 2;
  if (inInlandWater(points[0], points[1]) && inInlandWater(points[last], points[last + 1]))
    return true;
  for (let i = 0; i < points.length; i += 2) if (!holeVertices.has(key(points, i))) return false;
  return true;
}

const countryOf = new Map(atlas.regions.map((region) => [region.id, region.country]));
const ids = [];
const rankOf = new Map();
const rankFor = (regionId) => {
  if (!rankOf.has(regionId)) rankOf.set(regionId, ids.push(regionId) - 1);
  return rankOf.get(regionId);
};
let pointCount = 0;
const write = (ints, regionId, run) => {
  ints.push(rankFor(regionId), run.length / 2);
  let [px, py] = [0, 0];
  for (let i = 0; i < run.length; i += 2) {
    const [x, y] = [Math.round(run[i] / QUANTUM), Math.round(run[i + 1] / QUANTUM)];
    ints.push(x - px, y - py);
    [px, py] = [x, y];
  }
  pointCount += run.length / 2;
};

const coastInts = [];
for (const border of atlas.borders((left, right) => (left === null) !== (right === null), DETAIL)) {
  if (border.lake || isInlandShore(border.points)) continue;
  const regionId = (border.left ?? border.right).id;
  // The land on the left of every arc: which side of its nearest shore a point lies is land or sea.
  const points = border.left === null ? reversed(border.points) : border.points;
  let run = [];
  for (let i = 0; i + 3 < points.length; i += 2) {
    if (onSeam(points[i], points[i + 1]) && onSeam(points[i + 2], points[i + 3])) {
      if (run.length >= 4) write(coastInts, regionId, run);
      run = [];
      continue;
    }
    if (run.length === 0) run.push(points[i], points[i + 1]);
    run.push(points[i + 2], points[i + 3]);
  }
  if (run.length >= 4) write(coastInts, regionId, run);
}
const coastalCount = ids.length;
const coastPoints = pointCount;

function reversed(points) {
  const out = new Float32Array(points.length);
  for (let i = 0; i < points.length; i += 2) {
    out[points.length - 2 - i] = points[i];
    out[points.length - 1 - i] = points[i + 1];
  }
  return out;
}

/**
 * **The regions no cell carries** (#224): their rings whole, so the server reads the land and the
 * region of Malta, Singapore or an atoll as the board draws them, where the 25 km raster has none.
 */
const { ids: rasterIds, regionCells } = regionRaster();
const withCells = new Set(regionCells);
const cellLess = new Set(rasterIds.filter((_, rank) => !withCells.has(rank + 1)));
const islandInts = [];
for (const [regionId, shapes] of atlas.shapes((region) => region.id, DETAIL, cellLess))
  for (const { outer, holes } of shapes)
    for (const ring of [outer, ...holes]) write(islandInts, regionId, ring);

const base64 = (ints) => Buffer.from(Int32Array.from(ints).buffer).toString('base64');
const output = JSON.stringify({
  quantum: QUANTUM,
  ids,
  countries: ids.map((id) => countryOf.get(id)),
  data: base64(coastInts),
  islands: base64(islandInts),
});
writeFileSync('public/coast.json', output);
console.log(
  `${coastalCount} coastal regions, ${coastPoints} points; ` +
    `${cellLess.size} regions without a cell, ${pointCount - coastPoints} points; ` +
    `${(output.length / 1024).toFixed(0)} Ko (${(gzipSync(output).length / 1024).toFixed(0)} Ko gzip)`,
);
