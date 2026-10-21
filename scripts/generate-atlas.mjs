/**
 * Bakes the geographic base of the map (ADR 0034): `public/atlas.json`, a TopoJSON topology of
 * the admin-1 regions with their far arcs, and `public/atlas-near.json`, the near arcs in the
 * same order. `src/domain/atlas.ts` reads them.
 *
 * 1. Natural Earth 10m admin-1, Antarctica left out as `world.json` leaves it, three German
 *    Länder cut into their Regierungsbezirke (BKG VG2500), in lon/lat.
 * 2. One topology with shared arcs, cleaned by mapshaper: no gap, no overlap between regions.
 * 3. Each arc projected in Natural Earth 1 over 400 × 208 u, then weighted by Visvalingam on
 *    the sheet. Two levels keep the same arcs and objects: near (30 % of the points) and far
 *    (6 %), quantized at 0.001 u (~110 m). Where simplifying arcs one by one pushes two shores
 *    across each other, the points between them come back until nothing crosses.
 * 4. The `regionId` diff against `public/regions.json` is printed: an id that moves orphans a
 *    capital, a deposit or a saved season.
 *
 * Usage: node scripts/generate-atlas.mjs <ne_10m_admin_1_states_provinces.geojson>
 *   <vg2500_12-31.utm32s.shape.zip>
 * Sources, pinned by SHA-256 below:
 * - Natural Earth v5.1.2, github.com/nvkelso/natural-earth-vector/blob/v5.1.2/geojson/
 *   ne_10m_admin_1_states_provinces.geojson
 * - BKG VG2500 (© GeoBasis-DE / BKG, dl-de/by-2-0), daten.gdz.bkg.bund.de/produkte/vg/vg2500/
 *   aktuell/vg2500_12-31.utm32s.shape.zip
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync, inflateRawSync } from 'node:zlib';
import { geoNaturalEarth1 } from 'd3-geo';
import mapshaper from 'mapshaper';
import { presimplify } from 'topojson-simplify';
import { findCrossings } from '../src/domain/atlas.ts';
import { germanDistricts } from './german-districts.mjs';

const SOURCES = [
  ['Natural Earth admin-1', '22d0e3ad85eb3e27f17cabf8ba2d50e554fbc27a87796ff891d958185da62fb5'],
  ['BKG VG2500', '2782060b2e518fc60cce2f8b1201334cd783d3225e6c7552655aa0b33b056d05'],
];
const WIDTH = 400;
const HEIGHT = 208;
const QUANTUM = 1000;
const NEAR_SHARE = 0.3;
const FAR_SHARE = 0.06;

const paths = process.argv.slice(2);
if (paths.length !== 2) {
  console.error(
    'usage: node scripts/generate-atlas.mjs <ne_10m_admin_1_states_provinces.geojson> <vg2500_12-31.utm32s.shape.zip>',
  );
  process.exit(1);
}
const [admin1, vg2500] = paths.map((path, i) => {
  const [name, expected] = SOURCES[i];
  const bytes = readFileSync(path);
  const actual = createHash('sha256').update(bytes).digest('hex');
  if (actual !== expected)
    throw new Error(`${name} (${path}): SHA-256 ${actual}, expected ${expected}`);
  return bytes;
});

// ---------- 1. The regions, in lon/lat ----------

const features = JSON.parse(admin1.toString('utf8'))
  .features.filter(({ properties }) => properties.adm0_a3 !== 'ATA')
  .map(({ properties, geometry }) => {
    if (!properties.adm1_code) throw new Error(`${properties.name}: no adm1_code`);
    return {
      type: 'Feature',
      properties: {
        id: properties.adm1_code,
        country: properties.adm0_a3,
        name: properties.name ?? properties.admin,
      },
      geometry,
    };
  });

const districts = germanDistricts(
  zipMember(vg2500, 'VG2500_RBZ.shp'),
  zipMember(vg2500, 'VG2500_RBZ.dbf'),
);
for (const land of new Set(districts.features.map(({ properties }) => properties.land))) {
  const at = features.findIndex(({ properties }) => properties.id === land);
  if (at === -1) throw new Error(`no region ${land} to cut into districts`);
  const own = districts.features.filter(({ properties }) => properties.land === land);
  features.splice(at, 1, ...(await cutIntoDistricts(features[at], own)));
}

/**
 * The Land's Natural Earth outline is kept and cut, never VG2500's own: the neighbours were
 * drawn against the former. The two disagree by a kilometre or so; what falls outside every
 * district goes to the district it borders most, what a district reaches beyond is dropped.
 * mapshaper clips: polygon-clipping overflows its stack on Bavaria's hundred-odd slivers.
 */
