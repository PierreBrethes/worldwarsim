/**
 * What every server-side bake reads the geography through (ADR 0034): the atlas, decoded at the
 * `near` level, and the frame of the map. The grids are cut from `public/atlas.json` and
 * `public/atlas-near.json` and from nothing else, so a border falls where the hover says it does.
 */
import { readFileSync } from 'node:fs';
import { geoNaturalEarth1 } from 'd3-geo';
import { decodeAtlas } from '../src/domain/atlas.ts';
import { atlasWorld as landOf } from '../src/domain/atlas-world.ts';

export const WIDTH = 400;
export const HEIGHT = 208;
/** The mesh of the routing raster and of the region raster (ADR 0023). */
export const STEP = 0.25;

const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
export const atlas = decodeAtlas(read('public/atlas.json'), read('public/atlas-near.json'));
export const DETAIL = 'near';

export const naturalEarth = geoNaturalEarth1().fitExtent(
  [
    [0, 0],
    [WIDTH, HEIGHT],
  ],
  { type: 'Sphere' },
);

const rounded = (value) => Math.round(value * 100) / 100;

/** The frame the server projects a lon/lat in: the sphere and its outline per degree of latitude. */
export const frame = (() => {
  const outline = [];
  for (let latitude = -90; latitude <= 90; latitude++) {
    const [westX] = naturalEarth([-180, latitude]);
    const [eastX] = naturalEarth([180, latitude]);
    const [, y] = naturalEarth([0, latitude]);
    outline.push([latitude, rounded(westX), rounded(eastX), rounded(y)]);
  }
  return { sphere: { minX: 0, maxX: WIDTH, minY: 0, maxY: HEIGHT }, outline };
})();

/** The regions of a country, merged: `{ outer, holes }` shapes in map units. */
export const countryShapes = () => atlas.shapes((region) => region.country, DETAIL);

/** The `World` that `buildGrid` reads. */
export const atlasWorld = () => landOf(atlas, frame);

/** A flat `x, y, x, y…` ring as `[x, y]` pairs. */
export function pairs(flat) {
  const out = [];
  for (let i = 0; i < flat.length; i += 2) out.push([flat[i], flat[i + 1]]);
  return out;
}
