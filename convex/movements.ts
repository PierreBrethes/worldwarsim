import { v } from 'convex/values';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { internalMutation, mutation, query } from './_generated/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { distanceKm, type LonLat } from '../src/domain/geo';
import { firstInterception, type MarchingForce } from '../src/domain/interception';
import {
  foundingRefusal,
  liftOf,
  refusalOf,
  routeModeOf,
  type Column,
  type MovementAim,
} from '../src/domain/movement-orders';
import { isNation } from '../src/domain/nations';
import { nearestOutpost } from '../src/domain/outposts';
import { windowExit } from '../src/domain/rest-window';
import type { ComputedRoute } from '../src/domain/routing';
import { buildingAt, playerBuildings } from './buildings';
import { resolveContact, troopsStationedAt } from './combat';
import {
  ARRIVAL_RADIUS_KM,
  INTERCEPTION_RADIUS_KM,
  MOVEMENTS_IN_FLIGHT,
  OUTPOST_DISABLED_HOURS,
  OUTPOST_IMMUNITY_HOURS,
  routeMinutes,
} from './constants';
import { fail } from './errors';
import { capitalRegionOf, homeCountryOf, nearestRegion, regionFacts } from './regions';
import { hostAtPoint, routeBetween } from './routes';
import { isAnchored } from './upkeep';
import { playerByToken, requirePlayable } from './seasons';
import {
  ATTACK_TARGET,
  CONTACT_FORCE,
  LON_LAT,
  MOVEMENT_ORIGIN,
  MOVEMENT_TYPE,
  SPECIALIZATION,
} from './validators';

/**
 * The second act of the game: **see the deposit, walk, plant the outpost, build on it** — and,
 * since the combat pass, **walk at somebody**. Three kinds of march are ordered: the foundation,
 * the attack and the raid. A fourth exists that nobody orders, the return: a column that has
 * fought, or broken contact, is put back on the road home by the resolution itself.
 *
 * **They leave from wherever the column stands** (ADR 0019 §1) — a projection building or the
 * outpost it garrisons. What that ground carries decides only the domain gates: a port to
 * embark, an airfield to take off, nothing at all to walk.
 *
 * Naval and air movement are not here, nor the agent, nor the decoy: they need routing in three
 * media and the fog, in that order.
 */
/**
 * **One founds where one stands.** It was a kind of march until ADR 0019 let a column stay on
 * the map: the player named the specialisation at departure, hours of walking from ground he
 * had not seen. Now the column is already there and looking at it — the terrain is under its
 * feet when the choice is made, which is a better game and cost nothing to get.
 *
 * The founding column **becomes the garrison** of its own point, exactly as the arrival of an
 * `outpost` movement used to leave it (`garnison-adresse.md`): one address, and it changes from
 * a coordinate to the outpost standing on it.
 */
export const foundOutpostHere = mutation({
  args: {
    token: v.string(),
    point: LON_LAT,
    specialization: SPECIALIZATION,
    troopIds: v.array(v.id('troops')),
  },
  handler: async (ctx, { token, point, specialization, troopIds }) => {
    const { player, season } = await playerByToken(ctx, token);
    requirePlayable(season);

    /** A column keeps its address while it walks (`troopIds` is the manifest, not a second
     *  attachment), so standing at the point is not enough: one that left it is on the road, and
     *  a point is planted by boots on the ground, never by an order sent after them. */
    const marching = new Set<Id<'troops'>>(
      (await movementsOf(ctx, player._id)).flatMap((movement) => movement.troopIds),
    );

    const troops: Array<Doc<'troops'>> = [];
    for (const troopId of troopIds) {
      const troop = await ctx.db.get(troopId);
      if (!troop || troop.playerId !== player._id) fail('UNKNOWN_TROOP', { troopId });
      if (!sameStation(troop.stationedAt, point) || marching.has(troopId)) {
        fail('TROOP_NOT_AT_ORIGIN', { troopId });
      }
      troops.push(troop);
    }

    /**
     * **Whose ground this is, read as everything else reads it**: the nearest region's, which
     * is the only containment the server has (`hostAtPoint`). A region carrying a building of
     * mine has nothing to gain from an outpost — that is `FRIENDLY_TARGET`, unchanged.
     */
    const here = nearestRegion(pointOf(point));
    const buildings = await playerBuildings(ctx, player._id);
    const refusal = foundingRefusal(
      troops.map((troop) => troop.role),
      here !== null && buildings.some((building) => building.regionId === here.id),
    );
    if (refusal !== null) fail(refusal, {});

    const outpostId = await ctx.db.insert('outposts', {
      playerId: player._id,
      point,
      hostCountry: hostAtPoint(pointOf(point)),
      level: 1,
      specialization,
      foundedAt: Date.now(),
      disabledUntil: null,
      immuneUntil: null,
    });
    for (const troop of troops) await ctx.db.patch(troop._id, { stationedAt: outpostId });
    return { outpostId };
  },
});

/**
 * **Go there, and stay** — the plainest order there is, and the one the game had no word for
 * until ADR 0019 §7. A slot like any other (ADR 0006), irreversible like any other, the same
 * domain gates as any other; what sets it apart is that it refuses no ground for allegiance —
 * one marches on one's own soil exactly as on somebody else's — and that it is the only order
 * whose column has an address at the end of it.
 *
 * **`marchTo`, not `march`**: `march` below is the corridor all three orders walk down, and the
 * name was taken years before the type existed. Renaming the corridor to free the word would
 * touch three call sites to gain nothing.
 */
export const marchTo = mutation({
  args: {
    token: v.string(),
    origin: MOVEMENT_ORIGIN,
    troopIds: v.array(v.id('troops')),
    point: LON_LAT,
  },
  handler: async (ctx, { token, origin, troopIds, point }) => {
    const { player, season } = await playerByToken(ctx, token);
    requirePlayable(season);

    return march(ctx, {
      playerId: player._id,
      type: 'march',
      origin,
      troopIds,
      aim: await aimOf(ctx, { kind: 'point', point }),
    });
  },
});

export const attack = mutation({
  args: {
    token: v.string(),
    origin: MOVEMENT_ORIGIN,
    troopIds: v.array(v.id('troops')),
    target: ATTACK_TARGET,
  },
  handler: async (ctx, { token, origin, troopIds, target }) => {
    const { player, season } = await playerByToken(ctx, token);
    requirePlayable(season);

    return march(ctx, {
      playerId: player._id,
      type: 'attack',
      origin,
      troopIds,
      aim: await aimOf(ctx, target),
    });
  },
});

/**
 * A raid marches at an outpost and nothing else: it does not come to hold ground, it comes to
 * put the point out of service for a while. Winning the engagement is what deactivates it — a
 * raid that fails to clear the garrison has walked for nothing.
 */
export const raid = mutation({
  args: {
    token: v.string(),
    origin: MOVEMENT_ORIGIN,
    troopIds: v.array(v.id('troops')),
    outpostId: v.id('outposts'),
  },
  handler: async (ctx, { token, origin, troopIds, outpostId }) => {
    const { player, season } = await playerByToken(ctx, token);
    requirePlayable(season);

    return march(ctx, {
      playerId: player._id,
      type: 'raid',
      origin,
      troopIds,
      aim: await aimOf(ctx, { kind: 'outpost', outpostId }),
    });
  },
});

