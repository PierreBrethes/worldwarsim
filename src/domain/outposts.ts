import { LOOKOUT_COAL_PER_HOUR_PER_LEVEL, outpostReachKm } from '../../convex/constants';
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

/**
 * **Le plus proche des points qui portent jusque-là** — et non le plus proche tout court : deux
 * avant-postes de niveaux différents ne couvrent pas le même cercle, et le plus près peut très
 * bien ne pas atteindre ce que le suivant atteint.
 *
 * **Il mesure un point, jamais une région** (révision du 17/09 de l'ADR 0020 §1) : le sol se lit
 * au disque, sur les cellules du raster (`coveredByDisc`), et c'est `convex/sites.ts` qui le lit.
 * Ce qui reste ici est ce qu'un ravitaillement demande — *cette coordonnée est-elle dans une de
 * mes portées* — où il n'y a pas de région à toucher et où la distance suffit.
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

/**
 * **Un point en chantier n'est pas encore un point** (révision du 15/09 de l'ADR 0020 §10).
 * Fonder se paie et prend du temps ; entre l'ordre et `standsAt` il y a une fenêtre où le camp
 * est posé et visible (ADR 0024 §1) et où le point *n'existe pas* — il ne tient rien, n'atteint
 * rien, ne détecte rien, n'offre aucun emplacement et ne relaie pas. C'est ce que la fondation
 * achète : sans elle, elle était le seul geste du jeu sans contre-coup possible.
 *
 * Une fonction, lue par **tout** ce qui lit un avant-poste — la couleur, les emplacements, le
 * relevé du sol, la vue, le relais. Cinq lectures parallèles auraient divergé au premier
 * chantier, et la divergence aurait été un point qui colore sans tenir.
 *
 * Le repli est `foundedAt` : un point d'avant le champ est debout, et un point levé n'en porte
 * plus (`movements.standOutpost` efface la date).
 */
export type OutpostStanding = { readonly foundedAt: number; readonly standsAt?: number };

export const isStanding = (outpost: OutpostStanding, now: number): boolean =>
  (outpost.standsAt ?? outpost.foundedAt) <= now;

/**
 * **Un point n'a de murs que debout et en service** (décision du 14/10, C4) : sa garnison encaisse
 * moins (C1), celle d'un chantier ou d'un point désactivé encaisse tout. Lue par la passe
 * (`convex/combat.ts`) et par l'aperçu de l'ordre, pour qu'ils ne divergent pas.
 */
export const outpostShelters = (
  outpost: OutpostStanding & { readonly disabledUntil: number | null },
  now: number,
): boolean => isStanding(outpost, now) && (outpost.disabledUntil ?? 0) <= now;

/**
 * **Tout avant-poste debout guette** (ADR 0037 §1, §2) : sa vigie porte à la moitié de son rayon
 * de contrôle. `@a-mesurer` avec le rayon. Le Guet portera au rayon entier (#371).
 */
export const lookoutKmOf = (outpost: { readonly level: number }): number =>
  outpostReachKm(outpost.level) / 2;

/** Le charbon que la vigie brûle, au stock national (ADR 0037 §2). */
export const lookoutCoalPerHour = (level: number): number =>
  LOOKOUT_COAL_PER_HOUR_PER_LEVEL * level;

type LiaisonPoint<Id> = OutpostReach & { readonly id: Id };

/**
 * **Deux avant-postes dont les rayons se touchent sont en liaison**, sans geste (ADR 0037 §8) :
 * toutes les paires, sans élaguer — le dessin épure (#375), la règle non, sinon un point neuf
 * ferait perdre l'accélération à un trajet qui passait par une liaison retirée. L'appelant ne
 * passe que ses points debout et en service : il est seul à savoir quelle heure il lit.
 */
export function liaisonsOf<Id>(points: ReadonlyArray<LiaisonPoint<Id>>): Array<[Id, Id]> {
  return points.flatMap((a, index) =>
    points
      .slice(index + 1)
      .filter((b) => distanceKm(a.point, b.point) <= a.reachKm + b.reachKm)
      .map((b): [Id, Id] => [a.id, b.id]),
  );
}

/** **Les points qui accélèrent** (ADR 0037 §8) : ceux qui ont au moins une liaison. Un point
 *  seul n'accélère rien ; un point à un seul voisin autant qu'un nœud. */
export function linkedRelays<Id>(points: ReadonlyArray<LiaisonPoint<Id>>): OutpostReach[] {
  const linked = new Set(liaisonsOf(points).flat());
  return points
    .filter((point) => linked.has(point.id))
    .map(({ point, reachKm }) => ({ point, reachKm }));
}
