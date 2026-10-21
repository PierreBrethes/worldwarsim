/**
 * What every server-side bake reads the geography through (ADR 0034): the atlas, decoded at the
 * `near` level, and the frame of the map. The grids are cut from `public/atlas.json` and
 * `public/atlas-near.json` and from nothing else, so a border falls where the hover says it does.
 */
import { readFileSync } from 'node:fs';
import { geoNaturalEarth1 } from 'd3-geo';
import { decodeAtlas } from '../src/domain/atlas.ts';
import { atlasWorld as landOf } from '../src/domain/atlas-world.ts';
import { projectLonLat } from '../src/domain/routing.ts';

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

/**
 * `public/region-grid.json` for a set of region points: the region and host runs, and the
 * anchors of the regions smaller than a cell, read off their points.
 */
export function regionGridAsset(points) {
  const world = frame;
  const { width, height, ids, hosts, codeOfRegion, regionCells, hostCells } = regionRaster();
  const runsOf = (cells) => {
    const runs = [];
    let value = cells[0];
    let length = 0;
    for (const cell of cells) {
      if (cell === value) {
        length += 1;
        continue;
      }
      runs.push(value, length);
      value = cell;
      length = 1;
    }
    runs.push(value, length);
    return runs;
  };

  /**
   * **Le troisième canal : l'ancrage** (ADR 0023). Neuf cent soixante-et-onze régions sont plus
   * petites qu'une cellule — aucun centre ne tombe dedans, donc aucune cellule ne porte leur code —
   * et la direction région → cellules s'arrêtait là. Elle est totale désormais : chacune reçoit
   * **la cellule qui contient son point intérieur**, le pôle d'inaccessibilité que
   * `generate-region-index.mjs` a déjà calculé et cuit. Rien n'est recalculé ici, et rien n'est
   * inventé : l'ancrage ne dit pas que la cellule *est* la région, il dit par où l'on y entre.
   *
   * **Plusieurs régions ancrent la même cellule** — les quarante-cinq régions maltaises tiennent
   * dans une seule — et c'est la raison pour laquelle un but est une liste et non une valeur.
   *
   * `convex/invariants.test.ts` exige que chaque ancrage cuit soit **exactement** la cellule où
   * `cellAt` fait tomber le point : même contrat que l'égalité cuisson/calcul de `grid.json`.
   */
  const withCells = new Set(regionCells);
  const anchors = [];
  for (const id of ids) {
    if (withCells.has(codeOfRegion.get(id))) continue;
    const lonLat = points[id];
    if (lonLat === undefined) throw new Error(`region without an interior point: ${id}`);
    const [x, y] = projectLonLat(world.outline, world.sphere, lonLat);
    const column = Math.min(
      width - 1,
      Math.max(0, Math.round((x - world.sphere.minX) / STEP - 0.5)),
    );
    const row = Math.min(height - 1, Math.max(0, Math.round((y - world.sphere.minY) / STEP - 0.5)));
    anchors.push(row * width + column, codeOfRegion.get(id));
  }

  const asset = {
    step: STEP,
    width,
    height,
    ids,
    hosts,
    regionRuns: runsOf(regionCells),
    hostRuns: runsOf(hostCells),
    anchors,
  };
  return { asset, regionCells, hostCells };
}
