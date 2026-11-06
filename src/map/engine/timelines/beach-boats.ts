import { Euler, Quaternion, Vector3 } from 'three';
import type { MapMotion } from '@/domain/map-motion';
import { wrap } from '../articulation';
import type { PartPose, Sequence } from '../sequences';
import { ease, span } from './curves';
import { RAZE_RING_MS } from './raze';

export type Flat = readonly [x: number, z: number];
type Vec3 = readonly [x: number, y: number, z: number];

/** The storyboard's hours (« L'assaut en canots », `T`), in ms, as written: the boat slides out of
 *  its davit in 500 and goes down to the water in 1100; a man hops in 380. The rest is proposed
 *  there. `@a-mesurer` — read off the storyboard, not from a boat on a swell */
const T = {
  out: 500,
  down: 1100,
  hop: 380,
  /** The second boat is lowered this long after the first. */
  stagger: 300,
  first: 200,
  /** After it grounds, the first man shows at the bow; each next one this much later. */
  manFirst: 250,
  manGap: 180,
} as const;
/** The boat's pace on the water, in metres of the model a second. `@a-mesurer` — the storyboard's */
const BOAT_MPS = 22;
/** It comes home over this share of the time it took to go: it is light. `@a-mesurer` */
const BACK_SHARE = 0.8;
/** It slides this far out of its davit, in metres of the model. `@a-mesurer` */
const SWING_M = 2.5;
/** The boat's keel on the water, aground, and its bow up when aground (a boat of 7.6 m). `@a-mesurer` */
const WATER_Y = -0.25;
const AGROUND_Y = -0.1;
const BOW_UP = (4 * Math.PI) / 180;
/** Half a boat's length, and where its men stand from its bow, in metres of the model. */
const HALF_BOAT = 3.8;
const BOW_BACK = 0.6;
/** How high a man stands in the bow, in metres of the model. `@a-mesurer` */
const BOW_DECK = 0.6;
/** A man's pace, in his heights a second (the storyboard's), and how high his hop rises. */
const MAN_SPEED = 1.9;
const HOP_RISE = 0.14;
/** The boat going round the stern keeps this far out of its davit's side, as a multiple of it. */
const WIDE = 1.8;

/**
 * **An assault to play** (#482), the board's places given, none of the storyboard's: the hull
 * where it stands (`metre` board units to a metre of the model, `heading` its bow's turn from +z,
 * `astern` the z of its stern in its own frame, clear of the water it runs in), the boats it
 * hangs (`rest` in the hull's frame, where the rig finds the node: the junk has `boat_left`
 * only), and each squad's men at their places, the way they face and the board point where the
 * boat that brings them grounds (its centre).
 */
export type Assault = {
  readonly hull: {
    readonly at: Flat;
    readonly heading: number;
    readonly metre: number;
    readonly astern: number;
  };
  readonly boats: ReadonlyArray<{ readonly node: 'boat_left' | 'boat_right'; readonly rest: Vec3 }>;
  readonly squads: ReadonlyArray<{
    readonly men: ReadonlyArray<Flat>;
    readonly heading: number;
    readonly landing: Flat;
  }>;
  /** A man's height, in board units. */
  readonly man: number;
};

const sign = (x: number): 1 | -1 => (x < 0 ? -1 : 1);
const lerp = (a: Flat, b: Flat, k: number): Flat => [
  a[0] + (b[0] - a[0]) * k,
  a[1] + (b[1] - a[1]) * k,
];
const gap = (a: Flat, b: Flat): number => Math.hypot(a[0] - b[0], a[1] - b[1]);
const headingOf = (a: Flat, b: Flat): number => Math.atan2(b[0] - a[0], b[1] - a[1]);

/** A way of straight legs, `k` of the way along it (0..1): where, and the way it faces. */
export function wayOf(points: ReadonlyArray<Flat>) {
  const legs = points
    .slice(1)
    .map((to, i) => ({ from: points[i]!, to, length: gap(points[i]!, to) }));
  const length = legs.reduce((sum, leg) => sum + leg.length, 0);
  return {
    length,
    at(k: number): { at: Flat; heading: number } {
      let s = k * length;
      for (const leg of legs)
        if (s <= leg.length || leg === legs.at(-1))
          return {
            at: lerp(leg.from, leg.to, leg.length > 0 ? Math.min(1, s / leg.length) : 1),
            heading: headingOf(leg.from, leg.to),
          };
        else s -= leg.length;
      throw new Error('unreachable: a way has a leg');
    },
  };
}

const UP = new Vector3(0, 1, 0);
const ACROSS = new Vector3(1, 0, 0);
const up = new Quaternion();
const nose = new Quaternion();
/** The boat turns about the up first, then lifts its bow in its own frame: Ry(yaw)·Rx(pitch).
 *  A pose's `turn` is read as Euler XYZ, Rx·Ry·Rz, which would bank a boat aground broadside. */
