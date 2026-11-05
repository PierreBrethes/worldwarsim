import type { MapMotion } from '@/domain/map-motion';
import { MAN_METRES } from '@/domain/piece-size';
import type { PartPose, Pose, Sequence } from '../sequences';
import { ease, span } from './curves';
import { WALK_MIN_PX } from './walk';

type Point = readonly [x: number, y: number, z: number];
type Man = `man_${number}`;

/** **What a man of mine does at a site he takes from** (#279, `storyboard-prise`): where he goes,
 *  in board units from his place in the pile, along the world's axes. */
export type Trip = {
  readonly part: Man;
  readonly to: Point;
  /** The corners he goes round on his way to `to`, and back by (`aroundTheFront`). */
  readonly via?: ReadonlyArray<Point>;
};

/** Whether the segment `a`→`b` cuts the rectangle (slabs): the building, in the site's axes. */
function crosses(
  [ax, az]: readonly [number, number],
  [bx, bz]: readonly [number, number],
  box: { minX: number; maxX: number; minZ: number; maxZ: number },
): boolean {
  let [from, until] = [0, 1];
  for (const [a, d, lo, hi] of [
    [ax, bx - ax, box.minX, box.maxX],
    [az, bz - az, box.minZ, box.maxZ],
  ] as const) {
    if (Math.abs(d) < 1e-9) {
      if (a < lo || a > hi) return false;
      continue;
    }
    const [t0, t1] = [(lo - a) / d, (hi - a) / d];
    from = Math.max(from, Math.min(t0, t1));
    until = Math.min(until, Math.max(t0, t1));
  }
  return from < until;
}

/**
 * **His way round the building to its perron** (#279, storyboard « Piller »): a man standing
 * whom the building stands in the way of goes along the socle's side, round its corner, and
 * comes to the crate before the door; the crate leaves by the door on his shoulder. In the site's
 * own units, `[x, z]`; the door faces `yaw` (`StandingMaquette['seal']`), `box` is the socle's,
 * `building` the building's. A man the building does not stand in the way of goes straight.
 */
export function aroundTheFront(
  from: readonly [number, number],
  to: readonly [number, number],
  yaw: number,
  box: {
    readonly minX: number;
    readonly maxX: number;
    readonly minZ: number;
    readonly maxZ: number;
  },
  building: {
    readonly minX: number;
    readonly maxX: number;
    readonly minZ: number;
    readonly maxZ: number;
  },
): ReadonlyArray<readonly [number, number]> {
  const [cos, sin] = [Math.cos(yaw), Math.sin(yaw)];
  // Across the door (u) and before it (v).
  type Flat = readonly [number, number];
  const door = ([x, z]: Flat): Flat => [x * cos - z * sin, x * sin + z * cos];
  const site = ([u, v]: Flat): Flat => [u * cos + v * sin, -u * sin + v * cos];
  const [fu, fv] = door(from);
  const [tu, tv] = door(to);
  if (!crosses(from, to, building)) return [];
  const across = [box.minX, box.maxX].flatMap((x) =>
    [box.minZ, box.maxZ].map((z) => door([x, z])[0]),
  );
  // Round the side he stands on; square behind the crate, either does.
  const side = fu < tu - 1e-9 ? Math.min(...across) : Math.max(...across);
  return [site([side, fv]), site([side, tv])];
}

