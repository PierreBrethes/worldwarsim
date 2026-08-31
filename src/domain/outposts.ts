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

/**
 * **Un point et ce qu'il porte.** Le rayon voyage avec l'avant-poste depuis qu'il suit son niveau
 * (`outpostReachKm`, révision du 31/08) : une portée unique en paramètre dirait que tous les
 * points couvrent la même chose, ce qui n'est plus vrai depuis qu'on l'achète.
 */
export type OutpostReach = OutpostPoint & { readonly reachKm: number };

/**
 * The nearest outpost and how far it is — `null` when the list is empty. It is generic over what
 * is hung on the point so that a caller needing the outpost itself (a rout looking for the
 * anchor it refluxes to, ADR 0019 §3) reads the same distance as one needing only the number.
 */
export function nearestOutpost<T extends OutpostPoint>(
  target: LonLat,
  outposts: ReadonlyArray<T>,
): { readonly nearest: T; readonly km: number } | null {
  return outposts.reduce<{ nearest: T; km: number } | null>((best, outpost) => {
    const km = distanceKm(outpost.point, target);
    return best === null || km < best.km ? { nearest: outpost, km } : best;
  }, null);
}

/** How far the nearest outpost is, in kilometres — `null` when the player has none. */
export function nearestOutpostKm(
  target: LonLat,
  outposts: ReadonlyArray<OutpostPoint>,
): number | null {
  return nearestOutpost(target, outposts)?.km ?? null;
}

/**
 * **Le plus proche des points qui portent jusque-là** — et non le plus proche tout court : deux
 * avant-postes de niveaux différents ne couvrent pas le même cercle, et le plus près peut très
 * bien ne pas atteindre ce que le suivant atteint.
 */
export function reachingOutpost<T extends OutpostReach>(
  target: LonLat,
  outposts: ReadonlyArray<T>,
): { readonly nearest: T; readonly km: number } | null {
  return nearestOutpost(
    target,
    outposts.filter((outpost) => distanceKm(outpost.point, target) <= outpost.reachKm),
  );
}

export const withinReach = (target: LonLat, outposts: ReadonlyArray<OutpostReach>): boolean =>
  reachingOutpost(target, outposts) !== null;
