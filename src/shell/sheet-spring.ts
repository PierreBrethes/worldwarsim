/** The sheet's height in screen pixels and its speed in pixels per millisecond (positive = growing). */
export type Spring = { h: number; v: number };

/** @a-mesurer: the feel of the release — a little overshoot, settled in about a third of a second. */
const OMEGA = 0.02;
const ZETA = 0.75;

/**
 * **Le ressort de la feuille, pur** : avance `state` de `ms` vers `target`. `ceiling` est le cran
 * haut : un lancer vers le haut s'y arrête, il ne rebondit pas au-delà.
 */
export function stepSpring(state: Spring, target: number, ceiling: number, ms: number): Spring {
  let { h, v } = state;
  for (let left = Math.min(ms, 64); left > 0; left--) {
    v += -OMEGA * OMEGA * (h - target) - 2 * ZETA * OMEGA * v;
    h += v;
    if (h > ceiling) {
      h = ceiling;
      v = Math.min(v, 0);
    }
  }
  return { h, v };
}

export const isSettled = (state: Spring, target: number): boolean =>
  Math.abs(state.h - target) < 0.5 && Math.abs(state.v) < 0.005;
