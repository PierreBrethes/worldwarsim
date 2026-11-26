import { nationInk } from './nations';
import type { StrategicPointView } from './player-view';

/** Neutral point: white flame and fringe. */
const NEUTRAL_INK = '#ffffff';

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
export const CONTESTED_FLAME_AT = 0.42;

export function mastOf(point: StrategicPointView, concluded: boolean): Mast {
  return {
    ink: point.holder === null ? NEUTRAL_INK : nationInk(point.holder.nation),
    flameAt: point.contested ? CONTESTED_FLAME_AT : 1,
    ring: point.contested && !concluded,
    star: point.mine,
  };
}

/** Board units. */
export const MAST_UNITS = {
  /** A 24 m barracks mast (ADR 0038 §3) at the common scale x1600 (ADR 0035). */
  height: 0.46,
  /** @a-mesurer lavis.html (cap #668): flame height = 0.6 x 0.32 of the mast */
  flame: 0.6 * 0.32,
  /** @a-mesurer lavis.html (cap #668) */
  baseRadius: 0.17,
};

export const MAST_PX = {
  /** @a-mesurer lavis.html (cap #668): floor up to `nearDistance` (its Europe zoom) */
  near: 56,
  nearDistance: 53,
  /** @a-mesurer lavis.html (cap #668): floor from `farDistance` (its world zoom) on */
  far: 30,
  farDistance: 136,
  /** @a-mesurer lavis.html (cap #668) */
  phone: 0.7,
  /** @a-mesurer lavis.html (cap #668): the base never drops under this share of the mast on screen */
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
