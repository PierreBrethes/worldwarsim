import type { VerdictReason } from './blitz';
import type { Hand } from './final-edition';
import type { PlayableRegion } from './ids';

/**
 * **Ce que la page de l'édition finale lit de l'archive** (#455) : les règles de l'oreille, de
 * la bande des Sept et du cadre de la carte. L'archive est écrite par `finalEditionOf`
 * (`./final-edition`) ; ici, rien ne se calcule qu'elle ne porte déjà.
 */

const HOUR = 3_600_000;

/** Ce qui peut finir avant l'horloge : l'avance n'a de sens que pour eux (relecture du 05/11). */
const AHEAD_OF_CLOCK: ReadonlySet<VerdictReason> = new Set([
  'points',
  'hqTaken',
  'lastStanding',
  'closed',
]);

export type VerdictTiming = { kind: 'ahead'; hours: number } | { kind: 'clock' } | { kind: 'date' };

/**
 * **L'oreille du verdict** : « 3 h avant l'horloge » pour les points, le QG pris, le dernier
 * debout et une clôture à la main avec horloge ; « à l'horloge » quand elle a tranché ; la date
 * seule pour une clôture sans horloge.
 */
export function verdictTimingOf(input: {
  readonly reason: VerdictReason;
  readonly launchedAt: number;
  readonly durationHours: number | null;
  readonly concludedAt: number;
}): VerdictTiming {
  if (input.durationHours === null) return { kind: 'date' };
  if (!AHEAD_OF_CLOCK.has(input.reason)) return { kind: 'clock' };
  const hours = Math.floor(
    (input.launchedAt + input.durationHours * HOUR - input.concludedAt) / HOUR,
  );
  return hours > 0 ? { kind: 'ahead', hours } : { kind: 'clock' };
}

/** Une main tenue d'un instant à l'autre ; `nation: null`, le point rendu au neutre. */
export type HandSpan = {
  readonly from: number;
  readonly to: number;
  readonly nation: string | null;
};

/** **Les Sept de main en main** : chaque main court jusqu'à la suivante, la dernière jusqu'à la fin. */
export const handSpansOf = (hands: ReadonlyArray<Hand>, concludedAt: number): HandSpan[] =>
  hands.map((hand, rank) => ({
    from: hand.at,
    to: hands[rank + 1]?.at ?? concludedAt,
    nation: hand.nation,
  }));

/** `[ouest, nord, est, sud]` en unités de carte (400 × 208, le nord en haut). */
export type MapFrame = readonly [number, number, number, number];

/**
 * **Le cadre de la carte de la fin** : la région où la saison s'est jouée (`playableRegion`).
 * Les boîtes sont celles de 12° O–45° E, 34–72° N (l'Europe) et 18° O–64° E, 12–72° N (avec la
 * Méditerranée et le Moyen-Orient), projetées une fois (`public/projection.json`).
 * @a-mesurer cadres posés à l'œil, sans capture
 */
const FRAMES: Readonly<Record<PlayableRegion, MapFrame>> = {
  world: [0, 0, 400, 208],
  europe: [187, 14, 248, 61],
  'europe-med': [180, 14, 271, 89],
};

export const frameOf = (region: string): MapFrame =>
  FRAMES[region as PlayableRegion] ?? FRAMES.world;
