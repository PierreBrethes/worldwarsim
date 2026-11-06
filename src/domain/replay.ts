import type { UnitRole, UnitTier } from './ids';
import type { ReplayView } from './player-view';
import type { MapMotion } from './map-motion';
import { DOMAIN_BY_ROLE } from './troops';

export type ReplayStep = 'voyage' | 'pose' | 'frappe' | 'riposte' | 'deroute' | 'compte-rendu';

/** @a-mesurer — a short replay, read through in about ten seconds (grilling of 13/10). */
export const STEP_MS: Readonly<Record<ReplayStep, number>> = {
  voyage: 1500,
  pose: 1200,
  frappe: 1950,
  riposte: 1950,
  deroute: 1400,
  'compte-rendu': 2000,
};

export const REPLAY_STEPS: ReadonlyArray<ReplayStep> = [
  'voyage',
  'pose',
  'frappe',
  'riposte',
  'deroute',
  'compte-rendu',
];

/** The share of a fire step the shots take; the struck side falls over the rest of it. */
export const VOLLEY_SHARE = 0.4;

/** **The initiative, played in two beats** (B16): the attacker fires in the strike, the defender
 *  in the riposte, and each beat fells only the side it was aimed at. */
const FIRING_SIDE: Partial<Record<ReplayStep, ReplayView['side']>> = {
  frappe: 'attacker',
  riposte: 'defender',
};

export const REPLAY_MS = REPLAY_STEPS.reduce((sum, step) => sum + STEP_MS[step], 0);

/** @a-mesurer — le tampon se pose 0,4 s après la coulée, soit à la fin du compte-rendu, et tient 2 s
 *  sur la mer vide sous sa nappe (storyboard : `report = sink[1] + 0,4`, `total = report + 2,0`) */
export const SINK_HOLD_MS = 2000;

/** **Combien dure la scène d'une vue** (#514) : les six temps, et `SINK_HOLD_MS` de plus quand une
 *  coque coule en mer. Les autres combats gardent `REPLAY_MS`. */
export function sceneMsOf(view: ReplayView): number {
  if (view.atSea !== true) return REPLAY_MS;
  /** What goes down is a hull or a wing: what a ship carries is not drawn (`afloat`). */
  const afloat = (entry: { readonly role: UnitRole; readonly destroyed: number }) =>
    entry.destroyed > 0 && DOMAIN_BY_ROLE[entry.role] !== 'land';
  const sinks =
    view.mine.some(afloat) ||
    (view.faced === undefined ? view.theirs.destroyed > 0 : view.faced.forces.some(afloat));
  return sinks ? REPLAY_MS + SINK_HOLD_MS : REPLAY_MS;
}

export function stepBounds(step: ReplayStep): { start: number; end: number } {
  let start = 0;
  for (const each of REPLAY_STEPS) {
    if (each === step) break;
    start += STEP_MS[each];
  }
  return { start, end: start + STEP_MS[step] };
}

type PieceFate = 'standing' | 'fallen' | 'routed';

/**
 * One troop on the table. `progress` is how far its fate has played, 0..1 — a fall or a retreat
 * under way; a standing piece is at 0. **An enemy piece carries its role only when it was seen
 * at the fire** (F1): an account written before 14/10 has none, and stands a block.
 */
export type ReplayPiece =
  | {
      readonly side: 'mine';
      readonly role: UnitRole;
      readonly tier: UnitTier;
      readonly fate: PieceFate;
      readonly progress: number;
      /** A fallen piece: the clock (ms) at which its fall ends, what its sinking is anchored on. */
      readonly fellAt?: number;
    }
  | {
      readonly side: 'theirs';
      readonly seen?: { readonly role: UnitRole; readonly tier: UnitTier };
      readonly fate: PieceFate;
      readonly progress: number;
      readonly fellAt?: number;
    };

export type ReplayFrame = {
  readonly step: ReplayStep;
  readonly progress: number;
  /** Who fires in this step — `null` outside the strike and the riposte. */
  readonly firing: 'mine' | 'theirs' | null;
  /** Mine first, in the view's order and one per troop; then the enemy's blocks. */
  readonly pieces: ReadonlyArray<ReplayPiece>;
  /** **Past the six steps** (#514), ms: where a scene in which a hull sinks holds its empty sea, slick
   *  and stamp. 0 for every other frame. */
  readonly overtime: number;
  /** Where this scene ends, ms: `REPLAY_MS`, or past it by `SINK_HOLD_MS` when a hull sinks. */
  readonly end: number;
};

/**
 * The first `destroyed` fall, the next `routed` rout, the rest stand — per entry. **A piece is a
 * troop, and only a destroyed troop falls**: losses in men leave it standing whole, its three
 * figurines included — as on the board, where a weak troop drops no figurine (grilling, tour 4).
 * The account card gives the men.
 */
function destinies(troops: number, destroyed: number, routed: number): PieceFate[] {
  const falls = Math.min(troops, destroyed);
  const routs = Math.min(troops - falls, routed);
  return Array.from({ length: troops }, (_, k) =>
    k < falls ? 'fallen' : k < falls + routs ? 'routed' : 'standing',
  );
}

