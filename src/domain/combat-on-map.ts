import { fr } from '@/i18n/fr';
import { SQUAD_DRAWN_WHOLE } from './pile-pieces';
import { REPLAY_MS, STEP_MS, replayAt, type ReplayFrame } from './replay';
import type { LonLat } from './geo';
import type { MapMotion } from './map-motion';
import type { ArcView, CombatReport, ReplayView } from './player-view';

/**
 * **Le combat sur la carte** (#272) : un combat d'arrivée à terre se joue à son point, aux six
 * temps du rejeu (`replayAt`), le même sort pour chaque pièce. Le rejeu reste pour revoir.
 */

/** **Combien de combats jouent à la fois, et jusqu'à combien de pièces par camp** (décisions de
 *  Pierre du 31/10, au banc) : au bureau trois et douze — une escouade dessinée entière —, au
 *  téléphone un et six, où douze contre douze tombait à trente images par seconde. Au-delà, la
 *  pose finale. Un budget à part des sorties de caserne. */
export const COMBAT_LIMITS = {
  desk: { atOnce: 3, pieces: SQUAD_DRAWN_WHOLE },
  phone: { atOnce: 1, pieces: 6 },
} as const;

/** How late a combat is still news when the view brings it, past its own length. @a-mesurer : un
 *  aller-retour du serveur et un onglet qui se réveille, sans rejouer le combat d'il y a une heure. */
export const STALE_MARGIN_MS = 30_000;

/** **Ce que tient la pose finale**, quand rien ne joue (coupées, plus de douze pièces, budget
 *  plein). @a-mesurer : le temps du compte-rendu, assez pour lire qui reste debout ? */
export const FINAL_POSE_MS = STEP_MS['compte-rendu'];

/** **Les combats qu'une vue apporte et que la précédente n'avait pas** — jamais à la première
 *  vue (`known` nul), jamais un combat fini depuis longtemps (un portable qui sort de veille), et
 *  seulement l'arrivée : l'interception, la mer et le bombardement sont d'autres lots (#323 à
 *  #327). */
export function freshCombats(
  known: ReadonlySet<string> | null,
  reports: ReadonlyArray<CombatReport>,
  now: number,
): ReadonlyArray<CombatReport> {
  if (known === null) return [];
  return reports.filter(
    (report) =>
      report.cause === 'arrival' &&
      !known.has(report.id) &&
      report.at >= now - REPLAY_MS - STALE_MARGIN_MS,
  );
}

/** **Au-delà de `COMBAT_LIMITS` pièces par camp, le combat ne joue pas** : la pose finale, la
 *  dépêche et le rejeu. */
export function playsWhole(view: ReplayView, phone: boolean): boolean {
  const { pieces } = COMBAT_LIMITS[phone ? 'phone' : 'desk'];
  const mine = view.mine.reduce((sum, entry) => sum + entry.troops, 0);
  return mine <= pieces && view.theirs.troops <= pieces;
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
 * **D'où l'attaquant est venu** : son pion qui repart du point, le retour par `walkHome`, montre
 * le chemin de chez lui — le mien quand j'attaque, celui d'en face quand je défends ; le défenseur
 * en déroute repart aussi du point, et ce n'est pas le bon chemin. `null` quand personne n'en
 * repart, ou qu'on ne le voit pas.
 */
export function homewardOf(
  point: { readonly lon: number; readonly lat: number },
  arcs: ReadonlyArray<ArcView>,
  side: ReplayView['side'],
): LonLat | null {
  const leaving = arcs.find(
    (arc) =>
      (arc.state === 'mine') === (side === 'attacker') &&
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

/** **Combien de temps le tampon du compte-rendu reste posé**, de son apparition : le reste du
 *  compte-rendu, puis six secondes. @a-mesurer : le temps de lire « nos pièces » et de l'ouvrir. */
export const REPORT_HOLD_MS = STEP_MS['compte-rendu'] + 6000;

/**
 * **Ce que dit le tampon du compte-rendu** (#327) : l'issue vue du lecteur, et ses propres pertes
 * en pièces — la dépêche garde les hommes. `won` fait l'encre : rouge quand on gagne.
 */
export function reportOf(view: ReplayView): {
  readonly title: string;
  readonly losses: string;
  readonly won: boolean;
} {
  const words = fr.replay.report;
  const destroyed = view.mine.reduce((sum, entry) => sum + entry.destroyed, 0);
  const routed = view.mine.reduce((sum, entry) => sum + entry.routed, 0);
  const lost = [
    ...(destroyed > 0 ? [words.destroyed(destroyed)] : []),
    ...(routed > 0 ? [words.routed(routed)] : []),
  ];
  return {
    title: words[view.side][view.won ? 'won' : 'lost'],
    losses: lost.length > 0 ? lost.join(', ') : words.noLoss,
    won: view.won,
  };
}
