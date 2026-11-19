type Box = {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
};

/** L'air qu'on laisse entre la pile « En cours » et ce qui monte vers elle. */
const GAP_PX = 8;

/**
 * **Les boutons de la carte ne recouvrent jamais la pile « En cours »** (#587) : ils montent avec
 * l'étage (`--mat-rise`), et quand leur sommet passerait sous le bas de la pile dépliée, la pile
 * se replie sur son onglet. `pile` est la pile telle qu'elle serait dépliée ; `floors`, ce qui se
 * pose au bas de la carte.
 */
export const crowdedBy = (pile: Box, floors: ReadonlyArray<Box>): boolean =>
  floors.some(
    (floor) =>
      floor.left < pile.right && floor.right > pile.left && floor.top < pile.bottom + GAP_PX,
  );