/**
 * **What the player sees before he pays.** The route drawn under the aim is the one the march
 * will store — same grid, same weights, same pace (ADR 0012) — so the preview cannot promise a
 * Paris–Alger as short as a Paris–Berlin. It also answers the rest window: an arrival that bites
 * the target's window stalls at the border, and that is exactly the kind of thing one wants to
 * learn before the slot is spent, not after.
 *
 * It refuses nothing: the fan only ever offered legal types (`legalMovementTypes`), and a query
 * that failed would turn a hover into an error. An impassable target answers `null` and the card
 * says so.
 */
export const preview = query({
  args: {
    token: v.string(),
    origin: MOVEMENT_ORIGIN,
    troopIds: v.array(v.id('troops')),
    target: ATTACK_TARGET,
    type: MOVEMENT_TYPE,
  },
  handler: async (ctx, { token, origin, troopIds, target, type }) => {
    const { player } = await playerByToken(ctx, token);
    const departure = await departureOf(ctx, player._id, origin);
    if (departure === null) return null;

    /** The medium is read off the pile, exactly as the march will read it: a preview drawn on a
     *  road for a column that sails would promise a route nobody takes. */
    const troops = await troopsAmong(ctx, player._id, troopIds);
    const column = await columnOf(ctx, player._id, troops, departure);

    const { point, name, host } = await aimOf(ctx, target);
    const route = routeBetween(departure.point, point, routeModeOf(column.roles));
    if (route === null) return null;

    const now = Date.now();
    const minutes = routeMinutes(route.costUnits);
    const arrivesAt = now + minutes * 60_000;
    return {
      minutes,
      arrivesAt,
      /** Where the column would wait if it walked into a sleeping nation's window. */
      holdUntil: await restHold(ctx, player._id, host, arrivesAt),
      /** What the player knows about the ground he is pointing at — see `recognises`. */
      recognised: await recognises(ctx, player, point),
      troops: troopIds.length,
      type,
      destinationName: name,
      originName: departure.name,
      route: routeFacts(route),
    };
  },
});

/**
 * The arrival. A foundation plants its point and the column becomes its garrison; an attack or
 * a raid engages what stands there and turns around; a return hangs its troops back on what
 * they came from.
 *
 * **The rest window of design sheet 07 forbids arrivals, never departures**, and it forbids
 * them *at a player*: a column reaching the home country of somebody at rest waits at the
 * border until the window closes. Neutral ground has nobody to wake, so nothing waits.
 *
 * **A return never engages**, and that is a decision, not an omission. It can land on ground
 * that has turned against it while it walked — the outpost it rallied to razed, an enemy camp
 * pitched inside the arrival radius — and it still only hangs its troops back up. Survivors do
 * not open a pass of resolution: the rout was the end of that engagement, and a beaten column
 * that arrives fighting would be resolved twice for one defeat (ADR 0014, one pass per
 * engagement). It stands where it arrives, at its own risk — what walks past it afterwards will
 * find it, since a posted troop defends the ground it stands on like any other.
 */
export const arrive = internalMutation({
  args: { movementId: v.id('movements') },
  handler: async (ctx, { movementId }) => {
    const movement = await ctx.db.get(movementId);
    if (!movement) return;

    const now = Date.now();
    const held = await restHold(ctx, movement.playerId, movement.hostCountry, now);
    if (held !== null) {
      await ctx.db.patch(movementId, { arrivesAt: held });
      await ctx.scheduler.runAt(held, internal.movements.arrive, { movementId });
      return;
    }

    if (movement.type === 'attack' || movement.type === 'raid') {
      await engageAt(ctx, movement, now);
    } else if (movement.type === 'march') await standAt(ctx, movement, now);
    else if (movement.type === 'recall') await recallAt(ctx, movement);
    else await attachHome(ctx, movement);

    await ctx.db.delete(movementId);
  },
});

/**
 * **The interceptor takes the initiative** (ADR 0008): the force that was already there strikes
 * first, and that is the whole point of the counter-power — a defender who reads the map right
 * is not condemned to receive the first blow at home.
 *
 * The date and the place were settled when the column left (`src/domain/interception.ts`).
 * Everything can have changed since: the interceptor may have marched off, the column may have
 * been destroyed elsewhere. Both are ordinary, and both mean nothing happens.
 */
export const intercept = internalMutation({
  args: {
    movementId: v.id('movements'),
    by: CONTACT_FORCE,
    point: LON_LAT,
  },
  handler: async (ctx, { movementId, by, point }) => {
    const movement = await ctx.db.get(movementId);
    if (!movement) return;
    const owner = await ctx.db.get(movement.playerId);
    if (!owner) return;

    const interceptor = await forceOf(ctx, by);
    if (interceptor === null || interceptor.troops.length === 0) return;
    if (interceptor.playerId === movement.playerId) return;

    const marching = await troopsCarriedBy(ctx, movement);
    if (marching.length === 0) return;

    const now = Date.now();
    const { engagement, routed } = await resolveContact(ctx, {
      seasonId: owner.seasonId,
      attacker: { playerId: interceptor.playerId, troops: interceptor.troops },
      defender: { playerId: movement.playerId, troops: marching },
      cause: 'interception',
      point,
      hostCountry: movement.hostCountry,
      outpostId: null,
      disabledUntil: null,
      at: now,
    });

    const left = new Set(
      engagement.outcomes
        .filter((outcome) => outcome.side === 'defender' && outcome.state === 'standing')
        .map((outcome) => outcome.id),
    );
    /**
     * **What survives the ambush keeps walking.** Breaking off the whole march would make one
     * cheap contact worth an entire order — the column that still stands has somewhere to be.
     */
    const carriedOn = movement.troopIds.filter((troopId) => left.has(troopId));
    if (carriedOn.length === 0) await ctx.db.delete(movement._id);
    else await ctx.db.patch(movement._id, { troopIds: carriedOn });

    if (interceptor.movementId !== null) {
      const carrier = await ctx.db.get(interceptor.movementId);
      if (carrier) {
        const kept = carrier.troopIds.filter(
          (troopId) => !routed.some((troop) => troop._id === troopId),
        );
        if (kept.length === 0) await ctx.db.delete(carrier._id);
        else await ctx.db.patch(carrier._id, { troopIds: kept });
      }
    }
    /** The two roads home, and they never cross: `sendHome` walks whoever hangs from a building
     *  back to it, `refluxHome` takes whoever hangs from a point — the camp that reached out and
     *  broke, the column that marched out of one — to its nearest anchor (ADR 0019 §3). */
    await sendHome(ctx, routed, pointOf(point), now);
    await refluxHome(ctx, routed, pointOf(point), now);
  },
});

export async function movementsOf(
  ctx: QueryCtx,
  playerId: Id<'players'>,
): Promise<Array<Doc<'movements'>>> {
  return ctx.db
    .query('movements')
    .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
    .collect();
}

export async function outpostsOf(
  ctx: QueryCtx,
  playerId: Id<'players'>,
): Promise<Array<Doc<'outposts'>>> {
  return ctx.db
    .query('outposts')
    .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
    .collect();
}

/** The stored `{ lon, lat }` back as the tuple the domain measures distances with. */
export const pointOf = (point: { lon: number; lat: number }): LonLat => [point.lon, point.lat];

const asPoint = (lonLat: LonLat) => ({ lon: lonLat[0], lat: lonLat[1] });

