import type { LonLat } from './geo';

/** Un objet d'une famille de fiches (piles, bâtiments, avant-postes, camps, objectifs, points) et
 *  l'endroit où il se tient. */
export type FamilySpot = { readonly id: string; readonly lonLat: LonLat };

/**
 * **Les voisins d'un objet dans le cycle de sa famille** (#593) : ‹ et › de la fiche au téléphone.
 * L'ordre est stable — de l'ouest à l'est, puis du sud au nord, l'id départageant deux objets au
 * même point — et bouclé. La place de l'objet ouvert se retrouve par son id, jamais par un rang :
 * un membre qui arrive ou part ne déplace pas celui qu'on lit. `null` quand il n'y a rien à
 * parcourir : famille d'un seul, ou objet qui n'en est plus.
 */
export function cycleOf(
  family: ReadonlyArray<FamilySpot>,
  currentId: string,
): { readonly prev: string; readonly next: string } | null {
  const order = [...family].sort(
    (a, b) =>
      a.lonLat[0] - b.lonLat[0] ||
      a.lonLat[1] - b.lonLat[1] ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  const at = order.findIndex((one) => one.id === currentId);
  if (at === -1 || order.length < 2) return null;
  return {
    prev: order[(at + order.length - 1) % order.length]!.id,
    next: order[(at + 1) % order.length]!.id,
  };
}
