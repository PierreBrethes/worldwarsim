import { ease, span } from './curves';
import type { P3 } from './gangway';
import type { Pose, Sequence } from '../sequences';

/** **A cargo's derrick** (#505, storyboard `mer-air` « 1. Au cargo »), in the hull's own metres:
 *  the mast is `BOOM` long from its pivot, unless its file says otherwise (the junk's is 9); the hook hangs `HOOK` under a cable's end and the load
 *  `SLING` under the hook. */
export const BOOM = 12;
export const HOOK = 1;
export const SLING = 1;

/** One mast and the hold it serves, read from the file (`boomsOfScene`). `rest` is the mast's
 *  heading about the hull's up from +z and its lift above the horizontal; `hatch.at` the middle of
 *  the black plane at the bottom of the hold with the coaming's height, `rim`, where a load is
 *  taken by the dark. */
export type Boom = {
  readonly n: number;
  readonly pivot: P3;
  readonly length: number;
  readonly rest: { readonly yaw: number; readonly lift: number };
  readonly hatch: { readonly at: P3; readonly rim: number };
};

/** **The mast's tip** at a heading and a lift, in the hull's metres. */
export const tipOf = (pivot: P3, yaw: number, lift: number, length = BOOM): P3 => [
  pivot[0] + length * Math.cos(lift) * Math.sin(yaw),
  pivot[1] + length * Math.sin(lift),
  pivot[2] + length * Math.cos(lift) * Math.cos(yaw),
];

/** **The heading and lift that bring the tip over `(x, z)`**; beyond its reach, as near as it goes. */
export function aimAt(
  pivot: P3,
  x: number,
  z: number,
  length = BOOM,
): { yaw: number; lift: number } {
  const [dx, dz] = [x - pivot[0], z - pivot[2]];
  const reach = Math.min(0.99 * length, Math.hypot(dx, dz));
  return { yaw: Math.atan2(dx, dz), lift: Math.acos(reach / length) };
}

/** The storyboard's hours (ms): the mast slews to the load or over the hold, the hook comes down,
 *  the slings tauten, the load is hoisted, lowered, the hook comes up and the mast goes home; the
 *  hatch takes `hatch` to open or shut. `@a-mesurer` */
const T = {
  slew: 1400,
  down: 800,
  sling: 350,
  hoist: 900,
  lower: 1200,
  up: 600,
  home: 1000,
  hatch: 800,
};
/** The shortest cable, a hook under its mast's tip; how far the load is hoisted over its deck; the
 *  hatch's angle, and how far under the coaming the load goes, and how much of its height it takes
 *  to fade across it. `@a-mesurer` */
const SHORT = 1.5;
const HOISTED = 7;
const OPEN = (105 * Math.PI) / 180;
const SINK = 0.3;
const FADE_SHARE = 0.6;

/** **How far in from the mole's face a load is taken from the deck**, in the port's metres: the
 *  mast's tip stands there, past the hull's flank (`@a-mesurer`). */
export const SPOT_ONTO_DECK = 1;

const angleBetween = (from: number, to: number, k: number): number =>
  from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * k;
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;

/** What a lift is at an instant: the mast, the cable to its hook, whether the load is slung, where
 *  the load's bottom hangs (null while it stands on the deck), and how much of it shows. */
export type Lifting = {
  readonly yaw: number;
  readonly lift: number;
  readonly cable: number;
  readonly hook: P3;
  readonly hooked: boolean;
  readonly load: P3 | null;
  readonly fade: number;
};

export type Lift = {
  readonly start: number;
  /** The mast is over the load. */
  readonly pick: number;
  /** The load leaves the deck. */
  readonly lifted: number;
  /** The mast is over the hold. */
  readonly over: number;
  /** The load is down, gone. */
  readonly dropped: number;
  readonly end: number;
  at(t: number): Lifting;
  /** How open its hatch is, 0 to 1. */
  hatchAt(t: number): number;
};

