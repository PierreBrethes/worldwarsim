import { wrap } from '../articulation';
import type { PartPose, Pose, Sequence } from '../sequences';
import { ease, span } from './curves';
import { WALK_MIN_PX } from './walk';

export type Flat = readonly [x: number, z: number];

/** **The tailgate plays from 30 px**: the zoom stops at d = 3, where a truck reads some 50 px
 *  (34 by `seenBig`, which reads the backed-off eye's distance on the 42 degrees reference window)
 *  — the buildings' 150 px (`PLAY_PX`) would never let it play. `@a-mesurer` */
export const BOARDING_PX = 30;

/** The storyboard's hours (« une pile vivante », `T`), in ms: the tailgate falls in 500 (`out3`)
 *  and shuts in 450 (`in2`); the rest is proposed there. `@a-mesurer` */
const T = {
  open: 500,
  close: 450,
  clang: 80,
  bounce: 120,
  first: 250,
  gap: 150,
  hop: 380,
  hopGap: 80,
  swallow: 200,
  jolt: 90,
  joltBack: 300,
  engine: 1300,
  shiver: 600,
  /** The tailgate shuts this long after the last man is in, or down. */
  after: 150,
} as const;
/** It falls to 93 degrees and hangs on its chains, with a clang of 3 (`embarquer.js`). */
const DOWN = (93 * Math.PI) / 180;
const CLANG = (3 * Math.PI) / 180;
/** A man's pace, in his heights a second (the POC's `MAN_SPEED`). */
const MAN_SPEED = 1.7;
/** How high a man's hop rises over its line, in his height. */
const HOP_RISE = 0.14;
/** How far the bed settles under a man's foot, in metres of the model. `@a-mesurer` */
const JOLT_M = 0.12;
/** The truck in metres (the Laffly, 6.5 m): its tailgate's hinge behind its middle, the foot of
 *  the tailgate (`fx_hayon`) behind the hinge, the bed's edge in front of it at its height, and
 *  the dark under the tarp where a man is swallowed. `@a-mesurer` read off the GLB of France */
const TRUCK_M = { length: 6.5, hinge: 3.1, foot: 1.8, edge: 0.4, bed: 1.46, dark: 1.4 } as const;
/** Behind the rank by so many steps, a man walks round it to the tailgate. */
const ROUND = 0.55;

/** **A boarding or a landing to play** (#277), on the board: the truck where it stands, the way
 *  it faces and how long it is drawn; a man's height; the pile's step; and each squad's men at
 *  their places, front first, with the way the squad faces there. */
export type Boarding = {
  readonly down: boolean;
  readonly truck: { readonly at: Flat; readonly front: Flat; readonly length: number };
  readonly man: number;
  readonly step: number;
  readonly squads: ReadonlyArray<{
    readonly men: ReadonlyArray<Flat>;
    readonly heading: number;
  }>;
};

const add = (a: Flat, b: Flat, by = 1): Flat => [a[0] + b[0] * by, a[1] + b[1] * by];
const lerp = (a: Flat, b: Flat, k: number): Flat => [
  a[0] + (b[0] - a[0]) * k,
  a[1] + (b[1] - a[1]) * k,
];
const dot = (a: Flat, b: Flat): number => a[0] * b[0] + a[1] * b[1];
const gap = (a: Flat, b: Flat): number => Math.hypot(a[0] - b[0], a[1] - b[1]);
const headingOf = (from: Flat, to: Flat): number => Math.atan2(to[0] - from[0], to[1] - from[1]);

/** A quadratic way, sampled: its length, and its point and heading `s` along it. */
export function wayOf(a: Flat, via: Flat, b: Flat) {
  const points = Array.from({ length: 19 }, (_, k): Flat => {
    const u = k / 18;
    return [
      (1 - u) ** 2 * a[0] + 2 * (1 - u) * u * via[0] + u * u * b[0],
      (1 - u) ** 2 * a[1] + 2 * (1 - u) * u * via[1] + u * u * b[1],
    ];
  });
  const lengths = [0];
  for (let k = 1; k < points.length; k++)
    lengths.push(lengths[k - 1]! + gap(points[k]!, points[k - 1]!));
  const length = lengths.at(-1)!;
  return {
    length,
    at(s: number): { at: Flat; heading: number } {
      let k = 1;
      while (k < points.length - 1 && lengths[k]! < s) k++;
      const leg = lengths[k]! - lengths[k - 1]!;
      const f = leg > 0 ? Math.min(1, Math.max(0, (s - lengths[k - 1]!) / leg)) : 1;
      return {
        at: lerp(points[k - 1]!, points[k]!, f),
        heading: headingOf(points[k - 1]!, points[k]!),
      };
    },
  };
}

