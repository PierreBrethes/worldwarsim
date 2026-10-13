/**
 * Classifies the regions of `public/regions.json` against the terrain rasters (ETOPO relief,
 * Köppen-Geiger climate, Hansen forest cover) and bakes `public/region-types.json`:
 * `{ [type]: regionId[] }`, the plain regions included. Decoration only — no rule reads it.
 * The rasters live outside the repository; their SHA-256 are checked below. The contours are read
 * back from the asset, the interior points from `region-index.json`.
 *
 * Usage: node scripts/generate-region-types.mjs <terrain-dir> — also chained at the end of
 * generate-world.mjs when given `--terrain <terrain-dir>`.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { projectLonLat } from '../src/domain/routing.ts';
import {
  classifyRegions,
  readEsriAscii,
  readKoppenZipMember,
  readNetcdf3,
  sideBySide,
} from './region-terrain.mjs';

/** Two machines baking from two different sources must not find out at review. */
const SOURCES = {
  'etopo-west.asc': 'a6dd4ab319cb028abde4785868783a78a5dd0f34a71fce5c474da23054eee710',
  'etopo-east.asc': '11cce27e1a677dda513077a573612b60c1566bda96f9f627aea85933cfc3ef30',
  'koppen-0p1.zipmember': 'fd3d45d40a66951dab26268b945a7eff45374983a72be0e8fa12de01415ff9c2',
  'hansen_2000_forestcover_025deg.nc':
    'e6b983efa9818b8bf1db10986a7dd07af10c64670a92559298c6342825e34434',
};

const WIDTH = 400;
const flag = process.argv.indexOf('--terrain');
const terrainDir = flag >= 0 ? process.argv[flag + 1] : process.argv[2];
if (terrainDir === undefined) {
  console.error('usage: node scripts/generate-region-types.mjs <terrain-dir>');
  process.exit(1);
}

const started = performance.now();
const source = {};
for (const [name, expected] of Object.entries(SOURCES)) {
  try {
    source[name] = readFileSync(`${terrainDir}/${name}`);
  } catch {
    throw new Error(
      `${terrainDir}/${name} is missing — sources are listed in ` +
        'WWS/docs/design/propositions/classification-regions.md (section "Les téléchargements")',
    );
  }
  const actual = createHash('sha256').update(source[name]).digest('hex');
  if (actual !== expected) throw new Error(`${name}: SHA-256 ${actual}, expected ${expected}`);
}
const rasters = {
  relief: sideBySide(
    readEsriAscii(source['etopo-west.asc'].toString('latin1')),
    readEsriAscii(source['etopo-east.asc'].toString('latin1')),
  ),
  climate: readKoppenZipMember(source['koppen-0p1.zipmember']),
  forest: readNetcdf3(source['hansen_2000_forestcover_025deg.nc'], 'band_data'),
};
const read = performance.now();

const world = JSON.parse(readFileSync('public/world.json', 'utf8'));
const regionsAsset = JSON.parse(readFileSync('public/regions.json', 'utf8'));
const index = JSON.parse(readFileSync('public/region-index.json', 'utf8'));
const { sphere, outline } = world.meta;

/** The same guard as `generate-region-grid.mjs`: a degenerate islet projected as the whole frame. */
const isProjectionFrame = (ring) => {
  const xs = ring.map(([x]) => x);
  const ys = ring.map(([, y]) => y);
  return (
    Math.max(...xs) - Math.min(...xs) > WIDTH * 0.9 &&
    Math.max(...ys) - Math.min(...ys) > sphere.maxY * 0.9
  );
};

const regions = regionsAsset.regions.map((region) => ({
  id: region.id,
  rings: region.p.filter((ring) => !isProjectionFrame(ring)),
  point: index.point[region.id],
}));
const types = classifyRegions(regions, rasters, {
  project: (lon, lat) => projectLonLat(outline, sphere, [lon, lat]),
  width: WIDTH,
});
const byType = {};
for (const [id, type] of types) (byType[type] ??= []).push(id);
writeFileSync('public/region-types.json', JSON.stringify(byType));

const counts = {};
for (const type of types.values()) counts[type] = (counts[type] ?? 0) + 1;
console.log(
  `${regions.length} regions\n` +
    Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => `${type} ${count}`)
      .join(' · ') +
    `\nrasters ${((read - started) / 1000).toFixed(1)} s, ` +
    `classification ${((performance.now() - read) / 1000).toFixed(1)} s`,
);
