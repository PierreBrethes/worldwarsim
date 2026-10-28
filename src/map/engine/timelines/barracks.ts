import type { Pose, Sequence } from '../sequences';
import { ease, span } from './curves';
import { WALK_MIN_PX } from './walk';

/** Ouverts vers l'extérieur, à 110° (décision de Pierre, #268, 23/10). */
const OUT = (110 * Math.PI) / 180;
/** La porte de la caserne claque : 550 ms (`out3`), 450 ms (`in2`), un rebond de 4° en 80 ms. */
const CASERNE = { open: 550, close: 450, bounce: 80 } as const;
const BOUNCE = (4 * Math.PI) / 180;
/** Les vantaux lourds de la remise : 750 ms à l'ouverture comme à la fermeture (`inOut`). */
const REMISE = { open: 750, close: 750 } as const;

/** **Quand chaque porte s'ouvre et se referme**, en ms : une fois par recrue ou par file de
 *  recrues, ouverte au signal et refermée quand la dernière l'a passée (`walkOut.passed`). Une
 *  porte absente reste fermée. */
export type DoorsPassing = {
  readonly caserne?: ReadonlyArray<readonly [opens: number, shuts: number]>;
  readonly remise?: ReadonlyArray<readonly [opens: number, shuts: number]>;
  /** When a vehicle's motor starts in the shed: its breath comes out of the door. */
  readonly motors?: ReadonlyArray<number>;
};
/** A motor's breath: 1 s whole, gone over 0.6 s more. `@a-mesurer` */
const BREATH = { whole: 1000, gone: 600 } as const;

/** **The same passings, `ms` later**, joined to what the doors already do: a second recruit
 *  cued while the first still walks (`SequenceLayer.retime`). */
export function joinedDoors(before: DoorsPassing, after: DoorsPassing, ms: number): DoorsPassing {
  const later = (spans: DoorsPassing['caserne']) =>
    (spans ?? []).map(([opens, shuts]) => [opens + ms, shuts + ms] as const);
  return {
    caserne: [...(before.caserne ?? []), ...later(after.caserne)],
    remise: [...(before.remise ?? []), ...later(after.remise)],
    motors: [...(before.motors ?? []), ...(after.motors ?? []).map((motor) => motor + ms)],
  };
}

const caserneAngle = (t: number, [opens, shuts]: readonly [number, number]): number => {
  const shut = shuts + CASERNE.close;
  return (
    OUT * ease.out3(span(t, opens, opens + CASERNE.open)) * (1 - ease.in2(span(t, shuts, shut))) +
    Math.sin(span(t, shut, shut + CASERNE.bounce) * Math.PI) * BOUNCE
  );
};
const remiseAngle = (t: number, [opens, shuts]: readonly [number, number]): number =>
  OUT *
  ease.inOut(span(t, opens, opens + REMISE.open)) *
  (1 - ease.inOut(span(t, shuts, shuts + REMISE.close)));

/**
 * **Les portes de la caserne laissent passer ses recrues** (`T.caserne` et `T.remise` du
 * storyboard) : chaque porte s'ouvre pour qui la passe, tient, et se referme quand le dernier l'a
 * passée ; une recrue qui vient après l'a rouverte. Le battant de gauche a son gond à droite du
 * plan (+x) : les deux battants d'une porte tournent en sens contraires.
 */
export function barracksDoors(passing: DoorsPassing): Sequence<'barracks'> {
  const caserne = passing.caserne ?? [];
  const remise = passing.remise ?? [];
  const motors = passing.motors ?? [];
  const ms = Math.max(
    CASERNE.open,
    ...caserne.map(([, shuts]) => shuts + CASERNE.close + CASERNE.bounce),
    ...remise.map(([, shuts]) => shuts + REMISE.close),
  );
  return {
    family: 'barracks',
    ms,
    // A recruit never walks out through a shut door: the doors play as far off as the walk.
    minPx: WALK_MIN_PX,
    at(t) {
      if (t <= 0 || t >= ms) return {};
      const pose: Pose<'barracks'> = {};
      if (caserne.length > 0) {
        const angle = Math.max(...caserne.map((span) => caserneAngle(t, span)));
        Object.assign(pose, {
          porte_gauche: { turn: [0, angle, 0] },
          porte_droite: { turn: [0, -angle, 0] },
        });
      }
      if (remise.length > 0) {
        const angle = Math.max(...remise.map((span) => remiseAngle(t, span)));
        Object.assign(pose, {
          remise_porte_gauche: { turn: [0, angle, 0] },
          remise_porte_droite: { turn: [0, -angle, 0] },
        });
      }
      const motor = [...motors]
        .reverse()
        .find((at) => t >= at && t < at + BREATH.whole + BREATH.gone);
      if (motor !== undefined)
        pose.fx_sortie_remise = {
          exhaust: [
            (t - motor) / 1000,
            1 - span(t, motor + BREATH.whole, motor + BREATH.whole + BREATH.gone),
          ],
        };
      return pose;
    },
  };
}

type Point = readonly [x: number, y: number, z: number];

/** The way's lengths, in metres: a metre of landing, the foot of the steps 3.1 m past the door
 *  (the perron ends 2.7 m past it), the shed's leaves (2.5 m) and half a metre, the street 1.5 m
 *  past the flagpole, 3 m off a gable. `@a-mesurer` */
const WAY = { landing: 1, steps: 3.1, leaves: 3, street: 1.5, gable: 3 } as const;
/** How far behind its place a piece turns to come to it straight, in its own lengths. `@a-mesurer` */
const APPROACH = 1.5;

