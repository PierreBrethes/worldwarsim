import { troopMetres } from '@/domain/piece-size';
import { AIRFIELD, MOLE } from '@/emblems/kits/manifest';
import { type AirRole, TAIL_GAP } from './airfield';
import { berthOf, HULL_BEAM_SHARE, type SeaRole } from './port';

/**
 * **Where the pieces of a site rest** (#475, storyboards `aerodrome` « Plusieurs avions » and
 * `port` « À couple »): pure, in the site's metres — the airfield's yard, the port's mole —, one
 * slot per piece in the order given, `null` for one that does not fit (it is not drawn). `side`
 * mirrors the site (#476); `growth` is how much larger than true size each figurine is drawn up
 * close (`floorGrowth`), a number or one per piece: it widens the steps, never what fits.
 */
export type Rest = { readonly x: number; readonly z: number; readonly yaw: number };
type Side = 1 | -1;
type Growth = number | ReadonlyArray<number>;
const growthOf = (growth: Growth, k: number): number =>
  typeof growth === 'number' ? growth : (growth[k] ?? 1);

/** The yard from the rail to the ramp's top, where a plane's nose must stop. */
const YARD = AIRFIELD.ramp.from - AIRFIELD.facade;
/** The room a lane holds, from the rail: its tail gap to the ramp's top. */
const LANE_ROOM = YARD - TAIL_GAP;
/** **The gap between two planes of a lane**, so a fighter's pitch is 13 m. `@a-mesurer` */
const PLANE_GAP = 2;
/** **The gap between the flanks of two hulls side by side.** `@a-mesurer` */
const COUPLE_GAP = 1;
/** **How far past the mole's head a third hull rides at anchor.** `@a-mesurer` */
const ROADS_GAP = 60;

/**
 * **The apron**: the right lane fills first, each plane a pitch behind the one before it, its tail
 * 2 m from the rail; what does not fit goes on to the left lane, and a big plane is alone in its
 * own. The steps widen with the growth, but never past the ramp: the last plane of a lane keeps
 * its nose on the yard.
 */
export function apron(
  roles: ReadonlyArray<AirRole>,
  side: Side = 1,
  growth: Growth = 1,
): Array<Rest | null> {
  const lanes = AIRFIELD.lanes.map((x) => ({ x, used: 0, count: 0, big: false, cursor: TAIL_GAP }));
  const homes = roles.map((role) => {
    const length = troopMetres(role);
    const big = role !== 'fighter';
    const lane = lanes.find((each) =>
      big ? each.count === 0 : !each.big && each.used + length <= LANE_ROOM,
    );
    if (lane === undefined) return null;
    lane.used += length + PLANE_GAP;
    lane.count += 1;
    lane.big = big;
    return lane;
  });
  // The nose of the last plane of each lane, at true size: what the growth may not push past.
  const cap = Math.min(
    ...lanes
      .filter(({ count }) => count > 0)
      .map(({ used }) => YARD / (TAIL_GAP + used - PLANE_GAP)),
  );
  return roles.map((role, k) => {
    const lane = homes[k];
    if (lane === null || lane === undefined) return null;
    const length = troopMetres(role);
    const g = Math.min(growthOf(growth, k), cap);
    const z = AIRFIELD.facade + lane.cursor + (g * length) / 2;
    lane.cursor += g * (length + PLANE_GAP);
    return { x: side * lane.x, z, yaw: 0 };
  });
}

/**
 * **The berths**: the first hull against the mole's fenders, the second alongside it, bows level,
 * the third in the roads past the mole's head, off to sea; no more.
 */
export function berths(
  roles: ReadonlyArray<SeaRole>,
  side: Side = 1,
  growth: Growth = 1,
): Array<Rest | null> {
  // From the mole's face outward: what the hulls before have taken.
  let used = 0;
  return roles.map((role, k) => {
    if (k > 2) return null;
    const length = troopMetres(role);
    const beam = HULL_BEAM_SHARE * length;
    const g = growthOf(growth, k);
    const berth = berthOf(role, beam);
    const clear = MOLE.inner - berth.x - beam / 2;
    if (k === 0) used = g * clear;
    else if (k === 1) used += g * COUPLE_GAP;
    const x = k === 2 ? MOLE.inner - g * (clear + beam / 2) : MOLE.inner - (used + (g * beam) / 2);
    if (k < 2) used += g * beam;
    const z =
      k === 2
        ? MOLE.quay + g * (MOLE.length + MOLE.head + ROADS_GAP + length / 2)
        : MOLE.quay + g * (berth.z - MOLE.quay);
    return { x: side * x, z, yaw: side * berth.yaw };
  });
}
