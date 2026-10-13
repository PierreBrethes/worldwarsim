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
 * Three German Länder are then cut into their Regierungsbezirke (`german-districts.mjs`).
 *
 * Usage: node scripts/generate-regions.mjs <path/to/ne_10m_admin_1_states_provinces.geojson>
 *   <path/to/VG2500_RBZ.shp>
 * (sources: github.com/nvkelso/natural-earth-vector, geojson/ folder; and the BKG's VG2500,
 * daten.gdz.bkg.bund.de/produkte/vg/vg2500/aktuell/, the `utm32s.shape` archive)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { geoNaturalEarth1 } from 'd3-geo';
import { geoProject } from 'd3-geo-projection';
import { feature, mesh } from 'topojson-client';
import { topology } from 'topojson-server';
import { presimplify, quantile, simplify } from 'topojson-simplify';
import polygonClipping from 'polygon-clipping';
import { germanDistricts } from './german-districts.mjs';

const source = process.argv[2];
if (!source) throw new Error('path to the admin-1 geojson required');
const districtSource = process.argv[3];
if (!districtSource) throw new Error('path to VG2500_RBZ.shp required');

const WIDTH = 400;
const HEIGHT = 208;
/** Share of vertices kept after simplification — 0.18 matches the density of the 50m world. */
const VERTEX_SHARE = 0.06;
const MINIMUM_LENGTH = 0.4;

const raw = JSON.parse(readFileSync(source, 'utf8'));
const topo = topology({ regions: raw }, 1e6);
const weighted = presimplify(topo);
const minimumWeight = quantile(weighted, VERTEX_SHARE);
const simplified = simplify(weighted, minimumWeight);
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
  if (geometry.type === 'Polygon') return geometry.coordinates;
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.flatMap((polygon) => polygon);
  return [];
};

const isProjectionFrame = (ring) => {
  const xs = ring.map(([x]) => x);
  const ys = ring.map(([, y]) => y);
  return (
    Math.max(...xs) - Math.min(...xs) > WIDTH * 0.9 &&
    Math.max(...ys) - Math.min(...ys) > HEIGHT * 0.9
  );
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
    .filter((ring) => !isProjectionFrame(ring))
    .map((ring) => ring.map(([x, y]) => [rounded(x), rounded(y)]));
  if (rings.length === 0) continue;
  regions.push({
    id: identify(properties, fallbacks),
    country: properties.adm0_a3,
    n: name,
    p: rings,
  });
}

/**
 * **A Land is cut after the world is simplified, never before.** The simplification threshold
 * is a quantile of every vertex on Earth, and a district border joining the topology would
 * shift it and nudge every coastline; a junction landing on a Land's outline would also split
 * the arc it shares with its neighbours. Cut afterwards, inside the outline already drawn, the
 * rest of the file comes out byte for byte — the neighbours, Austria and Switzerland included,
 * do not move a vertex.
 *
 * The districts are simplified with the world's own threshold, so their borders carry the
 * density of the outline around them. VG2500 and Natural Earth disagree on that outline by a
 * kilometre or so: what falls outside the districts goes to the district that borders it most.
 */
const cutIntoDistricts = (land, districts) => {
  const outline = polygonClipping.xor(...land.p.map((ring) => [ring]));
  // Disjoint by construction: VG2500 leaves a few district borders unshared by a hair, which
  // the simplification then pulls apart — first come keeps the overlap.
  const pieces = [];
  for (const district of districts) {
    const shape = polygonClipping.intersection(outline, district.shape);
    const taken = pieces.map((piece) => piece.shape);
    pieces.push({ district, shape: polygonClipping.difference(shape, ...taken) });
  }
  const strays = polygonClipping.difference(outline, ...pieces.map(({ shape }) => shape));
  for (const piece of pieces) {
    const [main, ...fragments] = piece.shape.toSorted((a, b) => areaOf(b) - areaOf(a));
    piece.shape = main ? [main] : [];
    strays.push(...fragments);
  }
  const claims = pieces.map(() => []);
  for (const stray of strays) {
    const votes = pieces.map((piece) => bordering(stray[0], piece.shape));
    claims[votes.indexOf(Math.max(...votes))].push(stray);
  }
  const merged = pieces.map((piece, i) =>
    polygonClipping.union(piece.shape, ...claims[i]).flatMap((polygon) => polygon),
  );
  /**
   * Where VG2500 crossed the outline, the pieces keep a vertex lying on one of its edges.
   * Rounded, it would step off the edge the neighbouring Land still draws straight — a sliver
   * of gap on one side, of overlap on the other. Only a junction of two districts keeps its
   * vertex there: it is where an inner border ends.
   */
  // Two clippings can land the same junction a few ulps apart, hence the snapped key.
  const key = ([x, y]) => `${x.toFixed(6)},${y.toFixed(6)}`;
  const outlineVertices = new Set(land.p.flat().map(key));
  const holders = new Map();
  merged.forEach((rings, owner) => {
    for (const point of rings.flat()) {
      holders.set(key(point), (holders.get(key(point)) ?? new Set()).add(owner));
    }
  });
  const onOutline = (point) =>
    land.p.some((ring) =>
      ring.some((end, j) => j > 0 && distanceToSegment(point, ring[j - 1], end) < 1e-9),
    );
  const strayVertex = (point) =>
    !outlineVertices.has(key(point)) && holders.get(key(point)).size < 2 && onOutline(point);
  return pieces.map((piece, i) => ({
    id: piece.district.id,
    country: land.country,
    n: piece.district.name,
    p: merged[i]
      .map((ring) => {
        const kept = ring.slice(0, -1).filter((point) => !strayVertex(point));
        return withoutRepeats([...kept, kept[0]].map(([x, y]) => [rounded(x), rounded(y)]));
      })
      .filter((ring) => ring.length >= 4),
  }));
};

