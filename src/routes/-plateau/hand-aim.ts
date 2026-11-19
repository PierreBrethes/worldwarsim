import { fr } from '@/i18n/fr';
import type { DropNote } from '@/map/DropHint';

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