/**
 * **The way out of a barracks** (`barracks.glb`, in metres, its façade toward +z): from the hall
 * (`fx_entree`) through the door (`fx_sortie`) — a door above the ground is a man's, who crosses
 * the landing and goes down the perron —, or from the shed, clear of its leaves. Then along the
 * street in front of the flagpole, round a gable when the rank stands beside or behind, to come
 * to the rank from behind, along its front: it stops facing the way it rests.
 */
export function wayOut({
  inside,
  out,
  rank,
  front,
  length,
  box,
}: {
  readonly inside: Point;
  readonly out: Point;
  readonly rank: Point;
  /** The rank's front, a unit vector on the ground. */
  readonly front: Point;
  /** The piece's length, in metres. */
  readonly length: number;
  /** The model's bounds, in metres: its walls, its shed, its flagpole. */
  readonly box: { readonly min: Point; readonly max: Point };
}): Point[] {
  const man = out[1] > 0;
  const along = (by: number, y: number): Point => [out[0], y, out[2] + by];
  const door = man
    ? [along(WAY.landing, out[1]), along(WAY.steps, rank[1])]
    : [along(length / 2 + WAY.leaves, rank[1])];
  const foot = door.at(-1)!;
  const street = Math.max(box.max[2] + WAY.street, foot[2]);
  const approach: Point = [
    rank[0] - front[0] * APPROACH * length,
    rank[1],
    rank[2] - front[2] * APPROACH * length,
  ];
  const side =
    approach[0] >= (box.min[0] + box.max[0]) / 2
      ? Math.max(box.max[0], foot[0]) + WAY.gable + length / 2
      : Math.min(box.min[0], foot[0]) - WAY.gable - length / 2;
  const around: Point[] =
    approach[2] >= street
      ? [[approach[0], rank[1], street]]
      : [
          [side, rank[1], street],
          [side, rank[1], approach[2]],
        ];
  return [inside, out, ...door, [foot[0], rank[1], street], ...around, approach, rank];
}

type Flat = readonly [x: number, z: number];
type Rect = { readonly min: Flat; readonly max: Flat };

/** Whether the segment `a`→`b` crosses the inside of `rect` (Liang–Barsky, on the ground). */
function crosses(a: Flat, b: Flat, { min, max }: Rect): boolean {
  let [enter, leave] = [0, 1];
  for (const axis of [0, 1] as const) {
    const d = b[axis] - a[axis];
    for (const [edge, sign] of [
      [min[axis], -1],
      [max[axis], 1],
    ] as const) {
      const gap = sign * (edge - a[axis]);
      const toward = sign * d;
      if (toward === 0) {
        if (gap < 0) return false;
      } else if (toward > 0) leave = Math.min(leave, gap / toward);
      else enter = Math.max(enter, gap / toward);
    }
  }
  return enter < leave;
}

const grown = ({ min, max }: { readonly min: Point; readonly max: Point }, by: number): Rect => ({
  min: [min[0] - by, min[2] - by],
  max: [max[0] + by, max[2] + by],
});

/**
 * **The way into a garrison** (décision de Pierre du 28/10): from where the column stood at the
 * end of its route — out of the walls, the way it came, when its route ended in the building —
 * round the building by its corners when it stands between, to come to the rank from behind,
 * along its front. No door: the piece walks to its place.
 */
export function wayIn({
  at,
  toward,
  rank,
  front,
  length,
  box,
}: {
  readonly at: Point;
  /** Where it came from: the point before `at` on its route. */
  readonly toward: Point;
  readonly rank: Point;
  readonly front: Point;
  readonly length: number;
  readonly box: { readonly min: Point; readonly max: Point };
}): Point[] {
  const margin = WAY.gable + length / 2;
  const around = grown(box, margin);
  const blocked = grown(box, margin / 2);
  const y = rank[1];
  let start: Flat = [at[0], at[2]];
  const inside = (p: Flat) =>
    p[0] > blocked.min[0] &&
    p[0] < blocked.max[0] &&
    p[1] > blocked.min[1] &&
    p[1] < blocked.max[1];
  if (inside(start)) {
    // Out of the walls, back the way it came: where the ray leaves the way round.
    const d: Flat = [toward[0] - at[0], toward[2] - at[2]];
    const t = Math.min(
      ...([0, 1] as const)
        .filter((axis) => d[axis] !== 0)
        .map(
          (axis) => ((d[axis] > 0 ? around.max[axis] : around.min[axis]) - start[axis]) / d[axis],
        ),
    );
    if (Number.isFinite(t)) start = [start[0] + d[0] * t, start[1] + d[1] * t];
  }
  const approach: Flat = [
    rank[0] - front[0] * APPROACH * length,
    rank[2] - front[2] * APPROACH * length,
  ];
  const corners: Flat[] = [
    [around.min[0], around.min[1]],
    [around.max[0], around.min[1]],
    [around.max[0], around.max[1]],
    [around.min[0], around.max[1]],
  ];
  const ways: Flat[][] = [
    [],
    ...corners.map((corner) => [corner]),
    ...corners.flatMap((corner, k) => {
      const next = corners[(k + 1) % 4]!;
      return [
        [corner, next],
        [next, corner],
      ];
    }),
  ];
  const legsOf = (way: Flat[]) => {
    const points = [start, ...way, approach];
    return points.slice(1).map((p, k) => [points[k]!, p] as const);
  };
  const lengthOf = (way: Flat[]) =>
    legsOf(way).reduce((sum, [a, b]) => sum + Math.hypot(b[0] - a[0], b[1] - a[1]), 0);
  const clear = ways.filter((way) => legsOf(way).every(([a, b]) => !crosses(a, b, blocked)));
  const best = [...clear].sort((a, b) => lengthOf(a) - lengthOf(b))[0] ?? [];
  return [
    [start[0], y, start[1]],
    ...best.map(([x, z]): Point => [x, y, z]),
    [approach[0], y, approach[1]],
    rank,
  ];
}
