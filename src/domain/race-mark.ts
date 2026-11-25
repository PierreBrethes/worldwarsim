import { fr, nationLabel, raceClockLabel } from '@/i18n/fr';
import type { PlayerView, StrategicPointView } from './player-view';
import { RACE_TO_WIN } from './strategic-points';

export type RaceMark = {
  readonly id: string;
  readonly key: StrategicPointView['key'];
  /** Le teneur ; `null` si le point est neutre. Jamais qui l'attaque. */
  readonly nation: string | null;
  readonly contested: boolean;
};

export type RaceMarkReading = {
  readonly marks: ReadonlyArray<RaceMark>;
  /** Mes points, bornés à `RACE_TO_WIN` : au-delà de quatre, le cinquième ne compte pas. */
  readonly mine: number;
  /** « Vous · victoire dans 23 h 12 » : de `season.race` seul, jamais du décompte des marques (un
   *  éliminé garde ses marques sans que la course coure pour lui). `null` sans course, ou conclue. */
  readonly phrase: { readonly who: string; readonly left: string } | null;
};

/** Les sept marques : le teneur et le contesté, rien de plus que la Presse ne sert. */
export const raceMarksOf = (points: ReadonlyArray<StrategicPointView>): ReadonlyArray<RaceMark> =>
  points.map((point) => ({
    id: point.id,
    key: point.key,
    nation: point.holder?.nation ?? null,
    contested: point.contested,
  }));

/**
 * **La course aux Sept sur la réglette** (#670) : sept marques à l'encre de leur teneur, le compte
 * du joueur, et la phrase du compte à rebours. Tout vient de ce que la Presse sert déjà : les
 * teneurs sont publics, `race` aussi. `null` quand la saison n'a pas de points (Blitz).
 */
export function raceMarkOf(view: PlayerView, now: number): RaceMarkReading | null {
  const points = view.strategicPoints;
  if (points.length === 0) return null;
  const { race } = view.season;
  const concluded = view.season.outcome.concludedAt !== null;
  return {
    marks: raceMarksOf(points),
    mine: Math.min(RACE_TO_WIN, points.filter((point) => point.mine).length),
    phrase:
      race === null || concluded
        ? null
        : {
            who:
              race.leaderNation === view.me.nation
                ? fr.points.race.you
                : nationLabel(race.leaderNation),
            left: raceClockLabel(Math.max(0, race.endsAt - now)),
          },
  };
}
