import type { TroopStation } from './player-view';
import { stationKeyOf } from './troops';

/**
 * **La troupe mise en avant, et une seule source pour le dire** (carte-lisible, 03/10). Elle
 * grossit de 30 % sur la carte et se cerne d'encre ; les autres gardent leur taille. Deux états
 * du plateau peuvent la désigner, et ils ne se contredisent jamais parce qu'ils se lisent ici,
 * dans cet ordre :
 *
 * 1. **la pièce en main** — levée sur la carte, ou préparée dans une garnison (ADR 0026 §6) ;
 * 2. **les cases cochées** du panneau de garnison ouvert.
 *
 * Une sélection vide ne met rien en avant : une garnison ouverte sans case cochée n'a encore
 * rien choisi.
 */
export type Designation = {
  readonly station: TroopStation;
  readonly troopIds: ReadonlyArray<string>;
};

export type Highlight = {
  /** L'étiquette qui grossit — une pile posée, la seule troupe que la carte dessine en planche.
   *  Un mât de bâtiment ou d'avant-poste dit une adresse, pas une troupe : il ne grossit pas. */
  readonly labelId: string;
  readonly troopIds: ReadonlyArray<string>;
};

export const stackLabelId = (station: Extract<TroopStation, { kind: 'point' }>): string =>
  `stack-${stationKeyOf(station)}`;

export function highlightOf(
  hand: Designation | null,
  garrison: Designation | null,
): Highlight | null {
  const chosen = [hand, garrison].find(
    (candidate) => candidate !== null && candidate.troopIds.length > 0,
  );
  if (chosen === undefined || chosen === null || chosen.station.kind !== 'point') return null;
  return { labelId: stackLabelId(chosen.station), troopIds: chosen.troopIds };
}