/**
 * A target resolved to a place. The **legality** of marching there is not decided here: it is
 * `refusalOf` in `src/domain/movement-orders.ts`, the very function the compass rose filters its
 * fan with — one rule, so a fan can never offer what a mutation then turns down (ADR 0015).
 */
type Aimed = {
  readonly aim: MovementAim;
  /** The same target in the shape the table stores, brand and all — `MovementAim` is domain
   *  data and knows nothing of Convex ids. */
  readonly target: Doc<'movements'>['target'];
  readonly point: LonLat;
  readonly name: string;
  /**
   * The country the destination stands in. It travels with the target rather than being read
   * back off the aim, because a **point** does not carry it: only the geometry knows, and the
   * geometry is consulted once, here. The open sea alone answers `''` — a country nobody plays
   * is still a host, and is named as one.
   */
  readonly host: string;
};

async function aimOf(
  ctx: QueryCtx,
  target: Doc<'movements'>['target'] & { kind: 'region' | 'outpost' | 'point' },
): Promise<Aimed> {
  /**
   * **A point is kept as it was aimed.** Nothing looks up what stands there — that is the fog's
   * business and the arrival's (ADR 0019 §1). The only thing read off it is the country it falls
   * in, because a rest window is owed to whoever owns the ground, not to the ground itself; only
   * the open sea owes none, and it alone answers the empty string that every reader treats as
   * "no name" for a movement that left no building behind.
   */
  if (target.kind === 'point') {
    const point = pointOf(target.point);
    const country = hostAtPoint(point);
    return {
      aim: { kind: 'point', lon: point[0], lat: point[1] },
      target: { kind: 'point', point: target.point },
      point,
      name: country,
      host: country,
    };
  }
  if (target.kind === 'outpost') {
    const outpost = await ctx.db.get(target.outpostId);
    if (!outpost) fail('UNKNOWN_OUTPOST', { outpostId: target.outpostId });
    return {
      aim: { kind: 'outpost', outpostId: outpost._id, hostCountry: outpost.hostCountry },
      target: { kind: 'outpost', outpostId: outpost._id },
      point: pointOf(outpost.point),
      name: outpost.hostCountry,
      host: outpost.hostCountry,
    };
  }
  const region = regionFacts(target.regionId);
  if (!region) fail('UNKNOWN_REGION', { regionId: target.regionId });
  return {
    aim: { kind: 'region', regionId: region.id, country: region.country },
    target: { kind: 'region', regionId: region.id },
    point: region.point,
    name: region.name,
    host: region.country,
  };
}

/** What the map needs to draw the thread, straight off the route the server just computed. */
const routeFacts = (route: ComputedRoute) => ({
  mode: route.mode,
  points: route.points.map(asPoint),
  distanceUnits: route.distanceUnits,
  costUnits: route.costUnits,
  legs: route.legs.map((leg) => ({ medium: leg.medium, distanceUnits: leg.distanceUnits })),
});

/**
 * The column as the shared rule reads it: what it carries, and what its owner already holds.
 * Built from documents here, from `PlayerView` on the client — the shape is the seam.
 */
/** The troops of an order, silently skipping what does not answer — a preview reads them to know
 *  which medium to draw in, and a hover is not the place to raise an error. */
async function troopsAmong(
  ctx: QueryCtx,
  playerId: Id<'players'>,
  troopIds: ReadonlyArray<Id<'troops'>>,
): Promise<Array<Doc<'troops'>>> {
  const troops: Array<Doc<'troops'>> = [];
  for (const troopId of troopIds) {
    const troop = await ctx.db.get(troopId);
    if (troop && troop.playerId === playerId) troops.push(troop);
  }
  return troops;
}

async function columnOf(
  ctx: QueryCtx,
  playerId: Id<'players'>,
  troops: ReadonlyArray<Doc<'troops'>>,
  departure: Departure,
): Promise<Column> {
  const buildings = await ctx.db
    .query('buildings')
    .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
    .collect();
  return {
    roles: troops.map((troop) => troop.role),
    myRegionIds: new Set(buildings.map((building) => building.regionId)),
    myOutpostIds: new Set((await outpostsOf(ctx, playerId)).map((outpost) => String(outpost._id))),
    departureBuildings: new Set(
      buildings
        .filter((building) => building.regionId === departure.regionId)
        .map((building) => building.key),
    ),
  };
}

/** Where a march leaves from — a building, the outpost a column garrisons, or the plain point
 *  it was left standing on (ADR 0019 §1). Exactly one of the three, never two, never none. */
type MarchOrigin =
  | { readonly kind: 'building'; readonly buildingId: Id<'buildings'> }
  | { readonly kind: 'outpost'; readonly outpostId: Id<'outposts'> }
  | { readonly kind: 'point'; readonly point: { readonly lon: number; readonly lat: number } };

/** A troop's address as the row stores it. Named here because three functions compare it and
 *  one of its three forms is not an id. */
type TroopAddress = Doc<'troops'>['stationedAt'];

/**
 * **Two addresses are the same when they name the same place**: an id by identity, a point by
 * its coordinates. The point is compared as it was written — nothing rounds, because nothing
 * ever writes a second point *near* the first one: an address is copied, never re-measured.
 */
const sameStation = (a: TroopAddress, b: TroopAddress): boolean => {
  if (a === null || b === null) return a === b;
  if (typeof a === 'string' || typeof b === 'string') return a === b;
  return a.lon === b.lon && a.lat === b.lat;
};

/**
 * The origin resolved to a place. `regionId` is `null` for an outpost, and that null is the rule
 * rather than a hole: an outpost is a point, it carries no region and therefore no port and no
 * airfield — a garrison walks, it does not embark (ADR 0019 §2).
 */
type Departure = {
  readonly point: LonLat;
  readonly name: string;
  readonly regionId: string | null;
  /** The address the troops must already be standing at to be ordered out of it. */
  readonly stationId: TroopAddress;
  /** What a return walks back to — an outpost keeps its garrison on the spot and needs none. */
  readonly fromBuildingId: Id<'buildings'> | null;
};

async function departureOf(
  ctx: QueryCtx,
  playerId: Id<'players'>,
  origin: MarchOrigin,
): Promise<Departure | null> {
  if (origin.kind === 'outpost') {
    const outpost = await ctx.db.get(origin.outpostId);
    if (!outpost || outpost.playerId !== playerId) return null;
    return {
      point: pointOf(outpost.point),
      /** A code, never a phrase (ADR 0016): the same `hostCountry` a stored movement falls back
       *  to when it left no building behind (`view.ts`). */
      name: outpost.hostCountry,
      regionId: null,
      stationId: outpost._id,
      fromBuildingId: null,
    };
  }
  if (origin.kind === 'point') {
    /**
     * **A place is not a thing, so there is nothing to own here.** No document answers for it;
     * what makes the order legitimate is that the player's own troops are standing at exactly
     * this coordinate, which `march` checks address by address. The ground carries no building,
     * therefore no gate: a column left on the map walks (ADR 0019 §2).
     */
    const point = pointOf(origin.point);
    return {
      point,
      name: hostAtPoint(point),
      regionId: null,
      stationId: origin.point,
      fromBuildingId: null,
    };
  }
  const building = await ctx.db.get(origin.buildingId);
  if (!building || building.playerId !== playerId) return null;
  const region = regionFacts(building.regionId);
  if (!region) return null;
  return {
    point: region.point,
    name: region.name,
    regionId: building.regionId,
    stationId: building._id,
    fromBuildingId: building._id,
  };
}