/**
 * **One load taken from the deck by a mast and lowered into its hold**: the mast comes round to
 * the spot, the hook goes down and slings the load, hoists it, comes round over the hold, lowers it
 * out of sight — it fades across the coaming — and goes home, from `start` (ms). Pure of the
 * clock: `at(t)` for any `t`.
 */
export function liftOf({
  boom,
  spot,
  height,
  start,
}: {
  readonly boom: Boom;
  /** The deck's point the load stands on, under the tip: its height is the deck's. */
  readonly spot: P3;
  /** The load's, in the hull's metres. */
  readonly height: number;
  readonly start: number;
}): Lift {
  const [a1, a2, a3, a4, a5, a6, a7, a8] = [
    T.slew,
    T.down,
    T.sling,
    T.hoist,
    T.slew,
    T.lower,
    T.up,
    T.home,
  ].reduce<number[]>((sums, ms) => [...sums, (sums.at(-1) ?? start) + ms], []) as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const { rest, pivot, hatch } = boom;
  const from = aimAt(pivot, spot[0], spot[2], boom.length);
  const to = aimAt(pivot, hatch.at[0], hatch.at[2], boom.length);
  const [tipFrom, tipTo] = [
    tipOf(pivot, from.yaw, from.lift, boom.length),
    tipOf(pivot, to.yaw, to.lift, boom.length),
  ];
  // The load's top hangs a hook and a sling under the tip less the cable.
  const slung = HOOK + SLING;
  const pickTop = spot[1] + height;
  const cPick = Math.max(SHORT, tipFrom[1] - pickTop - slung);
  const cHigh = Math.max(SHORT, Math.min(cPick, tipFrom[1] - (pickTop + HOISTED) - slung));
  const cDrop = Math.max(SHORT, tipTo[1] - (hatch.rim - SINK) - slung);

  const at = (t: number): Lifting => {
    let [yaw, lift, cable, hooked] = [rest.yaw, rest.lift, SHORT, false];
    if (t < start) {
      /* at rest */
    } else if (t < a1) {
      const k = ease.inOut(span(t, start, a1));
      [yaw, lift] = [angleBetween(rest.yaw, from.yaw, k), lerp(rest.lift, from.lift, k)];
    } else if (t < a2) {
      [yaw, lift, cable] = [from.yaw, from.lift, lerp(SHORT, cPick, ease.out3(span(t, a1, a2)))];
    } else if (t < a3) {
      [yaw, lift, cable] = [from.yaw, from.lift, cPick];
      hooked = span(t, a2, a3) > 0.5;
    } else if (t < a4) {
      [yaw, lift, hooked] = [from.yaw, from.lift, true];
      cable = lerp(cPick, cHigh, ease.inOut(span(t, a3, a4)));
    } else if (t < a5) {
      const k = ease.inOut(span(t, a4, a5));
      [yaw, lift, cable, hooked] = [
        angleBetween(from.yaw, to.yaw, k),
        lerp(from.lift, to.lift, k),
        cHigh,
        true,
      ];
    } else if (t < a6) {
      [yaw, lift, hooked] = [to.yaw, to.lift, true];
      cable = lerp(cHigh, cDrop, ease.in2(span(t, a5, a6)));
    } else if (t < a7) {
      [yaw, lift] = [to.yaw, to.lift];
      cable = lerp(cDrop, SHORT, ease.out3(span(t, a6, a7)));
    } else {
      const k = ease.inOut(span(t, a7, a8));
      [yaw, lift] = [angleBetween(to.yaw, rest.yaw, k), lerp(to.lift, rest.lift, k)];
    }
    const tip = tipOf(pivot, yaw, lift, boom.length);
    const hook: P3 = [tip[0], tip[1] - cable, tip[2]];
    const lifted = t >= a3 && t < a6;
    const bottom = hook[1] - slung - height;
    return {
      yaw,
      lift,
      cable,
      hook,
      hooked,
      load: lifted ? [hook[0], bottom, hook[2]] : null,
      fade:
        lifted && t >= a5 ? 1 - span(hatch.rim - bottom, 0, FADE_SHARE * height) : t >= a6 ? 0 : 1,
    };
  };
  const hatchAt = (t: number): number =>
    ease.out3(span(t, start, start + T.hatch)) * (1 - ease.in2(span(t, a7, a7 + T.hatch)));
  return { start, pick: a1, lifted: a3, over: a5, dropped: a6, end: a8, at, hatchAt };
}

