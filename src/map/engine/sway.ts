import type { UnitRole } from '@/domain/ids';

/**
 * **How a piece of mine rides its road** (proposition `table-etat-major`, lot « vie des
 * pièces »): a vehicle on tracks or wheels pitches and jolts, a hull rolls and heaves, a wing
 * banks into its turns. Infantry walks without either. Amplitudes and frequencies are the
 * prototype's (`table-etat-major.html`, `step`), in radians and in model units.
 */
export type Gait = 'rolling' | 'hull' | 'wing';

const GAIT_BY_ROLE: Readonly<Record<UnitRole, Gait | null>> = {
  infantry: null,
  armor: 'rolling',
  landTransport: 'rolling',
  fighter: 'wing',
  bomber: 'wing',
  airTransport: 'wing',
  escort: 'hull',
  cargo: 'hull',
  carrier: 'hull',
};

export const gaitOf = (role: UnitRole | null): Gait | null =>
  role === null ? null : GAIT_BY_ROLE[role];

export type Sway = { readonly pitch: number; readonly roll: number; readonly lift: number };

const STILL: Sway = { pitch: 0, roll: 0, lift: 0 };

/** The widest bank, reached from a turn of `FULL_BANK_TURN` radians around the plane. */
export const MAX_BANK = 0.32;
const FULL_BANK_TURN = 0.6;

/**
 * **The sway at `time` seconds.** `moving` stills what only shakes on the road — a vehicle at
 * the dock does not jolt —, a hull rolls wherever it floats. `turn` is the road's bend around
 * the piece, positive to the left: a plane leans into it, and flies level on a straight line.
 */
export function swayOf(gait: Gait | null, time: number, moving: boolean, turn = 0): Sway {
  switch (gait) {
    case 'rolling':
      return moving
        ? {
            pitch: Math.sin(time * 15) * 0.025,
            roll: 0,
            lift: Math.abs(Math.sin(time * 15)) * 0.03,
          }
        : STILL;
    case 'hull':
      return { pitch: 0, roll: Math.sin(time * 1.3) * 0.04, lift: Math.sin(time * 1.7) * 0.05 };
    case 'wing':
      return {
        pitch: 0,
        roll: -MAX_BANK * Math.max(-1, Math.min(1, turn / FULL_BANK_TURN)),
        lift: 0,
      };
    default:
      return STILL;
  }
}

type Xz = { readonly x: number; readonly z: number };

/** Below this, a stretch of road has no heading: the end of a leg, read clamped onto the piece. */
const SHORTEST_STRETCH = 1e-6;

/**
 * **The road's bend around a piece**, from a point behind it to one ahead, in radians and
 * positive to the left. Zero where either stretch has no length — at take-off and landing the
 * clamped read falls on the piece itself, and `atan2(0, 0)` would bank it by its compass
 * heading — and across a jump wider than a quarter turn, which is the board's east-west seam,
 * never a turn.
 */
export function bendAround(behind: Xz, at: Xz, ahead: Xz): number {
  const [bx, bz, ax, az] = [at.x - behind.x, at.z - behind.z, ahead.x - at.x, ahead.z - at.z];
  if (Math.hypot(bx, bz) < SHORTEST_STRETCH || Math.hypot(ax, az) < SHORTEST_STRETCH) return 0;
  let delta = (Math.atan2(ax, az) - Math.atan2(bx, bz)) % (2 * Math.PI);
  if (delta > Math.PI) delta -= 2 * Math.PI;
  if (delta <= -Math.PI) delta += 2 * Math.PI;
  return Math.abs(delta) > Math.PI / 2 ? 0 : delta;
}
