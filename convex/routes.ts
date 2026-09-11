import type { LonLat } from '../src/domain/geo';
import type { ComputedRoute, RouteMode } from '../src/domain/routing';
import {
  computeRoute,
  computeRouteToAny,
  countryAmong,
  countryAt,
  decodeGrid,
  isCoastCell,
  isLandCell,
  extendRouteSearch,
  truncateRouteSearch,
} from '../src/domain/routing';
import type { World } from '../src/domain/world';
import gridAsset from '../public/grid.json';
import worldAsset from '../public/world.json';
import { firstRouteEntryInRegion, goalCellsForRegions, regionAtRoutePoint } from './regionGeometry';

/**
 * The routing grid of ADR 0012, on the server side — because that is where the ADR says the
 * calculation lives: a client that computes its own routes also picks its own speeds.
 *
 * **This is the one place world geometry enters the routing bundle**, and it is measured rather
 * than assumed: `world.json` weighs 1.27 MB, the raster is 1600×832 = 1.33 M cells, and a
 * Dijkstra pass costs 13 ms from Paris to Berlin, 125 ms from Tokyo to Los Angeles by land and
 * sea. Admin-1 contours stay out of this grid; the plunder return crossing loads them separately
 * in `regionGeometry.ts`, once per isolate.
 *
 * **The raster is no longer computed here — it is baked** (`scripts/generate-grid.mjs`, 65 Ko of
 * run-length pairs) and decoded at the first demand of the isolate. The 31 ms of `buildGrid` were
 * measured warm, on a development machine; cold and without a JIT they are seconds, and a query
 * has one — `view:playerView` reads `afloat` and `coastal` off this grid for every standing
 * column, and was intermittently timing out on the first call of a fresh isolate. Decoding is a
 * handful of `fill` calls instead, and the first movement of the season still pays for it rather
 * than the import: most mutations never route anything.
 */
const world = {
  sphere: worldAsset.meta.sphere,
  outline: worldAsset.meta.outline,
  countries: worldAsset.countries.map((country) => ({
    name: country.n,
    adm0: country.a,
    representativePoint: country.c,
    lonLat: country.ll,
    rings: country.p,
  })),
} as unknown as World;

let grid: ReturnType<typeof decodeGrid> | null = null;

export function routeBetween(
  from: LonLat,
  to: LonLat,
  mode: RouteMode,
  landCost?: number,
): ComputedRoute | null {
  grid ??= decodeGrid(gridAsset, world);
  return computeRoute(grid, from, to, mode, landCost);
}

export function routeToRegions(
  from: LonLat,
  regions: ReadonlyArray<{ readonly id: string; readonly point: LonLat }>,
  mode: RouteMode,
  landCost?: number,
):
  | { readonly kind: 'standing'; readonly regionId: string; readonly point: LonLat }
  | {
      readonly kind: 'route';
      readonly regionId: string;
      readonly point: LonLat;
      readonly route: ComputedRoute;
    }
  | null {
  const regionIds = new Set(regions.map((region) => region.id));
  const here = regionAtRoutePoint(from);
  if (here !== null && regionIds.has(here))
    return { kind: 'standing', regionId: here, point: from };

  grid ??= decodeGrid(gridAsset, world);
  const goals = goalCellsForRegions(regions, grid);
  const search = computeRouteToAny(grid, from, new Set(goals.keys()), mode, landCost);
  if (search === null) return null;
  const goal = goals.get(search.goalCell);
  if (goal === undefined) return null;
  if (goal.point !== undefined && mode !== 'air' && !isLandCell(grid, goal.point)) return null;
  const completed = goal.point === undefined ? search : extendRouteSearch(grid, search, goal.point);
  const entry = firstRouteEntryInRegion(completed.rawPoints, goal.regionId);
  if (entry === null) return null;
  return {
    kind: 'route',
    regionId: goal.regionId,
    point: entry.point,
    route: truncateRouteSearch(grid, completed, entry.segmentIndex, entry.fraction, entry.point),
  };
}

/**
 * **Is this a coast the routing can sail from?** The very grid a movement is computed on
 * answers, so a port accepted here is a port a cargo leaves from without a land leg. A port
 * refused here would have been a quay Dijkstra never found water beside.
 *
 * It is the client's own reading too (`isCoastCell`): the ghost snaps onto the cells this
 * returns true for, and the click that follows cannot be refused for the reason it was aimed at.
 */
export function coastAtPoint(point: LonLat): boolean {
  grid ??= decodeGrid(gridAsset, world);
  return isCoastCell(grid, point);
}

export function landAtPoint(point: LonLat): boolean {
  grid ??= decodeGrid(gridAsset, world);
  return isLandCell(grid, point);
}

/**
 * **The country hosting a point, as every rule keys it**: an `adm0_a3`, or the empty string on
 * the open sea and nowhere else. One asset, one reading — `world.json` carries the rings and,
 * since `nommer-les-pays`, the code that goes with them, so the containment and the name come
 * out of the same polygon and cannot disagree.
 *
 * The empty string used to swallow both "this is the high sea" and "this is a country nobody
 * plays", which made Arabia, Romania and Bolivia one and the same host. They are the ordinary
 * case, not the edge: the decreasing yield per host, the finite trade capacity and the
 * expulsion of fiche 03 all key on this string, and none of them can be written on a key that
 * collapses a hundred and fifty-five countries into one.
 *
 * **It is the polygon that answers, never the closest region.** Reading a host off the nearest
 * region point put Menton in Monaco and Aix-la-Chapelle in Belgium: a pole of inaccessibility
 * says where a region *is*, and says nothing whatsoever about where it stops.
 */
export function hostAtPoint(point: LonLat): string {
  return countryAt(world, point) ?? '';
}

/**
 * **Whose soil this is, asked only of the players' own** — the territory detector of design
 * sheet 04, which has no radius because it is not a thing standing on the ground: it *is* the
 * ground. A road is walked sample by sample against it, so the reading is restricted to the
 * countries that can answer rather than to the whole world.
 */
export function hostAmongCountries(point: LonLat, adm0s: ReadonlySet<string>): string {
  return countryAmong(world, point, adm0s) ?? '';
}
