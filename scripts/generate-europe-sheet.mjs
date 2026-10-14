/**
 * Bakes `public/europe-sheet.json` — the Europe–Mediterranean sheet of the public front page
 * (`src/routes/-index/`), cut out of `public/world.json` so a visitor does not download the
 * whole world for the one sheet the page shows.
 *
 * The rings keep the world's own projected coordinates: the page builds a `WorldFrame` from the
 * same `sphere` and `outline`, and places, the night and the pieces land where the board puts
 * them. Each ring is clipped to the box and a margin, at a hundredth of a unit, points closer
 * than `MIN_STEP` merged.
 *
 * Usage: node scripts/generate-europe-sheet.mjs — also chained at the end of generate-world.mjs.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import polygonClipping from 'polygon-clipping';
import { projectLonLat } from '../src/domain/routing.ts';

const LONGITUDES = [-18, 58];
const LATITUDES = [24, 72];
/** The sheet's straight edges are read at this latitude: the world narrows toward the pole. */
const EDGE_LATITUDE = 48;
const MARGIN = 3;
const MIN_STEP = 0.06;

const asset = JSON.parse(readFileSync('public/world.json', 'utf8'));
const { sphere, outline } = asset.meta;
const at = (lonLat) => projectLonLat(outline, sphere, lonLat);

const [x0] = at([LONGITUDES[0], EDGE_LATITUDE]);
const [x1] = at([LONGITUDES[1], EDGE_LATITUDE]);
const [, y0] = at([0, LATITUDES[1]]);
const [, y1] = at([0, LATITUDES[0]]);
const round = (value) => Math.round(value * 100) / 100;
const frame = [
  [
    [x0 - MARGIN, y0 - MARGIN],
    [x1 + MARGIN, y0 - MARGIN],
    [x1 + MARGIN, y1 + MARGIN],
    [x0 - MARGIN, y1 + MARGIN],
    [x0 - MARGIN, y0 - MARGIN],
  ],
];

const countries = [];
for (const country of asset.countries) {
  const rings = [];
  for (const ring of country.p)
    for (const [clipped] of polygonClipping.intersection([ring], frame)) {
      const kept = [];
      let last = null;
      for (const [x, y] of clipped) {
        if (last && Math.hypot(x - last[0], y - last[1]) < MIN_STEP) continue;
        kept.push([round(x), round(y)]);
        last = [x, y];
      }
      if (kept.length > 3) rings.push(kept);
    }
  if (rings.length) countries.push({ a: country.a, p: rings });
}

const sheet = {
  box: { x0: round(x0), x1: round(x1), y0: round(y0), y1: round(y1) },
  sphere,
  outline,
  countries,
};
const json = JSON.stringify(sheet);
writeFileSync('public/europe-sheet.json', json);
console.log(`europe-sheet.json: ${countries.length} countries, ${json.length} bytes`);
