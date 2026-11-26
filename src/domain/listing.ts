import type { SeasonMode } from './season-mode';

/**
 * **Les petites annonces** (ADR 0027 §4, #654) : un salon de Mondiale que son fondateur publie
 * se lit sur l'accueil de tout joueur, et il part seul. Son départ suit les inscriptions : le
 * minimum atteint le fixe à une heure ronde au moins 24 h plus tard, le salon plein l'avance à
 * une heure ronde au moins 1 h plus tard. Personne n'entre après le départ (règle inchangée).
 */

/**
 * **Le minimum d'une annonce**, commun à toutes (décision de #654) : en dessous, le départ
 * n'est pas fixé et le salon attend.
 *
 * @a-mesurer la moitié des huit nations, aucune saison publique jouée
 */
export const LISTED_MINIMUM = 4;

const HOUR_MS = 3_600_000;
const FIXED_AFTER_MS = 24 * HOUR_MS;
const FULL_AFTER_MS = HOUR_MS;

/** La première heure ronde à `delay` au moins de `now`. En UTC, ronde partout où le décalage
 *  est d'heures entières. */
export const roundHourAfter = (now: number, delay: number): number =>
  Math.ceil((now + delay) / HOUR_MS) * HOUR_MS;

/**
 * **L'heure du départ d'une annonce**, relue à chaque inscription. Une place ne se quitte pas
 * (`countSeat`) : un départ fixé ne se défixe jamais, et il ne recule pas non plus.
 */
export function departureOf(input: {
  readonly seats: number;
  readonly minimum: number;
  readonly maximum: number;
  readonly departureAt: number | null;
  readonly now: number;
}): number | null {
  if (input.seats < input.minimum) return input.departureAt;
  const fixed = input.departureAt ?? roundHourAfter(input.now, FIXED_AFTER_MS);
  if (input.seats < input.maximum) return fixed;
  return Math.min(fixed, roundHourAfter(input.now, FULL_AFTER_MS));
}

export type ListingRefusal = 'SETTING_NOT_IN_MODE' | 'DEPARTURE_FIXED';

/**
 * **Publier, ou reprendre l'annonce** : la Mondiale seule s'annonce, et une annonce dont le
 * départ est fixé ne se retire plus — ceux qui sont venus par elle attendent cette heure-là.
 */
export function listingRefusalOf(input: {
  readonly mode: SeasonMode;
  readonly listed: boolean;
  readonly departureAt: number | null;
}): ListingRefusal | null {
  if (input.listed && input.mode !== 'mondiale') return 'SETTING_NOT_IN_MODE';
  if (!input.listed && input.departureAt !== null) return 'DEPARTURE_FIXED';
  return null;
}
