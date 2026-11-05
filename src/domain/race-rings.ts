import { nationInk } from './nations';
import type { RaceCountdown, StrategicPointView } from './player-view';

/**
 * **Le compte à rebours en anneaux** (#442, `storyboard-moments/compte-anneaux.html`) : un anneau
 * à l'encre du meneur autour de chaque point qu'il tient, qui se vide sur 24 h. Les mâts se
 * lisent sur les teneurs, publics comme le compte : rien ici que la presse ne dise déjà.
 */
export type RaceRings = {
  readonly leaderNation: string;
  readonly ink: string;
  readonly endsAt: number;
  readonly pointIds: ReadonlyArray<string>;
  /** Le compte est tombé en cours de partie : les anneaux qui restent s'effacent. */
  readonly fading: boolean;
};

export function raceRingsOf(
  race: RaceCountdown | null,
  points: ReadonlyArray<StrategicPointView>,
): RaceRings | null {
  if (race === null) return null;
  return {
    leaderNation: race.leaderNation,
    ink: nationInk(race.leaderNation),
    endsAt: race.endsAt,
    pointIds: points
      .filter((point) => point.holder?.nation === race.leaderNation)
      .map((point) => point.id),
    fading: false,
  };
}

/** **Le compte tombé** : l'anneau du point repris casse net, les autres s'effacent — tous quand
 *  le meneur sort de la guerre et que ses points redeviennent neutres. */
export const fadingRingsOf = (
  before: RaceRings,
  points: ReadonlyArray<StrategicPointView>,
): RaceRings => ({
  ...before,
  pointIds: before.pointIds.filter((id) => {
    const holder = points.find((point) => point.id === id)?.holder ?? null;
    return holder === null || holder.nation === before.leaderNation;
  }),
  fading: true,
});