async function march(
  ctx: MutationCtx,
  {
    playerId,
    type,
    origin,
    troopIds,
    aim,
  }: {
    playerId: Id<'players'>;
    type: 'march' | 'attack' | 'raid' | 'recall';
    origin: MarchOrigin;
    troopIds: ReadonlyArray<Id<'troops'>>;
    aim: Aimed;
  },
) {
  /**
   * Standing in for the movement slots of ADR 0006, which have no building left to hang from
   * since the economy v2 dissolved the logistics centre. One column at a time bounds the
   * fan-out and prejudges nothing: when the slots land, this constant goes and the rule they
   * bring takes its place.
   *
   * **A return does not count against it**: it is not an order, and holding a player's only
   * slot hostage while his beaten column walks back would punish him twice for one defeat. A
   * recall is not a return — it is the one order a garrison gets — so it counts like any other.
   */
  const flying = (await movementsOf(ctx, playerId)).filter(
    (movement) => movement.type !== 'return',
  );
  if (flying.length >= MOVEMENTS_IN_FLIGHT) {
    fail('MOVEMENT_IN_FLIGHT', { maximum: MOVEMENTS_IN_FLIGHT });
  }

  /**
   * **Where the column stands, and nothing more.** It no longer decides what may be asked for
   * (ADR 0019 §1) — it only has to be the address the troops actually hang from, so that a
   * garrison abroad is not ordered out of a barracks it is not in.
   */
  const departure = await departureOf(ctx, playerId, origin);
  if (departure === null) {
    if (origin.kind === 'outpost') fail('UNKNOWN_OUTPOST', { outpostId: origin.outpostId });
    fail('UNKNOWN_BUILDING');
  }

  const troops: Array<Doc<'troops'>> = [];
  for (const troopId of troopIds) {
    const troop = await ctx.db.get(troopId);
    if (!troop || troop.playerId !== playerId) fail('UNKNOWN_TROOP', { troopId });
    if (!sameStation(troop.stationedAt, departure.stationId)) {
      fail('TROOP_NOT_AT_ORIGIN', { troopId });
    }
    troops.push(troop);
  }

  /**
   * **The refusal comes before the route**, and can again: nothing in it reads a trip any more —
   * a pile that crosses is a pile carrying a transport, which the composition says on its own
   * (design sheet 09). So an order the fan should never have offered costs nothing, and the fan
   * itself can be exact, which is the whole of ADR 0015.
   */
  const column = await columnOf(ctx, playerId, troops, departure);
  const refusal = refusalOf(type, aim.aim, column);
  if (refusal !== null) fail(refusal, { type, ...liftOf(column.roles) });

  const route = routeBetween(departure.point, aim.point, routeModeOf(column.roles));
  if (route === null) fail('NO_LAND_ROUTE', { from: departure.name, to: aim.name });

  const now = Date.now();
  const minutes = routeMinutes(route.costUnits);
  const arrivesAt = now + minutes * 60_000;
  const movementId = await ctx.db.insert('movements', {
    playerId,
    type,
    fromBuildingId: departure.fromBuildingId,
    target: aim.target,
    from: asPoint(departure.point),
    to: asPoint(aim.point),
    hostCountry: aim.host,
    points: route.points.map(asPoint),
    legs: route.legs.map((leg) => ({ medium: leg.medium, distanceUnits: leg.distanceUnits })),
    distanceUnits: route.distanceUnits,
    costUnits: route.costUnits,
    troopIds: [...troopIds],
    departedAt: now,
    arrivesAt,
  });
  await ctx.scheduler.runAt(arrivesAt, internal.movements.arrive, { movementId });
  /** The document rather than its parts: the sweep has to read the order exactly as the arrival
   *  will read it, and the surest way to say that is to hand it the same row. */
  await scheduleInterception(ctx, (await ctx.db.get(movementId))!);
  return { movementId, minutes, arrivesAt };
}

/**
 * Who a contact is with, as the scheduled pass reads it back. `CONTACT_FORCE` is the same union
 * in the shape Convex checks at run time; this is the one TypeScript reads.
 */
type ContactForce =
  | { readonly kind: 'outpost'; readonly outpostId: Id<'outposts'> }
  | { readonly kind: 'movement'; readonly movementId: Id<'movements'> }
  | {
      readonly kind: 'posted';
      readonly playerId: Id<'players'>;
      readonly point: { readonly lon: number; readonly lat: number };
    };

/**
 * The contact is looked for **once, at departure**, against everything already on the board: an
 * outpost with a garrison stands still, a column in flight moves, and both carry the same
 * radius. It is the newcomer that looks — nothing already marching is re-examined, which is
 * what keeps a departure from costing a sweep of every pair on the map.
 */
async function scheduleInterception(ctx: MutationCtx, movement: Doc<'movements'>): Promise<void> {
  const movementId = movement._id;
  const { playerId, departedAt, arrivesAt } = movement;
  const points = movement.points.map(pointOf);

  /**
   * **One pass per engagement (ADR 0014), and the arrival answers for exactly what it will
   * resolve — no more.** The set is `defenceOf`'s own answer, asked here at departure: the same
   * function the arrival will ask hours later, never a second reading of "who stands here" to
   * drift from it. That is the whole point — the rule this replaces was a blind radius around
   * the aim, and it cost the garrison of a neighbouring outpost its entire net for a raid it
   * would never have been part of.
   *
   * So: a march on a point silences whatever holds ground within `ARRIVAL_RADIUS_KM` of it; a
   * raid silences the garrison it is walking at, and it alone — the old `except`, now a case of
   * the rule rather than a second exclusion; a march on a region silences nothing, because what
   * answers there hangs from buildings and buildings are not swept.
   *
   * **The long interception is untouched everywhere else** (ADR 0019 §3): the net cast across a
   * road does not move, only the double at its far end goes.
   */
  const answered = new Set<Id<'troops'>>(
    (await defenceOf(ctx, movement))?.troops.map((troop) => troop._id) ?? [],
  );
  const willBeMet = (troopIds: ReadonlyArray<Id<'troops'>>): boolean =>
    troopIds.some((troopId) => answered.has(troopId));

  const sources = new Map<string, ContactForce>();
  const standing: Array<{ id: string; point: LonLat }> = [];
  for (const outpost of await ctx.db.query('outposts').collect()) {
    if (outpost.playerId === playerId) continue;
    const garrison = await troopsStationedAt(ctx, outpost._id);
    if (garrison.length === 0) continue;
    if (willBeMet(garrison.map((troop) => troop._id))) continue;
    const id = `outpost:${outpost._id}`;
    sources.set(id, { kind: 'outpost', outpostId: outpost._id });
    standing.push({ id, point: pointOf(outpost.point) });
  }

  const marching: Array<MarchingForce> = (await ctx.db.query('movements').collect())
    .filter((other) => other.playerId !== playerId && other._id !== movementId)
    .map((other) => {
      const id = `movement:${other._id}`;
      sources.set(id, { kind: 'movement', movementId: other._id });
      return {
        id,
        points: other.points.map(pointOf),
        departedAt: other.departedAt,
        arrivesAt: other.arrivesAt,
      };
    });

  const mine = { id: `movement:${movementId}`, points, departedAt, arrivesAt };
  const intercepted = firstInterception({
    mine,
    standing,
    marching,
    radiusKm: INTERCEPTION_RADIUS_KM,
  });

  /**
   * **Two contacts of different natures, and they must not be read as one another.**
   *
   * — An **interception** is a net cast across a road, at `INTERCEPTION_RADIUS_KM` (200 km). It
   *   is a fact *between movements* (ADR 0018 §3): a force reaches out to catch what passes.
   * — A **crossing** is a march walking into a camp, at `ARRIVAL_RADIUS_KM` (25 km). Nobody
   *   reaches for anything: a posted force never orders anything, it only defends the ground it
   *   stands on (ADR 0019 §3). Two hundred kilometres would make three pawns a continental
   *   blockade; twenty-five on a world map is a needle, and a needle is what a meeting is.
   */
  const posted = (await postedForces(ctx, playerId)).filter((camp) => !willBeMet(camp.troopIds));
  for (const camp of posted) sources.set(camp.id, camp.force);
  const crossed = firstInterception({
    mine,
    standing: posted,
    marching: [],
    radiusKm: ARRIVAL_RADIUS_KM,
  });

  /** The first on the road answers, and it alone: an engagement changes the column that comes
   *  out of it, so what it would have met later has to be met by what is left of it. */
  const contact = [intercepted, crossed]
    .filter((candidate) => candidate !== null)
    .sort((a, b) => a.at - b.at)[0];
  if (contact === undefined) return;

  await ctx.scheduler.runAt(contact.at, internal.movements.intercept, {
    /** The identifier only ever travelled inside this function: `firstInterception` hands back
     *  one of the ones it was given, and every one of them was filed above. */
    by: sources.get(contact.withId)!,
    movementId,
    point: asPoint(contact.point),
  });
}

