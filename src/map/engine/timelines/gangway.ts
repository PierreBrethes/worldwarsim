import { MOLE } from '@/emblems/kits/manifest';
import type { PartPose, Sequence } from '../sequences';
import { ease, span } from './curves';
import { WALK_MIN_PX } from './walk';

/** A point in the port's metres, or on the board when `gangwayOf` reads it. */
export type P3 = readonly [x: number, y: number, z: number];
type Point = { readonly x: number; readonly y: number; readonly z: number };

/** The mole's deck, level with the quay (`MOLE.lift` and the kit's 0.5 m). */
const DECK = MOLE.lift + 0.5;
/** **Where the men walk on the mole**, in metres of `port.glb`: the line along the quay they take
 *  before it, the lane of the mole's outer edge (the mole is 20 m wide, its centre at `MOLE.x`),
 *  and the foot of the plank, on the deck. `@a-mesurer` (storyboard `mer-air`, « 1. Au cargo ») */
const QUAY_LINE = MOLE.quay - 2;
const OUTER_LANE = MOLE.x + 7;
const PLANK_FOOT = MOLE.inner + 2;

/**
 * **The gangway mark a hull is boarded by**: of its two (`fx_passerelle`, `fx_passerelle_tribord`),
 * the one nearest the mole's inner face. The geometry tells, not the names: a hull berthed the
 * other way, or a port laid in mirror (#476, read in the file's metres), turns them over.
 */
export function gangwayDoor<T extends Point>(marks: ReadonlyArray<T>): T {
  return marks.reduce((best, mark) =>
    Math.abs(mark.x - MOLE.inner) < Math.abs(best.x - MOLE.inner) ? mark : best,
  );
}

/** Where the plank rests on the mole, at the door's station. */
export const plankFoot = (door: Point): P3 => [PLANK_FOOT, DECK, door.z];

/**
 * **A man's way to the door**: from his rest, along the quay to the mole's outer edge, down it to
 * the door's station, across the deck to the plank's foot, then up the plank to the door. The
 * points after the rest, in the port's metres.
 */
export function quayWay(from: { readonly x: number; readonly z: number }, door: Point): P3[] {
  const way: P3[] = [];
  // Already past the quay line (on the mole itself): he joins the outer lane from where he is.
  if (from.z < QUAY_LINE) way.push([from.x, DECK, QUAY_LINE]);
  way.push([OUTER_LANE, DECK, Math.min(from.z, QUAY_LINE)], [OUTER_LANE, DECK, door.z]);
  way.push(plankFoot(door), [door.x, door.y, door.z]);
  return way;
}

/** A man's pace, in his heights a second (`boarding.ts`'s). */
const MAN_SPEED = 1.7;
/** The storyboard's hours (« au cargo »), in ms: the plank lies in 400; the first man leaves 300
 *  after it starts, then one every 600; a man is taken by the dark of the door over 200; the plank
 *  is taken in 200 after the last. `@a-mesurer` */
const T = { plank: 400, first: 300, gap: 600, swallow: 200, after: 200 } as const;

/** The plank's two instants, from the sequence's start: it is taken in from `up`. */
export type Plank = { readonly up: number };

/** **How far the plank is laid**, 0 to 1 (`out3` down, `in2` up). */
export function plankAt(t: number, { up }: Plank): number {
  return ease.out3(span(t, 0, T.plank)) * (1 - ease.in2(span(t, up, up + T.plank)));
}

/** How long the plank takes to lie or to be taken in. */
export const PLANK_MS = T.plank;

/**
 * **The men of the squads that board a hull by its gangway** (#479, storyboard « 1. Au cargo »):
 * each on his own path (board points, the first his rest), the nearest first, one every `T.gap`,
 * at his own pace; the dark of the door takes him over his last 200 ms. Rend la séquence de chaque
 * escouade, quand son dernier homme a passé la porte (`through`, in ms), la planche, et quand tout
 * est rangé (`settled`).
 */
