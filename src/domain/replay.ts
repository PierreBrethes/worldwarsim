import type { UnitRole, UnitTier } from './ids';
import type { ReplayView } from './player-view';
import type { MapMotion } from './map-motion';

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

export function stepBounds(step: ReplayStep): { start: number; end: number } {
  let start = 0;
  for (const each of REPLAY_STEPS) {
    if (each === step) break;
    start += STEP_MS[each];
  }
  return { start, end: start + STEP_MS[step] };
}

export type PieceFate = 'standing' | 'fallen' | 'routed';

/**
 * One troop on the table. `progress` is how far its fate has played, 0..1 — a fall or a retreat
 * under way; a standing piece is at 0. **An enemy piece has no role, structurally**: a block.
 */
export type ReplayPiece =
  | {
      readonly side: 'mine';
      readonly role: UnitRole;
      readonly tier: UnitTier;
      readonly fate: PieceFate;
      readonly progress: number;
    }
  | { readonly side: 'theirs'; readonly fate: PieceFate; readonly progress: number };

export type ReplayFrame = {
  readonly step: ReplayStep;
  readonly progress: number;
  /** Who fires in this step — `null` outside the strike and the riposte. */
  readonly firing: 'mine' | 'theirs' | null;
  /** Mine first, in the view's order and one per troop; then the enemy's blocks. */
  readonly pieces: ReadonlyArray<ReplayPiece>;
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
  const step = REPLAY_STEPS.find((each) => shown < stepBounds(each).end) ?? REPLAY_STEPS.at(-1)!;
  const bounds = stepBounds(step);
  const at = motion === 'reduced' ? bounds.end : shown;
  const progress = Math.min(1, (at - bounds.start) / (bounds.end - bounds.start));

  const mine = view.mine.flatMap((entry) =>
    destinies(entry.troops, entry.destroyed, entry.routed).map((fate) => ({
      role: entry.role,
      tier: entry.tier,
      fate,
    })),
  );
  /** Bombardée, la cible ne voit pas d'où vient le coup : aucune batterie sur sa table. */
  const unseen = view.bombardment !== undefined && view.side === 'defender';
  const theirs = unseen
    ? []
    : destinies(view.theirs.troops, view.theirs.destroyed, view.theirs.routed);

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
    theirs: theirs.filter((fate) => fate === 'fallen').length,
  };
  const rout = stepBounds('deroute');
  const share = (from: number, length: number) => Math.min(1, Math.max(0, (at - from) / length));
  const playOut = (fate: PieceFate, side: 'mine' | 'theirs') => {
    const fall = () => {
      const { from, length } = struckIn(side);
      const slot = length / fallCount[side];
      return share(from + ranks[side]++ * slot, slot);
    };
    const progress =
      fate === 'routed' ? share(rout.start, rout.end - rout.start) : fate === 'fallen' ? fall() : 0;
    return progress > 0 ? { fate, progress } : { fate: 'standing' as const, progress: 0 };
  };

  /** Un bombardement n'a pas de riposte (B20). */
  const firing =
    view.bombardment !== undefined && step === 'riposte' ? undefined : FIRING_SIDE[step];
  return {
    step,
    progress,
    firing: firing === undefined ? null : firing === view.side ? 'mine' : 'theirs',
    pieces: [
      ...mine.map((piece): ReplayPiece => ({
        side: 'mine',
        role: piece.role,
        tier: piece.tier,
        ...playOut(piece.fate, 'mine'),
      })),
      ...theirs.map((fate): ReplayPiece => ({ side: 'theirs', ...playOut(fate, 'theirs') })),
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
