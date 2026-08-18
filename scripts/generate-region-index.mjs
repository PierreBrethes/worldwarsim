/**
 * Bakes `public/region-index.json` — the four facts the **server** needs about a region, and
 * nothing else: its name, the country it belongs to, whether it touches the sea, and the
 * lon/lat point where anything put on it stands.
 *
 * `regions.json` cannot answer them on the server: it weighs 2.5 MB of polygons because it
 * exists for the map, and the Convex bundle has no business carrying geometry to decide that
 * a port may not be built in Auvergne. This file is that answer, stripped to what a rule
 * reads — under 200 Ko, imported straight into the bundle next to `deposits.json`.
 *
 * **The coast is derived, never judged.** An edge that belongs to a single admin-1 region is
 * an outer boundary of the whole layer; it is maritime when its midpoint falls close to a
 * country outline that is itself shared with no other country — the same test, one level up,
 * on `world.json`. The second pass is what rules out enclaves (Berlin inside Brandenburg,
 * Vienna inside Lower Austria): their outer boundary is unshared, because a hole in the
 * surrounding region's ring is dropped at bake time, and without the coastline check they
 * would all come out as ports.
 *
 * **The point is a pole of inaccessibility, un-projected** — the same treatment the world gives
 * a country. It is what turns a region into a distance: an outpost's reach is measured in
 * kilometres from point to point (ADR 0015), never in regions, and a movement leaves from the
 * point of the region its barracks stands on. A centroid would fall in the sea off Norway; the
 * pole of inaccessibility stays inside the shape.
 *
 * Usage: node scripts/generate-region-index.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { geoNaturalEarth1 } from 'd3-geo';
import polylabel from 'polylabel';

/**
 * How far a region edge may sit from a coastline edge and still be the same shore. The two
 * files are simplified separately — 10m for the regions, 50m for the world — so the shores
 * never superpose exactly. 0.6 unit is about sixty kilometres at the equator: wide enough to
 * absorb the mismatch, narrow enough that no inland border reaches the sea.
 */
const COAST_TOLERANCE = 0.6;
const CELL = 1;

/** The frame `generate-world.mjs` and `generate-regions.mjs` project into. Reading it back is
 *  what lets a projected ring answer in lon/lat. */
const WIDTH = 400;
const HEIGHT = 208;

const world = JSON.parse(readFileSync('public/world.json', 'utf8'));
const raw = JSON.parse(readFileSync('public/regions.json', 'utf8'));

const edgeKey = (a, b) => {
  const first = `${a[0]},${a[1]}`;
  const second = `${b[0]},${b[1]}`;
  return first < second ? `${first}|${second}` : `${second}|${first}`;
};

function countEdges(shapes) {
  const counts = new Map();
  for (const rings of shapes) {
    for (const ring of rings) {
      for (let i = 1; i < ring.length; i++) {
        const key = edgeKey(ring[i - 1], ring[i]);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
  }
  return counts;
}

const worldEdges = countEdges(world.countries.map((country) => country.p));
const shore = new Map();
for (const country of world.countries) {
  for (const ring of country.p) {
    for (let i = 1; i < ring.length; i++) {
      if (worldEdges.get(edgeKey(ring[i - 1], ring[i])) !== 1) continue;
      for (const point of [ring[i - 1], ring[i]]) {
        const cell = `${Math.floor(point[0] / CELL)}:${Math.floor(point[1] / CELL)}`;
        const bucket = shore.get(cell);
        if (bucket) bucket.push(point);
        else shore.set(cell, [point]);
      }
    }
  }
}

const nearShore = (x, y) => {
  const cellX = Math.floor(x / CELL);
  const cellY = Math.floor(y / CELL);
  for (let i = -1; i <= 1; i++) {
    for (let j = -1; j <= 1; j++) {
      for (const point of shore.get(`${cellX + i}:${cellY + j}`) ?? []) {
        if (Math.hypot(point[0] - x, point[1] - y) <= COAST_TOLERANCE) return true;
      }
    }
  }
  return false;
};

const regionEdges = countEdges(raw.regions.map((region) => region.p));

const projection = geoNaturalEarth1().fitExtent(
  [
    [0, 0],
    [WIDTH, HEIGHT],
  ],
  { type: 'Sphere' },
);

const areaOf = (ring) => {
  let twice = 0;
  for (let i = 0; i < ring.length; i++) {
    const [ax, ay] = ring[i];
    const [bx, by] = ring[(i + 1) % ring.length];
    twice += ax * by - bx * ay;
  }
  return Math.abs(twice) / 2;
};

const rounded = (value) => Math.round(value * 100) / 100;

const name = {};
const country = {};
const coastal = [];
const point = {};
for (const region of raw.regions) {
  name[region.id] = region.n;
  country[region.id] = region.country;
  const largest = region.p.reduce((a, b) => (areaOf(a) >= areaOf(b) ? a : b));
  const [lon, lat] = projection.invert(polylabel([largest], 0.5));
  point[region.id] = [rounded(lon), rounded(lat)];
  const touchesSea = region.p.some((ring) =>
    ring.some((point, index) => {
      if (index === 0) return false;
      const previous = ring[index - 1];
      if (regionEdges.get(edgeKey(previous, point)) !== 1) return false;
      return nearShore((previous[0] + point[0]) / 2, (previous[1] + point[1]) / 2);
    }),
  );
  if (touchesSea) coastal.push(region.id);
}

/** A region the server can name but cannot place is a region a rule would refuse to reason
 *  about hours later, without saying why. It fails here instead. */
const pointless = Object.keys(country).filter((id) => !Number.isFinite(point[id]?.[0]));
if (pointless.length > 0) throw new Error(`regions without a point: ${pointless.join(', ')}`);

const output = { name, country, coastal, point };
writeFileSync('public/region-index.json', JSON.stringify(output));

const size = (JSON.stringify(output).length / 1024).toFixed(0);
console.log(`${Object.keys(country).length} regions, ${coastal.length} coastal, ${size} Ko`);
