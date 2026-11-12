/**
 * **Un arrêt allumé sur la carte** (#551) : un arrêt de la feuille porte son rang dans la boucle,
 * un arrêt possible le sien dans le classement, un arrêt refusé se barre. Il se pose sur l'étiquette
 * que la carte dessine déjà pour ce bâtiment ou cet avant-poste, jamais sur un nœud de plus.
 */
export type SheetMark = {
  readonly tone: 'stop' | 'cand' | 'nope';
  readonly text: string;
  /** Ce qu'un clic sur la marque ajoute à la feuille, ou dit de son refus. */
  readonly pick: { readonly kind: 'depot' | 'site'; readonly id: string };
};

/** Les étiquettes, avec leur marque quand la feuille en a posé une : la même liste sinon. */
export function markedLabels<T extends { readonly id: string }>(
  labels: ReadonlyArray<T>,
  marks: ReadonlyMap<string, SheetMark>,
): ReadonlyArray<T & { readonly sheetMark?: SheetMark }> {
  if (marks.size === 0) return labels;
  return labels.map((label) => {
    const sheetMark = marks.get(label.id);
    return sheetMark === undefined ? label : { ...label, sheetMark };
  });
}