/**
 * **What the table shows at `t` ms from the start.** Reduced motion shows each step already
 * played out; cut motion goes straight to the account (ADR 0026 §8).
 */
export function replayAt(view: ReplayView, t: number, motion: MapMotion = 'full'): ReplayFrame {
  const shown = motion === 'off' ? REPLAY_MS : Math.min(REPLAY_MS, Math.max(0, t));
  const end = sceneMsOf(view);
  const overtime = motion === 'full' ? Math.min(end - REPLAY_MS, Math.max(0, t - REPLAY_MS)) : 0;
  const step = REPLAY_STEPS.find((each) => shown < stepBounds(each).end) ?? REPLAY_STEPS.at(-1)!;
  const bounds = stepBounds(step);
  const at = motion === 'reduced' ? bounds.end : shown;
  const progress = Math.min(1, (at - bounds.start) / (bounds.end - bounds.start));

  const byKind = (kinds: ReplayView['mine']) =>
    kinds.flatMap((entry) =>
      destinies(entry.troops, entry.destroyed, entry.routed).map((fate) => ({
        role: entry.role,
        tier: entry.tier,
        fate,
      })),
    );
  const mine = byKind(view.mine);
  /** Bombardée, la cible ne voit pas d'où vient le coup : aucune batterie sur sa table. */
  const unseen = view.bombardment !== undefined && view.side === 'defender';
  const theirs: Array<{ fate: PieceFate; seen?: { role: UnitRole; tier: UnitTier } }> = unseen
    ? []
    : view.faced
      ? byKind(view.faced.forces).map(({ role, tier, fate }) => ({ seen: { role, tier }, fate }))
      : destinies(view.theirs.troops, view.theirs.destroyed, view.theirs.routed).map((fate) => ({
          fate,
        }));

  // Each side falls in the beat aimed at it, one piece at a time across what the shots leave of it.
  const struckIn = (side: 'mine' | 'theirs') => {
    const firedAt = (view.side === 'attacker') === (side === 'theirs') ? 'frappe' : 'riposte';
    const { start, end } = stepBounds(firedAt);
    const from = start + VOLLEY_SHARE * (end - start);
    return { from, length: end - from };
  };
  const ranks = { mine: 0, theirs: 0 };
  const fallCount = {
    mine: mine.filter((piece) => piece.fate === 'fallen').length,
    theirs: theirs.filter((piece) => piece.fate === 'fallen').length,
  };
  const rout = stepBounds('deroute');
  const share = (from: number, length: number) => Math.min(1, Math.max(0, (at - from) / length));
  const playOut = (fate: PieceFate, side: 'mine' | 'theirs') => {
    let fellAt: number | undefined;
    const fall = () => {
      const { from, length } = struckIn(side);
      const slot = length / fallCount[side];
      const begins = from + ranks[side]++ * slot;
      fellAt = begins + slot;
      return share(begins, slot);
    };
    const progress =
      fate === 'routed' ? share(rout.start, rout.end - rout.start) : fate === 'fallen' ? fall() : 0;
    if (progress <= 0) return { fate: 'standing' as const, progress: 0 };
    return fellAt === undefined ? { fate, progress } : { fate, progress, fellAt };
  };

  /** Un bombardement n'a pas de riposte (B20). */
  const firing =
    view.bombardment !== undefined && step === 'riposte' ? undefined : FIRING_SIDE[step];
  return {
    step,
    progress,
    overtime,
    end,
    firing: firing === undefined ? null : firing === view.side ? 'mine' : 'theirs',
    pieces: [
      ...mine.map((piece): ReplayPiece => ({
        side: 'mine',
        role: piece.role,
        tier: piece.tier,
        ...playOut(piece.fate, 'mine'),
      })),
      ...theirs.map((piece): ReplayPiece => ({
        side: 'theirs',
        ...(piece.seen ? { seen: piece.seen } : {}),
        ...playOut(piece.fate, 'theirs'),
      })),
    ],
  };
}

/** Where an arrow leads from `t`: the start of the next step — the end, past the last — or of the previous one. */
export function steppedFrom(t: number, direction: 1 | -1): number {
  const current = REPLAY_STEPS.findIndex((step) => t < stepBounds(step).end);
  const index = (current === -1 ? REPLAY_STEPS.length : current) + direction;
  if (index <= 0) return 0;
  const step = REPLAY_STEPS[index];
  return step === undefined ? REPLAY_MS : stepBounds(step).start;
}

/** **Le naufrage** (#483, storyboard « 5. Le naufrage »). @a-mesurer — la gîte à la chute, 14° sur le bord touché (storyboard) */
const HEEL = (14 * Math.PI) / 180;
/** @a-mesurer — le tangage de la coulée par l'arrière, 9° (storyboard) */
const PITCH = (9 * Math.PI) / 180;
/** @a-mesurer — la gîte où la coque finit, 22° (storyboard), tenue par l'épave de la pose finale */
const FINAL_HEEL = (22 * Math.PI) / 180;
/** @a-mesurer — la coulée finit 1,6 s après le début du compte-rendu : à juger à l'œil, avant l'effacement du tampon */
const SINK_MS = 1600;
/** @a-mesurer — la coulée commence 1 s après la fin de la chute de la coque (storyboard : `P.sink[0] = P.hit + 1,0`) */
const SINK_LAG_MS = 1000;

