import type { StandingPile } from './engine';

/** **Une sortie de caserne** : où, dans quelle pile, et les groupes de la pile qui en sortent. */
export type Sortie = {
  readonly siteId: string;
  readonly pileId: string;
  /** Les groupes (`pieces.groups`) dont toutes les troupes sont neuves : ce qui marche de la
   *  porte au rang. Une recrue fondue dans un groupe connu (une escouade dessinée par rôle) n'en
   *  donne pas : la pile se pose comme elle est. */
  readonly groups: ReadonlyArray<number>;
};

/**
 * **Les casernes dont sort une recrue** : chaque pile de caserne (`beside`) qui porte une troupe
 * que `known` ne connaissait pas. Une troupe connue qui rentre d'une marche n'est pas une recrue ;
 * en Blitz la recrue se pose sur un point, sans pile `beside`, et ne donne rien.
 */
export function sortiesOf(
  known: ReadonlySet<string>,
  piles: ReadonlyArray<StandingPile>,
): ReadonlyArray<Sortie> {
  return piles.flatMap(({ id, at, pieces }) =>
    'beside' in at &&
    at.beside.startsWith('building-barracks') &&
    pieces.troopIds.some((troop) => !known.has(troop))
      ? [
          {
            siteId: at.beside,
            pileId: id,
            groups: pieces.groups.flatMap(({ troopIds }, k) =>
              troopIds.every((troop) => !known.has(troop)) ? [k] : [],
            ),
          },
        ]
      : [],
  );
}

type Seated = { readonly id: string; readonly carriedBy?: string | undefined };

/** Who is aboard whom in a view: rider id → carrier id. What `descentesOf` remembers between two views. */
export function aboardOf(troops: ReadonlyArray<Seated>): ReadonlyMap<string, string> {
  return new Map(troops.flatMap((troop) => (troop.carriedBy ? [[troop.id, troop.carriedBy]] : [])));
}

/**
 * **Les camions dont une troupe vient de descendre** : l'id (`${pile}/${groupe}`, celui que
 * `StandingLayer` prête aux séquences) du groupe de chaque camion dont un passager d'avant, encore
 * là, n'est plus à bord. Un embarquement, un passager qui reste ou qui a disparu ne donnent rien.
 */
export function descentesOf(
  aboard: ReadonlyMap<string, string>,
  troops: ReadonlyArray<Seated>,
  piles: ReadonlyArray<StandingPile>,
): ReadonlyArray<string> {
  const freed = new Set(
    troops.flatMap((troop) => {
      const carrier = aboard.get(troop.id);
      return carrier !== undefined && !troop.carriedBy ? [carrier] : [];
    }),
  );
  return piles.flatMap(({ id, pieces }) =>
    pieces.groups.flatMap((group, k) =>
      group.role === 'landTransport' && group.troopIds.some((troop) => freed.has(troop))
        ? [`${id}/${k}`]
        : [],
    ),
  );
}
