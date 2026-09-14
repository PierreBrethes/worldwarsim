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
 * Vienna inside Lower Austria): their outer boundary was unshared, and without the coastline
 * check they would all come out as ports.
 *
 * **Le trou est l'autre moitié de la réponse, et il n'est cuit que depuis le 14/09.**
 * `generate-regions.mjs` ne gardait que l'anneau extérieur de chaque polygone jusqu'à
 * `cb42ae3` (09/09) ; l'enclave était donc bordée d'un côté seulement et le contrôle de
 * littoral restait seul à la retenir — il en laissait passer neuf, Séoul et Taipei comprises,
 * dont le pourtour frôle une côte sans la toucher. Les trous partagent désormais l'arête, et
 * les deux passes disent la même chose.
 *
 * **The point is a pole of inaccessibility, un-projected** — the same treatment the world gives
 * a country. It is what turns a region into a distance: an outpost's reach is measured in
 * kilometres from point to point (ADR 0015), never in regions, and a movement leaves from the
 * point of the region its barracks stands on. A centroid would fall in the sea off Norway; the
 * pole of inaccessibility stays inside the shape.
 *
 * It also bakes `public/country-names.json`, the French name of every country the game can
 * show — 251 codes against the eight nations that have a hand-written label. The names come
 * from CLDR at bake time, so nothing translates at run time and no code ever reaches a screen.
 *
 * Usage: node scripts/generate-region-index.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { geoNaturalEarth1 } from 'd3-geo';
import isoCountries from 'i18n-iso-countries';
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

/**
 * **The Natural Earth → ISO bridge, checked from the other side.** `generate-world.mjs` keys its
 * nine hand-written codes by English name: rename one upstream and the five that ISO codes
 * nowhere fail loudly, but the four Natural Earth codes differently — `SDS`, `SAH`, `PSX`,
 * `ALD` — fall back on the ISO code without a word, and the world then carries a code no region
 * answers to. A host read off a polygon would name a country the index has never heard of.
 *
 * A defect of data is repaired once, here, and never discovered mid-season.
 */
const carried = new Set(Object.values(country));
const unbridged = [...new Set(world.countries.map((entry) => entry.a))].filter(
  (code) => !carried.has(code),
);
if (unbridged.length > 0) {
  throw new Error(`codes of world.json no region carries: ${unbridged.join(', ')}`);
}

const output = { name, country, coastal, point };
writeFileSync('public/region-index.json', JSON.stringify(output));

const size = (JSON.stringify(output).length / 1024).toFixed(0);
console.log(`${Object.keys(country).length} regions, ${coastal.length} coastal, ${size} Ko`);

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

/** Everything the screen can name: the countries the map draws, and those only regions reach. */
const codes = [
  ...new Set([...world.countries.map((entry) => entry.a), ...Object.values(country)]),
].sort();

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
