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
 *    the sheet. Two levels keep the same arcs and region objects: near (30 % of the points) and
 *    far (6 %), quantized at 0.001 u (~110 m). Each level is repaired until no arc crosses
 *    another and every region keeps a shape (`level`).
 * 4. Decor, read by no rule (#440): the cities (capitals and agglomerations over 500 000) and
 *    the seas (#457) in `atlas.json`, the rivers at each level, outside the arcs and so outside
 *    `level`'s repairs.
 * 5. The `regionId` diff against the atlas being replaced is printed: an id that moves orphans
 *    a capital, a deposit or a saved season.
 *
 * Usage: node scripts/generate-atlas.mjs <ne_10m_admin_1_states_provinces.geojson>
 *   <vg2500_12-31.utm32s.shape.zip> <ne_10m_lakes.geojson> <ne_10m_populated_places.geojson>
 *   <ne_10m_rivers_lake_centerlines.geojson> <rivers10.dbf> <ne_10m_geography_marine_polys.geojson>
 * Sources, pinned by SHA-256 below:
 * - Natural Earth v5.1.2, github.com/nvkelso/natural-earth-vector/blob/v5.1.2/geojson/
 *   ne_10m_admin_1_states_provinces.geojson
 * - Natural Earth v5.1.2, same folder, ne_10m_lakes.geojson
 * - Natural Earth v5.1.2, raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/
 *   ne_10m_populated_places.geojson (the full file: `_simple` has no NAME_FR)
 * - BKG VG2500 (© GeoBasis-DE / BKG, dl-de/by-2-0), daten.gdz.bkg.bund.de/produkte/vg/vg2500/
 *   aktuell/vg2500_12-31.utm32s.shape.zip
 * - Natural Earth v5.1.2 rivers and lake centerlines, two files of the same tag: the lines from
 *   raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/
 *   ne_10m_rivers_lake_centerlines.geojson (left behind by the tag: English names only, accents
 *   dropped), `name_fr` from raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/
 *   10m_physical/ne_10m_rivers_lake_centerlines.dbf, saved as `rivers10.dbf`. See
 *   `frenchRiverNames`.
 * - Natural Earth v5.1.2, raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/
 *   ne_10m_geography_marine_polys.geojson (#457)
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { gzipSync, inflateRawSync } from 'node:zlib';
import { geoArea, geoNaturalEarth1 } from 'd3-geo';
import mapshaper from 'mapshaper';
import polylabel from 'polylabel';
import { presimplify } from 'topojson-simplify';
import { decodeAtlas, findCrossings } from '../src/domain/atlas.ts';
import { attributesOf, germanDistricts } from './german-districts.mjs';
import { frenchRegionName } from './region-names-fr.mjs';

const SOURCES = [
  ['Natural Earth admin-1', '22d0e3ad85eb3e27f17cabf8ba2d50e554fbc27a87796ff891d958185da62fb5'],
  ['BKG VG2500', '2782060b2e518fc60cce2f8b1201334cd783d3225e6c7552655aa0b33b056d05'],
  ['Natural Earth lakes', '2d036f53dedec578001c5c30c2959ee7d4eebc1306900fa4367c49929ec8f2d9'],
  [
    'Natural Earth populated places',
    '9b8e3de09048ef00dfc70357dbb9fa324493f214b5e0ae4daf1aa79a8d10116b',
  ],
  ['Natural Earth rivers', 'bb854a900ecbd3b408df46d5e16e3e0f974ba55993f9d8b5c26e855273c0905a'],
  [
    'Natural Earth rivers, v5.1.2 attributes',
    '68079fde5fde6167d0c7c4f03e498164badcc3b687a93c436278ade83882b564',
  ],
  [
    'Natural Earth marine polygons',
    '53f865e8ffa966cdd402145c82c5cd14ee7ce974cd0eb9a3f59f03a4cfd2d66c',
  ],
];
const WIDTH = 400;
const HEIGHT = 208;
/** Points per map unit, ~110 m. At 0.002 u the far level saves 31 Ko gzip, and the Vatican
 *  no longer has a shape. */
const QUANTUM = 1000;
const NEAR_SHARE = 0.3;
const FAR_SHARE = 0.06;

const paths = process.argv.slice(2);
if (paths.length !== SOURCES.length) {
  console.error(
    'usage: node scripts/generate-atlas.mjs <ne_10m_admin_1_states_provinces.geojson> <vg2500_12-31.utm32s.shape.zip> <ne_10m_lakes.geojson> <ne_10m_populated_places.geojson> <ne_10m_rivers_lake_centerlines.geojson> <rivers10.dbf> <ne_10m_geography_marine_polys.geojson>',
  );
  process.exit(1);
}
const [admin1, vg2500, lakeSource, placeSource, riverSource, riverAttributes, seaSource] =
  paths.map((path, i) => {
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
        name: frenchRegionName(properties.adm0_a3, properties.name ?? properties.admin),
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
      name: frenchRegionName(
        land.properties.country,
        districts.find((district) => district.properties.id === id).properties.name,
      ),
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

// ---------- 4. The decor: cities and rivers ----------

/**
 * **Les villes : capitales et agglomérations de plus de 500 000 habitants** (`POP_MAX`, ce
 * qu'un lecteur appelle une grande ville), sous leur nom français d'aujourd'hui. A city that is
 * no capital goes when a more populous one is kept within 25 km: Gizeh under Le Caire, Duisbourg
 * under Essen. @a-mesurer
 */
const CITY_POPULATION = 500_000;
const CITY_MERGE_KM = 25;
/**
 * Natural Earth's French name, where the French Wikipedia's article title says otherwise. Keyed
 * by the English `NAME`.
 */
const CITY_NAMES = {
  'Nur-Sultan': 'Astana', // renamed back in 2022
  Busan: 'Busan', // NAME_FR « Pusan »
  'Vatican City': 'Vatican', // NAME_FR « Cité du Vatican »
};
const kmBetween = ([lon1, lat1], [lon2, lat2]) => {
  const rad = Math.PI / 180;
  const h =
    Math.sin(((lat2 - lat1) * rad) / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};
const places = JSON.parse(placeSource.toString('utf8'))
  .features.filter(
    ({ properties }) => properties.ADM0CAP === 1 || properties.POP_MAX > CITY_POPULATION,
  )
  .map(({ properties, geometry }) => ({
    at: geometry.coordinates,
    name: CITY_NAMES[properties.NAME] ?? properties.NAME_FR ?? properties.NAME,
    capital: properties.ADM0CAP === 1,
    population: properties.POP_MAX,
  }))
  .toSorted((a, b) => b.capital - a.capital || b.population - a.population);
const cities = [];
for (const place of places)
  if (
    place.capital ||
    !cities.some(
      (kept) => kept.population >= place.population && kmBetween(kept.at, place.at) < CITY_MERGE_KM,
    )
  )
    cities.push(place);
console.log(
  `${places.length} cities, ${places.length - cities.length} under a larger neighbour, ${cities.length} kept`,
);
/** `[lon, lat, name, capital, POP_MAX]`, lon/lat × 100: the night reads them in degrees. */
atlas.cities = cities.map(({ at: [lon, lat], name, capital, population }) => [
  Math.round(lon * 100),
  Math.round(lat * 100),
  name,
  capital ? 1 : 0,
  population,
]);

/**
 * **Les fleuves, sur deux niveaux comme la côte** : au loin les grands (`scalerank` ≤ 4 : Rhin,
 * Seine, Oder, Dniepr), au près jusqu'au rang 6 (Rhône, Pô, Garonne, Tamise, Don), plus le
 * front de 1940 de rang 7 à 9. Each level is simplified on the sheet, then cut to the same
 * level's land, lakes out, so no river runs past the coast that is drawn.
 */
const RIVER_RANKS = { far: 4, near: 6 };
const FRONT_RIVERS = new Set(['Maas', 'Mosel', 'Marne', 'Schelde']);
/** The sheet distance a simplified river may stray, ~2.2 km far, ~1.1 km near. */
const RIVER_INTERVAL = { far: 0.02, near: 0.01 };
/** Where the v5.1.2 `name_fr` is wrong or missing, keyed by the GeoJSON's `name`. */
const RIVER_NAMES = {
  'St. Lawrence': 'Saint-Laurent',
  'Bratul Sfintu Gheorghe': 'Bras de Saint-Georges',
};

const riverFeatures = JSON.parse(riverSource.toString('utf8')).features;
const riverNames = frenchRiverNames(riverFeatures, attributesOf(riverAttributes));

/**
 * The GeoJSON holds the lines but no `name_fr`; the v5.1.2 `.dbf` holds `name_fr` for lines of
 * its own, in another order (1473 records against 1455). A record is the line's when name,
 * `rivernum`, `scalerank` and class all agree, the name compared on its ASCII letters: the older
 * file dropped the accents (« Rhne »). A line no record answers keeps its English name.
 */
function frenchRiverNames(features, records) {
  const letters = (name) => (name ?? '').replace(/[^A-Za-z]/g, '');
  const keyOf = ({ name, rivernum, scalerank, featurecla }) =>
    `${letters(name)}|${Number(rivernum)}|${Number(scalerank)}|${featurecla}`;
  const french = new Map();
  for (const record of records) {
    const key = keyOf(record);
    const known = french.get(key);
    if (known !== undefined && known !== record.name_fr)
      throw new Error(`rivers: ${key} has two French names, ${known} and ${record.name_fr}`);
    french.set(key, record.name_fr);
  }
  let paired = 0;
  const names = features.map(({ properties }) => {
    const found = french.get(keyOf(properties));
    if (found) paired++;
    const name = RIVER_NAMES[properties.name] ?? (found || properties.name);
    return name || null;
  });
  console.log(`rivers: ${records.length} records, ${paired} of ${features.length} lines paired`);
  return names;
}

const lineStrings = ({ type, coordinates }) =>
  type === 'LineString' ? [coordinates] : type === 'MultiLineString' ? coordinates : [];

async function riversOf(detail, keep, land) {
  const features = riverFeatures.flatMap(({ properties, geometry }, i) =>
    keep(properties)
      ? [
          {
            type: 'Feature',
            properties: {
              key: `${riverNames[i]}|${properties.rivernum}`,
              name: riverNames[i],
              rank: properties.scalerank,
            },
            geometry: {
              type: 'MultiLineString',
              coordinates: lineStrings(geometry).map((line) => line.map((p) => projection(p))),
            },
          },
        ]
      : [],
  );
  const cut = await mapshaper.applyCommands(
    `-i rivers.json land.json combine-files ` +
      `-simplify dp planar interval=${RIVER_INTERVAL[detail]} target=rivers ` +
      '-clip land target=rivers -o rivers.json target=rivers',
    {
      'rivers.json': JSON.stringify({ type: 'FeatureCollection', features }),
      'land.json': JSON.stringify({ type: 'FeatureCollection', features: [land] }),
    },
  );
  const pieces = new Map();
  for (const { properties, geometry } of JSON.parse(cut['rivers.json']).features) {
    if (!geometry) continue;
    const lines = lineStrings(geometry)
      .map((line) =>
        line
          .map(([x, y]) => [Math.round(x * QUANTUM), Math.round(y * QUANTUM)])
          .filter((p, k, all) => k === 0 || p[0] !== all[k - 1][0] || p[1] !== all[k - 1][1]),
      )
      .filter((line) => line.length >= 2);
    const river = pieces.get(properties.key) ?? {
      name: properties.name,
      rank: Infinity,
      lines: [],
    };
    river.rank = Math.min(river.rank, properties.rank);
    river.lines.push(...lines);
    pieces.set(properties.key, river);
  }
  // One river, one name: the pieces of one number (the Volga, cut by its reservoirs), and the
  // numbers of one name that touch (the Rhine is three). Two Rio Negro stay two.
  const named = Map.groupBy(pieces.values(), ({ name }) => name);
  const rivers = [...named].flatMap(([name, groups]) =>
    touching(groups).map((group) => [
      name,
      Math.min(...group.map(({ rank }) => rank)),
      deltas(chained(group.flatMap(({ lines }) => lines))),
    ]),
  );
  const points = rivers.reduce((sum, [, , lines]) => sum + lines.flat().length, 0);
  console.log(`${detail} rivers: ${rivers.length}, ${points} points`);
  return rivers;
}

const same = (a, b) => a[0] === b[0] && a[1] === b[1];
const endsOf = ({ lines }) => lines.flatMap((line) => [line[0], line.at(-1)]);

/** The groups of lines that share an end, gathered. */
function touching(groups) {
  const out = [];
  for (const group of groups) {
    const met = out.filter((gathered) =>
      gathered.some((other) => endsOf(other).some((a) => endsOf(group).some((b) => same(a, b)))),
    );
    for (const gathered of met) out.splice(out.indexOf(gathered), 1);
    out.push([group, ...met.flat()]);
  }
  return out;
}

/** Lines laid end to end wherever two share an end, reversed as needed. */
function chained(lines) {
  const out = lines.map((line) => [...line]);
  const join = (a, b) =>
    same(a.at(-1), b[0])
      ? [...a, ...b.slice(1)]
      : same(a.at(-1), b.at(-1))
        ? [...a, ...b.toReversed().slice(1)]
        : same(a[0], b[0])
          ? [...a.toReversed(), ...b.slice(1)]
          : null;
  for (let i = 0; i < out.length; i++)
    for (let j = i + 1; j < out.length; j++) {
      const joined = join(out[i], out[j]) ?? join(out[j], out[i]);
      if (joined === null) continue;
      out[i] = joined;
      out.splice(j, 1);
      j = i;
    }
  return out;
}

/** The land of one level, lakes out, as one GeoJSON feature in sheet units. */
function landOf(decoded, detail) {
  const ring = (points) => {
    const pairs = [];
    for (let i = 0; i < points.length; i += 2) pairs.push([points[i], points[i + 1]]);
    return [...pairs, pairs[0]];
  };
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'MultiPolygon',
      coordinates: [...decoded.shapes(() => 'land', detail).values()]
        .flat()
        .map(({ outer, holes }) => [ring(outer), ...holes.map(ring)]),
    },
  };
}

atlas.rivers = await riversOf(
  'far',
  ({ scalerank }) => scalerank <= RIVER_RANKS.far,
  landOf(decodeAtlas(atlas), 'far'),
);
near.rivers = await riversOf(
  'near',
  ({ scalerank, name }) => scalerank <= RIVER_RANKS.near || FRONT_RIVERS.has(name),
  landOf(decodeAtlas(atlas, near), 'near'),
);

/**
 * **Les mers et les océans** (#457) : océans, mers, golfes, baies, canaux, détroits et sounds de
 * rang ≤ 4, sous leur `name_fr`, les entités d'un même nom réunies (Atlantique Nord et Sud). Each
 * sea keeps up to six points inside it, 25 u apart at least, each with the radius of the water
 * there, up to the nearest land of the far level (the sea's border with its neighbours is no
 * shore): the map writes the name only where that disc spans it. Across the
 * antimeridian, the points come from the largest projected piece. @a-mesurer
 */
const SEA_CLASSES = new Set(['ocean', 'sea', 'gulf', 'bay', 'channel', 'strait', 'sound']);
const SEA_RANK = 4;
const SEA_MIN_RADIUS = 0.5;
const SEA_SPOTS = 6;
const SEA_APART = 25;
/**
 * Where `name_fr` is wrong, keyed by the GeoJSON's `name`. The Seto inland sea plays no part
 * today: its widest water is under `SEA_MIN_RADIUS`, so it is left out. The guard keeps it from
 * coming in under a Scottish name if the radius or the rank ever lets it in.
 */
const SEA_NAMES = {
  'Inner Sea': 'mer intérieure de Seto', // NAME_FR « Mers intérieures de la côte occidentale de l'Écosse »
};

/** The far level's land, for the seas' radii: its shores in cells of `SHORE_CELL` u. */
const SHORE_CELL = 2;
const seaAtlas = decodeAtlas(atlas);
const shores = new Map();
for (const polygon of landOf(seaAtlas, 'far').geometry.coordinates)
  for (const ring of polygon)
    for (let i = 1; i < ring.length; i++) {
      const [a, b] = [ring[i - 1], ring[i]];
      const cell = (v) => Math.floor(v / SHORE_CELL);
      for (let x = cell(Math.min(a[0], b[0])); x <= cell(Math.max(a[0], b[0])); x++)
        for (let y = cell(Math.min(a[1], b[1])); y <= cell(Math.max(a[1], b[1])); y++) {
          const key = `${x},${y}`;
          if (!shores.has(key)) shores.set(key, []);
          shores.get(key).push([a, b]);
        }
    }
const segmentDistance = (x, y, [[ax, ay], [bx, by]]) => {
  const l = (bx - ax) ** 2 + (by - ay) ** 2;
  const t = l ? Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / l)) : 0;
  return Math.hypot(x - ax - t * (bx - ax), y - ay - t * (by - ay));
};
/** How far the nearest land lies, 0 on land: the rings of cells around the point, out until no
 *  cell further can hold a nearer shore. A segment is filed in every cell its box covers. */
function waterRadius(x, y) {
  if (seaAtlas.regionAt([x, y], 'far') !== null) return 0;
  const [cx, cy] = [Math.floor(x / SHORE_CELL), Math.floor(y / SHORE_CELL)];
  let least = Infinity;
  for (let k = 0; k < 200 && least > (k - 1) * SHORE_CELL; k++)
    for (let i = cx - k; i <= cx + k; i++)
      for (let j = cy - k; j <= cy + k; j++) {
        if (Math.max(Math.abs(i - cx), Math.abs(j - cy)) !== k) continue;
        for (const segment of shores.get(`${i},${j}`) ?? [])
          least = Math.min(least, segmentDistance(x, y, segment));
      }
  return least;
}

/** The points inside one projected polygon with the radius of the water there, polylabel's
 *  best and a grid's. */
function seaCandidates(polygon) {
  const segments = polygon.flatMap((ring) => ring.slice(1).map((b, i) => [ring[i], b]));
  const inside = (x, y) => {
    let odd = false;
    for (const [[ax, ay], [bx, by]] of segments)
      if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) odd = !odd;
    return odd;
  };
  const best = polylabel(polygon, 0.01);
  const out = [[best[0], best[1], waterRadius(best[0], best[1])]];
  const [xs, ys] = [0, 1].map((k) => polygon[0].map((point) => point[k]));
  const [left, right, top, bottom] = [
    Math.min(...xs),
    Math.max(...xs),
    Math.min(...ys),
    Math.max(...ys),
  ];
  const step = Math.max(0.25, Math.min(2, (right - left) / 20));
  for (let x = left; x <= right; x += step)
    for (let y = top; y <= bottom; y += step) if (inside(x, y)) out.push([x, y, waterRadius(x, y)]);
  return out;
}

const seaGroups = new Map();
for (const { properties, geometry } of JSON.parse(seaSource.toString('utf8')).features) {
  if (!SEA_CLASSES.has(properties.featurecla) || properties.scalerank > SEA_RANK) continue;
  const name = SEA_NAMES[properties.name] ?? properties.name_fr;
  if (!name) continue;
  const parts = (geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates).map(
    (polygon) => polygon.map((ring) => ring.map((point) => projection(point))),
  );
  const areaOfRing = (ring) =>
    Math.abs(ring.slice(1).reduce((sum, [x, y], i) => sum + ring[i][0] * y - x * ring[i][1], 0)) /
    2;
  const areaOfPart = ([outer, ...holes]) =>
    areaOfRing(outer) - holes.reduce((sum, hole) => sum + areaOfRing(hole), 0);
  const largest = parts.reduce((a, b) => (areaOfPart(b) > areaOfPart(a) ? b : a));
  const group = seaGroups.get(name) ?? { rank: Infinity, candidates: [] };
  group.rank = Math.min(group.rank, properties.scalerank);
  group.candidates.push(...seaCandidates(largest));
  seaGroups.set(name, group);
}
const seas = [...seaGroups].flatMap(([name, { rank, candidates }]) => {
  const spots = [];
  for (const spot of candidates
    .filter(([, , r]) => r >= SEA_MIN_RADIUS)
    .toSorted((a, b) => b[2] - a[2])) {
    if (spots.length === SEA_SPOTS) break;
    if (spots.every(([x, y]) => Math.hypot(x - spot[0], y - spot[1]) >= SEA_APART))
      spots.push(spot);
  }
  return spots.length === 0 ? [] : [{ name, rank, spots }];
});
console.log(
  `${seaGroups.size} seas, ${seas.length} wide enough, ${seas.reduce((sum, { spots }) => sum + spots.length, 0)} spots`,
);
/** `[name, rank, [lon, lat, radius][]]`, × 100: the ranks first, then the widest. */
atlas.seas = seas
  .toSorted((a, b) => a.rank - b.rank || b.spots[0][2] - a.spots[0][2])
  .map(({ name, rank, spots }) => [
    name,
    rank,
    spots.map(([x, y, radius]) => [
      ...projection.invert([x, y]).map((degrees) => Math.round(degrees * 100)),
      Math.round(radius * 100),
    ]),
  ]);

// ---------- 5. Outputs and the id diff ----------

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