const turnOf = (yaw: number, pitch: number): Vec3 => {
  const e = new Euler().setFromQuaternion(
    up.setFromAxisAngle(UP, yaw).multiply(nose.setFromAxisAngle(ACROSS, pitch)),
    'XYZ',
  );
  return [e.x, e.y, e.z];
};

type Trip = {
  readonly node: 'boat_left' | 'boat_right';
  readonly rest: Vec3;
  readonly out: Vec3;
  readonly way: ReturnType<typeof wayOf>;
  readonly down: number;
  readonly go: number;
  readonly beach: number;
  readonly leave: number;
  readonly back: number;
  readonly up: number;
  readonly home: number;
  readonly t0: number;
};

/**
 * **L'assaut sur une plage** (#482, storyboard « L'assaut en canots ») : le cargo ne tourne pas ;
 * ses canots sortent de leurs bossoirs, descendent à l'eau, et vont à la plage, celui du flanc de
 * la terre tout droit, l'autre par l'arrière. Échoués, l'avant levé de 4°, trois hommes paraissent
 * à l'avant, sautent et courent à leur place ; le canot repart quand le dernier a sauté, et
 * remonte sous son bossoir. Les escouades au-delà des canots se posent d'un coup, au premier
 * échouage. Rend la séquence du cargo, celle de chaque escouade, et quand tout est posé.
 *
 * En « réduites » rien ne navigue : la pile est sur la plage, un anneau d'encre dessus 0,6 s ; en
 * « coupées », la pile seule.
 */
