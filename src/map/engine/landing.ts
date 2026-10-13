/**
 * **The prototype's hand, in seconds** (`liftTick`, `table-etat-major.html`): how a piece is set
 * down, carried back, and how it hangs from the hand while carried. Heights are in whatever unit
 * the caller lifts in; the bounce is a tenth of the drop, as there.
 */
export const FALL = 0.14;
export const BOUNCE = 0.12;
/** The way back to where the piece was taken, before it is set down there (`returning`). */
export const GLIDE = 0.4;

/** Dropped from `from`: down in `FALL`, a small bounce, then on the board. */
export function dropLift(t: number, from: number): number {
  if (t < 0) return from;
  if (t < FALL) return from * (1 - t / FALL) ** 2;
  if (t < FALL + BOUNCE) return Math.sin(((t - FALL) / BOUNCE) * Math.PI) * from * 0.1;
  return 0;
}

export const DROP_DONE = FALL + BOUNCE;
export const RETURN_DONE = GLIDE + DROP_DONE;

/**
 * Put back: the share of the way home and the height, at `t`. It glides in a small hop, then
 * drops from the height it was carried at — a piece already down hops up first.
 */
export function returnAt(t: number, carried: number, hop: number): { share: number; lift: number } {
  if (t < GLIDE) {
    const k = Math.max(0, t / GLIDE);
    return { share: k * k * (3 - 2 * k), lift: carried + Math.sin(k * Math.PI) * hop };
  }
  return { share: 1, lift: dropLift(t - GLIDE, carried) };
}

/** Carried, it sways on two slow beats, and leans into the way it is dragged. */
export function swayAt(t: number, drag: { x: number; z: number }): { x: number; z: number } {
  const lean = (v: number) => Math.max(-0.15, Math.min(0.15, v));
  return {
    z: Math.sin(t * 3.1) * 0.05 - lean(drag.x),
    x: Math.sin(t * 2.3) * 0.04 + lean(drag.z),
  };
}

/** A step of `dt` seconds of an exponential follow at `rate` per second, never past the target. */
export const followShare = (dt: number, rate: number): number =>
  Math.min(1, Math.max(0, dt * rate));
