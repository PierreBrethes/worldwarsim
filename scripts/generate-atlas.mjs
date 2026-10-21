/**
 * Bakes the geographic base of the map (ADR 0034): `public/atlas.json`, a TopoJSON topology of
 * the admin-1 regions with their far arcs, and `public/atlas-near.json`, the near arcs in the
 * same order. `src/domain/atlas.ts` reads them.
 *
 * 1. Natural Earth 10m admin-1, Antarctica left out, three German
 *    Länder cut into their Regierungsbezirke (BKG VG2500), in lon/lat.
 * 2. One topology with shared arcs, cleaned by mapshaper: no gap, no overlap between regions.
 *    The great lakes are cut out of it: their water is no region's.
 * 3. Each arc projected in Natural Earth 1 over 400 × 208 u, then weighted by Visvalingam on
 *    the sheet. Two levels keep the same arcs and objects: near (30 % of the points) and far
 *    (6 %), quantized at 0.001 u (~110 m). Each level is repaired until no arc crosses
 *    another and every region keeps a shape (`level`).
 * 4. The `regionId` diff against the atlas being replaced is printed: an id that moves orphans
 *    a capital, a deposit or a saved season.
 *
 * Usage: node scripts/generate-atlas.mjs <ne_10m_admin_1_states_provinces.geojson>
 *   <vg2500_12-31.utm32s.shape.zip> <ne_10m_lakes.geojson>
 * Sources, pinned by SHA-256 below:
 * - Natural Earth v5.1.2, github.com/nvkelso/natural-earth-vector/blob/v5.1.2/geojson/
 *   ne_10m_admin_1_states_provinces.geojson
 * - Natural Earth v5.1.2, same folder, ne_10m_lakes.geojson
 * - BKG VG2500 (© GeoBasis-DE / BKG, dl-de/by-2-0), daten.gdz.bkg.bund.de/produkte/vg/vg2500/
 *   aktuell/vg2500_12-31.utm32s.shape.zip
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { gzipSync, inflateRawSync } from 'node:zlib';
import { geoArea, geoNaturalEarth1 } from 'd3-geo';
import mapshaper from 'mapshaper';
import { presimplify } from 'topojson-simplify';
import { findCrossings } from '../src/domain/atlas.ts';
import { germanDistricts } from './german-districts.mjs';

const SOURCES = [
  ['Natural Earth admin-1', '22d0e3ad85eb3e27f17cabf8ba2d50e554fbc27a87796ff891d958185da62fb5'],
  ['BKG VG2500', '2782060b2e518fc60cce2f8b1201334cd783d3225e6c7552655aa0b33b056d05'],
  ['Natural Earth lakes', '2d036f53dedec578001c5c30c2959ee7d4eebc1306900fa4367c49929ec8f2d9'],
];
const WIDTH = 400;
const HEIGHT = 208;
/** Points per map unit, ~110 m. At 0.002 u the far level saves 31 Ko gzip, and the Vatican
 *  no longer has a shape. */
const QUANTUM = 1000;
const NEAR_SHARE = 0.3;
const FAR_SHARE = 0.06;

