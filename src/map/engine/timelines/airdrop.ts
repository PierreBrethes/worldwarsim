import type { MapMotion } from '@/domain/map-motion';
import { AIR_ALTITUDE, metresOnBoard } from '@/domain/piece-size';
import { CRATE_METRES } from '../crate';
import { FALL_MS, PARACHUTE_MS, parachuteAt } from '../parachute';
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

/** The transport reaches the target (and lets go) this long after it comes into view.
 *  `@a-mesurer` — read off the storyboard's pass; the door has to open on the way in. */
export const PASS_MS = 1500;
/** The plane's speed, m/s: the transport's roll in `AIR` (`airfield.ts`). `@a-mesurer` — the
 *  take-off's figure, not a cruise speed. */
const SPEED_MPS = 60;
/** It stays in view this long after the pass. `@a-mesurer` — long enough to close its door. */
const LEAVE_MS = 1500;
/** The bay door opens ahead of the pass, and closes after it, this long. `@a-mesurer` — the
 *  storyboard's beat for a door. */
const DOOR_MS = 500;
/** How far the door swings open, radians. `@a-mesurer` — a ramp's quarter turn, short of it. */
const DOOR_ANGLE = (70 * Math.PI) / 180;
/** The canopy takes this long to fill, from the crate leaving. `@a-mesurer` — a static line. */
export const OPEN_MS = 500;
export const CANOPY_METRES = 8;
/** It lands this far past its target, in the flight's direction. */
export const DRIFT_METRES = 6;
/** Planes of a column drop this far apart. `@a-mesurer` — the storyboard's file. */
export const COLUMN_GAP_MS = 400;

/** What the packet looks like at an instant: where its crate is, how wide its canopy is open
 *  (0 shut), the crate's side, and its opacity. */
export type Packet = {
  readonly at: Vec3;
  readonly canopy: number;
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

const PLANE_MS = PASS_MS + LEAVE_MS;
const sideOf = (metres: number): number => metresOnBoard(metres);

/**
 * **One transport's pass.** `delivered` false: it flies by, door shut, no packet. `to` is where
 * the piece that takes the packet stands, from the target: crate and canopy go there as they fade.
 * Reduced motion lays the packet down at once; cut motion plays nothing.
 */
export function airdrop(opts: {
  readonly delivered: boolean;
  readonly motion: MapMotion;
  readonly to?: Vec3;
}): Airdrop {
  const { delivered, motion, to } = opts;
  if (motion === 'off') return { ms: 0, plane: () => ({}), packet: () => null };
  const drift = sideOf(DRIFT_METRES);
  const reduced = motion === 'reduced';
  // Reduced: no plane, the packet at once; full: after the pass.
  const origin = reduced ? 0 : PASS_MS;
  const ms = reduced ? origin + 1400 : PASS_MS + PARACHUTE_MS;

  const plane = (t: number): Pose<'airTransport'> => {
    if (reduced || t < 0 || t >= PLANE_MS) return {};
    const x = sideOf((SPEED_MPS * (t - PASS_MS)) / 1000);
    const root = { travel: [x, AIR_ALTITUDE, 0] as const, heading: Math.PI / 2 };
    if (!delivered) return { root };
    const open =
      ease.inOut(span(t, PASS_MS - DOOR_MS, PASS_MS)) *
      (1 - ease.inOut(span(t, PASS_MS + 300, PASS_MS + 300 + DOOR_MS)));
    return open > 0 ? { root, bay_door: { turn: [open * DOOR_ANGLE, 0, 0] } } : { root };
  };

  const packet = (t: number): Packet | null => {
    if (!delivered) return null;
    const age = t - origin;
    const state = parachuteAt(age, motion);
    if (state === null) return null;
    const fell = 1 - state.height;
    const taken = reduced ? span(age, 1400 - 500, 1400) : span(age, FALL_MS + 700, PARACHUTE_MS);
    const k = ease.inOut(taken);
    const from: Vec3 = [drift * fell, AIR_ALTITUDE * state.height, 0];
    const at: Vec3 = to
      ? [from[0] + (to[0] - from[0]) * k, from[1], from[2] + (to[2] - from[2]) * k]
      : from;
    const canopy = reduced || state.height === 0 ? 0 : ease.out3(span(age, 0, OPEN_MS));
    return {
      at,
      canopy: sideOf(CANOPY_METRES) * canopy,
      crate: sideOf(CRATE_METRES),
      opacity: state.opacity,
    };
  };

  return { ms, plane, packet };
}

/**
 * **A column of transports**: one packet per loaded plane, each plane `COLUMN_GAP_MS` behind the
 * one before. `loads[i]` is whether plane `i` carries a crate; each drop runs on its own clock
 * from `start`.
 */
export function airdropColumn(
  loads: ReadonlyArray<boolean>,
  motion: MapMotion,
): { readonly ms: number; readonly drops: ReadonlyArray<{ start: number; drop: Airdrop }> } {
  const drops = loads.map((delivered, i) => ({
    start: i * COLUMN_GAP_MS,
    drop: airdrop({ delivered, motion }),
  }));
  return { ms: Math.max(0, ...drops.map((d) => d.start + d.drop.ms)), drops };
}
