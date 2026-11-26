import { FLAG_SWAP_MS } from './ink-bursts';
import type { MapMotion } from './map-motion';
import { MAST_UNITS } from './strategic-mast';

/** The flame's top edge when it is at the foot: a whole pennant above the ground. */
export const FLAG_FOOT = MAST_UNITS.flame / MAST_UNITS.height;

/** @a-mesurer : the ink's fade in reduced motion, where the flame stays put (#682) */
export const FLAG_FADE_MS = 600;

/** How long the swap of a flame lasts: `FLAG_SWAP_MS` is also what the seal waits for. */
export const flagSwapMs = (motion: MapMotion): number =>
  motion === 'full' ? FLAG_SWAP_MS : motion === 'reduced' ? FLAG_FADE_MS : 0;

/** What a taken point's flame shows `elapsedMs` after the new holder is served. */
export type FlagSwap = {
  /** Height of the flame's top edge, as a share of the mast. */
  readonly flameAt: number;
  /** Share of the way from the old ink to the new one. */
  readonly mix: number;
};

const ease = (t: number): number => t * t * (3 - 2 * t);

/**
 * **La prise d'un point** (#682): the flame goes down from `from` to the foot of the mast, changes
 * ink there, and climbs back to `to`, in `FLAG_SWAP_MS` (#442's 0.8 s each way). Reduced, the flame
 * stays at `to` and the ink fades; cut, the ink is the new one from the first frame.
 */
export function flagSwapAt(
  elapsedMs: number,
  motion: MapMotion,
  from: number,
  to: number,
): FlagSwap {
  if (motion === 'off') return { flameAt: to, mix: 1 };
  if (motion === 'reduced')
    return { flameAt: to, mix: Math.min(1, Math.max(0, elapsedMs / FLAG_FADE_MS)) };
  const progress = Math.min(1, Math.max(0, elapsedMs / FLAG_SWAP_MS));
  const foot = Math.min(FLAG_FOOT, from, to);
  if (progress < 0.5) return { flameAt: from + (foot - from) * ease(progress * 2), mix: 0 };
  return { flameAt: foot + (to - foot) * ease(progress * 2 - 1), mix: 1 };
}
