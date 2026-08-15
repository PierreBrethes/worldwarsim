/**
 * Extracts the admin-1 borders (regions, states, departments…) of Natural Earth 10m into
 * `public/regions.json`, in the same projection as `world.json`.
 *
 * Only the **inner borders** are kept — the segments shared by two regions (`mesh` with
 * `a !== b`). Coastlines and country borders are already drawn by the map: redrawing them
 * here would double every stroke with a slight simplification mismatch, visible as a
 * doubled line when zoomed in.
 *
 * The 10m set is the only complete one (50m covers big countries only — France has no
 * region there), simplified here down to a density comparable to the 50m world.
 *
 * Usage: node scripts/generate-regions.mjs <path/to/ne_10m_admin_1_states_provinces.geojson>
 * (source: github.com/nvkelso/natural-earth-vector, geojson/ folder)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { geoNaturalEarth1 } from 'd3-geo';
import { geoProject } from 'd3-geo-projection';
import { feature, mesh } from 'topojson-client';
import { topology } from 'topojson-server';
import { presimplify, quantile, simplify } from 'topojson-simplify';

const source = process.argv[2];
if (!source) throw new Error('path to the admin-1 geojson required');

const WIDTH = 400;
const HEIGHT = 208;
/** Share of vertices kept after simplification — 0.18 matches the density of the 50m world. */
const VERTEX_SHARE = 0.06;
const MINIMUM_LENGTH = 0.4;

const raw = JSON.parse(readFileSync(source, 'utf8'));
const topo = topology({ regions: raw }, 1e6);
const weighted = presimplify(topo);
const simplified = simplify(weighted, quantile(weighted, VERTEX_SHARE));
const inner = mesh(simplified, simplified.objects.regions, (a, b) => a !== b);

const projection = geoNaturalEarth1().fitExtent(
  [
    [0, 0],
    [WIDTH, HEIGHT],
  ],
  { type: 'Sphere' },
);
const projectedInner = geoProject(inner, projection);

const rounded = (value) => Math.round(value * 100) / 100;
const lines = [];
for (const line of projectedInner.coordinates) {
  const points = line.map(([x, y]) => [rounded(x), rounded(y)]);
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    length += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  }
  if (points.length >= 2 && length >= MINIMUM_LENGTH) lines.push(points);
}

/**
 * The polygons serve the hover (point-in-region, highlight). They come out of the same
 * simplified topology as the lines: same arcs, so the highlight hugs the strokes.
 */
const ringsOf = (geometry) => {
  if (!geometry) return [];
  if (geometry.type === 'Polygon') return [geometry.coordinates[0]];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.map((polygon) => polygon[0]);
  return [];
};

/**
 * `adm1_code` is the only field unique across the whole 10m set — admin-1 names repeat from
 * one country to the next ("Distrito Federal" exists in Mexico, Brazil, Venezuela…), so a
 * name cannot key a deposit. The fallbacks never fire on the current Natural Earth release;
 * they are logged rather than silent so a future release cannot degrade the key unnoticed.
 */
const identify = (properties, fallbacks) => {
  if (properties.adm1_code) return properties.adm1_code;
  if (properties.iso_3166_2) {
    fallbacks.push(`${properties.name}: iso_3166_2`);
    return properties.iso_3166_2;
  }
  fallbacks.push(`${properties.name}: country + name`);
  return `${properties.adm0_a3}-${properties.name}`;
};

const regions = [];
const fallbacks = [];
for (const region of feature(simplified, simplified.objects.regions).features) {
  const properties = region.properties ?? {};
  const name = properties.name;
  if (!name) continue;
  const projectedRegion = geoProject(region, projection);
  const rings = ringsOf(projectedRegion?.geometry)
    .filter((ring) => ring && ring.length >= 4)
    .map((ring) => ring.map(([x, y]) => [rounded(x), rounded(y)]));
  if (rings.length === 0) continue;
  regions.push({ id: identify(properties, fallbacks), country: properties.adm0_a3, n: name, p: rings });
}

if (fallbacks.length > 0) console.warn(`${fallbacks.length} fallback ids:\n  ${fallbacks.join('\n  ')}`);

const duplicates = [...regions.reduce((counts, region) => counts.set(region.id, (counts.get(region.id) ?? 0) + 1), new Map())]
  .filter(([, count]) => count > 1)
  .map(([id]) => id);
if (duplicates.length > 0) throw new Error(`duplicate region ids: ${duplicates.join(', ')}`);

const output = { lines, regions };
writeFileSync('public/regions.json', JSON.stringify(output));
const points = lines.reduce((sum, line) => sum + line.length, 0);
const regionPoints = regions.reduce(
  (sum, region) => sum + region.p.reduce((s, ring) => s + ring.length, 0),
  0,
);
console.log(
  `${lines.length} lines (${points} pts), ${regions.length} regions (${regionPoints} pts), ${(JSON.stringify(output).length / 1024).toFixed(0)} Ko`,
);
