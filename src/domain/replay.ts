import type { UnitRole, UnitTier } from './ids';
import type { ReplayView } from './player-view';
import type { MapMotion } from './map-motion';

export type ReplayStep = 'voyage' | 'pose' | 'salves' | 'pertes' | 'deroute' | 'compte-rendu';

/** @a-mesurer — a short replay, read through in about ten seconds (grilling of 13/10). */
export const STEP_MS: Readonly<Record<ReplayStep, number>> = {
  voyage: 1500,
  pose: 1200,
  salves: 900,
  pertes: 3000,
  deroute: 1400,
  'compte-rendu': 2000,
};

export const REPLAY_STEPS: ReadonlyArray<ReplayStep> = [
  'voyage',
  'pose',
  'salves',
  'pertes',
  'deroute',
  'compte-rendu',
];

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
  const theirs = destinies(view.theirs.troops, view.theirs.destroyed, view.theirs.routed);

  // Losses fall one at a time, the two sides spread evenly across the step: a regular
  // alternation when they lost as many, the larger side falling more often otherwise.
  const fallsOf = (fates: ReadonlyArray<PieceFate>, side: 'mine' | 'theirs') => {
    const of = fates.filter((fate) => fate === 'fallen').length;
    return Array.from({ length: of }, (_, rank) => ({ side, key: (rank + 0.5) / of }));
  };
  const falls = [
    ...fallsOf(
      mine.map((piece) => piece.fate),
      'mine',
    ),
    ...fallsOf(theirs, 'theirs'),
  ].sort((a, b) => a.key - b.key || (a.side === 'mine' ? -1 : 1));

  // The n-th fallen piece of a side takes the n-th slot of that side.
  const slots = { mine: [] as number[], theirs: [] as number[] };
  falls.forEach((fall, order) => slots[fall.side].push(order));
  const losses = stepBounds('pertes');
  const slot = (losses.end - losses.start) / Math.max(1, falls.length);
  const rout = stepBounds('deroute');
  const share = (from: number, length: number) => Math.min(1, Math.max(0, (at - from) / length));
  const playOut = (fate: PieceFate, side: 'mine' | 'theirs') => {
    const progress =
      fate === 'routed'
        ? share(rout.start, rout.end - rout.start)
        : fate === 'fallen'
          ? share(losses.start + slots[side].shift()! * slot, slot)
          : 0;
    return progress > 0 ? { fate, progress } : { fate: 'standing' as const, progress: 0 };
  };

  return {
    step,
    progress,
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
