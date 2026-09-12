/**
 * Rebuilds `public/world.json` from world-atlas (Natural Earth), projected in
 * Natural Earth 1 over a 400×208 unit sphere.
 *
 * `geoProject` walks the d3 stream, which cuts the antimeridian correctly — projecting
 * point by point would produce a Russia stretched across the whole map.
 * The representative point is an approximate pole of inaccessibility (polylabel), not a
 * centroid: the centroid puts France in Spain and Japan out at sea.
 *
 * Usage: node scripts/generate-world.mjs [--detail 50m|110m]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { geoNaturalEarth1 } from 'd3-geo';
import isoCountries from 'i18n-iso-countries';
import { geoProject } from 'd3-geo-projection';
import polylabel from 'polylabel';
import { feature } from 'topojson-client';

const require = createRequire(import.meta.url);
const detail = process.argv.includes('--detail')
  ? process.argv[process.argv.indexOf('--detail') + 1]
  : '50m';

const WIDTH = 400;
const HEIGHT = 208;
/** In projected units² (1 unit ≈ 111 km): discards rocks too small to be clicked. */
const MINIMUM_RING_AREA = 0.05;

const world = JSON.parse(
  readFileSync(require.resolve(`world-atlas/countries-${detail}.json`), 'utf8'),
);
const projection = geoNaturalEarth1().fitExtent(
  [
    [0, 0],
    [WIDTH, HEIGHT],
  ],
  { type: 'Sphere' },
);

const rounded = (value) => Math.round(value * 100) / 100;

function sphereOutline() {
  const samples = [];
  for (let latitude = -90; latitude <= 90; latitude++) {
    const [westX] = projection([-180, latitude]);
    const [eastX] = projection([180, latitude]);
    const [, y] = projection([0, latitude]);
    samples.push([latitude, rounded(westX), rounded(eastX), rounded(y)]);
  }
  return samples;
}

function areaOf(ring) {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    sum += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return Math.abs(sum / 2);
}

/** Outer rings only: the holes (Lesotho, San Marino…) are countries in their own right. */
function outerRings(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'Polygon') return [geometry.coordinates[0]];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.map((polygon) => polygon[0]);
  return [];
}

function withoutClosingPoint(ring) {
  const [first, last] = [ring[0], ring[ring.length - 1]];
  return first[0] === last[0] && first[1] === last[1] ? ring.slice(0, -1) : ring;
}

/** Unplayable, no neutral country nor outpost possible: its visual mass buys nothing. */
const EXCLUDED_COUNTRIES = new Set(['Antarctica']);

/**
 * **The bridge between the map and the code.** Everything else in the game keys a country by
 * its Natural Earth `adm0_a3` — the server, the regions, the outposts — while world-atlas only
 * exposes the ISO numeric id, so the map was the one file naming a country in English and
 * nothing else. The numeric id converts exactly for all but these nine: five carry no ISO code
 * at all, four are coded differently by Natural Earth than by ISO. They are written out because
 * nothing derives them, and a country resolving to neither throws below.
 */
const NATURAL_EARTH_CODE = {
  Somaliland: 'SOL',
  Kosovo: 'KOS',
  'N. Cyprus': 'CYN',
  'Indian Ocean Ter.': 'IOA',
  'Siachen Glacier': 'KAS',
  'S. Sudan': 'SDS',
  'W. Sahara': 'SAH',
  Palestine: 'PSX',
  Åland: 'ALD',
};

const adm0Of = (name, id) =>
  NATURAL_EARTH_CODE[name] ??
  (id === undefined ? undefined : isoCountries.numericToAlpha3(String(id).padStart(3, '0')));

const countries = [];
for (const raw of feature(world, world.objects.countries).features) {
  if (EXCLUDED_COUNTRIES.has(raw.properties?.name)) continue;
  const projected = geoProject(raw, projection);
  const rings = outerRings(projected?.geometry)
    .filter((ring) => ring && ring.length >= 4 && areaOf(ring) >= MINIMUM_RING_AREA)
    .map((ring) => withoutClosingPoint(ring).map(([x, y]) => [rounded(x), rounded(y)]));
  if (rings.length === 0 || !raw.properties?.name) continue;

  const code = adm0Of(raw.properties.name, raw.id);
  if (!code) throw new Error(`country without an adm0_a3: ${raw.properties.name} (id ${raw.id})`);

  const largest = rings.reduce((a, b) => (areaOf(a) >= areaOf(b) ? a : b));
  const representative = polylabel([largest], 0.5);
  const lonLat = projection.invert(representative);
  countries.push({
    n: raw.properties.name,
    a: code,
    c: [rounded(representative[0]), rounded(representative[1])],
    ll: [rounded(lonLat[0]), rounded(lonLat[1])],
    p: rings,
  });
}

const PLAYABLE_NATIONS = [
  'France',
  'United Kingdom',
  'United States of America',
  'Russia',
  'Germany',
  'Japan',
  'Italy',
  'China',
];
for (const name of PLAYABLE_NATIONS) {
  if (!countries.some((candidate) => candidate.n === name)) {
    throw new Error(`playable nation missing from the export: ${name}`);
  }
}

const xs = countries.flatMap((candidate) => candidate.p.flat().map(([x]) => x));
const ys = countries.flatMap((candidate) => candidate.p.flat().map(([, y]) => y));
const output = {
  meta: {
    minX: rounded(Math.min(...xs)),
    maxX: rounded(Math.max(...xs)),
    minY: rounded(Math.min(...ys)),
    maxY: rounded(Math.max(...ys)),
    sphere: { minX: 0, maxX: WIDTH, minY: 0, maxY: HEIGHT },
    outline: sphereOutline(),
  },
  countries,
};

writeFileSync('public/world.json', JSON.stringify(output));
const points = countries.reduce((sum, candidate) => sum + candidate.p.flat().length, 0);
console.log(
  `${countries.length} countries, ${points} points, ${(JSON.stringify(output).length / 1024).toFixed(0)} Ko (${detail})`,
);

/** The routing raster is cut from these very polygons: a new world leaves a stale grid, and the
 *  server reads the grid rather than rebuilding it. One command, the two files. */
await import('./generate-grid.mjs');

/** And the region raster with it — the host channel is cut from these polygons too, and the
 *  server reads no polygon at all any more (ADR 0023). */
await import('./generate-region-grid.mjs');