/**
 * **The camps, as a departing column sees them**: troops standing on plain ground, grouped by
 * owner and place, everybody's but the player's own. A troop keeps its address while it walks
 * (`troopIds` is a manifest, not a second attachment), so the manifests are what tell a camp
 * from a column that has already left it.
 *
 * A camp is not a document, so it has no id: what it is filed under is its owner and its point,
 * and that pair travels to the resolution whole. The `id` here never leaves this pass — it
 * groups the troops of one camp and breaks a tie between two, and nothing reads it back.
 */
async function postedForces(
  ctx: MutationCtx,
  playerId: Id<'players'>,
): Promise<
  Array<{ id: string; point: LonLat; force: ContactForce; troopIds: ReadonlyArray<Id<'troops'>> }>
> {
  const marching = new Set<Id<'troops'>>(
    (await ctx.db.query('movements').collect()).flatMap((movement) => movement.troopIds),
  );
  const camps = new Map<
    string,
    { point: LonLat; force: ContactForce; troopIds: Array<Id<'troops'>> }
  >();
  for (const troop of await ctx.db.query('troops').collect()) {
    const address = troop.stationedAt;
    if (troop.playerId === playerId || marching.has(troop._id)) continue;
    if (address === null || typeof address === 'string') continue;
    const key = `posted:${troop.playerId}@${address.lon},${address.lat}`;
    const camp = camps.get(key) ?? {
      point: pointOf(address),
      force: { kind: 'posted' as const, playerId: troop.playerId, point: address },
      troopIds: [],
    };
    camp.troopIds.push(troop._id);
    camps.set(key, camp);
  }
  return [...camps].map(([id, camp]) => ({ id, ...camp }));
}

/**
 * **A column that finds nobody has not fought.** Buildings are not looted yet (that is the next
 * step), so an attack that arrives on empty ground turns around — no engagement, no account, and
 * nothing to show for the walk. It is the honest reading of "the fog made me march for nothing".
 */
async function engageAt(ctx: MutationCtx, movement: Doc<'movements'>, now: number): Promise<void> {
  const owner = await ctx.db.get(movement.playerId);
  const marching = await troopsCarriedBy(ctx, movement);
  if (!owner || marching.length === 0) return;

  const outpost =
    movement.target.kind === 'outpost' ? await ctx.db.get(movement.target.outpostId) : null;
  const defence = await defenceOf(ctx, movement);
  if (defence === null) {
    /** **An outpost nobody garrisons falls to whoever walks up to it.** There is no engagement
     *  to file — a raid without an adversary is not a battle — but the point still goes out of
     *  service, which is the only thing the raid came for. */
    if (movement.type === 'raid' && outpost !== null) await deactivate(ctx, outpost, now, null);
    await sendHome(ctx, marching, pointOf(movement.to), now);
    return;
  }

  const { engagementId, engagement, routed } = await resolveContact(ctx, {
    seasonId: owner.seasonId,
    attacker: { playerId: movement.playerId, troops: marching },
    defender: { playerId: defence.playerId, troops: defence.troops },
    cause: 'arrival',
    point: movement.to,
    hostCountry: movement.hostCountry,
    outpostId: defence.outpostId,
    disabledUntil: null,
    at: now,
  });

  if (movement.type === 'raid' && outpost !== null && engagement.winner === 'attacker') {
    await deactivate(ctx, outpost, now, engagementId);
  }

  /**
   * Whoever is still on his feet walks back, routed or not: the column came to fight, not to
   * stay. On the other side, a routed **garrison** is already at its attachment and a routed
   * building defender stands in its own region — only what hung from a point has lost the very
   * ground it stood on, and it refluxes to its nearest anchor (ADR 0019 §3), whichever side of
   * the pass it was on.
   */
  const survivors = marching.filter((troop) =>
    engagement.outcomes.some(
      (outcome) => outcome.id === troop._id && outcome.state !== 'destroyed',
    ),
  );
  await sendHome(ctx, survivors, pointOf(movement.to), now);
  await refluxHome(ctx, routed, pointOf(movement.to), now);
}

/**
 * **The end of a march: the column stops walking and stands there** (ADR 0019 §3). Nothing
 * waiting, nothing to resolve — the address becomes the point, and that is the whole order.
 *
 * When something *is* waiting, the pass belongs to whoever was already on the ground:
 * `resolveContact` is handed the standing force as the **attacker**, and that is what initiative
 * means here. An attack buys its initiative by declaring itself (ADR 0014); a march declares
 * nothing, so it takes the first blow — it holds the terrain, the arrival is surprised.
 *
 * What is still on its feet stays where it walked to: the column came to stay, and losing a
 * pass it did not seek does not send it home. Only what broke contact walks back.
 */
