import { ease, span } from './curves';
import type { Lift } from './derrick';
import { measured, type P3 } from './gangway';
import type { PartPose, Sequence } from '../sequences';

/**
 * **A vehicle lifted aboard a cargo** (#505): it drives its `path` on the board (the first point
 * its rest) from `driveStart` to `arrive` (ms), waits under the mast's tip, is hoisted as `lift`
 * says — `toBoard` takes a point of the hull to the board — turning with the mast (`swing`: the
 * board's heading of a heading of the hull), and is gone, faded across the coaming, once
 * lowered. Pure of the clock.
 */
export function hoistedOf({
  path,
  driveStart,
  arrive,
  lift,
  toBoard,
  swing,
}: {
  readonly path: ReadonlyArray<P3>;
  readonly driveStart: number;
  readonly arrive: number;
  readonly lift: Lift;
  readonly toBoard: (point: P3) => P3;
  readonly swing: (yaw: number) => number;
}): Sequence<never> {
  const { length, at: along } = measured(path);
  const rest = path[0]!;
  const ms = lift.dropped + 1;
  const moved = (to: P3): [number, number, number] => [
    to[0] - rest[0],
    to[1] - rest[1],
    to[2] - rest[2],
  ];
  const end = along(length);
  const slung = swing(lift.at(lift.lifted).yaw);
  return {
    ms,
    anywhere: true,
    pool: 'boarding',
    at(t) {
      if (t < 0 || t >= ms) return {};
      let pose: PartPose = {};
      if (t < driveStart) return {};
      if (t < arrive) {
        const there = along(ease.drive(span(t, driveStart, arrive)) * length);
        pose = { travel: moved(there.at), heading: there.heading };
      } else if (t < lift.lifted) {
        pose = { travel: moved(end.at), heading: end.heading };
      } else {
        const { load, yaw, fade } = lift.at(t);
        pose = {
          travel: moved(load === null ? end.at : toBoard(load)),
          heading: end.heading + swing(yaw) - slung,
          fade,
        };
      }
      return { root: pose };
    },
  };
}
