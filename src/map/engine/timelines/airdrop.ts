import type { MapMotion } from '@/domain/map-motion';
import { AIR_ALTITUDE, metresOnBoard } from '@/domain/piece-size';
import { CRATE_METRES } from '../crate';
import { FADE_MS, FALL_MS, PARACHUTE_MS, parachuteAt, REST_MS, STILL_MS } from '../parachute';
import type { Pose } from '../sequences';
import { ease, span } from './curves';

/**
 * **An airdrop, pure functions of time** (#481, `storyboard-mer-air` « 3. Largage », ADR 0028 §4):
 * a transport flies level at `AIR_ALTITUDE`, opens its bay door, and its crate (1.2 m) leaves
 * `fx_parachute` under a canopy (8 m) that brakes it, drifting with the flight to land 6 m past
 * the target. Everything is in board units, from the target, `x` along the flight, `y` up. Times
 * in ms. The fall's own curve is `parachuteAt`'s, unchanged.
 */
type Vec3 = readonly [x: number, y: number, z: number];

/** The storyboard's pass (`mer-air.js`, `AIR`): 70 m/s played, from -160 m to +160 m of the
 *  target. `@a-mesurer` */
const SPEED_MPS = 70;
const RUN_M = 160;
/** The transport reaches the target, and lets go, this long after it comes into view. */
export const PASS_MS = (RUN_M / SPEED_MPS) * 1000;
const PLANE_MS = 2 * PASS_MS;
/** The bay door (`mer-air.js:622-624, 900`): swings open 90° (`out3`, 0.5 s) from 0.6 s before
 *  the drop, shuts (`in2`, 0.6 s) from 0.6 s after it. `@a-mesurer` */
const BAY_LEAD_MS = 600;
const BAY_OPEN_MS = 500;
const BAY_SHUT_MS = 600;
const BAY_ANGLE = Math.PI / 2;
/** The canopy fills over 0.35 s, from 0.25 s into the fall; on the ground it sinks over 0.5 s
 *  (`T.canopy`, `T.settle`). `@a-mesurer` */
const CANOPY_AT_MS = 250;
export const CANOPY_MS = 350;
const SETTLE_MS = 500;
export const CANOPY_METRES = 8;
/** It lands this far past its target, in the flight's direction. */
export const DRIFT_METRES = 6;
/** Planes of a column drop this far apart. `@a-mesurer` — the storyboard's file. */
export const COLUMN_GAP_MS = 400;

/** What the packet looks like at an instant: where its crate is, how wide its canopy is open
 *  (0 shut), the crate's side, and its opacity. */
type Packet = {
  readonly at: Vec3;
  readonly canopy: number;
  readonly collapse: number;
  readonly crate: number;
  readonly opacity: number;
};

export type Airdrop = {
  readonly ms: number;
  /** The transport's pose: `root` flying level, `bay_door` swung open. `{}` outside the sequence. */
  plane(t: number): Pose<'airTransport'>;
  /** `null` before the crate leaves, with nothing delivered, and once it is gone. */
  packet(t: number): Packet | null;
};

const sideOf = (metres: number): number => metresOnBoard(metres);

/** What #508 may fix: the arc's heading, and where the crate leaves the plane. */
type Frame = {
  /** The arc's heading, from +z like `PartPose.heading`; default the flight's own, +x. Every
   *  `travel`, `at` and `to` comes out turned to it. */
  readonly heading?: number;
  /** Where the crate leaves the plane (`fx_parachute`), from its root, in the flight's frame. */
  readonly release?: Vec3;
  /** Where the piece that takes the packet stands from the target, in the flight's frame: crate
   *  and canopy go there as they fade. */
  readonly to?: Vec3;
};

/**
 * **One transport's pass.** `delivered` false: it flies by, door shut, no packet. Reduced motion
 * lays the packet down at once; cut motion plays nothing.
 */