/** **The storyboard's hours** (`prise.js`, `T`), in ms. `@a-mesurer` */
export const TAKING = {
  walk: 700,
  crateWalk: 600,
  bend: 300,
  lift: 450,
  search: 1100,
  swallow: 350,
  smoke: 2400,
  stop: 1200,
  tag: 300,
  /** A perron's crate gives way to the one on the man's shoulder. */
  swap: 150,
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

/** **Where he stops to take a crate lying at `to`**: it lies at his feet, before him
 *  (`crateOnMan(0)`), so that he lifts it from where it lay. */
function shortOf(to: Point, perMetre: number, from: Point = ORIGIN): Point {
  const reach = 0.35 * MAN_METRES * perMetre;
  const way = length([to[0] - from[0], to[1] - from[1], to[2] - from[2]]);
  return lerp(from, to, Math.max(0, 1 - reach / Math.max(way, 1e-6)));
}

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

/** Along `way`, leg by leg, between `start` and `end`: each leg its share of the length. */
function walkingAlong(
  way: ReadonlyArray<Point>,
  t: number,
  start: number,
  end: number,
  perMetre: number,
) {
  const legs = way.slice(1).map((to, k) => length([to[0] - way[k]![0], 0, to[2] - way[k]![2]]));
  const total = legs.reduce((sum, leg) => sum + leg, 0);
  let from = start;
  for (let k = 0; k < legs.length - 1; k++) {
    const until = from + ((end - start) * legs[k]!) / Math.max(total, 1e-9);
    if (t < until) return walking(way[k]!, way[k + 1]!, t, from, until, perMetre);
    from = until;
  }
  return walking(way.at(-2)!, way.at(-1)!, t, from, end, perMetre);
}

/** **A man's trip, leg by leg**: out until `there`, his work until `back`, home by `home`. */
function tripOf(
  { to, via = [] }: Trip,
  hours: {
    readonly there: number;
    readonly back: number;
    readonly home: number;
    /** How long his own way takes, out and back (default: `there`): a longer way, a longer walk. */
    readonly walk?: number;
  },
  work: (t: number) => PartPose,
  homeward: (t: number) => PartPose,
  perMetre: number,
) {
  const way = [ORIGIN, ...via, to];
  const from = way.at(-2)!;
  const walk = hours.walk ?? hours.there;
  return (t: number): PartPose => {
    if (t < walk) return walkingAlong(way, t, 0, walk, perMetre);
    if (t < hours.back)
      return { travel: to, heading: Math.atan2(to[0] - from[0], to[2] - from[2]), ...work(t) };
    if (t < hours.back + walk)
      return {
        ...walkingAlong([...way].reverse(), t, hours.back, hours.back + walk, perMetre),
        ...homeward(t),
      };
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
  const trip = tripOf(
    { part, to: shortOf(to, perMetre) },
    { there, back, home },
    (t) => {
      const lifted = ease.out3(span(t, lift, back));
      return { carry: [ease.out3(span(t, there, lift)) * (1 - lifted), lifted, 1] };
    },
    (t) => ({ carry: [0, 1, 1 - span(t, home, home + TAKING.tag)] }),
    perMetre,
  );
  // The crate lies at its point from the column's arrival until he takes it up.
  const at = (t: number): PartPose =>
    t < there ? { ...trip(t), lying: { at: to, shown: 1 } } : trip(t);
  return sequenceOf(ms, [[part, at]]);
}

/**
 * **Il cherche** (#279, « Ramasser », la caisse partie) : l'homme va où était la caisse, regarde à
 * gauche, à droite ; la caisse se délave, il n'y a rien sous sa main, il rejoint le rang à vide.
 */
export function crateSearch({
  part,
  to,
  perMetre,
}: Trip & { readonly perMetre: number }): Sequence {
  const there = TAKING.crateWalk;
  const back = there + TAKING.search;
  const home = back + TAKING.crateWalk;
  const ms = home + 200;
  const facing = Math.atan2(to[0], to[2]);
  const trip = tripOf(
    { part, to: shortOf(to, perMetre) },
    { there, back, home },
    (t) => ({ heading: facing + Math.sin(span(t, there, back) * Math.PI * 2) * 0.8 }),
    () => ({}),
    perMetre,
  );
  const washed = (t: number) => 1 - span(t, there, there + 400);
  const at = (t: number): PartPose =>
    washed(t) > 0 ? { ...trip(t), lying: { at: to, shown: washed(t) } } : trip(t);
  return sequenceOf(ms, [[part, at]]);
}

/**
 * **Piller** (#279) : deux hommes quittent le rang pour le perron, chacun prend une caisse du haut
 * de sa pile (`takenAt`, `perronOf`), la met à l'épaule et rejoint le rang, où elle s'efface : la
 * colonne repart chargée. `to` : la caisse qu'il prend.
 */
export function plunderOf({
  trips,
  perMetre,
}: {
  readonly trips: ReadonlyArray<Trip>;
  readonly perMetre: number;
}): Sequence & { readonly takenAt: number } {
  // He walks the pace a straight way takes `TAKING.walk * 1.4`: a longer way takes longer.
  const legs = trips.map(({ part, to, via }) => {
    const target = shortOf(to, perMetre, via?.at(-1));
    const way = [ORIGIN, ...(via ?? []), target];
    const metres = way.slice(1).reduce((sum, p, k) => {
      const [x, z] = [p[0] - way[k]![0], p[2] - way[k]![2]];
      return sum + Math.hypot(x, z);
    }, 0);
    const straight = Math.max(Math.hypot(target[0], target[2]), 1e-6);
    return {
      part,
      to: target,
      ...(via !== undefined && { via }),
      walk: TAKING.walk * 1.4 * Math.max(1, metres / straight),
    };
  });
  const there = Math.max(TAKING.walk * 1.4, ...legs.map(({ walk }) => walk));
  const back = there + TAKING.lift + 150;
  const home = back + there;
  const ms = home + TAKING.tag + 300;
  const sequence = sequenceOf(
    ms,
    legs.map(({ part, to, via, walk }) => [
      part,
      tripOf(
        { part, to, ...(via !== undefined && { via }) },
        { there, back, home, walk },
        (t) => {
          // He takes it at hand's height off the pile, and swings it up to his shoulder.
          const lifted = 0.6 + 0.4 * ease.out3(span(t, there, there + TAKING.lift));
          return { carry: [0, lifted, span(t, there, there + TAKING.swap)] };
        },
        (t) => ({ carry: [0, 1, 1 - span(t, home, home + TAKING.tag)] }),
        perMetre,
      ),
    ]),
  );
  return { ...sequence, takenAt: there };
}

/** **The perron's pile loses the crates the men take** (#279), `crates` off its top: they give
 *  way to the ones on their shoulders, as a loading's jump aboard (#271). */
export function perronOf(
  { ms, takenAt }: Sequence & { readonly takenAt: number },
  crates: ReadonlyArray<string>,
): Sequence<'warehouse'> {
  const fade = (t: number) => 1 - span(t, takenAt, takenAt + TAKING.swap);
  return {
    family: 'warehouse',
    ms,
    minPx: WALK_MIN_PX,
    at: (t) =>
      t <= 0 || t >= ms
        ? {}
        : (Object.fromEntries(
            crates.map((name) => [name, { fade: fade(t) }]),
          ) as Pose<'warehouse'>),
  };
}

/**
 * **Saboter** (#279) : deux hommes vont à la porte du site et s'effacent dans son noir ; une
 * fumée noire sort de ses cheminées (`smokeAt`, `TAKING.smoke`) ; ils ressortent du noir et
 * rejoignent le rang. Ses scellés et sa machine figée restent (décision 5).
 */
export function sabotageOf({
  trips,
  perMetre,
}: {
  readonly trips: ReadonlyArray<Trip>;
  readonly perMetre: number;
}): Sequence & { readonly smokeAt: number } {
  const there = TAKING.walk * 1.6;
  const smokeAt = there + TAKING.swallow + 200;
  const out = smokeAt + 500 + TAKING.stop;
  const home = out + TAKING.walk * 1.6;
  const ms = home + 200;
  const swallowed = (t: number) => ({
    fade: t < out ? 1 - span(t, there, there + TAKING.swallow) : span(t, out, out + TAKING.swallow),
  });
  return {
    ...sequenceOf(
      ms,
      trips.map((trip) => [
        trip.part,
        tripOf(trip, { there, back: out, home }, swallowed, swallowed, perMetre),
      ]),
    ),
    smokeAt,
  };
}

/** **What a taking under the eyes plays** (#279, storyboard « Réduites et coupées »): its
 *  sequence at full motion; at reduced, a ring of ink on the site or the pile; cut, nothing. */
export const takingStepOf = (motion: MapMotion): 'play' | 'ring' | 'nothing' =>
  motion === 'full' ? 'play' : motion === 'reduced' ? 'ring' : 'nothing';
