import { fr } from '@/i18n/fr';
import type { Medium, UnitRole } from './ids';
import { troopSpan } from './piece-size';
import { SQUAD_DRAWN_WHOLE } from './pile-pieces';
import { DOMAIN_BY_ROLE, seatsOf } from './troops';
import { REPLAY_MS, STEP_MS, replayAt, type ReplayFrame } from './replay';
import type { LonLat } from './geo';
import type { MapMotion } from './map-motion';
import type { ArcView, CombatReport, ReplayView } from './player-view';

/**
 * **Le combat sur la carte** (#272) : un combat d'arrivée — à terre, ou en mer sur une pile
 * mouillée (#324) — se joue à son point, aux six
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
const STALE_MARGIN_MS = 30_000;

/** **Ce que tient la pose finale**, quand rien ne joue (coupées, plus de douze pièces, budget
 *  plein). @a-mesurer : le temps du compte-rendu, assez pour lire qui reste debout ? */
export const FINAL_POSE_MS = STEP_MS['compte-rendu'];

/** **Les combats qu'une vue apporte et que la précédente n'avait pas** — jamais à la première
 *  vue (`known` nul), jamais un combat fini depuis longtemps (un portable qui sort de veille) :
 *  l'arrivée et le bombardement (#325), sur terre comme en mer ; l'interception est un autre lot. */
export function freshCombats(
  known: ReadonlySet<string> | null,
  reports: ReadonlyArray<CombatReport>,
  now: number,
): ReadonlyArray<CombatReport> {
  if (known === null) return [];
  return reports.filter(
    (report) =>
      report.cause !== 'interception' &&
      !known.has(report.id) &&
      report.at >= now - REPLAY_MS - STALE_MARGIN_MS,
  );
}

/** **La Blitz ne joue aucune scène** : ses dépêches ne se retiennent pas, elles partent aussitôt. */
export const scenesToPlay = (
  blitz: boolean,
  known: ReadonlySet<string> | null,
  reports: ReadonlyArray<CombatReport>,
  now: number,
): ReadonlyArray<CombatReport> => (blitz ? [] : freshCombats(known, reports, now));

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
  /** **The account begins** (#327): the stamp goes up. Where a hull sinks, at the end of the six
   *  steps, with the empty sea (#514); everywhere else as the account step begins. */
  readonly reportDue: boolean;
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
  const full = !still && motion === 'full';
  const sinks = frame.end > REPLAY_MS;
  return {
    frame,
    turns,
    over: t >= (still ? FINAL_POSE_MS : full ? frame.end : REPLAY_MS),
    reportDue: full && sinks ? t >= REPLAY_MS : frame.step === 'compte-rendu',
  };
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

/**
 * **Un combat en mer se joue entre navires et avions** (#324) : ce que portent les navires — les
 * troupes de terre — ne se montre pas, et sa noyade reste à la dépêche (`drownedAtSea`). L'ennemi
 * vu au feu perd de même ses passagers ; l'ennemi non relevé reste compté tel quel, rien ne disant
 * ce qui flottait.
 */
export function afloat(view: ReplayView): ReplayView {
  const ship = (entry: { readonly role: UnitRole }) => DOMAIN_BY_ROLE[entry.role] !== 'land';
  if (view.faced === undefined) return { ...view, mine: view.mine.filter(ship) };
  const forces = view.faced.forces.filter(ship);
  const sum = (key: 'troops' | 'lost' | 'routed' | 'destroyed') =>
    forces.reduce((total, force) => total + force[key], 0);
  return {
    ...view,
    mine: view.mine.filter(ship),
    theirs: {
      troops: sum('troops'),
      lost: sum('lost'),
      routed: sum('routed'),
      destroyed: sum('destroyed'),
    },
    faced: { ...view.faced, forces },
  };
}

/**
 * **Ce que la scène au point pose** (#325) : chez le tireur d'un bombardement, le camp d'en face
 * seul — sa batterie reste sa propre pile, sa pièce relayée par une copie qui tire (ADR 0036 §5,
 * précisée le 02/11). Ailleurs, tout le combat.
 */
export function sceneOf(view: ReplayView): ReplayView {
  return view.bombardment !== undefined && view.side === 'attacker' ? { ...view, mine: [] } : view;
}

/**
 * **La mesure d'une scène de combat** (#324) : sa plus longue pièce, un char au moins — un bloc
 * ennemi se mesure en char (`ANONYMOUS_SPAN`). Ce qui la cadre, la montre de loin et la pose.
 */
export function sceneSpan(view: ReplayView): number {
  const roles = [...view.mine, ...(view.faced?.forces ?? [])].map((entry) => entry.role);
  return Math.max(troopSpan('armor'), ...roles.map((role) => troopSpan(role)));
}

/** **Combien de temps le tampon du compte-rendu reste posé**, de son apparition : le reste du
 *  compte-rendu, puis six secondes. @a-mesurer : le temps de lire « nos pièces » et de l'ouvrir. */
export const REPORT_HOLD_MS = STEP_MS['compte-rendu'] + 6000;

/**
 * **Ce que dit le tampon du compte-rendu** (#327) : l'issue vue du lecteur — en mer, un
 * engagement, qu'on attaque ou qu'on défende (#324) ; bombardé, le coup du tireur ou les pilonnés
 * (#325) — et ses propres pertes
 * en pièces — la dépêche garde les hommes. `won` fait l'encre : rouge quand on gagne.
 */
export function reportOf(
  view: ReplayView,
  medium: Medium = 'land',
): {
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
    title:
      view.bombardment !== undefined
        ? words.bombardment[view.side]
        : view.drowned !== undefined
          ? words.drowned
          : (medium === 'sea' ? words.sea : words[view.side])[view.won ? 'won' : 'lost'],
    losses: `${words.ours} : ${lost.length > 0 ? lost.join(', ') : words.noLoss}`,
    won: view.won,
  };
}

/**
 * **L'étiquette de places de la coque qui coule** (#514), une pour tout le point : les places prises
 * sur celles des coques tombées — `drowned.seats`, que seul le camp qui les perd reçoit (#513).
 * `null` pour qui voit couler : il ne sait rien de la cargaison.
 */
export function seatsTagOf(view: ReplayView): string | null {
  if (view.drowned === undefined) return null;
  const hulls = view.mine.filter((entry) => entry.destroyed > 0 && seatsOf(entry.role) > 0);
  const first = hulls[0]?.role;
  if (first !== 'cargo' && first !== 'carrier' && first !== 'airTransport') return null;
  const seats = hulls.reduce((sum, entry) => sum + seatsOf(entry.role) * entry.destroyed, 0);
  return fr.replay.seatsTag(first, view.drowned.seats, seats);
}

/** A journey ends « by the combat » within this share of its camera distance. @a-mesurer : « voir »
 *  centre le combat, et un voyage ailleurs en est à plusieurs fois cette distance. */
const STAMP_NEAR_SHARE = 0.5;

/** **Le tampon reste quand la caméra arrive près de son point** : le « voir » de sa dépêche ne le
 *  lève pas ; un voyage ailleurs, si. `gap` et `cameraDistance` sont dans la même unité. */
export function stampStays(gap: number, cameraDistance: number): boolean {
  return gap <= cameraDistance * STAMP_NEAR_SHARE;
}
