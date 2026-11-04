import { MAN_METRES } from '@/domain/piece-size';
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
function shortOf(to: Point, perMetre: number): Point {
  const reach = 0.35 * MAN_METRES * perMetre;
  return lerp(ORIGIN, to, Math.max(0, 1 - reach / Math.max(length(to), 1e-6)));
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
  const there = TAKING.walk * 1.4;
  const back = there + TAKING.lift + 150;
  const home = back + TAKING.walk * 1.4;
  const ms = home + TAKING.tag + 300;
  const sequence = sequenceOf(
    ms,
    trips.map(({ part, to }) => [
      part,
      tripOf(
        { part, to: shortOf(to, perMetre) },
        { there, back, home },
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
