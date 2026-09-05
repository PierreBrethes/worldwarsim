import type { LonLat } from '../src/domain/geo';
import type { ComputedRoute, RouteMode } from '../src/domain/routing';
import {
  buildGrid,
  computeRoute,
  countryAmong,
  countryAt,
  isCoastCell,
} from '../src/domain/routing';
import type { World } from '../src/domain/world';
import worldAsset from '../public/world.json';

/**
 * The routing grid of ADR 0012, on the server side — because that is where the ADR says the
 * calculation lives: a client that computes its own routes also picks its own speeds.
 *
 * **This is the one place geometry is allowed into the bundle**, and it is measured rather
 * than assumed: `world.json` weighs 1.27 MB, the raster comes out at 1600×832 = 1.33 M cells
 * in 31 ms, and a Dijkstra pass costs 13 ms from Paris to Berlin, 125 ms from Tokyo to Los
 * Angeles by land and sea. `regions.json` stays out, as `regions.ts` says: those 2.5 MB are
 * polygons drawn for the screen, and no rule needs a polygon.
 *
 * Built once per isolate, on the first movement rather than at import: a season spends most of
 * its life in mutations that never route anything, and they should not pay for the raster. If
 * the cold start ever shows, the escape hatch is a baked run-length encoding of the cells —
 * measured at 65 Ko, which would take the geometry out of the bundle altogether.
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

let grid: ReturnType<typeof buildGrid> | null = null;

export function routeBetween(
  from: LonLat,
  to: LonLat,
  mode: RouteMode,
  landCost?: number,
): ComputedRoute | null {
  grid ??= buildGrid(world);
  return computeRoute(grid, from, to, mode, landCost);
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
  grid ??= buildGrid(world);
  return isCoastCell(grid, point);
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
