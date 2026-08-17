import type { LonLat } from '../src/domain/geo';
import type { ComputedRoute, RouteMode } from '../src/domain/routing';
import { buildGrid, computeRoute } from '../src/domain/routing';
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
    representativePoint: country.c,
    lonLat: country.ll,
    rings: country.p,
  })),
} as unknown as World;

let grid: ReturnType<typeof buildGrid> | null = null;

export function routeBetween(from: LonLat, to: LonLat, mode: RouteMode): ComputedRoute | null {
  grid ??= buildGrid(world);
  return computeRoute(grid, from, to, mode);
}