type Man = {
  readonly squad: number;
  readonly k: number;
  readonly place: Flat;
  readonly way: ReturnType<typeof wayOf>;
  readonly walk: number;
  order: number;
  start: number;
  hopAt: number;
  /** Montée: at the tailgate's foot. Descente: back on the ground. */
  atFoot: number;
  /** Montée: under the tarp. Descente: out of the dark. */
  dark: number;
  end: number;
};

/**
 * **Monter en camion, en descendre** (#277, storyboard « une pile vivante ») : un par un, sous la
 * bâche. Le hayon tombe ; à la montée, les hommes vont à son pied en contournant le rang par
 * l'arrière, le plus proche le premier, y font la queue, sautent sur le plancher et le noir les
 * avale ; à la descente, le noir les rend, ils sautent à terre, le premier sorti allant le plus
 * loin, et gagnent leur place. La caisse tasse sous chaque pied ; le hayon claque quand le dernier
 * est passé, et le moteur repart. Le camion ne bouge pas : ils le contournent, où que regarde son
 * hayon. Rend la séquence du camion, celle de chaque escouade, et quand tout le monde est rangé.
 */
export function boardingOf(boarding: Boarding): {
  readonly truck: Sequence<'landTransport'>;
  readonly squads: ReadonlyArray<Sequence>;
  readonly settled: number;
  /** Coming down, the dust each man raises at the tailgate's foot as he lands (« une pile
   *  vivante », `hopDust`): where, and when. */
  readonly dust: { readonly at: Flat; readonly times: ReadonlyArray<number> };
} {
  const { down, truck, man: h, step } = boarding;
  const metre = truck.length / TRUCK_M.length;
  const front = truck.front;
  const hinge = add(truck.at, front, -TRUCK_M.hinge * metre);
  const foot = add(hinge, front, -TRUCK_M.foot * metre);
  const edge = add(hinge, front, TRUCK_M.edge * metre);
  const dark = add(hinge, front, TRUCK_M.dark * metre);
  const bed = TRUCK_M.bed * metre;
  const facing = Math.atan2(front[0], front[1]);
  const speed = (MAN_SPEED * h) / 1000;
  const men: Man[] = boarding.squads.flatMap(({ men: places }, squad) =>
    places.map((place, k) => {
      // Round the rank by its back, to the tailgate's foot.
      const base = lerp(place, foot, 0.45);
      const back =
        Math.min(dot(add(place, truck.at, -1), front), dot(add(foot, truck.at, -1), front)) -
        ROUND * step;
      const via = add(base, front, back - dot(add(base, truck.at, -1), front));
      const way = wayOf(place, via, foot);
      return {
        squad,
        k,
        place,
        way,
        walk: way.length / speed,
        order: 0,
        start: 0,
        hopAt: 0,
        atFoot: 0,
        dark: 0,
        end: 0,
      };
    }),
  );
  // The nearest the tailgate first; coming down, the first out goes furthest.
  const near = [...men].sort((a, b) => gap(a.place, foot) - gap(b.place, foot));
  const order = down ? near.reverse() : near;
  let free = T.open * 0.7;
  order.forEach((m, i) => {
    m.order = i;
    if (!down) {
      m.start = T.first + i * T.gap;
      m.atFoot = m.start + m.walk;
      m.hopAt = Math.max(m.atFoot, free);
      free = m.hopAt + T.hop + T.hopGap;
      m.dark = m.hopAt + T.hop + T.swallow;
      m.end = m.dark;
    } else {
      m.start = T.open * 0.6 + i * (T.hop + T.hopGap + T.swallow * 0.5);
      m.hopAt = Math.max(m.start + T.swallow, free);
      free = m.hopAt + T.hop + T.hopGap;
      m.atFoot = m.hopAt + T.hop;
      m.end = m.atFoot + m.walk;
    }
  });
  const lastHop = Math.max(...men.map((m) => (down ? m.atFoot : m.dark)));
  const closeAt = lastHop + T.after;
  const closed = closeAt + T.close;
  const engineAt = closed + 50;
  const settled = down ? Math.max(closed, ...men.map((m) => m.end)) : engineAt + 300;

  /** Where a man stands at `t`, how high, the way he faces, and how he goes. */
  const manAt = (
    m: Man,
    t: number,
  ): { at: Flat; y: number; heading: number; seen: number; stride?: number; hop?: number } => {
    const hopped = (k: number, out: boolean) => {
      const along = out ? 1 - k : k;
      return {
        at: lerp(foot, edge, ease.inOut(along)),
        y: bed * ease.out3(along) + Math.sin(Math.PI * along) * HOP_RISE * h,
        heading: facing + (out ? Math.PI : 0),
        hop: Math.sin(Math.PI * k),
      };
    };
    if (!down) {
      const seen = 1 - span(t, m.hopAt + T.hop / 2, m.dark);
      if (t < m.start) return { at: m.place, y: 0, heading: Number.NaN, seen };
      if (t < m.atFoot) {
        const { at, heading } = m.way.at((t - m.start) * speed);
        return { at, y: 0, heading, seen, stride: (t - m.start) / 1000 };
      }
      if (t < m.hopAt) {
        // In file at the foot of the tailgate, each behind those waiting before him.
        const ahead = men.filter((x) => x.order < m.order && t >= x.atFoot && t < x.hopAt).length;
        const from = m.way.at(m.way.length * 0.8).at;
        const away = gap(from, foot) > 0 ? add(from, foot, -1) : ([0, -1] as Flat);
        const unit: Flat = [away[0] / Math.hypot(...away), away[1] / Math.hypot(...away)];
        return { at: add(foot, unit, 0.5 * h * ahead), y: 0, heading: facing, seen };
      }
      if (t < m.hopAt + T.hop) return { ...hopped(span(t, m.hopAt, m.hopAt + T.hop), false), seen };
      return {
        at: lerp(edge, dark, span(t, m.hopAt + T.hop, m.dark)),
        y: bed,
        heading: facing,
        seen,
        stride: t / 1000,
      };
    }
    const seen = span(t, m.start, m.hopAt + T.hop / 2);
    if (t < m.start) return { at: dark, y: bed, heading: facing + Math.PI, seen };
    if (t < m.hopAt)
      return {
        at: lerp(dark, edge, span(t, m.start, m.start + T.swallow)),
        y: bed,
        heading: facing + Math.PI,
        seen,
        stride: t / 1000,
      };
    if (t < m.atFoot) return { ...hopped(span(t, m.hopAt, m.atFoot), true), seen };
    const k = span(t, m.atFoot, m.end);
    const { at, heading } = m.way.at(m.way.length * (1 - ease.march(k)));
    const rest = boarding.squads[m.squad]!.heading;
    const back = heading + Math.PI;
    return {
      at,
      y: 0,
      heading: back + wrap(rest - back) * ease.inOut(span(k, 0.8, 1)),
      seen,
      ...(k < 1 ? { stride: (t - m.atFoot) / 1000 } : {}),
    };
  };

  const squads = boarding.squads.map((_, squad): Sequence => {
    const mine = men.filter((m) => m.squad === squad);
    const ms = Math.max(...mine.map((m) => m.end)) + (down ? 0 : 1);
    // The truck says whether it plays (`BOARDING_PX`); its men follow it.
    return {
      ms,
      minPx: WALK_MIN_PX,
      at(t) {
        if (t < 0 || t >= ms) return {};
        const pose: Record<string, PartPose> = {};
        for (const m of mine) {
          const { at, y, heading, seen, stride, hop } = manAt(m, t);
          pose[`man_${m.k}`] = {
            travel: [at[0] - m.place[0], y, at[1] - m.place[1]],
            ...(Number.isNaN(heading) ? {} : { heading }),
            ...(stride === undefined ? {} : { stride }),
            ...(hop === undefined ? {} : { hop }),
            ...(seen < 1 ? { fade: seen } : {}),
          };
        }
        return pose;
      },
    };
  });

  const truckMs = down ? closed + T.clang : engineAt + T.engine;
  const truckSequence: Sequence<'landTransport'> = {
    family: 'landTransport',
    ms: truckMs,
    minPx: BOARDING_PX,
    at(t) {
      if (t < 0 || t >= truckMs) return {};
      const shut = ease.in2(span(t, closeAt, closed));
      const bounce = Math.sin(span(t, T.open, T.open + T.bounce) * Math.PI) * CLANG;
      const clang = Math.sin(span(t, closed, closed + T.clang) * Math.PI) * CLANG;
      const angle = (DOWN * ease.out3(span(t, 0, T.open)) - bounce) * (1 - shut) + clang;
      // The bed settles under each foot that lands on it, or leaves it.
      const jolt = Math.min(
        1,
        men.reduce((sum, m) => {
          const k = t - (down ? m.hopAt + 50 : m.hopAt + T.hop * 0.8);
          if (k <= 0 || k >= T.jolt + T.joltBack) return sum;
          return (
            sum + (k < T.jolt ? ease.out3(k / T.jolt) : 1 - ease.out3((k - T.jolt) / T.joltBack))
          );
        }, 0),
      );
      const running = t - engineAt;
      const shiver =
        !down && running > 0 && running < T.shiver
          ? Math.sin(running * 0.12) * (1 - running / T.shiver) * 0.012
          : 0;
      const pose: Pose<'landTransport'> & Record<string, PartPose> = {};
      if (angle !== 0) pose.tailgate = { turn: [-angle, 0, 0] };
      if (jolt > 0 || shiver !== 0)
        pose.body = { shift: [0, -JOLT_M * jolt, 0], turn: [0, 0, shiver] };
      if (!down && running > 0)
        pose.fx_smoke = { exhaust: [running / 1000, 1 - running / T.engine] };
      return pose;
    },
  };
  const dust = { at: foot, times: down ? men.map((m) => m.atFoot) : [] };
  return { truck: truckSequence, squads, settled, dust };
}
