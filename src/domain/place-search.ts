import type { LonLat } from './geo';
import type { Atlas } from './atlas';

/**
 * **Un lieu qu'on peut chercher** : une ville de l'atlas ou une région, par son nom. Géographie
 * seule (ADR 0034) : aucune pièce, aucun tenant, rien que le brouillard garde.
 */
export type Place = {
  readonly kind: 'city' | 'region';
  readonly name: string;
  /** L'`adm0_a3` du pays : les régions de deux pays portent le même nom (« Córdoba »). */
  readonly country: string | null;
  readonly lonLat: LonLat;
  /** L'identifiant de la région, `undefined` pour une ville. */
  readonly id?: string;
};

/** The name as it is compared: no accent, no case, no ligature, words split on any punctuation. */
export function foldedName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** How far into the name the query lands: from the start, from a word's start, anywhere. */
const tierOf = (folded: string, query: string): number => {
  if (folded.startsWith(query)) return 0;
  if (folded.includes(` ${query}`)) return 1;
  return folded.includes(query) ? 2 : -1;
};

/**
 * **La liste de la barrette « Chercher un lieu »** : les lieux dont le nom contient la
 * recherche, ceux qui la commencent d'abord, puis ceux d'un de leurs mots, puis le reste ; à
 * égalité une ville avant une région, puis l'ordre reçu (capitales, puis population). Au plus
 * `limit` lieux ; une recherche vide ne propose rien.
 */
export function searchPlaces(places: ReadonlyArray<Place>, query: string, limit = 6): Place[] {
  const wanted = foldedName(query);
  if (wanted === '') return [];
  return places
    .flatMap((place, order) => {
      const tier = tierOf(foldedName(place.name), wanted);
      return tier < 0 ? [] : [{ place, tier, order }];
    })
    .sort(
      (a, b) =>
        a.tier - b.tier ||
        Number(a.place.kind === 'region') - Number(b.place.kind === 'region') ||
        a.order - b.order,
    )
    .slice(0, limit)
    .map(({ place }) => place);
}

/**
 * **Tous les lieux qu'on peut chercher** : les villes de l'atlas (capitales, puis population),
 * puis ses régions, chacune à son point (`region-index.json`) — une région sans point n'a pas de
 * lieu où mener la carte, elle n'est pas proposée.
 */
export function placesOf(
  atlas: Pick<Atlas, 'cities' | 'regions'>,
  regionPoints: ReadonlyMap<string, LonLat>,
): Place[] {
  return [
    ...atlas
      .cities()
      .map(({ name, lonLat }): Place => ({ kind: 'city', name, country: null, lonLat })),
    ...atlas.regions.flatMap(({ id, name, country }): Place[] => {
      const lonLat = regionPoints.get(id);
      return lonLat === undefined ? [] : [{ kind: 'region', name, country, lonLat, id }];
    }),
  ];
}
