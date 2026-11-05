import { troopMetres } from '@/domain/piece-size';
import { AIRFIELD, MOLE } from '@/emblems/kits/manifest';
import { type AirRole, TAIL_GAP } from './airfield';
import { HULL_BEAM_SHARE, type SeaRole } from './port';

/**
 * **Where the pieces of a site rest** (#475, storyboards `aerodrome` « Plusieurs avions » and
 * `port` « À couple »): pure, in the site's metres — the airfield's yard, the port's mole —, one
 * slot per piece in the order given, `null` for one that does not fit (it stays at its label).
 * `side` mirrors the site (#476); `growth` is how much larger than true size the figurines are
 * drawn up close (`floorGrowth`), which widens the steps, never what fits.
 */
export type Rest = { readonly x: number; readonly z: number; readonly yaw: number };
type Side = 1 | -1;

/** The room a lane holds, from the rail: its tail gap to the ramp's top. */
const LANE_ROOM = AIRFIELD.ramp.from - (AIRFIELD.facade + TAIL_GAP);
/** **The gap between two planes of a lane**, so a fighter's pitch is 13 m. `@a-mesurer` */
const PLANE_GAP = 2;
/** **The gap between the flanks of two hulls side by side.** `@a-mesurer` */
const COUPLE_GAP = 1;
/** **How far off the second hull a third rides at anchor.** `@a-mesurer` */
const ROADS_GAP = 60;

/**
 * **The apron**: the right lane fills first, each plane a pitch behind the one before it, its tail
 * 2 m from the rail; what does not fit goes on to the left lane, and a big plane is alone in its
 * own. A slot is a rank: when a plane leaves, the next stands where it stood.
 */
export function apron(
  roles: ReadonlyArray<AirRole>,
  side: Side = 1,
  growth = 1,
): Array<Rest | null> {
  const lanes = AIRFIELD.lanes.map((x) => ({ x, used: 0, count: 0, big: false }));
  return roles.map((role) => {
    const length = troopMetres(role);
    const big = role !== 'fighter';
    const lane = lanes.find((each) =>
      big ? each.count === 0 : !each.big && each.used + length <= LANE_ROOM,
    );
    if (lane === undefined) return null;
    const z = AIRFIELD.facade + growth * (TAIL_GAP + lane.used + length / 2);
    lane.used += length + PLANE_GAP;
    lane.count += 1;
    lane.big = big;
    return { x: side * lane.x, z, yaw: 0 };
  });
}

/**
 * **The berths**: the first hull against the mole's fenders, the second alongside it, bows level,
 * the third in the roads off the mole; no more.
 */
export function berths(
  roles: ReadonlyArray<SeaRole>,
  side: Side = 1,
  growth = 1,
): Array<Rest | null> {
  // From the mole's face outward: what the hulls before have taken.
  let used = 1;
  return roles.map((role, k) => {
    if (k > 2) return null;
    const length = troopMetres(role);
    const beam = HULL_BEAM_SHARE * length;
    used += k === 0 ? 0 : k === 1 ? COUPLE_GAP : ROADS_GAP;
    const x = MOLE.inner - growth * (used + beam / 2);
    used += beam;
    return { x: side * x, z: MOLE.quay + growth * (3 + length / 2), yaw: side * Math.PI };
  });
}