async function cutIntoDistricts(land, districts) {
  const collection = (features) => JSON.stringify({ type: 'FeatureCollection', features });
  const cut = await mapshaper.applyCommands(
    '-i land.json districts.json combine-files -clip land target=districts -explode -o pieces.json ' +
      '-erase districts target=land -explode -o strays.json',
    { 'land.json': collection([land]), 'districts.json': collection(districts) },
  );
  const parts = JSON.parse(cut['pieces.json']).features;
  const strays = JSON.parse(cut['strays.json']).features.map(({ geometry }) => geometry);
  const mains = districts.map(({ properties: { id } }) => {
    const [main, ...fragments] = parts
      .filter(({ properties }) => properties.id === id)
      .map(({ geometry }) => geometry)
      .toSorted((a, b) => areaOf(b.coordinates) - areaOf(a.coordinates));
    if (!main) throw new Error(`${id} lies outside ${land.properties.id}`);
    strays.push(...fragments);
    return main;
  });
  // A sliver cut off between two fragments touches no district: the nearest one takes it.
  const claimed = strays.map((stray) => {
    const ring = stray.coordinates[0];
    const votes = mains.map((main) => bordering(ring, main.coordinates));
    const gaps = mains.map((main) =>
      Math.min(...ring.map((point) => distanceTo(point, main.coordinates))),
    );
    const best =
      Math.max(...votes) > 0 ? votes.indexOf(Math.max(...votes)) : gaps.indexOf(Math.min(...gaps));
    return { type: 'Feature', properties: { id: districts[best].properties.id }, geometry: stray };
  });
  const pieces = mains.map((geometry, i) => ({
    type: 'Feature',
    properties: { id: districts[i].properties.id },
    geometry,
  }));
  const merged = await mapshaper.applyCommands('-i pieces.json -dissolve id -o pieces.json', {
    'pieces.json': collection([...pieces, ...claimed]),
  });
  return JSON.parse(merged['pieces.json']).features.map(({ properties: { id }, geometry }) => ({
    type: 'Feature',
    properties: {
      id,
      country: land.properties.country,
      name: districts.find((district) => district.properties.id === id).properties.name,
    },
    geometry,
  }));
}

function areaOf(polygon) {
  return polygon.reduce((sum, ring, i) => sum + (i === 0 ? 1 : -1) * Math.abs(ringArea(ring)), 0);
}

function ringArea(ring) {
  let sum = 0;
  for (let i = 0; i + 1 < ring.length; i++)
    sum += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  return sum / 2;
}

/** How much of a stray's outline runs along a polygon: its edges whose midpoint touches it. */
function bordering(ring, polygon) {
  let shared = 0;
  for (let i = 0; i + 1 < ring.length; i++) {
    const middle = [(ring[i][0] + ring[i + 1][0]) / 2, (ring[i][1] + ring[i + 1][1]) / 2];
    const touches = polygon.some((other) =>
      other.some((point, j) => j > 0 && distanceToSegment(middle, other[j - 1], point) < 1e-7),
    );
    if (touches) shared += Math.hypot(ring[i + 1][0] - ring[i][0], ring[i + 1][1] - ring[i][1]);
  }
  return shared;
}

function distanceTo(point, rings) {
  let best = Infinity;
  for (const ring of rings)
    for (let j = 1; j < ring.length; j++)
      best = Math.min(best, distanceToSegment(point, ring[j - 1], ring[j]));
  return best;
}

function distanceToSegment([px, py], [ax, ay], [bx, by]) {
  const length = (bx - ax) ** 2 + (by - ay) ** 2;
  const t =
    length === 0
      ? 0
      : Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / length));
  return Math.hypot(px - ax - t * (bx - ax), py - ay - t * (by - ay));
}

/** One member of a zip archive, found through its central directory. */
function zipMember(zip, name) {
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  let at = zip.readUInt32LE(end + 16);
  for (let entry = 0; entry < zip.readUInt16LE(end + 10); entry++) {
    const nameLength = zip.readUInt16LE(at + 28);
    const entryName = zip.toString('utf8', at + 46, at + 46 + nameLength);
    if (entryName.endsWith(`/${name}`) || entryName === name) {
      const method = zip.readUInt16LE(at + 10);
      const size = zip.readUInt32LE(at + 20);
      const local = zip.readUInt32LE(at + 42);
      const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
      const data = zip.subarray(start, start + size);
      return method === 8 ? inflateRawSync(data) : data;
    }
    at += 46 + nameLength + zip.readUInt16LE(at + 30) + zip.readUInt16LE(at + 32);
  }
  throw new Error(`${name} is not in the VG2500 archive`);
}

// ---------- 2. One topology ----------

const cleaned = await mapshaper.applyCommands(
  '-i regions.json -clean -o regions.json format=topojson no-quantization',
  { 'regions.json': JSON.stringify({ type: 'FeatureCollection', features }) },
);
const topology = JSON.parse(cleaned['regions.json']);
const geometries = topology.objects.regions.geometries;
if (geometries.length !== features.length || geometries.some(({ type }) => !type))
  throw new Error('mapshaper -clean lost a region');

// ---------- 3. Projection, simplification, quantization ----------