async function standAt(ctx: MutationCtx, movement: Doc<'movements'>, now: number): Promise<void> {
  const owner = await ctx.db.get(movement.playerId);
  const marching = await troopsCarriedBy(ctx, movement);
  if (!owner || marching.length === 0) return;

  const defence = await defenceOf(ctx, movement);
  if (defence === null) {
    for (const troop of marching) await ctx.db.patch(troop._id, { stationedAt: movement.to });
    return;
  }

  const { engagement, routed } = await resolveContact(ctx, {
    seasonId: owner.seasonId,
    attacker: { playerId: defence.playerId, troops: defence.troops },
    defender: { playerId: movement.playerId, troops: marching },
    cause: 'arrival',
    point: movement.to,
    hostCountry: movement.hostCountry,
    outpostId: defence.outpostId,
    disabledUntil: null,
    at: now,
  });

  const stateOf = (troopId: string) =>
    engagement.outcomes.find((outcome) => outcome.id === troopId)?.state ?? null;
  for (const troop of marching) {
    if (stateOf(troop._id) === 'standing')
      await ctx.db.patch(troop._id, { stationedAt: movement.to });
  }
  await sendHome(
    ctx,
    marching.filter((troop) => stateOf(troop._id) === 'routed'),
    pointOf(movement.to),
    now,
  );
  /** **The winner stands, the loser leaves** — including when the loser is the camp that held
   *  the ground and lost it (ADR 0019 §3). */
  await refluxHome(ctx, routed, pointOf(movement.to), now);
}

/**
 * **Deactivated, never taken** (ADR 0004). The immunity window that follows is what stops a
 * relay of cheap raids from holding a point out of service for good — and destruction after
 * several raids waits for looting, so nothing here counts them.
 */
async function deactivate(
  ctx: MutationCtx,
  outpost: Doc<'outposts'>,
  now: number,
  engagementId: Id<'engagements'> | null,
): Promise<void> {
  if (outpost.immuneUntil !== null && outpost.immuneUntil > now) return;

  const disabledUntil = now + OUTPOST_DISABLED_HOURS * 3_600_000;
  await ctx.db.patch(outpost._id, {
    disabledUntil,
    immuneUntil: disabledUntil + OUTPOST_IMMUNITY_HOURS * 3_600_000,
  });
  if (engagementId !== null) await ctx.db.patch(engagementId, { disabledUntil });
}

/**
 * Where a returning column re-hangs itself. A building razed while its troops were away leaves
 * them **standing where they arrived** rather than hanging from nothing: they come home, they
 * do not die (rule 3 of the project), and since ADR 0019 §1 the map is an address — the ground
 * they walked to is the one place the game can honestly say they are.
 */
async function attachHome(ctx: MutationCtx, movement: Doc<'movements'>): Promise<void> {
  const home = await homeOf(ctx, movement);
  for (const troopId of movement.troopIds) {
    const troop = await ctx.db.get(troopId);
    if (troop) await ctx.db.patch(troopId, { stationedAt: home });
  }
}

async function homeOf(ctx: MutationCtx, movement: Doc<'movements'>): Promise<TroopAddress> {
  if (movement.fromBuildingId !== null) {
    const station = await ctx.db.get(movement.fromBuildingId);
    return station?._id ?? movement.to;
  }
  /**
   * A rout that refluxed to one of its own outposts (ADR 0019 §3) **becomes its garrison**: the
   * address is the outpost, exactly as a founding column's is. Razed while the return walked —
   * the anchor is read once, at the rout, and never again — the column stands on the ground it
   * reached rather than on nothing.
   */
  if (movement.target.kind === 'outpost') {
    const outpost = await ctx.db.get(movement.target.outpostId);
    return outpost?._id ?? movement.to;
  }
  /**
   * A return that left **no building behind** and rallied to no point of its own came back to
   * national soil hanging from nothing that stands — which is what a `null` address means,
   * written once in the schema and not reinvented here.
   */
  return null;
}

/**
 * Where a recalled garrison re-hangs itself. `fromBuildingId` carries no address here — the
 * column left an outpost, not a building (question 21, 18/08) — so the barracks is looked up
 * fresh, in the region the order aimed at. Razed or lost since departure, the troops still come
 * home rather than die for it: the same rule `attachHome` reads for an ordinary return.
 */
async function recallAt(ctx: MutationCtx, movement: Doc<'movements'>): Promise<void> {
  const buildings =
    movement.target.kind === 'region' ? await playerBuildings(ctx, movement.playerId) : [];
  const barracks =
    movement.target.kind === 'region'
      ? buildingAt(buildings, 'barracks', movement.target.regionId)
      : undefined;
  for (const troopId of movement.troopIds) {
    const troop = await ctx.db.get(troopId);
    if (troop) await ctx.db.patch(troopId, { stationedAt: barracks ? barracks._id : movement.to });
  }
}

/**
 * The march back, created by the resolution and **outside the slots**: it is not an order, it is
 * what is left of one. Each troop walks to what it hangs from — the attachment it left with,
 * which a movement never took from it. A troop hanging from an **outpost** needs no march at
 * all: it is standing on its attachment already.
 *
 * A troop hanging from a **point** hangs from nothing anybody holds; it is not sent home here
 * but by `refluxHome`, and only when it was routed. The two are called side by side and read
 * disjoint forms of the address, so nothing is ever put on two roads at once.
 */
async function sendHome(
  ctx: MutationCtx,
  troops: ReadonlyArray<Doc<'troops'>>,
  from: LonLat,
  now: number,
): Promise<void> {
  const byBuilding = new Map<Id<'buildings'>, Array<Doc<'troops'>>>();
  for (const troop of troops) {
    const address = troop.stationedAt;
    const buildingId =
      typeof address === 'string' ? ctx.db.normalizeId('buildings', address) : null;
    if (buildingId === null) continue;
    byBuilding.set(buildingId, [...(byBuilding.get(buildingId) ?? []), troop]);
  }

  for (const [buildingId, group] of byBuilding) {
    const building = await ctx.db.get(buildingId);
    const origin = building === null ? null : regionFacts(building.regionId);
    /** Nothing to walk back to: the column stays on the ground it fought on, which is an
     *  address now (ADR 0019 §1) and no longer a hole in the model. */
    if (building === null || origin === null) {
      for (const troop of group) await ctx.db.patch(troop._id, { stationedAt: asPoint(from) });
      continue;
    }

    /** A column coming home from overseas has a sea to recross; `'land'` here would find no
     *  route at all and leave it hanging from a building it never reaches (rule 3). A return is
     *  not an order, so it owes no port — nobody asked for it. */
    const route = routeBetween(from, origin.point, routeModeOf(group.map((troop) => troop.role)));
    /** No road home — a landing whose transports sank, and nothing else. The column stays where
     *  it stands rather than being hung back on a barracks it never reached. */
    if (route === null) {
      for (const troop of group) await ctx.db.patch(troop._id, { stationedAt: asPoint(from) });
      continue;
    }

    const arrivesAt = now + routeMinutes(route.costUnits) * 60_000;
    const movementId = await ctx.db.insert('movements', {
      playerId: group[0]!.playerId,
      type: 'return',
      fromBuildingId: building._id,
      target: { kind: 'home' },
      from: asPoint(from),
      to: asPoint(origin.point),
      hostCountry: origin.country,
      points: route.points.map(asPoint),
      legs: route.legs.map((leg) => ({ medium: leg.medium, distanceUnits: leg.distanceUnits })),
      distanceUnits: route.distanceUnits,
      costUnits: route.costUnits,
      troopIds: group.map((troop) => troop._id),
      departedAt: now,
      arrivesAt,
    });
    await ctx.scheduler.runAt(arrivesAt, internal.movements.arrive, { movementId });
  }
}

