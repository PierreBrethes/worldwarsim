import type { Sequence } from '../sequences';
import { span } from './curves';

type Point = readonly [x: number, y: number, z: number];

/** The look ahead and behind a heading is read over, as a share of the path: the piece rounds a
 *  corner rather than snapping to the next leg. `@a-mesurer` */
const TURN_SHARE = 0.04;

/** **A walk plays as long as its piece stands** (`minPx` 0): the figurine's floor holds it up to
 *  d ≈ 30, its pin walks on beyond. The doors it passes play as far off (#268). */
export const WALK_MIN_PX = 0;

export type WalkOut = {
  /** World offsets from the piece's rest, in board units: from inside the door, through it, to
   *  the rest (`[0, 0, 0]`), its last leg along the rest's own front. */
  readonly path: ReadonlyArray<Point>;
  /** Milliseconds it waits in the dark before it walks: the doors open first. */
  readonly start: number;
  /** Milliseconds it walks. */
  readonly ms: number;
  /** Its pace (`ease.march`, `drive`, `push`). */
  readonly curve: (k: number) => number;
  /** A man marches, arms and legs (`stride`); a vehicle rolls. */
  readonly stride: boolean;
};

/**
 * **A piece walks out of its door to its rest** (#268, `storyboard-caserne`): hidden in the dark
 * of the doorway until `start`, it comes out of the dark over its first leg, then follows its path
 * at its pace, facing the way it goes, and stops on its rest. The whole piece moves: a squad
 * keeps its formation. `passed(k)` is when it has passed the `k`th point — what a door waits on to
 * close.
 */
export function walkOut(walk: WalkOut): Sequence<never> & { passed(point: number): number } {
  const { path, start, ms, curve, stride } = walk;
  const legs = path.slice(1).map((to, k) => distance(path[k]!, to));
  const length = legs.reduce((sum, leg) => sum + leg, 0);
  const end = start + ms;
  const travelled = (t: number) => length * curve(span(t, start, end));

  const pointAt = (s: number): Point => {
    let rest = Math.min(Math.max(s, 0), length);
    for (let k = 0; k < legs.length; k++) {
      const leg = legs[k]!;
      if (rest <= leg || k === legs.length - 1) {
        const [a, b] = [path[k]!, path[k + 1]!];
        const f = leg === 0 ? 1 : rest / leg;
        return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
      }
      rest -= leg;
    }
    return path[path.length - 1]!;
  };

  return {
    ms: end,
    minPx: WALK_MIN_PX,
    at(t) {
      if (t <= 0 || t >= end) return {};
      const s = travelled(t);
      const ahead = TURN_SHARE * length;
      const [from, to] = [pointAt(Math.min(s, length - ahead) - ahead), pointAt(s + ahead)];
      return {
        root: {
          travel: pointAt(s),
          heading: Math.atan2(to[0] - from[0], to[2] - from[2]),
          fade: Math.min(1, s / (legs[0] || 1)),
          ...(stride && t > start ? { stride: (t - start) / 1000 } : {}),
        },
      };
    },
    passed(point) {
      const at = legs.slice(0, point).reduce((sum, leg) => sum + leg, 0);
      for (let t = start; t < end; t += 10) if (travelled(t) >= at) return t;
      return end;
    },
  };
}

const distance = (a: Point, b: Point): number => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
