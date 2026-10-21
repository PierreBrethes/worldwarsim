/**
 * Bakes `public/europe-sheet.json` — the Europe–Mediterranean sheet of the public front page
 * (`src/routes/-index/`), cut out of the atlas (ADR 0034) so a visitor does not download the
 * whole world for the one sheet the page shows.
 *
 * The rings keep the world's own projected coordinates: the page builds a `WorldFrame` from the
 * same `sphere` and `outline`, and places, the night and the pieces land where the board puts
 * them. Each ring is clipped to the box and a margin, at a hundredth of a unit, points closer
 * than `MIN_STEP` merged.
 *
 * The countries are the atlas's regions merged by country at the `near` level; a lake or an
 * enclave stays a hole, wound against its shore, so the page's non-zero fill leaves it empty.
 *
 * Usage: node scripts/generate-europe-sheet.mjs
 */
import { writeFileSync } from 'node:fs';
import polygonClipping from 'polygon-clipping';
import { projectLonLat } from '../src/domain/routing.ts';
import { countryShapes, frame as mapFrame, pairs } from './atlas-base.mjs';

const LONGITUDES = [-18, 58];
const LATITUDES = [24, 72];
/** The sheet's straight edges are read at this latitude: the world narrows toward the pole. */
const EDGE_LATITUDE = 48;
const MARGIN = 3;
const MIN_STEP = 0.06;

const { sphere, outline } = mapFrame;
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
for (const [adm0, shapes] of countryShapes()) {
  const rings = [];
  for (const { outer, holes } of shapes)
    for (const polygon of polygonClipping.intersection([[outer, ...holes].map(pairs)], frame))
      for (const clipped of polygon) {
        const kept = [];
        let last = null;
        for (const [x, y] of clipped) {
          if (last && Math.hypot(x - last[0], y - last[1]) < MIN_STEP) continue;
          kept.push([round(x), round(y)]);
          last = [x, y];
        }
        if (kept.length > 3) rings.push(kept);
      }
  if (rings.length) countries.push({ a: adm0, p: rings });
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
