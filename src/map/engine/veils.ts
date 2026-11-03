import type { Object3D, Vector3 } from 'three';

/** What a combat on the map, or the replay, covers on the board: the ground there would show the after. */
export type Veil = { readonly center: Vector3; readonly reach: number };
/** My battery firing (#325): its point on the board, and how near it my gun stands. */
export type Battery = { readonly at: Vector3; readonly within: number };

/**
 * **Les piles qu'un voile cache** (#272) : celles qui se tiendraient dans la scène — sauf ma
 * batterie qui tire (#325), dont la pièce relayée tire depuis sa pile : près de sa cible, elle
 * disparaîtrait sous son propre coup.
 */
export function veiledPiles<T extends Object3D>(
  piles: ReadonlyArray<T>,
  veils: ReadonlyArray<Veil>,
  batteries: ReadonlyArray<Battery>,
): T[] {
  const firing = ({ x, z }: Vector3) =>
    batteries.some(({ at, within }) => Math.hypot(x - at.x, z - at.z) <= within);
  return piles.filter(
    ({ position }) =>
      veils.some(({ center, reach }) => position.distanceTo(center) < reach) && !firing(position),
  );
}
