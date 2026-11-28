import { nationInk } from './nations';
import type { RaceCountdown, StrategicPointView } from './player-view';

/** Neutral point: white flame and fringe. */
export const NEUTRAL_INK = '#ffffff';

/**
 * What a strategic point's mast shows, read from its view and nothing else: no name, no nation,
 * no ink of who attacks, nothing of `season.race`.
 */
export type Mast = {
  readonly ink: string;
  /** Flame height as a share of the mast, 1 at its head. */
  readonly flameAt: number;
  readonly ring: boolean;
  readonly star: boolean;
};

/** @a-mesurer lavis.html (cap #668): where a contested flame sits on the mast */
const CONTESTED_FLAME_AT = 0.42;

export function mastOf(point: StrategicPointView, concluded: boolean): Mast {
  return {
    ink: point.holder === null ? NEUTRAL_INK : nationInk(point.holder.nation),
    flameAt: point.contested ? CONTESTED_FLAME_AT : 1,
    ring: point.contested && !concluded,
    star: point.mine,
  };
}

/**
 * **The beam of the race** (#678): the ink of the leader's beam on a point it holds, `null` on any
 * other. Read from `season.race` and the holders the view serves, as the ruler and the rings do:
 * no race, no beam (a holder of four who is eliminated, a point retaken, a Blitz); a concluded
 * season has none either.
 */
export function raceBeamInk(
  point: StrategicPointView,
  race: RaceCountdown | null,
  concluded: boolean,
): string | null {
  if (race === null || concluded || point.holder?.nation !== race.leaderNation) return null;
  return nationInk(race.leaderNation);
}

/**
 * Board units. `height`: a 24 m barracks mast (ADR 0038 §3) at the common scale x1600 (ADR 0035).
 * @a-mesurer lavis.html (cap #668): `flame` (0.6 x 0.32 of the mast) and `baseRadius`
 */
export const MAST_UNITS = {
  height: 0.46,
  flame: 0.6 * 0.32,
  baseRadius: 0.17,
};

/**
 * The mast on screen, in pixels. @a-mesurer lavis.html (cap #668): `near` (floor up to
 * `nearDistance`, its Europe zoom), `far` (floor from `farDistance`, its world zoom), `phone` (the
 * floor's share on a phone), `baseMinShare` (the base never drops under this share of the mast)
 */
export const MAST_PX = {
  near: 56,
  nearDistance: 53,
  far: 30,
  farDistance: 136,
  phone: 0.7,
  baseMinShare: 0.16,
};

/**
 * Mast height on screen: the larger of its real size and its floor (the floor alone shrinks on a
 * phone: a mast close up is as big as it is). The real size is read against
 * the engine's own viewport height and camera FOV (degrees), never a copy of them.
 */
export function mastPx(
  distance: number,
  phone: boolean,
  viewportHeight: number,
  fov: number,
): number {
  const { near, nearDistance, far, farDistance } = MAST_PX;
  const t = Math.min(1, Math.max(0, (distance - nearDistance) / (farDistance - nearDistance)));
  const floor = near + (far - near) * t;
  const real =
    (MAST_UNITS.height * viewportHeight) / (2 * Math.tan((fov * Math.PI) / 360) * distance);
  return Math.max(real, floor * (phone ? MAST_PX.phone : 1));
}
