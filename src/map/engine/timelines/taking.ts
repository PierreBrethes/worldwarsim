import type { PartPose, Pose, Sequence } from '../sequences';
import { ease, span } from './curves';
import { WALK_MIN_PX } from './walk';

type Point = readonly [x: number, y: number, z: number];
type Man = `man_${number}`;

/** **What a man of mine does at a site he takes from** (#279, `storyboard-prise`): where he goes,
 *  in board units from his place in the pile, along the world's axes. */
export type Trip = { readonly part: Man; readonly to: Point };

/** **The storyboard's hours** (`prise.js`, `T`), in ms. `@a-mesurer` */
export const TAKING = {
  walk: 700,
  crateWalk: 600,
  bend: 300,
  lift: 450,
  swallow: 350,
  smoke: 2400,
  stop: 1200,
  tag: 300,
} as const;

/** A man walks so many metres a second: his stride follows the ground (`stride`). `@a-mesurer` */
const PACE_MPS = 1.4;
const ORIGIN: Point = [0, 0, 0];

const lerp = (a: Point, b: Point, k: number): Point => [
  a[0] + (b[0] - a[0]) * k,
  a[1] + (b[1] - a[1]) * k,
  a[2] + (b[2] - a[2]) * k,
];
const length = (p: Point): number => Math.hypot(p[0], p[1], p[2]);

/** One leg of his trip, `from` → `to` between `start` and `end`: facing the way, marching. */
function walking(from: Point, to: Point, t: number, start: number, end: number, perMetre: number) {
  const k = ease.march(span(t, start, end));
  const metres = (length([to[0] - from[0], 0, to[2] - from[2]]) * k) / perMetre;
  return {
    travel: lerp(from, to, k),
    heading: Math.atan2(to[0] - from[0], to[2] - from[2]),
    stride: metres / PACE_MPS,
  } satisfies PartPose;
}

/** **A man's trip, leg by leg**: out until `there`, his work until `back`, home by `home`. */
function tripOf(
  { to }: Trip,
  hours: { readonly there: number; readonly back: number; readonly home: number },
  work: (t: number) => PartPose,
  homeward: (t: number) => PartPose,
  perMetre: number,
) {
  return (t: number): PartPose => {
    if (t < hours.there) return walking(ORIGIN, to, t, 0, hours.there, perMetre);
    if (t < hours.back) return { travel: to, heading: Math.atan2(to[0], to[2]), ...work(t) };
    if (t < hours.home)
      return { ...walking(to, ORIGIN, t, hours.back, hours.home, perMetre), ...homeward(t) };
    return { travel: ORIGIN, ...homeward(t) };
  };
}

function sequenceOf(ms: number, men: ReadonlyArray<[Man, (t: number) => PartPose]>): Sequence {
  return {
    ms,
    // A squad's men are small on screen: they play as long as they stand, as a walk does.
    minPx: WALK_MIN_PX,
    at: (t) =>
      t <= 0 || t >= ms
        ? {}
        : (Object.fromEntries(men.map(([part, at]) => [part, at(t)])) as Pose<never>),
  };
}

/**
 * **Ramasser** (#279, décision 6) : un homme va à la caisse, se penche, la met à l'épaule et la
 * ramène à sa place, où elle s'efface dans le rang — l'étiquette de cargaison prend le relais.
 */
export function crateTaking({
  part,
  to,
  perMetre,
}: Trip & { readonly perMetre: number }): Sequence {
  const there = TAKING.crateWalk;
  const lift = there + TAKING.bend;
  const back = lift + TAKING.lift;
  const home = back + TAKING.crateWalk;
  const ms = home + TAKING.tag + 200;
  const at = tripOf(
    { part, to },
    { there, back, home },
    (t) => {
      const lifted = ease.out3(span(t, lift, back));
      return { carry: [ease.out3(span(t, there, lift)) * (1 - lifted), lifted, 1] };
    },
    (t) => ({ carry: [0, 1, 1 - span(t, home, home + TAKING.tag)] }),
    perMetre,
  );
  return sequenceOf(ms, [[part, at]]);
}