export function beachBoatsOf(
  assault: Assault,
  motion: MapMotion = 'full',
): {
  readonly cargo: Sequence<'cargo'> | null;
  readonly squads: ReadonlyArray<Sequence>;
  readonly ring: { readonly at: Flat; readonly ms: number } | null;
  readonly settled: number;
} {
  const { hull, boats, squads, man } = assault;
  const centre = (points: ReadonlyArray<Flat>): Flat => [
    points.reduce((sum, p) => sum + p[0], 0) / points.length,
    points.reduce((sum, p) => sum + p[1], 0) / points.length,
  ];
  if (motion !== 'full') {
    const ring =
      motion === 'reduced' ? { at: centre(squads.flatMap((s) => s.men)), ms: RAZE_RING_MS } : null;
    return { cargo: null, squads: [], ring, settled: ring?.ms ?? 0 };
  }

  const cos = Math.cos(hull.heading);
  const sin = Math.sin(hull.heading);
  const toBoard = ([x, z]: Flat): Flat => [
    hull.at[0] + hull.metre * (x * cos + z * sin),
    hull.at[1] + hull.metre * (-x * sin + z * cos),
  ];
  const toLocal = (p: Flat): Flat => {
    const dx = (p[0] - hull.at[0]) / hull.metre;
    const dz = (p[1] - hull.at[1]) / hull.metre;
    return [dx * cos - dz * sin, dx * sin + dz * cos];
  };

  // The shore's side of the hull; its boat goes first, with the first squad, and goes straight.
  const shore = sign(centre(squads.map((s) => toLocal(s.landing)))[0]);
  const ordered = [...boats].sort(
    (a, b) => Number(sign(b.rest[0]) === shore) - Number(sign(a.rest[0]) === shore),
  );

  const trips: Trip[] = ordered.slice(0, squads.length).map((boat, i) => {
    const [rx, ry, rz] = boat.rest;
    const out: Vec3 = [rx + sign(rx) * SWING_M, ry, rz];
    const landing = toLocal(squads[i]!.landing);
    const direct = sign(rx) === shore;
    const way = wayOf(
      direct
        ? [[out[0], out[2]], landing]
        : [
            [out[0], out[2]],
            [sign(rx) * Math.abs(out[0]) * WIDE, hull.astern],
            [shore * Math.abs(out[0]) * WIDE, hull.astern],
            landing,
          ],
    );
    const run = (way.length / BOAT_MPS) * 1000;
    const t0 = T.first + i * T.stagger;
    const down = t0 + T.out;
    const go = down + T.down;
    const beach = go + run;
    const leave = beach + T.manFirst + (squads[i]!.men.length - 1) * T.manGap + T.hop;
    const back = leave + run * BACK_SHARE;
    const up = back + T.down;
    return {
      node: boat.node,
      rest: boat.rest,
      out,
      way,
      t0,
      down,
      go,
      beach,
      leave,
      back,
      up,
      home: up + T.out,
    };
  });

  /** A boat at `t`: where in the hull's frame, its yaw and its pitch. */
  const boatAt = (trip: Trip, t: number): { at: Vec3; yaw: number; pitch: number } => {
    const [rx, ry] = trip.rest;
    const [ox, , oz] = trip.out;
    const end = trip.way.at(1);
    if (t < trip.down)
      return {
        at: [rx + (ox - rx) * ease.inOut(span(t, trip.t0, trip.down)), ry, trip.rest[2]],
        yaw: 0,
        pitch: 0,
      };
    if (t < trip.go)
      return {
        at: [ox, ry + (WATER_Y - ry) * ease.inOut(span(t, trip.down, trip.go)), oz],
        yaw: 0,
        pitch: 0,
      };
    if (t < trip.beach) {
      const p = trip.way.at(ease.drive(span(t, trip.go, trip.beach)));
      return { at: [p.at[0], WATER_Y, p.at[1]], yaw: p.heading, pitch: 0 };
    }
    if (t < trip.leave)
      return { at: [end.at[0], AGROUND_Y, end.at[1]], yaw: end.heading, pitch: -BOW_UP };
    if (t < trip.back) {
      const p = trip.way.at(1 - ease.drive(span(t, trip.leave, trip.back)));
      return { at: [p.at[0], WATER_Y, p.at[1]], yaw: p.heading + Math.PI, pitch: 0 };
    }
    if (t < trip.up)
      return {
        at: [ox, WATER_Y + (ry - WATER_Y) * ease.inOut(span(t, trip.back, trip.up)), oz],
        yaw: 0,
        pitch: 0,
      };
    return {
      at: [ox + (rx - ox) * ease.inOut(span(t, trip.up, trip.home)), ry, trip.rest[2]],
      yaw: 0,
      pitch: 0,
    };
  };

  const cargoMs = Math.max(0, ...trips.map((trip) => trip.home));
  const cargo: Sequence<'cargo'> = {
    family: 'cargo',
    ms: cargoMs,
    at(t) {
      if (t < 0 || t >= cargoMs) return {};
      const pose: Partial<Record<'boat_left' | 'boat_right', PartPose>> = {};
      for (const trip of trips) {
        const { at, yaw, pitch } = boatAt(trip, t);
        pose[trip.node] = {
          shift: [at[0] - trip.rest[0], at[1] - trip.rest[1], at[2] - trip.rest[2]],
          turn: turnOf(yaw, pitch),
        };
      }
      return pose;
    },
  };

  const speed = (MAN_SPEED * man) / 1000;
  const squadSequences = squads.map((squad, i): Sequence => {
    const trip = trips[i];
    if (trip === undefined) {
      // Past the boats: aboard and gone until the first boat grounds, then at their places.
      // With no boat at all, they are ashore from the start.
      const appear = trips.length > 0 ? Math.min(...trips.map((x) => x.beach)) : 0;
      return {
        ms: appear,
        at(t) {
          if (t < 0 || t >= appear) return {};
          return Object.fromEntries(squad.men.map((_, k) => [`man_${k}`, { fade: 0 }]));
        },
      };
    }
    // The bow of the boat aground, in the board's plane and height.
    const end = trip.way.at(1);
    const bowLocal: Flat = [
      end.at[0] + Math.sin(end.heading) * (HALF_BOAT - BOW_BACK),
      end.at[1] + Math.cos(end.heading) * (HALF_BOAT - BOW_BACK),
    ];
    const bow = toBoard(bowLocal);
    const bowY = BOW_DECK * hull.metre;
    const men = squad.men.map((place, k) => {
      const start = trip.beach + T.manFirst + k * T.manGap;
      const sand = lerp(bow, place, 0.25);
      const walk = Math.max(1, gap(sand, place) / speed);
      return { place, start, sand, walk, toSand: headingOf(bow, sand), end: start + T.hop + walk };
    });
    const ms = Math.max(...men.map((m) => m.end));
    return {
      ms,
      at(t) {
        if (t < 0 || t >= ms) return {};
        const pose: Record<string, PartPose> = {};
        men.forEach((m, k) => {
          const name = `man_${k}`;
          if (t < m.start) pose[name] = { fade: 0 };
          else if (t < m.start + T.hop) {
            const h = span(t, m.start, m.start + T.hop);
            const at = lerp(bow, m.sand, h);
            pose[name] = {
              travel: [
                at[0] - m.place[0],
                bowY * (1 - h) + Math.sin(Math.PI * h) * HOP_RISE * man,
                at[1] - m.place[1],
              ],
              heading: m.toSand,
              hop: Math.sin(Math.PI * h),
              fade: span(h, 0, 0.35),
            };
          } else if (t < m.end) {
            const w = span(t, m.start + T.hop, m.end);
            const at = lerp(m.sand, m.place, ease.march(w));
            pose[name] = {
              travel: [at[0] - m.place[0], 0, at[1] - m.place[1]],
              heading: m.toSand + wrap(squad.heading - m.toSand) * ease.inOut(span(w, 0.8, 1)),
              stride: (t - m.start - T.hop) / 1000,
            };
          }
        });
        return pose;
      },
    };
  });

  const settled = Math.max(cargoMs, ...squadSequences.map((s) => s.ms));
  return { cargo: trips.length > 0 ? cargo : null, squads: squadSequences, ring: null, settled };
}
