import { CRANE, MOLE } from '@/emblems/kits/manifest';

/** **What a side of a port may stand on**, in the port's metres (`port.glb`): the land, and what a
 *  neighbouring site takes. */
export type PortGround = {
  land(x: number, z: number): boolean;
  taken(x: number, z: number): boolean;
};

/** **How much of the mole's footprint may lie on land before its side is blocked** (#476),
 *  Décisions du 23/10 : « port posé en miroir si le côté de la grue est bloqué ». A quarter: the
 *  mole must cross the land beyond the shore, not graze a ragged one (measured on 834 coastal
 *  points: 0,1 mirrors 33 % of the ports, 0,25 with the rest below 23 %). `@a-mesurer` */
export const MOLE_LAND_MAX = 0.25;
/** **How much less blocked the other side must be** to be taken: no turning over for a hair.
 *  `@a-mesurer` */
export const MIRROR_MARGIN = 0.05;
/** **The rows of the mole's footprint, from the quay, left out**: the shore's line is smoothed and
 *  ragged by construction, its first row bites it. `@a-mesurer` */
const QUAY_ROWS_SKIPPED = 1;

/** The mole's footprint, in samples: across its width, along its run to the head. */
const ACROSS = 3;
const ALONG = 12;
const FAR = MOLE.quay + MOLE.length + MOLE.head;

/** **How blocked the mole's side is**: the share of its footprint on land or taken by another
 *  site, and a whole one more when its crane's foot is taken. `sign` is -1 mirrored. The crane
 *  stands on the port's own socle, which a coast that bends may hang over the water: only a
 *  neighbour can take its place, the ground under it blocks nothing. */
function blocked(ground: PortGround, sign: 1 | -1): number {
  let hit = 0;
  for (let i = 0; i < ACROSS; i++)
    for (let j = QUAY_ROWS_SKIPPED; j < ALONG; j++) {
      // At the middle of each cell, as the socle is read (`SOCLE_SAMPLES`).
      const x = sign * (MOLE.inner + ((MOLE.x - MOLE.inner) * 2 * (i + 0.5)) / ACROSS);
      const z = MOLE.quay + ((FAR - MOLE.quay) * (j + 0.5)) / ALONG;
      if (ground.land(x, z) || ground.taken(x, z)) hit++;
    }
  const [cx, cz] = [sign * CRANE.x, CRANE.z];
  const crane = ground.taken(cx, cz) ? 1 : 0;
  return hit / (ACROSS * (ALONG - QUAY_ROWS_SKIPPED)) + crane;
}

/**
 * **Whether a port is laid in mirror** (#476): its mole and crane stand on the `+x` edge of its
 * socle, and a coast that bends, or a site beside it, can block that side. Mirrored when the plain
 * side is blocked and the other is less so by a margin; with neither free the less blocked keeps its place,
 * and none is refused — the server reads nothing of the coast.
 */
export function mirroredPort(ground: PortGround): boolean {
  const plain = blocked(ground, 1);
  return plain > MOLE_LAND_MAX && blocked(ground, -1) < plain - MIRROR_MARGIN;
}