const paths = process.argv.slice(2);
if (paths.length !== 3) {
  console.error(
    'usage: node scripts/generate-atlas.mjs <ne_10m_admin_1_states_provinces.geojson> <vg2500_12-31.utm32s.shape.zip> <ne_10m_lakes.geojson>',
  );
  process.exit(1);
}
const [admin1, vg2500, lakeSource] = paths.map((path, i) => {
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

/**
 * The great lakes are water: cut out of the regions, their shore is a coast. Great is 400 km²
 * and more: Constance (459 km²), the smallest lake Pierre named, is in; a smaller one would be
 * a speck at the near level. Reservoirs count: the map is today's.
 */
const GREAT_LAKE_KM2 = 400;
const lakes = JSON.parse(lakeSource.toString('utf8')).features.filter(
  (lake) => geoArea(lake) * 6371 ** 2 >= GREAT_LAKE_KM2,
);
console.log(`${lakes.length} great lakes`);

const cleaned = await mapshaper.applyCommands(
  // Snapped first, at ~110 m, the quantum: a lake shore a few metres off a region's border
  // would leave slivers that rounding folds onto each other.
  '-i regions.json lakes.json combine-files snap snap-interval=0.001 ' +
    '-clip regions target=lakes -erase lakes target=regions -clean snap-interval=0.001 target=regions ' +
    '-o atlas.json target=regions,lakes format=topojson no-quantization',
  {
    'regions.json': JSON.stringify({ type: 'FeatureCollection', features }),
    'lakes.json': JSON.stringify({ type: 'FeatureCollection', features: lakes }),
  },
);
const topology = JSON.parse(cleaned['atlas.json']);
const geometries = topology.objects.regions.geometries;
if (geometries.length !== features.length || geometries.some(({ type }) => !type))
  throw new Error(
    `mapshaper lost a region: ${features.map(({ properties }) => properties.id).filter((id) => !geometries.some(({ type, properties }) => type && properties.id === id))}`,
  );

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

const polygonsOf = ({ type, arcs }) => (type === 'Polygon' ? [arcs] : arcs);
const ringOf = (arcs, refs) =>
  refs.flatMap((ref) => (ref >= 0 ? arcs[ref] : arcs[~ref].toReversed()));
/** The outer ring a region keeps whole when simplification would flatten all of them. */
const largestRing = geometries.map((geometry) =>
  polygonsOf(geometry)
    .map(([outer]) => outer)
    .reduce((a, b) =>
      Math.abs(ringArea(ringOf(weighted, a))) >= Math.abs(ringArea(ringOf(weighted, b))) ? a : b,
    ),
);
const flattened = (arcs) =>
  geometries.flatMap((geometry, region) =>
    polygonsOf(geometry).some(([outer]) => ringArea(ringOf(arcs, outer)) !== 0) ? [] : [region],
  );

/**
 * Three repairs, until none has anything left to do:
 * - a region whose every ring simplification flattened gets its largest ring back whole;
 * - where simplifying arcs one by one pushes two shores across each other, the points between
 *   them come back;
 * - once nothing is left to bring back, rounding to the quantum has folded two arcs onto each
 *   other, or the source itself crosses (a few Maldivian islets): of the inner points of each
 *   crossing pair, the one nearest the other segment goes — the point of the fold.
 */
function level(share) {
  const minimum = weights[Math.floor((weights.length - 1) * share)];
  const keep = weighted.map((arc) => arc.map((point) => point[2] >= minimum));
  const dropped = weighted.map((arc) => arc.map(() => false));
  const label = `${share * 100} %`;
  for (let pass = 0; pass < 50; pass++) {
    const { arcs, sources } = quantized(keep);
    const flat = flattened(arcs);
    const crossings = findCrossings(arcs);
    let restored = false;
    const restore = (a, from, to) => {
      for (let i = from; i < to; i++)
        if (!keep[a][i] && !dropped[a][i]) keep[a][i] = restored = true;
    };
    for (const region of flat)
      for (const ref of largestRing[region])
        restore(arcIndex(ref), 0, weighted[arcIndex(ref)].length);
    for (const pair of crossings)
      for (const [a, k] of pair) restore(a, sources[a][k] + 1, sources[a][k + 1]);
    if (restored) continue;
    if (crossings.length === 0) {
      // A region with no area at a level is one `regionAt` never answers and no cell carries.
      if (flat.length > 0)
        throw new Error(
          `${label}: regions without an area: ${flat.map((region) => geometries[region].properties.id).join(', ')}`,
        );
      const points = arcs.reduce((sum, arc) => sum + arc.length, 0);
      const folds = dropped.flat().filter(Boolean).length;
      console.log(`${label}: ${points} points, ${pass} repair passes, ${folds} folds`);
      return arcs;
    }
    for (const [s, t] of crossings) {
      const [nearest] = [
        [s, t],
        [t, s],
      ]
        .flatMap(([[a, k], [b, j]]) =>
          [k, k + 1]
            .filter((v) => v > 0 && v < arcs[a].length - 1)
            .map((v) => [[a, v], distanceToSegment(arcs[a][v], arcs[b][j], arcs[b][j + 1])]),
        )
        .sort((x, y) => x[1] - y[1])
        .map(([point]) => point);
      if (!nearest) throw new Error(`${label}: arcs ${s} and ${t} cross with no inner point`);
      const [a, v] = nearest;
      keep[a][sources[a][v]] = false;
      dropped[a][sources[a][v]] = true;
    }
  }
  throw new Error(`${label}: arcs still cross after 50 repair passes`);
}

const arcIndex = (ref) => (ref >= 0 ? ref : ~ref);
const deltas = (arcs) =>
  arcs.map((arc) =>
    arc.map(([x, y], i) => (i === 0 ? [x, y] : [x - arc[i - 1][0], y - arc[i - 1][1]])),
  );
const transform = { scale: [1 / QUANTUM, 1 / QUANTUM], translate: [0, 0] };

const atlas = {
  type: 'Topology',
  transform,
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
    lakes: {
      type: 'GeometryCollection',
      geometries: topology.objects.lakes.geometries
        .filter(({ type }) => type)
        .map(({ type, arcs }) => ({ type, arcs })),
    },
  },
  arcs: deltas(level(FAR_SHARE)),
};
const near = { transform, arcs: deltas(level(NEAR_SHARE)) };

// ---------- 4. Outputs and the id diff ----------

const ids = atlas.objects.regions.geometries.map(({ id }) => id);
const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
if (duplicates.length > 0) throw new Error(`duplicate region ids: ${duplicates.join(', ')}`);

// The ids are compared with the atlas being replaced; the first bake has nothing to compare with.
const previous = existsSync('public/atlas.json')
  ? JSON.parse(readFileSync('public/atlas.json', 'utf8')).objects.regions.geometries.map(
      ({ id, properties }) => [id, properties],
    )
  : [];

for (const [file, content] of [
  ['public/atlas.json', JSON.stringify(atlas)],
  ['public/atlas-near.json', JSON.stringify(near)],
]) {
  writeFileSync(file, content);
  const kb = (bytes) => `${(bytes / 1024).toFixed(0)} Ko`;
  console.log(`${file}: ${kb(content.length)}, ${kb(gzipSync(content).length)} gzip`);
}

const before = new Map(previous);
const after = new Map(
  atlas.objects.regions.geometries.map(({ id, properties }) => [id, properties]),
);
const gone = [...before.keys()].filter((id) => !after.has(id));
const added = [...after.keys()].filter((id) => !before.has(id));
const renamed = [...after]
  .filter(
    ([id, { country, name }]) =>
      before.has(id) && (before.get(id).name !== name || before.get(id).country !== country),
  )
  .map(([id, { name }]) => `${id} ${before.get(id).name} → ${name}`);
console.log(`regionId: ${before.size} before, ${after.size} after`);
console.log(`  ${gone.length} gone${gone.length ? `: ${gone.join(', ')}` : ''}`);
console.log(`  ${added.length} new${added.length ? `: ${added.join(', ')}` : ''}`);
console.log(`  ${renamed.length} renamed${renamed.length ? `: ${renamed.join(', ')}` : ''}`);
