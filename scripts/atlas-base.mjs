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

/**
 * The admin-1 region and the host country of every cell of the routing raster, by even-odd
 * scanlines over the region shapes, as `contains` of the atlas counts: a cell is in a region
 * when its centre has an odd number of crossings to its right. The first region to claim a cell
 * keeps it, as `regionAt` answers the first of the table. Codes are ranks + 1, 0 is none.
 */
export function regionRaster() {
  const world = frame;
  const width = Math.ceil((world.sphere.maxX - world.sphere.minX) / STEP);
  const height = Math.ceil((world.sphere.maxY - world.sphere.minY) / STEP);
  const ids = atlas.regions.map((region) => region.id);
  const hosts = [...new Set(atlas.regions.map((region) => region.country))];
  const codeOfRegion = new Map(ids.map((id, rank) => [id, rank + 1]));
  const codeOfHost = new Map(hosts.map((adm0, rank) => [adm0, rank + 1]));

  const regionCells = new Uint16Array(width * height);
  const hostCells = new Uint16Array(width * height);

  const shapesOf = atlas.shapes((region) => region.id, DETAIL);
  const countryOf = new Map(atlas.regions.map((region) => [region.id, region.country]));
  for (const id of ids) {
    const crossings = new Map();
    for (const { outer, holes } of shapesOf.get(id) ?? []) {
      for (const ring of [outer, ...holes]) {
        const n = ring.length / 2;
        for (let i = 0; i < n; i++) {
          const j = (i + n - 1) % n;
          const [ax, ay, bx, by] = [ring[2 * i], ring[2 * i + 1], ring[2 * j], ring[2 * j + 1]];
          if (ay === by) continue;
          const rowMin = Math.max(
            0,
            Math.ceil((Math.min(ay, by) - world.sphere.minY) / STEP - 0.5),
          );
          const rowMax = Math.min(
            height - 1,
            Math.floor((Math.max(ay, by) - world.sphere.minY) / STEP - 0.5),
          );
          for (let row = rowMin; row <= rowMax; row++) {
            const y = world.sphere.minY + (row + 0.5) * STEP;
            if (!(ay > y !== by > y)) continue;
            const x = ((bx - ax) * (y - ay)) / (by - ay) + ax;
            (crossings.get(row) ?? crossings.set(row, []).get(row)).push(x);
          }
        }
      }
    }
    const code = codeOfRegion.get(id);
    const host = codeOfHost.get(countryOf.get(id));
    for (const [row, xs] of crossings) {
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        // x in [xs[k], xs[k+1]): the centres to the left of an odd number of crossings.
        const start = Math.max(0, Math.ceil((xs[k] - world.sphere.minX) / STEP - 0.5));
        const end = Math.min(
          width - 1,
          Math.ceil((xs[k + 1] - world.sphere.minX) / STEP - 0.5) - 1,
        );
        for (let column = start; column <= end; column++) {
          const cell = row * width + column;
          if (regionCells[cell] !== 0) continue;
          regionCells[cell] = code;
          hostCells[cell] = host;
        }
      }
    }
  }
  return { width, height, ids, hosts, codeOfRegion, regionCells, hostCells };
}
