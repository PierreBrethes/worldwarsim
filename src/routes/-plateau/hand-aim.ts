import type { MovementAim } from '@/domain/movement-orders';
import { placeLabel } from '@/domain/station-name';
import { fr } from '@/i18n/fr';
import type { DropNote } from '@/map/DropHint';
import { destinationOf, type Previewed } from './order-wire';

/**
 * **La visée du téléphone** (#586) : ce que la pièce en main ferait à l'endroit touché, lu comme
 * la pastille le lit au bureau. La ligne de l'étiquette est le verbe et le lieu, puis les notes de
 * la visée telles quelles — le refus n'y est pas : la feuille le dit à la place d'« Envoyer ».
 */
export type HandAim = {
  /** Le verbe de chaque ordre que le point offre, dans l'ordre de la rose ; le premier est celui
   *  qui part par défaut. */
  readonly verbs: ReadonlyArray<string>;
  readonly chosen: number;
  /** « Marcher → lieu · ≈ km · durée · arrivée ». */
  readonly line: string;
  /** Un refus connu : il remplace « Envoyer ». `null` tant que l'aperçu n'est pas arrivé. */
  readonly refusal: string | null;
};

export function handAimOf(
  verbs: ReadonlyArray<string>,
  chosen: number,
  place: string,
  notes: ReadonlyArray<DropNote>,
): HandAim {
  return {
    verbs,
    chosen,
    line: [
      fr.aim.label(verbs[chosen] ?? '', place),
      ...notes.filter((note) => note.refusal !== true).map((note) => note.text),
    ].join(' · '),
    refusal: notes.find((note) => note.refusal === true)?.text ?? null,
  };
}

/**
 * **Le lieu de l'étiquette** : un point visé se dit par la région que l'aperçu nomme (« près de
 * Bourges »), des degrés tant qu'il n'est pas arrivé. `destinationOf` garde sa règle — un point n'a
 * pas de nom (ADR 0019 §1) — et ne sert que le reste ; seule la ligne du doigt emprunte la région.
 */
export function aimPlaceOf(aim: MovementAim, preview: Previewed | undefined): string {
  const named = preview?.destinationName;
  if (aim.kind !== 'point' || named === undefined) return destinationOf(aim, preview);
  return named === '' ? placeLabel(named) : fr.aim.near(placeLabel(named));
}

/**
 * **Sous une visée, les transports ne montrent que leur signe** : les fiches de cargaison qui
 * s'ouvriraient sous l'étiquette de la visée restent fermées. Embarquer part toujours du toucher
 * sur la pièce.
 */
export function cargoOpenUnder(
  aimed: boolean,
  piles: ReadonlyArray<string>,
  carrying: boolean,
): { availablePiles: ReadonlyArray<string>; carriersShown: boolean } {
  return aimed
    ? { availablePiles: NO_PILES, carriersShown: false }
    : { availablePiles: piles, carriersShown: carrying };
}

const NO_PILES: ReadonlyArray<string> = [];