const projection = geoNaturalEarth1().fitExtent(
  [
    [0, 0],
    [WIDTH, HEIGHT],
  ],
  { type: 'Sphere' },
);
const weighted = presimplify({
  type: 'Topology',
  objects: {},
  arcs: topology.arcs.map((arc) => arc.map((point) => projection(point))),
}).arcs;
const weights = weighted
  .flatMap((arc) => arc.map((point) => point[2]).filter(Number.isFinite))
  .sort((a, b) => b - a);

/** The kept points of one level, as absolute integers; `sources` maps each back to the arc. */
function quantized(keep) {
  const arcs = [];
  const sources = [];
  weighted.forEach((arc, a) => {
    const points = [];
    const from = [];
    arc.forEach((point, i) => {
      if (!keep[a][i]) return;
      const x = Math.round(point[0] * QUANTUM);
      const y = Math.round(point[1] * QUANTUM);
      const last = points.at(-1);
      if (last && last[0] === x && last[1] === y) return;
      points.push([x, y]);
      from.push(i);
    });
    if (points.length === 1) {
      points.push(points[0]);
      from.push(from[0]);
    }
    arcs.push(points);
    sources.push(from);
  });
  return { arcs, sources };
}

/**
 * Where simplifying arcs one by one pushes two shores across each other, the points between
 * them come back. Once nothing is left to bring back, rounding to the quantum has folded two
 * arcs onto each other by their junction: the inner point of each fold goes.
 */
function level(share) {
  const minimum = weights[Math.floor((weights.length - 1) * share)];
  const keep = weighted.map((arc) => arc.map((point) => point[2] >= minimum));
  const dropped = weighted.map((arc) => arc.map(() => false));
  for (let pass = 0; pass < 50; pass++) {
    const { arcs, sources } = quantized(keep);
    const crossings = findCrossings(arcs);
    if (crossings.length === 0) {
      const points = arcs.reduce((sum, arc) => sum + arc.length, 0);
      const folds = dropped.flat().filter(Boolean).length;
      console.log(`${share * 100} %: ${points} points, ${pass} repair passes, ${folds} folds`);
      return arcs;
    }
    let restored = false;
    for (const [a, k] of crossings)
      for (let i = sources[a][k] + 1; i < sources[a][k + 1]; i++)
        if (!keep[a][i] && !dropped[a][i]) keep[a][i] = restored = true;
    if (restored) continue;
    for (const [a, k] of crossings) {
      const inner = k > 0 ? sources[a][k] : sources[a][k + 1];
      if (inner === weighted[a].length - 1)
        throw new Error(`${share * 100} %: arc ${a} crosses with no inner point`);
      keep[a][inner] = false;
      dropped[a][inner] = true;
    }
  }
  throw new Error(`${share * 100} %: arcs still cross after 50 repair passes`);
}

const deltas = (arcs) =>
  arcs.map((arc) =>
    arc.map(([x, y], i) => (i === 0 ? [x, y] : [x - arc[i - 1][0], y - arc[i - 1][1]])),
  );

const atlas = {
  type: 'Topology',
  transform: { scale: [1 / QUANTUM, 1 / QUANTUM], translate: [0, 0] },
  objects: {
    regions: {
      type: 'GeometryCollection',
      geometries: geometries.map(({ type, arcs, properties: { id, country, name } }) => ({
        type,
        arcs,
        id,
        properties: { country, name },
      })),
    },
  },
  arcs: deltas(level(FAR_SHARE)),
};
const near = deltas(level(NEAR_SHARE));

// ---------- 4. Outputs and the id diff ----------

const ids = atlas.objects.regions.geometries.map(({ id }) => id);
const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
if (duplicates.length > 0) throw new Error(`duplicate region ids: ${duplicates.join(', ')}`);

for (const [file, content] of [
  ['public/atlas.json', JSON.stringify(atlas)],
  ['public/atlas-near.json', JSON.stringify(near)],
]) {
  writeFileSync(file, content);
  const kb = (bytes) => `${(bytes / 1024).toFixed(0)} Ko`;
  console.log(`${file}: ${kb(content.length)}, ${kb(gzipSync(content).length)} gzip`);
}

const before = new Map(
  JSON.parse(readFileSync('public/regions.json', 'utf8')).regions.map((region) => [
    region.id,
    region,
  ]),
);
const after = new Map(
  atlas.objects.regions.geometries.map(({ id, properties }) => [id, properties]),
);
const gone = [...before.keys()].filter((id) => !after.has(id));
const added = [...after.keys()].filter((id) => !before.has(id));
const renamed = [...after]
  .filter(
    ([id, { country, name }]) =>
      before.has(id) && (before.get(id).n !== name || before.get(id).country !== country),
  )
  .map(([id, { name }]) => `${id} ${before.get(id).n} → ${name}`);
console.log(`regionId against regions.json: ${before.size} before, ${after.size} after`);
console.log(`  ${gone.length} gone${gone.length ? `: ${gone.join(', ')}` : ''}`);
console.log(`  ${added.length} new${added.length ? `: ${added.join(', ')}` : ''}`);
console.log(`  ${renamed.length} renamed${renamed.length ? `: ${renamed.join(', ')}` : ''}`);
