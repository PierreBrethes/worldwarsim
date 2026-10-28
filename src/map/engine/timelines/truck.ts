import type { Sequence } from '../sequences';
import { ease, span } from './curves';

const OPEN_MS = 500;
const CLOSE_MS = 450;
/** The time the tailgate hangs, the time a troop steps down. `@a-mesurer`: until #277, which
 *  makes the men come down. */
const HELD_MS = 1000;
/** **The tailgate plays from 30 px**: the zoom stops at d = 3, where a truck reads some 50 px
 *  (34 by `seenBig`, which reads the backed-off eye's distance on the 42 degrees reference window)
 *  — the buildings' 150 px (`PLAY_PX`) would never let it play. `@a-mesurer` */
const MIN_PX = 30;
/** It falls to 93 degrees and hangs on its chains (`embarquer.js`, `T.gateOpen`). */
const DOWN = (93 * Math.PI) / 180;

/**
 * **The tailgate falls to let a troop step down** (`embarquer.js` of the interactions): it falls
 * backward in 500 ms (`out3`), hangs, and shuts in 450 ms (`in2`). Its pivot is its low edge, in
 * the file: a negative turn about x lays it toward -z, away from the bed.
 */
export function tailgateDrop(): Sequence<'landTransport'> {
  const closeAt = OPEN_MS + HELD_MS;
  const ms = closeAt + CLOSE_MS;
  return {
    family: 'landTransport',
    ms,
    minPx: MIN_PX,
    at(t) {
      if (t <= 0 || t >= ms) return {};
      const angle = DOWN * ease.out3(span(t, 0, OPEN_MS)) * (1 - ease.in2(span(t, closeAt, ms)));
      return { tailgate: { turn: [-angle, 0, 0] } };
    },
  };
}