/**
 * **Where a rout refluxes** (ADR 0019 §3, amended 19/08): to the nearest of the anchors the
 * player already holds — his capital, or one of his own outposts. It is the same set that puts
 * the upkeep at ×1 and that the aim calls recognised ground; three readers, one notion of home
 * ground, and no frontier invented here. The capital is the single home coordinate the game
 * writes (ADR 0015), so it stands for the national soil.
 *
 * **A deactivated outpost rallies all the same.** It already hosts its own garrison while out of
 * service — a raid deactivates, it never takes (ADR 0004) — so refusing the rally would invent a
 * third state for it. What deactivation suspends is its effects, never its address.
 *
 * **An ally's outpost is not an anchor**: same decision as the supply, same reason — no
 * diplomatic currency before the diplomacy.
 */
async function nearestAnchor(
  ctx: MutationCtx,
  playerId: Id<'players'>,
  from: LonLat,
): Promise<{ point: LonLat; hostCountry: string; outpostId: Id<'outposts'> | null } | null> {
  const owner = await ctx.db.get(playerId);
  const capital =
    owner && isNation(owner.nation) ? regionFacts(capitalRegionOf(owner.nation)) : null;
  const home =
    capital === null
      ? null
      : { point: capital.point, hostCountry: capital.country, outpostId: null };

  const outposts = (await outpostsOf(ctx, playerId)).map((outpost) => ({
    point: pointOf(outpost.point),
    outpost,
  }));
  const found = nearestOutpost(from, outposts);
  if (found === null) return home;
  if (home !== null && distanceKm(home.point, from) <= found.km) return home;
  return {
    point: found.nearest.point,
    hostCountry: found.nearest.outpost.hostCountry,
    outpostId: found.nearest.outpost._id,
  };
}

/**
 * **A force that loses the ground it hung from refluxes to its nearest anchor** (ADR 0019 §3).
 * A garrison stands on its own attachment and a column hangs from a barracks, so both are
 * already home when they break contact; a troop whose address is a **point** has nothing left —
 * the camp it stood on, or the camp it marched out of, is ground nobody holds. Left standing it
 * would sit ten kilometres from the force that beat it for the rest of the season, the exact
 * opposite of the ground cleared (ADR 0018 §1).
 *
 * It walks by the same `return` every rout gets: created by the resolution, never ordered, no
 * slot, no domain gate — nobody asked for it, so it pays for nothing. And it **walks**: the
 * column that left a camp used to be ignored here and reappear at its point of departure, which
 * was a teleport. Travel time is real for the beaten too.
 *
 * The anchor is read **once, here**, at the rout. One founded or razed while the return flies
 * does not move its destination — the same rule as the interception, for the same reason.
 */
async function refluxHome(
  ctx: MutationCtx,
  troops: ReadonlyArray<Doc<'troops'>>,
  from: LonLat,
  now: number,
): Promise<void> {
  const byPlayer = new Map<Id<'players'>, Array<Doc<'troops'>>>();
  for (const troop of troops) {
    const address = troop.stationedAt;
    if (address === null || typeof address === 'string') continue;
    byPlayer.set(troop.playerId, [...(byPlayer.get(troop.playerId) ?? []), troop]);
  }

  for (const [playerId, group] of byPlayer) {
    const anchor = await nearestAnchor(ctx, playerId, from);
    const route =
      anchor === null
        ? null
        : routeBetween(from, anchor.point, routeModeOf(group.map((troop) => troop.role)));

    /** No road back — a landing whose transports sank, a player without a nation. It comes home
     *  all the same rather than dying for it (rule 3 of the project); it just does not walk. */
    if (anchor === null || route === null) {
      for (const troop of group) await ctx.db.patch(troop._id, { stationedAt: null });
      continue;
    }

    const arrivesAt = now + routeMinutes(route.costUnits) * 60_000;
    const movementId = await ctx.db.insert('movements', {
      playerId,
      type: 'return',
      fromBuildingId: null,
      /** The anchor travels as the aim it is: `attachHome` reads it back to know whether the
       *  column becomes a garrison or comes back to national soil hanging from nothing. */
      target:
        anchor.outpostId === null
          ? { kind: 'home' }
          : { kind: 'outpost', outpostId: anchor.outpostId },
      from: asPoint(from),
      to: asPoint(anchor.point),
      hostCountry: anchor.hostCountry,
      points: route.points.map(asPoint),
      legs: route.legs.map((leg) => ({ medium: leg.medium, distanceUnits: leg.distanceUnits })),
      distanceUnits: route.distanceUnits,
      costUnits: route.costUnits,
      troopIds: group.map((troop) => troop._id),
      departedAt: now,
      arrivesAt,
    });
    await ctx.scheduler.runAt(arrivesAt, internal.movements.arrive, { movementId });
  }
}

type Defence = {
  readonly playerId: Id<'players'>;
  readonly troops: ReadonlyArray<Doc<'troops'>>;
  readonly outpostId: Id<'outposts'> | null;
};

/**
 * Who answers an arrival. At an outpost, its garrison. On a region, the troops hanging from the
 * buildings that stand there — and if several nations hold ground in the same region, the one
 * with the most troops answers: an arrival is **one** engagement, and splitting the column
 * across two of them would resolve the same pass twice.
 */
async function defenceOf(ctx: MutationCtx, movement: Doc<'movements'>): Promise<Defence | null> {
  const target = movement.target;
  if (target.kind === 'point') return defenceNear(ctx, movement, pointOf(target.point));
  if (target.kind === 'outpost') {
    const outpost = await ctx.db.get(target.outpostId);
    if (!outpost) return null;
    const garrison = await troopsStationedAt(ctx, outpost._id);
    return garrison.length === 0
      ? null
      : { playerId: outpost.playerId, troops: garrison, outpostId: outpost._id };
  }
  if (target.kind !== 'region') return null;

  const buildings = (await ctx.db.query('buildings').collect()).filter(
    (building) => building.regionId === target.regionId && building.playerId !== movement.playerId,
  );

  const byPlayer = new Map<Id<'players'>, Array<Doc<'troops'>>>();
  for (const building of buildings) {
    for (const troop of await troopsStationedAt(ctx, building._id)) {
      const kept = byPlayer.get(troop.playerId) ?? [];
      if (!kept.some((seen) => seen._id === troop._id)) kept.push(troop);
      byPlayer.set(troop.playerId, kept);
    }
  }

  let defender: Defence | null = null;
  for (const [playerId, troops] of byPlayer) {
    if (troops.length === 0) continue;
    if (defender === null || troops.length > defender.troops.length) {
      defender = { playerId, troops, outpostId: null };
    }
  }
  return defender;
}

/**
 * **Who answers a point, by distance rather than by containment.** The server holds no polygons
 * — `region-index.json` gives one point per region, which names a place and contains nothing —
 * so "which region encloses this coordinate" has no answer here. It is the wrong question
 * anyway: what an arrival meets is what stands within `ARRIVAL_RADIUS_KM` of where it stopped,
 * which is the same reading the interception has always used (ADR 0018 §3).
 *
 * **A troop in flight stands nowhere.** It is excluded here and nowhere else, and the difference
 * is the question: an outpost is raided whether or not its garrison walked out — the address is
 * the thing being attacked — where a point asks literally who is present.
 *
 * One arrival is **one** engagement (ADR 0014): if several nations answer inside the radius, the
 * one with the most troops does, exactly as a region-aimed arrival already settles it.
 */
