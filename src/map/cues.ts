import type { StandingPile } from './engine';

/**
 * **Les casernes dont sort une recrue** : l'id de maquette (`beside`) de chaque pile de caserne
 * qui porte une troupe que `known` ne connaissait pas. Une troupe connue qui rentre d'une marche
 * n'est pas une recrue ; en Blitz la recrue se pose sur un point, sans pile `beside`, et ne
 * donne rien.
 */
export function sortiesOf(
  known: ReadonlySet<string>,
  piles: ReadonlyArray<StandingPile>,
): ReadonlyArray<string> {
  const sites = new Set<string>();
  for (const { at, pieces } of piles)
    if (
      'beside' in at &&
      at.beside.startsWith('building-barracks') &&
      pieces.troopIds.some((id) => !known.has(id))
    )
      sites.add(at.beside);
  return [...sites];
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
