import { distanceKm, type LonLat } from './geo';

/**
 * What an outpost opens around itself: the right to build there (ADR 0015).
 *
 * **The reach is a radius in kilometres, never a number of regions.** Natural Earth cuts the
 * United Kingdom into 232 districts and Germany into 16 Länder; a reach counted in regions
 * would hand a cartography vendor the balance of the game — the same reason no game quantity
 * is ever counted in regions (`convex/constants.ts`). The *effect* stays "a few regions
 * around"; how many varies by country, and that is the geography speaking, not a bug.
 *
 * Point to point, great circle: an outpost is a point (fiche 03) and a region answers with the
 * point it stands on (`region-index.json`). Nothing here knows what a polygon is.
 */
export type OutpostPoint = { readonly point: LonLat };

/** How far the nearest outpost is, in kilometres — `null` when the player has none. */
export function nearestOutpostKm(
  target: LonLat,
  outposts: ReadonlyArray<OutpostPoint>,
): number | null {
  return outposts.reduce<number | null>((best, outpost) => {
    const km = distanceKm(outpost.point, target);
    return best === null || km < best ? km : best;
  }, null);
}

export function withinReach(
  target: LonLat,
  outposts: ReadonlyArray<OutpostPoint>,
  reachKm: number,
): boolean {
  const nearest = nearestOutpostKm(target, outposts);
  return nearest !== null && nearest <= reachKm;
}