export function gangwayOf(boarding: {
  readonly man: number;
  readonly squads: ReadonlyArray<{ readonly men: ReadonlyArray<ReadonlyArray<P3>> }>;
}): {
  readonly squads: ReadonlyArray<Sequence<never>>;
  readonly through: ReadonlyArray<number>;
  readonly plank: Plank;
  readonly settled: number;
} {
  const speed = (MAN_SPEED * boarding.man) / 1000;
  const men = boarding.squads.flatMap(({ men: paths }, squad) =>
    paths.map((path, k) => ({ squad, k, path, ...measured(path), start: 0, end: 0 })),
  );
  [...men]
    .sort((a, b) => a.length - b.length)
    .forEach((man, order) => {
      man.start = T.first + order * T.gap;
      man.end = man.start + man.length / speed;
    });
  const last = Math.max(0, ...men.map(({ end }) => end));
  const plank = { up: last + T.after };

  const squads = boarding.squads.map((_, squad): Sequence<never> => {
    const mine = men.filter((man) => man.squad === squad);
    const ms = mine.length === 0 ? 0 : Math.max(...mine.map(({ end }) => end)) + 1;
    return {
      ms,
      minPx: WALK_MIN_PX,
      at(t) {
        if (t < 0 || t >= ms) return {};
        const pose: Record<string, PartPose> = {};
        for (const man of mine) {
          if (t < man.start) continue;
          const s = Math.min(t - man.start, man.end - man.start) * speed;
          const { at, heading } = man.at(s);
          const rest = man.path[0]!;
          pose[`man_${man.k}`] = {
            travel: [at[0] - rest[0], at[1] - rest[1], at[2] - rest[2]],
            heading,
            ...(t < man.end ? { stride: (t - man.start) / 1000 } : {}),
            fade: 1 - span(t, man.end - T.swallow, man.end),
          };
        }
        return pose;
      },
    };
  });
  const through = boarding.squads.map((_, squad) =>
    Math.max(0, ...men.filter((man) => man.squad === squad).map(({ end }) => end)),
  );
  return { squads, through, plank, settled: plank.up + T.plank };
}

/** A path's length, and the point and heading `s` along it. */
function measured(path: ReadonlyArray<P3>) {
  const legs = path.slice(1).map((to, k) => Math.hypot(...to.map((v, i) => v - path[k]![i]!)));
  const length = legs.reduce((sum, leg) => sum + leg, 0);
  return {
    length,
    at(s: number): { at: P3; heading: number } {
      let rest = Math.min(Math.max(s, 0), length);
      for (let k = 0; k < legs.length; k++) {
        const [a, b] = [path[k]!, path[k + 1]!];
        if (rest <= legs[k]! || k === legs.length - 1) {
          const f = legs[k] === 0 ? 1 : Math.min(1, rest / legs[k]!);
          return {
            at: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f],
            heading: Math.atan2(b[0] - a[0], b[2] - a[2]),
          };
        }
        rest -= legs[k]!;
      }
      return { at: path[0]!, heading: 0 };
    },
  };
}

/**
 * **Whether a boarding plays up the gangway**, from what the engine reads of its hull: `'play'`
 * for a cargo at the mole's post, in the field, at full motion and not under a combat; `null` when
 * it is posed at once (a carrier, a hull at the mole's side or in the roads, out of the field,
 * under a combat, another setting); `'wait'` while the hull has no post yet — just docked, or its
 * view just loaded — which the engine reads again until the wait is over. The role comes first:
 * a carrier is refused whatever its post.
 */
export function boardingVerdict(hull: {
  readonly role: string;
  readonly post: string | null;
  readonly motion: 'full' | 'reduced' | 'off';
  readonly veiled: boolean;
  readonly big: boolean;
}): 'play' | 'wait' | null {
  if (hull.role !== 'cargo' || hull.motion !== 'full' || hull.veiled || !hull.big) return null;
  if (hull.post === null) return 'wait';
  return hull.post === 'mole' ? 'play' : null;
}

/** **Whether the end of a boarding cuts it short**: a man still walks, `elapsed` ms after it
 *  started; the plank goes with him. Once the last is through, it is taken in on its own. */
export const cutShort = (elapsed: number, through: ReadonlyArray<number>): boolean =>
  elapsed < Math.max(0, ...through) + 1;