/**
 * **Où en est une coque coulée**, 0..1 : de 1 s après sa chute (`fellAt`, d'une pièce tombée) à
 * `SINK_MS` du compte-rendu. `still` (temps figés) : rien avant le compte-rendu, tout d'un coup à
 * lui — les étapes se jouent comme le code les joue (décision 9 du 05/11).
 */
export function sinkOf(frame: ReplayFrame, fellAt: number, still: boolean): number {
  if (still) return frame.step === 'compte-rendu' ? 1 : 0;
  const from = fellAt + SINK_LAG_MS;
  const clock = clockOf(frame);
  const to = stepBounds('compte-rendu').start + SINK_MS;
  return Math.min(1, Math.max(0, (clock - from) / (to - from)));
}

/** **La pose d'une coque coulée**, en radians ; `depth` est la part de sa coulée, 0..1. `fall` et
 *  `sunk` valent 0..1, lissés par l'appelant. */
export function hullPose(
  fall: number,
  sunk: number,
): { heel: number; pitch: number; depth: number } {
  return { heel: HEEL * fall + (FINAL_HEEL - HEEL) * sunk, pitch: PITCH * sunk, depth: sunk };
}

/** @a-mesurer — la nappe s'étale jusqu'à 1,5 s après la fin de la coulée (storyboard : `sink[1] + 1,5`) */
const SLICK_TAIL_MS = 1500;
/** @a-mesurer — les bulles montent 0,6 s avant la fin de la coulée (storyboard : `sink[1] - 0,6`) */
const BUBBLES_LEAD_MS = 600;
/** @a-mesurer — les bulles vivent 1,4 s (storyboard : `life: 1.4`) */
const BUBBLES_MS = 1400;
/** @a-mesurer — l'étiquette de places se barre 1,6 s après le début de la coulée (storyboard : `sink[0] + 1,6`) */
const STRIKE_MS = 1600;

const clockOf = (frame: ReplayFrame) =>
  stepBounds(frame.step).start + frame.progress * STEP_MS[frame.step] + frame.overtime;

/**
 * **Où en est la nappe sous une coque coulée**, 0..1 : de sa coulée (`sinkOf`) à `SLICK_TAIL_MS`
 * après qu'elle finit. `still` (temps figés) : toute au compte-rendu, rien avant.
 */
export function slickOf(frame: ReplayFrame, fellAt: number, still: boolean): number {
  if (still) return frame.step === 'compte-rendu' ? 1 : 0;
  const from = fellAt + SINK_LAG_MS;
  const to = stepBounds('compte-rendu').start + SINK_MS + SLICK_TAIL_MS;
  return Math.min(1, Math.max(0, (clockOf(frame) - from) / (to - from)));
}

/** **L'âge des bulles**, 0..1, ou `null` hors de leur vie ; figées, elles ne montent pas. */
export function bubblesOf(frame: ReplayFrame, still: boolean): number | null {
  if (still) return null;
  const born = stepBounds('compte-rendu').start + SINK_MS - BUBBLES_LEAD_MS;
  const age = (clockOf(frame) - born) / BUBBLES_MS;
  return age >= 0 && age <= 1 ? age : null;
}

/** Quand l'étiquette de places d'un camp qui perd sa cargaison se barre, et quand la coque a fini de couler. */
export type SeatsTagWindow = { readonly struckAt: number; readonly goneAt: number };

/** **La vie de l'étiquette de places** : la première coque de mon camp qui tombe fixe l'heure où elle
 *  se barre ; `null` quand aucune ne tombe. */
export function seatsTagWindow(view: ReplayView): SeatsTagWindow | null {
  const fells = replayAt(view, REPLAY_MS).pieces.flatMap((piece) =>
    piece.side === 'mine' && piece.fate === 'fallen' && piece.fellAt !== undefined
      ? [piece.fellAt]
      : [],
  );
  if (fells.length === 0) return null;
  return {
    struckAt: Math.min(...fells) + SINK_LAG_MS + STRIKE_MS,
    goneAt: stepBounds('compte-rendu').start + SINK_MS,
  };
}

/** **L'étiquette de places à cet instant** : entière, barrée, ou plus là — la mer est vide. Aux temps
 *  figés, entière jusqu'au compte-rendu. */
export function seatsTagAt(
  window: SeatsTagWindow | null,
  frame: ReplayFrame,
  still: boolean,
): 'whole' | 'struck' | null {
  if (window === null) return null;
  if (still) return frame.step === 'compte-rendu' ? null : 'whole';
  const clock = clockOf(frame);
  return clock >= window.goneAt ? null : clock >= window.struckAt ? 'struck' : 'whole';
}