/** One vehicle to be lifted: how long it takes to drive to its spot, and its height. */
export type Hoisted = { readonly drive: number; readonly height: number };

/** The spots of two masts closer than this (hull metres) are one: a vehicle waits for the other. */
const SHARED = 6;
/** The mast starts to come round this long before the vehicle is under it (ms). */
const LEAD = 200;
/** How soon after a load leaves a spot the next vehicle may stand on it (ms). */
const CLEAR = 300;

/**
 * **The lifts of a boarding's vehicles, one after the other**: a vehicle takes the next mast,
 * those of different stations first (two masts at one station share one spot), and starts to drive
 * so as to arrive as the mast comes round; a vehicle bound for a spot another stands on arrives
 * once it is off the deck; a mast takes one load at a time. Rend la séquence du bord (ses mâts et
 * ses panneaux), les levées, et l'instant où tout est rangé.
 */
export function hoistsOf({
  booms,
  grounds,
  vehicles,
}: {
  readonly booms: ReadonlyArray<Boom>;
  /** Each boom's spot on the deck, in the hull's metres. */
  readonly grounds: ReadonlyArray<P3>;
  readonly vehicles: ReadonlyArray<Hoisted>;
}): {
  readonly hull: Sequence<'cargo'>;
  readonly lifts: ReadonlyArray<{
    readonly boom: number;
    readonly driveStart: number;
    readonly arrive: number;
    readonly lift: Lift;
  }>;
  readonly settled: number;
} {
  // The masts a station at a time: each station's first, then each's second.
  const stations: number[][] = [];
  booms.forEach((boom, k) => {
    const same = stations.find(
      ([first]) => Math.abs(booms[first!]!.pivot[2] - boom.pivot[2]) < SHARED,
    );
    if (same === undefined) stations.push([k]);
    else same.push(k);
  });
  const order = Array.from(
    { length: Math.max(0, ...stations.map(({ length }) => length)) },
    (_, rank) => rank,
  ).flatMap((rank) =>
    stations.flatMap((station) => (station[rank] === undefined ? [] : [station[rank]!])),
  );
  const done: Array<{ boom: number; lift: Lift }> = [];
  const lifts = vehicles.flatMap(({ drive, height }, k) => {
    const boom = order[k % order.length];
    if (boom === undefined) return [];
    const spot = grounds[boom]!;
    let arrive = LEAD + drive;
    for (const other of done) {
      const there = grounds[other.boom]!;
      if (other.boom === boom || Math.hypot(there[0] - spot[0], there[2] - spot[2]) < SHARED)
        arrive = Math.max(arrive, other.lift.lifted + CLEAR);
      if (other.boom === boom) arrive = Math.max(arrive, other.lift.end + T.slew - LEAD);
    }
    const lift = liftOf({ boom: booms[boom]!, spot, height, start: arrive - T.slew + LEAD });
    done.push({ boom, lift });
    return [{ boom, driveStart: arrive - drive, arrive, lift }];
  });
  const end = Math.max(0, ...lifts.map(({ lift }) => lift.end));
  const hull: Sequence<'cargo'> = {
    family: 'cargo',
    pool: 'site',
    anywhere: true,
    ms: end + 1,
    at(t) {
      const pose: Record<string, Pose<'cargo'>[keyof Pose<'cargo'>]> = {};
      if (t < 0 || t >= end + 1) return {};
      for (const { boom, lift } of lifts) {
        if (t < lift.start || t >= lift.end) continue;
        const { n } = booms[boom]!;
        const { yaw, lift: up } = lift.at(t);
        pose[`mat_charge_${n}`] = { aim: [yaw, up] };
        pose[`hold_hatch_${n}`] = { turn: [0, 0, -OPEN * lift.hatchAt(t)] };
      }
      return pose as Pose<'cargo'>;
    },
  };
  return { hull, lifts, settled: end };
}