export function airdrop(
  opts: Frame & { readonly delivered: boolean; readonly motion: MapMotion },
): Airdrop {
  const { delivered, motion, to, release = [0, 0, 0] } = opts;
  const heading = opts.heading ?? Math.PI / 2;
  if (motion === 'off') return { ms: 0, plane: () => ({}), packet: () => null };
  const turned = ([x, y, z]: Vec3): Vec3 => [
    x * Math.sin(heading) - z * Math.cos(heading),
    y,
    x * Math.cos(heading) + z * Math.sin(heading),
  ];
  const drift = sideOf(DRIFT_METRES);
  const reduced = motion === 'reduced';
  // Reduced: no plane, the packet at once; full: after the pass.
  const origin = reduced ? 0 : PASS_MS;
  const ms = !delivered
    ? reduced
      ? 0
      : PLANE_MS
    : reduced
      ? STILL_MS
      : Math.max(PLANE_MS, PASS_MS + PARACHUTE_MS);

  const plane = (t: number): Pose<'airTransport'> => {
    if (reduced || t < 0 || t >= PLANE_MS) return {};
    const x = sideOf((SPEED_MPS * (t - PASS_MS)) / 1000);
    const root = { travel: turned([x, AIR_ALTITUDE, 0]), heading };
    if (!delivered) return { root };
    const open =
      ease.out3(span(t, PASS_MS - BAY_LEAD_MS, PASS_MS - BAY_LEAD_MS + BAY_OPEN_MS)) *
      (1 - ease.in2(span(t, PASS_MS + BAY_LEAD_MS, PASS_MS + BAY_LEAD_MS + BAY_SHUT_MS)));
    // The door hinges at its fore edge: it falls open with a negative turn about x.
    return open > 0 ? { root, bay_door: { turn: [-open * BAY_ANGLE, 0, 0] } } : { root };
  };

  const packet = (t: number): Packet | null => {
    if (!delivered) return null;
    const age = t - origin;
    const state = parachuteAt(age, motion);
    if (state === null) return null;
    const fell = 1 - state.height;
    const taken = reduced
      ? span(age, STILL_MS - FADE_MS, STILL_MS)
      : span(age, FALL_MS + REST_MS, PARACHUTE_MS);
    const k = ease.inOut(taken);
    // Leaving the plane's marker, it sheds that offset as it comes down onto the target.
    const from: Vec3 = [
      drift * fell + release[0] * state.height,
      (AIR_ALTITUDE + release[1]) * state.height,
      release[2] * state.height,
    ];
    const at = turned(
      to ? [from[0] + (to[0] - from[0]) * k, from[1], from[2] + (to[2] - from[2]) * k] : from,
    );
    const open = reduced ? 0 : ease.out3(span(age, CANOPY_AT_MS, CANOPY_AT_MS + CANOPY_MS));
    return {
      at,
      canopy: sideOf(CANOPY_METRES) * open,
      collapse: reduced ? 0 : ease.out3(span(age, FALL_MS, FALL_MS + SETTLE_MS)),
      crate: sideOf(CRATE_METRES),
      opacity: state.opacity,
    };
  };

  return { ms, plane, packet };
}

/**
 * **A column of transports**: one packet per loaded plane, each plane `COLUMN_GAP_MS` behind the
 * one before. `loads[i]` is whether plane `i` carries a crate; each drop runs on its own clock
 * from `start`. Cut, or nothing loaded: nothing plays, `ms` 0.
 */
export function airdropColumn(
  loads: ReadonlyArray<boolean>,
  motion: MapMotion,
  frame: Frame = {},
): { readonly ms: number; readonly drops: ReadonlyArray<{ start: number; drop: Airdrop }> } {
  const drops = loads.map((delivered, i) => ({
    start: i * COLUMN_GAP_MS,
    drop: airdrop({ ...frame, delivered, motion }),
  }));
  const plays = motion !== 'off' && loads.some(Boolean);
  return { ms: plays ? Math.max(...drops.map((d) => d.start + d.drop.ms)) : 0, drops };
}
