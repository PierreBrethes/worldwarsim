import { troopMetres } from '@/domain/piece-size';
import { AIRFIELD, MOLE } from '@/emblems/kits/manifest';
import { type AirRole, TAIL_GAP } from './airfield';
import { berthOf, HULL_BEAM_SHARE, type SeaRole } from './port';

/**
 * **Where the pieces of a site rest** (#475, storyboards `aerodrome` « Plusieurs avions » and
 * `port` « À couple »): pure, in the site's metres — the airfield's yard, the port's mole —, one
 * slot per piece in the order given, `null` for one that does not fit (it is not drawn). `growth` is how much larger than true size each figurine is drawn up
 * close (`floorGrowth`), a number or one per piece: it widens the steps, never what fits.
 */
export type Rest = { readonly x: number; readonly z: number; readonly yaw: number };
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

/** **A place on the apron**: a lane (0 the right hangar's, 1 the left's) and a rank from the rail. */
export type Place = { readonly lane: 0 | 1; readonly rank: number };
export type Plane = { readonly role: AirRole; readonly place: Place | null };
/** **How a plane comes by its place**: out of its hangar, home from the runway, or the first free
 *  place in order (`apron`). */
export type Arrival = 'formed' | 'returned' | 'initial';

const FIGHTER = troopMetres('fighter');
/** A fighter's pitch, and how many a lane holds. */
const PITCH = FIGHTER + PLANE_GAP;
const RANKS = Math.floor((LANE_ROOM + PLANE_GAP) / PITCH);
const isBig = (role: AirRole) => role !== 'fighter';

/**
 * **The place a plane takes among those held** (décision du 05/11): never across a parked plane.
 * Formed, it drives out of its hangar to the most advanced free place before any plane of its
 * lane, else the neighbouring lane's; come home, it comes up its lane to the deepest free place
 * past the planes parked. With no history, the first free place in order (right lane first). A big
 * plane is alone in its lane. `null` when the apron is full.
 */
export function settle(held: ReadonlyArray<Plane>, role: AirRole, arrival: Arrival): Place | null {
  const planes = held.flatMap(({ place, role: kind }) => (place === null ? [] : [{ place, kind }]));
  const free: Array<Place & { before: boolean; past: boolean }> = [];
  for (const lane of [0, 1] as const) {
    const ranks = planes.filter(({ place }) => place.lane === lane).map(({ place }) => place.rank);
    const alone = planes.some(({ place, kind }) => place.lane === lane && isBig(kind));
    if (alone || (isBig(role) && ranks.length > 0)) continue;
    for (let rank = 0; rank < (isBig(role) ? 1 : RANKS); rank++)
      if (!ranks.includes(rank))
        free.push({
          lane,
          rank,
          before: ranks.every((taken) => taken > rank),
          past: ranks.every((taken) => taken < rank),
        });
  }
  const best = (reach: (place: (typeof free)[number]) => boolean, deepest: boolean) => {
    const pool = free.some(reach) ? free.filter(reach) : free;
    return pool.reduce<(typeof free)[number] | null>(
      (top, each) =>
        top === null || (deepest ? each.rank > top.rank : each.rank < top.rank) ? each : top,
      null,
    );
  };
  const found =
    arrival === 'initial'
      ? (free[0] ?? null)
      : arrival === 'formed'
        ? best(({ before }) => before, true)
        : best(({ past }) => past, false);
  return found === null ? null : { lane: found.lane, rank: found.rank };
}

/**
 * **The apron**: each plane where its place says, nose to the runway, its tail 2 m from the rail
 * for the first rank, a pitch of 13 m a rank. The steps widen with the growth (a number or one
 * per plane), but never past the ramp: a plane keeps its nose on the yard. A plane with no place
 * is `null`.
 */
export function layout(planes: ReadonlyArray<Plane>, growth: Growth = 1): Array<Rest | null> {
  return planes.map(({ role, place }, k) => {
    if (place === null) return null;
    const length = troopMetres(role);
    const depth = place.rank * PITCH;
    const g = Math.min(growthOf(growth, k), LANE_ROOM / (depth + length));
    return {
      x: AIRFIELD.lanes[place.lane],
      z: AIRFIELD.facade + TAIL_GAP + g * (depth + length / 2),
      yaw: 0,
    };
  });
}

/** **The apron with no history**: the places in the order of the roles (`settle`, `initial`). */
export function apron(roles: ReadonlyArray<AirRole>, growth: Growth = 1): Array<Rest | null> {
  const planes: Plane[] = [];
  for (const role of roles) planes.push({ role, place: settle(planes, role, 'initial') });
  return layout(planes, growth);
}

/** **A post along the mole**: against its fenders, at its side, or in the roads past its head. */
export type HullPost = 'mole' | 'couple' | 'roads';
const POSTS: ReadonlyArray<HullPost> = ['mole', 'couple', 'roads'];

/** **The post a hull takes** (décision du 05/11): the free one nearest the mole; `null` when the
 *  three are held. A hull that leaves frees its post and no other moves. */
export const settleHull = (held: ReadonlyArray<HullPost>): HullPost | null =>
  POSTS.find((post) => !held.includes(post)) ?? null;

/**
 * **The berths**: the hull at the mole against its fenders, the one at its side alongside it, bows
 * level, the third in the roads past the mole's head, off to sea. `posts` gives each hull its
 * post, by default in the order of the roles; a hull with none is not drawn.
 */
export function berths(
  roles: ReadonlyArray<SeaRole>,
  growth: Growth = 1,
  posts: ReadonlyArray<HullPost | null> = roles.map((_, k) => POSTS[k] ?? null),
): Array<Rest | null> {
  const sizes = roles.map((role, k) => {
    const length = troopMetres(role);
    const beam = HULL_BEAM_SHARE * length;
    return { length, beam, g: growthOf(growth, k), berth: berthOf(role, beam) };
  });
  // From the mole's face outward: what the hull at the mole takes.
  const moored = posts.indexOf('mole');
  const taken =
    moored < 0
      ? 0
      : sizes[moored]!.g * (MOLE.inner - sizes[moored]!.berth.x - sizes[moored]!.beam / 2) +
        sizes[moored]!.g * sizes[moored]!.beam;
  return roles.map((_, k) => {
    const post = posts[k];
    if (post === null || post === undefined) return null;
    const { length, beam, g, berth } = sizes[k]!;
    const clear = MOLE.inner - berth.x - beam / 2;
    const x =
      post === 'roads'
        ? MOLE.inner - g * (clear + beam / 2)
        : post === 'mole'
          ? MOLE.inner - (g * clear + (g * beam) / 2)
          : MOLE.inner - ((moored < 0 ? g * clear : taken) + g * COUPLE_GAP + (g * beam) / 2);
    const z =
      post === 'roads'
        ? MOLE.quay + g * (MOLE.length + MOLE.head + ROADS_GAP + length / 2)
        : MOLE.quay + g * (berth.z - MOLE.quay);
    return { x, z, yaw: berth.yaw };
  });
}