async function defenceNear(
  ctx: MutationCtx,
  movement: Doc<'movements'>,
  arrival: LonLat,
): Promise<Defence | null> {
  const marching = new Set<Id<'troops'>>(
    (await ctx.db.query('movements').collect()).flatMap((other) => other.troopIds),
  );
  const byPlayer = new Map<
    Id<'players'>,
    { troops: Array<Doc<'troops'>>; outposts: Set<Id<'outposts'>> }
  >();

  for (const troop of await ctx.db.query('troops').collect()) {
    if (troop.playerId === movement.playerId || marching.has(troop._id)) continue;
    const stance = await stanceOf(ctx, troop.stationedAt);
    if (stance === null || distanceKm(stance.point, arrival) > ARRIVAL_RADIUS_KM) continue;
    const kept = byPlayer.get(troop.playerId) ?? { troops: [], outposts: new Set() };
    kept.troops.push(troop);
    if (stance.outpostId !== null) kept.outposts.add(stance.outpostId);
    byPlayer.set(troop.playerId, kept);
  }

  let defender: Defence | null = null;
  for (const [playerId, kept] of byPlayer) {
    if (defender !== null && kept.troops.length <= defender.troops.length) continue;
    /** The engagement names an outpost only when the defence is one: two of them answering the
     *  same arrival is a place, not a point, and the account must not pick one of them. */
    const [only] = [...kept.outposts];
    defender = {
      playerId,
      troops: kept.troops,
      outpostId: kept.outposts.size === 1 ? only! : null,
    };
  }
  return defender;
}

/** Where an address stands on the globe. A building answers by the point of its region — the
 *  only coordinate the index carries for it — an outpost and a point by their own. `null` is a
 *  troop the game cannot place: at home, or hanging from something razed. */
async function stanceOf(
  ctx: MutationCtx,
  address: TroopAddress,
): Promise<{ point: LonLat; outpostId: Id<'outposts'> | null } | null> {
  if (address === null) return null;
  if (typeof address !== 'string') return { point: pointOf(address), outpostId: null };
  const outpostId = ctx.db.normalizeId('outposts', address);
  if (outpostId !== null) {
    const outpost = await ctx.db.get(outpostId);
    return outpost === null ? null : { point: pointOf(outpost.point), outpostId };
  }
  const buildingId = ctx.db.normalizeId('buildings', address);
  const building = buildingId === null ? null : await ctx.db.get(buildingId);
  const region = building === null ? null : regionFacts(building.regionId);
  return region === null ? null : { point: region.point, outpostId: null };
}

/**
 * How far a posted troop may stand from the point a contact was filed at and still be the camp
 * that was caught there. **A technical tolerance, not a radius of the game** — it settles no
 * rule and nothing is balanced on it: it is the width of a coordinate that has been through the
 * database and back.
 *
 * A kilometre is two orders of magnitude under anything the rules measure (`ARRIVAL_RADIUS_KM`
 * is twenty-five) and orders of magnitude over any rounding, so no reading changes on it. What
 * it replaces is an equality between two floating-point numbers, in the one place a missed
 * comparison would resolve a battle against nobody and say nothing about it.
 */
const POSTED_MATCH_KM = 1;

/**
 * An interceptor is a garrison, a column, or a camp, and all three answer the same question:
 * who is here. The first two are documents; the third is not — a force posted on the map is
 * troops sharing an address, and that address is the only name it has.
 *
 * It is read **now**, not at the moment the contact was computed: a camp that has since marched
 * off answers with what is left of it, exactly as a garrison does. Hence the distance: the camp
 * is found by standing where the contact says it stood, never by matching a coordinate to the
 * digit.
 */
async function forceOf(
  ctx: MutationCtx,
  force: ContactForce,
): Promise<{
  playerId: Id<'players'>;
  troops: ReadonlyArray<Doc<'troops'>>;
  movementId: Id<'movements'> | null;
} | null> {
  if (force.kind === 'posted') {
    const marching = new Set<Id<'troops'>>(
      (await ctx.db.query('movements').collect()).flatMap((movement) => movement.troopIds),
    );
    const here = pointOf(force.point);
    const troops = (
      await ctx.db
        .query('troops')
        .withIndex('byPlayer', (q) => q.eq('playerId', force.playerId))
        .collect()
    ).filter((troop) => {
      const address = troop.stationedAt;
      if (marching.has(troop._id) || address === null || typeof address === 'string') return false;
      return distanceKm(pointOf(address), here) <= POSTED_MATCH_KM;
    });
    return { playerId: force.playerId, troops, movementId: null };
  }
  if (force.kind === 'outpost') {
    const outpost = await ctx.db.get(force.outpostId);
    if (!outpost) return null;
    return {
      playerId: outpost.playerId,
      troops: await troopsStationedAt(ctx, outpost._id),
      movementId: null,
    };
  }
  const movement = await ctx.db.get(force.movementId);
  if (!movement) return null;
  return {
    playerId: movement.playerId,
    troops: await troopsCarriedBy(ctx, movement),
    movementId: movement._id,
  };
}

async function troopsCarriedBy(
  ctx: MutationCtx,
  movement: Doc<'movements'>,
): Promise<Array<Doc<'troops'>>> {
  const troops: Array<Doc<'troops'>> = [];
  for (const troopId of movement.troopIds) {
    const troop = await ctx.db.get(troopId);
    if (troop) troops.push(troop);
  }
  return troops;
}

/**
 * **What the player already watches — and nothing whatsoever about what stands there.** A point
 * is *recognised* when it falls on his own country or inside the reach of one of his outposts.
 * Two sources today; the list is meant to grow, and `SCOUT_RADIUS_KM` is the third
 * (`reperage-des-troupes-posees.md`) — the door is left open here on purpose.
 *
 * **It promises nothing.** It does not say an adversary is there, and above all it does not say
 * that recognised ground would be safe: a posted force is invisible everywhere, at home
 * included (ADR 0019 §6). It is information about one's own level of information, which is why
 * the server may answer it at all — there is no fog to leak.
 */
async function recognises(ctx: QueryCtx, player: Doc<'players'>, point: LonLat): Promise<boolean> {
  const outposts = await outpostsOf(ctx, player._id);
  /** **Every** point of his, deactivated ones included: a raid burns the depot, it does not
   *  blind the relay. That is the one thing this reading does not share with the upkeep's, which
   *  is fed by standing points only (`upkeep.ts`). */
  return isAnchored(
    point,
    homeCountryOf(player.nation),
    outposts.map((outpost) => ({ point: pointOf(outpost.point) })),
  );
}

/**
 * When a column reaching `hostCountry` at `at` would be let in. **The rest window of design
 * sheet 07 forbids arrivals, never departures**, and it forbids them *at a player*: neutral
 * ground has nobody to wake, so it answers `null` and nothing waits.
 *
 * Shared by the arrival, which stalls the movement, and by the preview, which says so before
 * the slot is spent — two readings of one rule rather than two rules.
 */
export async function restHold(
  ctx: QueryCtx,
  playerId: Id<'players'>,
  hostCountry: string,
  at: number,
): Promise<number | null> {
  const owner = await ctx.db.get(playerId);
  if (!owner) return null;
  const host = (
    await ctx.db
      .query('players')
      .withIndex('bySeason', (q) => q.eq('seasonId', owner.seasonId))
      .collect()
  ).find((player) => player._id !== owner._id && homeCountryOf(player.nation) === hostCountry);
  return host ? windowExit(at, host.restWindow) : null;
}
