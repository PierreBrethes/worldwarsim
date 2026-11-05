import { fr, nationLabel } from '@/i18n/fr';
import { asClockTime } from './duration';
import type { LonLat } from './geo';
import type { MapMotion } from './map-motion';
import { nationInk } from './nations';
import type { JournalDispatch, SeasonVerdict, StrategicPointView } from './player-view';
import type { SeasonMode } from './season-mode';

/**
 * **Les grands moments que la carte joue avant leur feuille** (#442,
 * `storyboard-moments/qg-tombe.html` et `victoire.html`) : la chute de mon QG, avant « hors de
 * combat » ; la fin de la saison, avant l'édition finale. Chacun se joue une fois, sous la clé de
 * sa feuille (`useOpenedOnce`), et rien que ce que la vue sert déjà : le lieu de ma chute est
 * celui de ma dépêche, et le recul de la victoire ne cadre que les Sept, publics.
 */
export type Moment =
  | { readonly kind: 'fall'; readonly at: LonLat; readonly hour: string }
  | {
      readonly kind: 'victory';
      readonly won: boolean;
      readonly winnerNation: string | null;
      readonly ink: string;
      readonly hour: string;
      /** Le grand tampon : « Victoire » au vainqueur, « Saison close » aux autres, et sa ligne. */
      readonly word: string;
      readonly line: string;
      /** Les points du vainqueur, dans l'ordre de leur prise ; `null` hors d'une victoire aux
       *  points : un recul depuis le dernier QG lèverait le brouillard. */
      readonly held: ReadonlyArray<{ readonly at: LonLat; readonly name: string }> | null;
      /** Les Sept, que le recul cadre. */
      readonly seven: ReadonlyArray<LonLat> | null;
    };

export type MomentFacts = {
  readonly mode: SeasonMode;
  readonly nation: string;
  readonly eliminatedAt: number | null;
  readonly journal: ReadonlyArray<JournalDispatch>;
  readonly verdict: SeasonVerdict | null;
  readonly concludedAt: number | null;
  readonly strategicPoints: ReadonlyArray<StrategicPointView>;
};

/** Le moment d'une fin (`endingOf`), `null` s'il n'y a rien à jouer — et en Blitz. */
export function momentOf(ending: 'final' | 'out' | null, facts: MomentFacts): Moment | null {
  if (ending === null || facts.mode === 'blitz') return null;
  if (ending === 'out') {
    const fall = facts.journal.find(
      (dispatch) => dispatch.kind === 'elimination' && dispatch.at === facts.eliminatedAt,
    );
    return fall?.place == null
      ? null
      : { kind: 'fall', at: [fall.place.lon, fall.place.lat], hour: asClockTime(fall.at) };
  }
  const winner = facts.verdict?.winnerNation ?? null;
  const byPoints = facts.verdict?.reason === 'points' && winner !== null;
  const won = winner !== null && winner === facts.nation;
  return {
    kind: 'victory',
    won,
    winnerNation: winner,
    ink: nationInk(winner),
    hour: asClockTime(facts.concludedAt ?? 0),
    word: won ? fr.moments.won : fr.moments.closed,
    line:
      winner === null
        ? fr.moments.draw
        : won && byPoints
          ? fr.moments.byPoints
          : fr.moments.takes(nationLabel(winner)),
    held: byPoints
      ? facts.strategicPoints
          .filter((point) => point.holder?.nation === winner)
          .sort((left, right) => (left.heldSince ?? 0) - (right.heldSince ?? 0))
          .map((point) => ({ at: point.point, name: fr.points.names[point.key] }))
      : null,
    seven: byPoints ? facts.strategicPoints.map((point) => point.point) : null,
  };
}

export type MomentBeat = {
  readonly at: number;
  /** `pull` (le recul sur les Sept), `fly` (vers le QG tombé), `seal` (le cachet du point
   *  `index`), `trace` (le trait qui les relie), `stamp` (« QG tombé »), `big` (le grand tampon),
   *  `sepia`, `open` (la feuille). */
  readonly does: 'pull' | 'fly' | 'seal' | 'trace' | 'stamp' | 'big' | 'sepia' | 'open';
  readonly index?: number;
};

/** @a-mesurer : le minutage du storyboard (`scenes.js`, `qg` et `victoire`), en ms. */
export const FLY_MS = 1000;
export const FALL_HOLD_MS = 3200;
export const PULL_MS = 2000;
const SEAL_GAP_MS = 450;
const TRACE_AFTER_MS = 1900;
export const TRACE_PEN_MS = 1200;
const BIG_AFTER_MS = { full: 1400, reduced: 300 } as const;
const SEPIA_AFTER_MS = 600;
const OPEN_AFTER_MS = 1600;
/** Réduites : la feuille paraît peu après le tampon posé à plat (`qg`, `T_STAMP + 0.4`). */
const REDUCED_OPEN_MS = 400;

/** **Le minutage d'un moment**, en ms depuis son départ. Coupées : la pose finale et la feuille. */
export function momentBeatsOf(moment: Moment, motion: MapMotion): ReadonlyArray<MomentBeat> {
  if (moment.kind === 'fall') {
    if (motion === 'off')
      return [
        { at: 0, does: 'fly' },
        { at: 0, does: 'open' },
      ];
    const stamp = motion === 'full' ? FLY_MS : 0;
    return [
      { at: 0, does: 'fly' },
      { at: stamp, does: 'stamp' },
      { at: motion === 'full' ? stamp + FALL_HOLD_MS : REDUCED_OPEN_MS, does: 'open' },
    ];
  }
  if (motion === 'off')
    return [
      { at: 0, does: 'sepia' },
      { at: 0, does: 'open' },
    ];
  const tail = (big: number): MomentBeat[] => [
    { at: big, does: 'big' },
    { at: big + SEPIA_AFTER_MS, does: 'sepia' },
    { at: big + SEPIA_AFTER_MS + OPEN_AFTER_MS, does: 'open' },
  ];
  if (moment.held === null) return tail(0);
  const seals = motion === 'full' ? PULL_MS : 0;
  const trace = seals + TRACE_AFTER_MS;
  return [
    { at: 0, does: 'pull' },
    ...moment.held.map((_, index): MomentBeat => ({
      at: seals + index * SEAL_GAP_MS,
      does: 'seal',
      index,
    })),
    { at: trace, does: 'trace' },
    ...tail(trace + BIG_AFTER_MS[motion]),
  ];
}
