import type { Pose, Sequence } from '../sequences';
import { around, type Flat } from './barracks';
import { ease, span } from './curves';

type Point = readonly [x: number, y: number, z: number];

/** **The truck plays from 30 px**, and its site with it (`MIN_PX` of `tailgateDrop`). `@a-mesurer` */
export const LOADING_PX = 30;
/** Where the truck turns before it backs to the quay, in metres from `fx_quai`: so far out into
 *  the yard, so far aside (the storyboard's (11 ; 39) off a quay at 23.5), and the run it makes
 *  there nose first. `@a-mesurer` */
const TURN = { out: 15.5, aside: 11, run: 7 } as const;
/** Where it comes straight to the quay from, in metres past its own half. `@a-mesurer` */
const STRAIGHT = 6;
/** How far ahead of its place it drives before it turns, in its own lengths. `@a-mesurer` */
const AHEAD = 1.5;
/** Clear of the walls by so many metres, and its half. `@a-mesurer` */
const GABLE = 3;
/** The legs, in ms (`entrepot.js`, « Au rang »). */
const LEG = { start: 200, out: 2000, pause: 250, back: 1800, leave: 1600, home: 2000 } as const;
/** The tailgate: it falls in 500 ms (`out3`) and shuts in 450 (`in2`), as `tailgateDrop`; laid
 *  on the quay beyond the level (`@a-mesurer`, the storyboard's 112° for France), it hangs on its
 *  chains at the HQ (93°), with a clang of 3° in 80 ms on the quay. */
const GATE = { open: 500, close: 450, clang: 80, after: 150, rest: 200 } as const;
const GATE_ON_QUAY = (110 * Math.PI) / 180;
const GATE_HANGING = (93 * Math.PI) / 180;
const CLANG = (3 * Math.PI) / 180;
/** The tailgate's length, where a crate lands on it. `@a-mesurer` */
const GATE_METRES = 0.6;
/** A crate: a hop of 450 ms on an arc of 1.4 m, 400 ms after the one before, then 350 ms under
 *  the tarp (`HOP_S`, `CRATE_GAP`, `SLIDE_IN_S`). */
const CRATE = { hop: 450, gap: 400, slide: 350, arc: 1.4 } as const;
/** Where each crate stands aboard, in the truck's lengths from its back. `@a-mesurer` */
const SLOTS = [0.55, 0.35] as const;
/** **Two crates at most** (décision de Pierre du 03/11): what the tarp holds, a slot each. */
export const MAX_CRATES = SLOTS.length;
/** The door slides 5.2 m toward +x in 600 ms (`DOOR_RUN`, `DOOR_S`), on rollers of 0.15 m. */
const DOOR = { run: 5.2, ms: 600, roller: 0.15, after: 150 } as const;
/** A crate back out of the dark: straight out, along the quay, up the pile (`RESTOCK`), each
 *  500 ms after the one before; the lane runs 1.25 m in front of the pile. */
const RESTOCK = { out: 400, along: 450, up: 400, gap: 500, lane: 1.25, arc: 0.8 } as const;
/** **At the HQ** the crates come out of the dark of its service door, which swings open to
 *  110° in 750 ms like the barracks' shed: 800 ms from the dark to the tailgate's foot, 500 ms
 *  apart, then a hop onto the bed. `@a-mesurer` */
const HQ = { swing: (110 * Math.PI) / 180, door: 750, out: 800, gap: 500, floor: 1.3 } as const;
/** How deep in the HQ's dark its crates wait, in metres behind `fx_quai`. `@a-mesurer` */
const HQ_DARK = 6;
/** The truck settles 4 cm under each crate, over 300 ms. */
const DIP = { metres: 0.04, ms: 300 } as const;
/** Its wheels' radius, in metres. `@a-mesurer` */
const WHEEL = 0.48;

const add = (a: Point, b: Point, by = 1): Point => [
  a[0] + b[0] * by,
  a[1] + b[1] * by,
  a[2] + b[2] * by,
];
const lerp = (a: Point, b: Point, k: number): Point => [
  a[0] + (b[0] - a[0]) * k,
  a[1] + (b[1] - a[1]) * k,
  a[2] + (b[2] - a[2]) * k,
];
const minus = (a: Point, b: Point): Point => add(a, b, -1);
const at = ([x, , z]: Point, y: number): Point => [x, y, z];

/** **Where a crate of the HQ waits in its dark**: on the quay's axis, behind its door. */
export const darkCrate = (stop: Point, front: Point, k: number): Point =>
  add(stop, front, -(HQ_DARK + k * 1.4));

