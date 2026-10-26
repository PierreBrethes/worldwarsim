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