const areaOf = (polygon) => {
  let sum = 0;
  for (const ring of polygon) {
    let ringSum = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      ringSum += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
    }
    sum += Math.abs(ringSum / 2) * (ring === polygon[0] ? 1 : -1);
  }
  return sum;
};

const distanceToSegment = ([px, py], [ax, ay], [bx, by]) => {
  const length = (bx - ax) ** 2 + (by - ay) ** 2;
  const t =
    length === 0
      ? 0
      : Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / length));
  return Math.hypot(px - ax - t * (bx - ax), py - ay - t * (by - ay));
};

/** How much of a stray's outline runs along a piece — the length of its edges whose midpoint touches it. */
const bordering = (ring, shape) => {
  let shared = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const middle = [(ring[i][0] + ring[i + 1][0]) / 2, (ring[i][1] + ring[i + 1][1]) / 2];
    const touches = shape.some((polygon) =>
      polygon.some((other) =>
        other.some((point, j) => j > 0 && distanceToSegment(middle, other[j - 1], point) < 1e-6),
      ),
    );
    if (touches) shared += Math.hypot(ring[i + 1][0] - ring[i][0], ring[i + 1][1] - ring[i][1]);
  }
  return shared;
};

const withoutRepeats = (ring) =>
  ring.filter((point, i) => i === 0 || point[0] !== ring[i - 1][0] || point[1] !== ring[i - 1][1]);

/**
 * The inner borders, read back from the pieces themselves: an edge two districts both carry.
 * Taken from the VG2500 mesh instead, they would stop a kilometre short of an outline they
 * were never drawn against.
 */
const innerLinesOf = (pieces) => {
  const key = ([x, y]) => `${x},${y}`;
  const owners = new Map();
  pieces.forEach((piece, owner) => {
    for (const ring of piece.p) {
      for (let i = 0; i < ring.length - 1; i++) {
        const edge = [key(ring[i]), key(ring[i + 1])].sort().join('|');
        owners.set(edge, (owners.get(edge) ?? new Set()).add(owner));
      }
    }
  });
  const neighbours = new Map();
  for (const [edge, by] of owners) {
    if (by.size < 2) continue;
    const [a, b] = edge.split('|');
    neighbours.set(a, [...(neighbours.get(a) ?? []), b]);
    neighbours.set(b, [...(neighbours.get(b) ?? []), a]);
  }
  const point = (text) => text.split(',').map(Number);
  const walked = new Set();
  const edgeKey = (a, b) => [a, b].sort().join('|');
  const walk = (from, to) => {
    const path = [from, to];
    walked.add(edgeKey(from, to));
    for (let at = to; neighbours.get(at).length === 2;) {
      const next = neighbours.get(at).find((other) => !walked.has(edgeKey(at, other)));
      if (!next) break;
      walked.add(edgeKey(at, next));
      path.push(next);
      at = next;
    }
    return path.map(point);
  };
  const paths = [];
  const ends = [...neighbours.keys()].filter((at) => neighbours.get(at).length !== 2);
  for (const start of ends) {
    for (const next of neighbours.get(start)) {
      if (!walked.has(edgeKey(start, next))) paths.push(walk(start, next));
    }
  }
  for (const [start, nexts] of neighbours) {
    for (const next of nexts) if (!walked.has(edgeKey(start, next))) paths.push(walk(start, next));
  }
  return paths;
};

const districtTopology = presimplify(topology({ districts: germanDistricts(districtSource) }, 1e6));
const districtsByLand = new Map();
for (const district of feature(
  simplify(districtTopology, minimumWeight),
  districtTopology.objects.districts,
).features) {
  const projected = geoProject(district, projection).geometry;
  const polygons = projected.type === 'Polygon' ? [projected.coordinates] : projected.coordinates;
  const shape = polygons.map((polygon) =>
    polygon.map((ring) => ring.map(([x, y]) => [rounded(x), rounded(y)])),
  );
  const { id, land, name } = district.properties;
  districtsByLand.set(land, [...(districtsByLand.get(land) ?? []), { id, name, shape }]);
}
for (const [landId, districts] of districtsByLand) {
  const at = regions.findIndex((region) => region.id === landId);
  if (at === -1) throw new Error(`no region ${landId} to cut into districts`);
  const pieces = cutIntoDistricts(
    regions[at],
    districts.toSorted((a, b) => (a.id < b.id ? -1 : 1)),
  );
  regions.splice(at, 1, ...pieces);
  // No MINIMUM_LENGTH here: it sweeps simplification debris off the world mesh, and a border
  // read back from two pieces is never debris — Kassel and Darmstadt touch over twenty km.
  lines.push(...innerLinesOf(pieces));
}

if (fallbacks.length > 0)
  console.warn(`${fallbacks.length} fallback ids:\n  ${fallbacks.join('\n  ')}`);

const duplicates = [
  ...regions.reduce(
    (counts, region) => counts.set(region.id, (counts.get(region.id) ?? 0) + 1),
    new Map(),
  ),
]
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
console.warn(
  'regions.json rewritten: re-run `node scripts/generate-region-types.mjs <terrain-dir>` to bake region-types.json again.',
);
console.log(
  `${lines.length} lines (${points} pts), ${regions.length} regions (${regionPoints} pts), ${(JSON.stringify(output).length / 1024).toFixed(0)} Ko`,
);