/** Corners cut a quarter in, three times (Chaikin): a polyline driven as a curve, its ends kept. */
function rounded(points: ReadonlyArray<Point>): Point[] {
  let line = [...points];
  for (let k = 0; k < 3; k++)
    line = [
      line[0]!,
      ...line
        .slice(1)
        .flatMap((b, j) => [lerp(line[j]!, b, 0.25), lerp(line[j]!, b, 0.75)])
        .slice(1, -1),
      line.at(-1)!,
    ];
  return line;
}

type Leg = {
  readonly points: ReadonlyArray<Point>;
  readonly lengths: ReadonlyArray<number>;
  readonly length: number;
  readonly from: number;
  readonly to: number;
  readonly back: boolean;
  readonly curve: (k: number) => number;
};

function legOf(points: Point[], from: number, ms: number, back: boolean): Leg {
  const lengths = [0];
  for (let k = 1; k < points.length; k++)
    lengths.push(
      lengths[k - 1]! +
        Math.hypot(points[k]![0] - points[k - 1]![0], points[k]![2] - points[k - 1]![2]),
    );
  return {
    points,
    lengths,
    length: lengths.at(-1)!,
    from,
    to: from + ms,
    back,
    curve: back ? ease.inOut : ease.drive,
  };
}

const pointOn = ({ points, lengths, length }: Leg, s: number): Point => {
  const d = Math.min(Math.max(s, 0), length);
  const k = Math.max(
    1,
    lengths.findIndex((at) => at >= d),
  );
  const leg = lengths[k]! - lengths[k - 1]!;
  return lerp(points[k - 1]!, points[k]!, leg === 0 ? 1 : (d - lengths[k - 1]!) / leg);
};

/**
 * **Un camion se charge à son entrepôt** (#271, `storyboard-entrepot`, « Au rang ») : il sort de
 * sa place nez devant, tourne sur la cour, recule l'arrière à `fx_quai` ; le hayon se pose sur le
 * quai, les caisses du dessus de la pile sautent à bord et glissent sous la bâche ; la porte
 * coulisse et les mêmes caisses ressortent du noir regarnir la pile ; le hayon remonte, le camion
 * ressort nez devant et recule à sa place. **Au QG** (`perron` absent), le hayon pend et les
 * caisses sortent du noir de la porte de service, au pied du hayon, et sautent à bord. Tout est
 * en mètres du site, `toBoard` le mène du modèle aux écarts du camion à son repos sur le plateau.
 * `crates` : l'heure au plus tôt du saut de chaque caisse — un second chargement joint au premier
 * (`SequenceLayer.retime`) n'en saute pas avant d'être signalé.
 */
