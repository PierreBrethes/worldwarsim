import { SQUAD_DRAWN_WHOLE } from './pile-pieces';
import { REPLAY_MS, STEP_MS, replayAt, type ReplayFrame } from './replay';
import type { LonLat } from './geo';
import type { MapMotion } from './map-motion';
import type { ArcView, CombatReport, ReplayView } from './player-view';

/**
 * **Le combat sur la carte** (#272) : un combat d'arrivée à terre se joue à son point, aux six
 * temps du rejeu (`replayAt`), le même sort pour chaque pièce. Le rejeu reste pour revoir.
 */

/** **Trois combats à la fois** (décision de Pierre du 31/10), sur un budget à part des sorties de
 *  caserne ; au-delà, la pose finale. */
export const COMBATS_AT_ONCE = 3;

/** **Ce que tient la pose finale**, quand rien ne joue (coupées, plus de douze pièces, budget
 *  plein) : le temps du compte-rendu. @a-mesurer */
export const FINAL_POSE_MS = STEP_MS['compte-rendu'];

/** **Les combats qu'une vue apporte et que la précédente n'avait pas** — jamais à la première
 *  vue (`known` nul), et seulement l'arrivée : l'interception, la mer et le bombardement sont
 *  d'autres lots (#323 à #327). */
export function freshCombats(
  known: ReadonlySet<string> | null,
  reports: ReadonlyArray<CombatReport>,
): ReadonlyArray<CombatReport> {
  if (known === null) return [];
  return reports.filter((report) => report.cause === 'arrival' && !known.has(report.id));
}

/** **Au-delà de douze pièces par camp, le combat ne joue pas** (décision de Pierre du 31/10) : la
 *  pose finale, la dépêche et le rejeu. Le seuil est celui d'une escouade dessinée entière. */
export function playsWhole(view: ReplayView): boolean {
  const mine = view.mine.reduce((sum, entry) => sum + entry.troops, 0);
  return mine <= SQUAD_DRAWN_WHOLE && view.theirs.troops <= SQUAD_DRAWN_WHOLE;
}

export type CombatShown = {
  readonly frame: ReplayFrame;
  /** Per piece of `frame`, how far it has turned about, 0..1. */
  readonly turns: ReadonlyArray<number>;
  /** The scene has played: the board takes over. */
  readonly over: boolean;
};

/**
 * **Ce que la carte montre `t` ms après le signal.** Joué, c'est `replayAt` à la lettre — en
 * réduites, ses six temps figés ; coupé, ou quand le combat ne joue pas, la pose finale seule,
 * `FINAL_POSE_MS`.
 *
 * **La déroute se réduit à un demi-tour sur place** (décision de Pierre du 31/10) : une pièce en
 * déroute se retourne en déroutant, et au compte-rendu tout survivant de l'attaquant, vainqueur
 * ou non, se tourne vers chez lui — là où son pion de retour (`walkHome`) le reprend, sans saut.
 */
export function combatAt(
  view: ReplayView,
  t: number,
  motion: MapMotion,
  plays: boolean,
): CombatShown {
  const still = motion === 'off' || !plays;
  const frame = still ? replayAt(view, REPLAY_MS) : replayAt(view, t, motion);
  const attacker = view.side === 'attacker' ? 'mine' : 'theirs';
  const home = frame.step === 'compte-rendu' ? frame.progress : 0;
  const turns = frame.pieces.map((piece) =>
    piece.fate === 'routed'
      ? piece.progress
      : piece.side === attacker && piece.fate === 'standing'
        ? home
        : 0,
  );
  return { frame, turns, over: t >= (still ? FINAL_POSE_MS : REPLAY_MS) };
}

/** Within this many degrees, a column's start is the combat's point. */
const AT_POINT_DEGREES = 0.01;

/**
 * **D'où l'attaquant est venu** : le pion qui repart du point, le retour par `walkHome`, montre
 * le chemin de chez lui. `null` quand personne n'en repart, ou qu'on ne le voit pas.
 */
export function homewardOf(
  point: { readonly lon: number; readonly lat: number },
  arcs: ReadonlyArray<ArcView>,
): LonLat | null {
  const leaving = arcs.find(
    (arc) =>
      Math.abs(arc.from[0] - point.lon) < AT_POINT_DEGREES &&
      Math.abs(arc.from[1] - point.lat) < AT_POINT_DEGREES,
  );
  if (leaving === undefined) return null;
  return (
    leaving.route.points.find(
      (at) =>
        Math.abs(at[0] - point.lon) >= AT_POINT_DEGREES ||
        Math.abs(at[1] - point.lat) >= AT_POINT_DEGREES,
    ) ?? leaving.to
  );
}