export function loadingAt({
  rank,
  rankFront,
  length,
  box,
  quay: { stop, front },
  perron,
  crates,
  toBoard,
}: {
  readonly rank: Point;
  readonly rankFront: Point;
  /** The truck's length, in metres. */
  readonly length: number;
  readonly box: { readonly min: Point; readonly max: Point };
  /** `fx_quai`, where the truck's back stops, and its +z: toward the yard, on the ground. */
  readonly quay: { readonly stop: Point; readonly front: Point };
  /** The warehouse's pile (`caisse_*`), its dark (`fx_entree`) and door (`fx_sortie`), and the
   *  quay's top; `null` at the HQ. */
  readonly perron: {
    readonly crates: ReadonlyArray<{ readonly name: string; readonly at: Point }>;
    readonly inside: Point;
    readonly door: Point;
    readonly top: number;
  } | null;
  readonly crates: ReadonlyArray<number>;
  readonly toBoard: (point: Point) => Point;
}): {
  readonly truck: Sequence<'landTransport'>;
  readonly site: Sequence<'warehouse' | 'hq'>;
  /** When the tailgate starts up: a load signalled before joins this one. */
  readonly gateUp: number;
  readonly atQuay: number;
  /** When it starts back into its place: the quay is free for the next truck. */
  readonly homeAt: number;
} {
  // The way: out nose first, past the bay on the side away from the rank, then back to the quay.
  const y = rank[1];
  const ground = (p: Point): Point => at(p, y);
  let side: Point = [front[2], 0, -front[0]];
  if ((rank[0] - stop[0]) * side[0] + (rank[2] - stop[2]) * side[2] > 0)
    side = add([0, 0, 0], side, -1);
  const turn = ground(add(add(stop, front, TURN.out), side, TURN.aside));
  const into = add(turn, side, -TURN.run);
  const ahead = ground(add(rank, rankFront, AHEAD * length));
  const corners = around([ahead[0], ahead[2]], [into[0], into[2]], box, GABLE + length / 2).map(
    ([x, z]: Flat): Point => [x, y, z],
  );
  const docked = ground(add(stop, front, length / 2));
  const out = rounded([rank, ahead, ...corners, into, turn]);
  const toQuay = rounded([turn, into, ground(add(stop, front, length / 2 + STRAIGHT)), docked]);

  let clock = LEG.start;
  const legs: Leg[] = [];
  const drive = (points: Point[], ms: number, back: boolean) => {
    legs.push(legOf(points, clock, ms, back));
    clock += ms;
  };
  drive(out, LEG.out, false);
  clock += LEG.pause;
  drive(toQuay, LEG.back, true);
  const atQuay = clock;
  const gateDown = atQuay + 50;
  const loadAt = gateDown + GATE.open + GATE.clang;

  // The crates, the door, the tailgate: on the quay at the warehouse, from the dark at the HQ.
  const aboard = (k: number): Point =>
    add(at(stop, perron?.top ?? stop[1] + HQ.floor), front, SLOTS[k]! * length);
  const pile = perron
    ? [...perron.crates]
        .sort(
          (a, b) =>
            b.at[1] - a.at[1] ||
            Math.hypot(a.at[0] - stop[0], a.at[2] - stop[2]) -
              Math.hypot(b.at[0] - stop[0], b.at[2] - stop[2]),
        )
        .slice(0, MAX_CRATES)
    : SLOTS.map((_, k) => ({ name: `caisse_${k + 1}`, at: darkCrate(stop, front, k) }));
  const count = Math.min(crates.length, pile.length);
  const moves = crates.slice(0, count).map((earliest, k) => {
    const from = Math.max(loadAt + k * (perron ? CRATE.gap : HQ.gap), earliest);
    return { crate: pile[k]!, k, from, hop: from + (perron ? 0 : HQ.out) };
  });
  const lastIn = Math.max(...moves.map(({ hop }) => hop + CRATE.hop + CRATE.slide));
  const doorOpen = perron ? moves[0]!.from + DOOR.after : moves[0]!.from - HQ.door;
  const restocks = perron
    ? moves.map(({ hop }, k) =>
        Math.max(doorOpen + DOOR.ms * 0.7 + k * RESTOCK.gap, hop + CRATE.hop + CRATE.slide),
      )
    : [];
  const doorShut = perron
    ? Math.max(restocks.at(-1)! + RESTOCK.out, doorOpen + DOOR.ms + 200)
    : moves.at(-1)!.from + HQ.out;
  const gateUp = lastIn + GATE.after;
  clock = gateUp + GATE.close + GATE.rest;
  drive([...toQuay].reverse(), LEG.leave, false);
  clock += LEG.pause;
  const homeAt = clock;
  drive([...out].reverse(), LEG.home, true);
  const ms = clock;
  // The site ends on its own gestures: the door shut, the last crate under the tarp or back up.
  const siteMs = Math.max(
    doorShut + (perron ? DOOR.ms : HQ.door),
    lastIn,
    ...restocks.map((r) => r + RESTOCK.out + RESTOCK.along + RESTOCK.up),
  );

  const truck: Sequence<'landTransport'> = {
    family: 'landTransport',
    ms,
    minPx: LOADING_PX,
    at(t) {
      if (t <= 0 || t >= ms) return {};
      const pose: Pose<'landTransport'> = {};
      // On its leg, or stopped where the one before left it.
      let rolled = 0;
      let leg: Leg | undefined;
      for (const each of legs) {
        if (t < each.from) break;
        leg = each;
        if (t < each.to) break;
        rolled += (each.back ? -1 : 1) * each.length;
      }
      if (leg !== undefined) {
        const done = leg.length * leg.curve(span(t, leg.from, leg.to));
        if (t < leg.to) rolled += (leg.back ? -1 : 1) * done;
        const [a, b] = [pointOn(leg, done - 0.5), pointOn(leg, done + 0.5)].map(toBoard);
        pose.root = {
          travel: toBoard(pointOn(leg, done)),
          heading: Math.atan2(b![0] - a![0], b![2] - a![2]) + (leg.back ? Math.PI : 0),
        };
      }
      const wheel = { turn: [rolled / WHEEL, 0, 0] as const };
      for (const k of [1, 2, 3])
        Object.assign(pose, { [`roue_left_${k}`]: wheel, [`roue_right_${k}`]: wheel });
      const down = perron ? GATE_ON_QUAY : GATE_HANGING;
      const clang = perron ? Math.sin(span(t, gateDown + GATE.open, loadAt) * Math.PI) * CLANG : 0;
      const angle =
        (down * ease.out3(span(t, gateDown, gateDown + GATE.open)) - clang) *
        (1 - ease.in2(span(t, gateUp, gateUp + GATE.close)));
      if (angle !== 0) pose.tailgate = { turn: [-angle, 0, 0] };
      const dip = moves.reduce((sum, { hop }) => {
        const landed = hop + CRATE.hop + CRATE.slide * 0.6;
        return sum + Math.sin(span(t, landed, landed + DIP.ms) * Math.PI) * DIP.metres;
      }, 0);
      if (dip > 0) pose.body = { shift: [0, -dip, 0] };
      return pose;
    },
  };

  const gateFoot = perron
    ? at(add(stop, front, -GATE_METRES), perron.top)
    : add(stop, front, -GATE_METRES * 1.5);
  const crateAt = (t: number, { crate, k, from, hop }: (typeof moves)[number]) => {
    const rest = crate.at;
    if (t < from) return null;
    const jumped = hop + CRATE.hop;
    const inside = jumped + CRATE.slide;
    if (t < hop) return { at: lerp(rest, gateFoot, ease.inOut(span(t, from, hop))) };
    if (t < jumped) {
      const k1 = span(t, hop, jumped);
      const landing = perron ? gateFoot : add(at(stop, stop[1] + HQ.floor), front, 0.4);
      const arc = Math.sin(k1 * Math.PI) * (perron ? CRATE.arc : RESTOCK.arc);
      return { at: add(lerp(perron ? rest : gateFoot, landing, ease.inOut(k1)), [0, arc, 0]) };
    }
    const r = restocks[k];
    if (r === undefined || t < r) {
      // Into the dark under the tarp: gone as it gets there.
      const slid = span(t, jumped, inside);
      const landing = perron ? gateFoot : add(at(stop, stop[1] + HQ.floor), front, 0.4);
      return { at: lerp(landing, aboard(k), ease.in2(slid)), fade: 1 - slid };
    }
    // Back out of the dark, along the quay, up onto the pile: the pile is whole again.
    const { door, inside: dark, top } = perron!;
    const lane = (rest[0] - door[0]) * front[0] + (rest[2] - door[2]) * front[2] + RESTOCK.lane;
    const before = at(add(door, front, lane), top);
    const foot = at(add(rest, front, RESTOCK.lane), top);
    const t1 = r + RESTOCK.out;
    const t2 = t1 + RESTOCK.along;
    const t3 = t2 + RESTOCK.up;
    if (t < t1) return { at: lerp(at(dark, top), before, ease.inOut(span(t, r, t1))) };
    if (t < t2) return { at: lerp(before, foot, ease.inOut(span(t, t1, t2))) };
    if (t < t3) {
      const up = span(t, t2, t3);
      return {
        at: add(lerp(foot, rest, ease.inOut(up)), [0, Math.sin(up * Math.PI) * RESTOCK.arc, 0]),
      };
    }
    return null;
  };

  const site: Sequence<'warehouse' | 'hq'> = {
    family: perron ? 'warehouse' : 'hq',
    ms: siteMs,
    minPx: LOADING_PX,
    at(t) {
      if (t <= 0 || t >= siteMs) return {};
      const pose: Record<string, { shift?: Point; turn?: Point; fade?: number }> = {};
      for (const move of moves) {
        const where = crateAt(t, move);
        if (where === null) continue;
        pose[move.crate.name] = {
          shift: minus(where.at, move.crate.at),
          ...(where.fade === undefined ? {} : { fade: where.fade }),
        };
      }
      const swing = perron ? DOOR.ms : HQ.door;
      const open =
        ease.inOut(span(t, doorOpen, doorOpen + swing)) *
        (1 - ease.inOut(span(t, doorShut, doorShut + swing)));
      if (open > 0 && perron) {
        pose.porte = { shift: [DOOR.run * open, 0, 0] };
        pose.galet = pose.galet_2 = { turn: [0, 0, -(DOOR.run * open) / DOOR.roller] };
      } else if (open > 0) pose.porte_service = { turn: [0, HQ.swing * open, 0] };
      return pose;
    },
  };
  return { truck, site, gateUp, atQuay, homeAt };
}
