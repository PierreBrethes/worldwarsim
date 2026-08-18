import { v } from 'convex/values';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { internalMutation, mutation, query } from './_generated/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import type { LonLat } from '../src/domain/geo';
import { firstInterception, type MarchingForce } from '../src/domain/interception';
import {
  liftOf,
  refusalOf,
  routeModeOf,
  type Column,
  type MovementAim,
} from '../src/domain/movement-orders';
import { windowExit } from '../src/domain/rest-window';
import type { ComputedRoute } from '../src/domain/routing';
import { buildingAt, playerBuildings } from './buildings';
import { resolveContact, troopsStationedAt } from './combat';
import {
  INTERCEPTION_RADIUS_KM,
  MOVEMENTS_IN_FLIGHT,
  OUTPOST_DISABLED_HOURS,
  OUTPOST_IMMUNITY_HOURS,
  routeMinutes,
} from './constants';
import { fail } from './errors';
import { homeCountryOf, regionFacts } from './regions';
import { hostAtPoint, routeBetween } from './routes';
import { playerByToken, requirePlayable } from './seasons';
import { ATTACK_TARGET, MOVEMENT_ORIGIN, MOVEMENT_TYPE, SPECIALIZATION } from './validators';

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
export const foundOutpost = mutation({
  args: {
    token: v.string(),
    origin: MOVEMENT_ORIGIN,
    regionId: v.string(),
    specialization: SPECIALIZATION,
    troopIds: v.array(v.id('troops')),
  },
  handler: async (ctx, { token, origin, regionId, specialization, troopIds }) => {
    const { player, season } = await playerByToken(ctx, token);
    requirePlayable(season);

    return march(ctx, {
      playerId: player._id,
      type: 'outpost',
      origin,
      troopIds,
      aim: await aimOf(ctx, { kind: 'region', regionId }),
      specialization,
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
      specialization: 'relay',
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
      specialization: 'relay',
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

    if (movement.type === 'outpost') await foundAt(ctx, movement, now);
    else if (movement.type === 'attack' || movement.type === 'raid') {
      await engageAt(ctx, movement, now);
    } else if (movement.type === 'recall') await recallAt(ctx, movement);
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
    by: v.string(),
    point: v.object({ lon: v.number(), lat: v.number() }),
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
    await sendHome(ctx, routed, pointOf(point), now);
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
  readonly outpostId: Id<'outposts'> | null;
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
      outpostId: null,
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
      outpostId: outpost._id,
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
    outpostId: null,
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

/** Where a march leaves from — a building, or the outpost a column garrisons. Never both, never
 *  neither; a point joins them the day `stationedAt` carries one (ADR 0019). */
type MarchOrigin =
  | { readonly kind: 'building'; readonly buildingId: Id<'buildings'> }
  | { readonly kind: 'outpost'; readonly outpostId: Id<'outposts'> };

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
  readonly stationId: Id<'buildings'> | Id<'outposts'>;
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
    specialization,
  }: {
    playerId: Id<'players'>;
    type: 'outpost' | 'attack' | 'raid' | 'recall';
    origin: MarchOrigin;
    troopIds: ReadonlyArray<Id<'troops'>>;
    aim: Aimed;
    specialization: Doc<'movements'>['specialization'];
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
    if (troop.stationedAt !== departure.stationId) fail('TROOP_NOT_AT_ORIGIN', { troopId });
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
    specialization,
    departedAt: now,
    arrivesAt,
  });
  await ctx.scheduler.runAt(arrivesAt, internal.movements.arrive, { movementId });
  await scheduleInterception(ctx, {
    movementId,
    playerId,
    points: route.points,
    departedAt: now,
    arrivesAt,
    /**
     * **What a column is marching at does not intercept it on the way in.** The garrison of the
     * target sits at the end of the road, well inside its own radius, so without this it would
     * fight the column twice for one order — once on approach and once on arrival. One
     * engagement is one pass (ADR 0014), and this is where that is enforced.
     */
    except: aim.outpostId,
  });
  return { movementId, minutes, arrivesAt };
}

/**
 * The contact is looked for **once, at departure**, against everything already on the board: an
 * outpost with a garrison stands still, a column in flight moves, and both carry the same
 * radius. It is the newcomer that looks — nothing already marching is re-examined, which is
 * what keeps a departure from costing a sweep of every pair on the map.
 */
async function scheduleInterception(
  ctx: MutationCtx,
  {
    movementId,
    playerId,
    points,
    departedAt,
    arrivesAt,
    except,
  }: {
    movementId: Id<'movements'>;
    playerId: Id<'players'>;
    points: ReadonlyArray<LonLat>;
    departedAt: number;
    arrivesAt: number;
    except: Id<'outposts'> | null;
  },
): Promise<void> {
  const outposts = await ctx.db.query('outposts').collect();
  const standing: Array<{ id: string; point: LonLat }> = [];
  for (const outpost of outposts) {
    if (outpost.playerId === playerId || outpost._id === except) continue;
    const garrison = await troopsStationedAt(ctx, outpost._id);
    if (garrison.length === 0) continue;
    standing.push({ id: `outpost:${outpost._id}`, point: pointOf(outpost.point) });
  }

  const marching: Array<MarchingForce> = (await ctx.db.query('movements').collect())
    .filter((other) => other.playerId !== playerId && other._id !== movementId)
    .map((other) => ({
      id: `movement:${other._id}`,
      points: other.points.map(pointOf),
      departedAt: other.departedAt,
      arrivesAt: other.arrivesAt,
    }));

  const contact = firstInterception({
    mine: { id: `movement:${movementId}`, points, departedAt, arrivesAt },
    standing,
    marching,
    radiusKm: INTERCEPTION_RADIUS_KM,
  });
  if (contact === null) return;

  await ctx.scheduler.runAt(contact.at, internal.movements.intercept, {
    movementId,
    by: contact.withId,
    point: asPoint(contact.point),
  });
}

async function foundAt(ctx: MutationCtx, movement: Doc<'movements'>, now: number): Promise<void> {
  const outpostId = await ctx.db.insert('outposts', {
    playerId: movement.playerId,
    point: movement.to,
    hostCountry: movement.hostCountry,
    level: 1,
    specialization: movement.specialization,
    foundedAt: now,
    disabledUntil: null,
    immuneUntil: null,
  });
  /**
   * The column that carried the foundation **becomes its garrison** — `stationedAt` is an
   * attachment and an outpost is one (ADR 0014). It is an address, and since the combat pass it
   * is also what an attack finds standing there.
   */
  for (const troopId of movement.troopIds) {
    const troop = await ctx.db.get(troopId);
    if (troop) await ctx.db.patch(troopId, { stationedAt: outpostId });
  }
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

  const { engagementId, engagement } = await resolveContact(ctx, {
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
   * stay. `routed` is not read here — a routed **defender** is already at its attachment, it
   * garrisons the outpost or stands in a building of the region, and it has nowhere to walk
   * back to.
   */
  const survivors = marching.filter((troop) =>
    engagement.outcomes.some(
      (outcome) => outcome.id === troop._id && outcome.state !== 'destroyed',
    ),
  );
  await sendHome(ctx, survivors, pointOf(movement.to), now);
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

/** Where a returning column re-hangs itself. A building razed while its troops were away answers
 *  `null` — they come home, they do not die (rule 3 of the project). */
async function attachHome(ctx: MutationCtx, movement: Doc<'movements'>): Promise<void> {
  const station =
    movement.fromBuildingId === null ? null : await ctx.db.get(movement.fromBuildingId);
  for (const troopId of movement.troopIds) {
    const troop = await ctx.db.get(troopId);
    if (troop) await ctx.db.patch(troopId, { stationedAt: station ? station._id : null });
  }
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
    if (troop) await ctx.db.patch(troopId, { stationedAt: barracks ? barracks._id : null });
  }
}

/**
 * The march back, created by the resolution and **outside the slots**: it is not an order, it is
 * what is left of one. Each troop walks to what it hangs from — the attachment it left with,
 * which a movement never took from it. A troop hanging from an **outpost** needs no march at
 * all: it is standing on its attachment already.
 */
async function sendHome(
  ctx: MutationCtx,
  troops: ReadonlyArray<Doc<'troops'>>,
  from: LonLat,
  now: number,
): Promise<void> {
  const byBuilding = new Map<Id<'buildings'>, Array<Doc<'troops'>>>();
  for (const troop of troops) {
    const buildingId =
      troop.stationedAt === null ? null : ctx.db.normalizeId('buildings', troop.stationedAt);
    if (buildingId === null) continue;
    byBuilding.set(buildingId, [...(byBuilding.get(buildingId) ?? []), troop]);
  }

  for (const [buildingId, group] of byBuilding) {
    const building = await ctx.db.get(buildingId);
    const origin = building === null ? null : regionFacts(building.regionId);
    if (building === null || origin === null) {
      for (const troop of group) await ctx.db.patch(troop._id, { stationedAt: null });
      continue;
    }

    /** A column coming home from overseas has a sea to recross; `'land'` here would find no
     *  route at all and leave it hanging from a building it never reaches (rule 3). A return is
     *  not an order, so it owes no port — nobody asked for it. */
    const route = routeBetween(from, origin.point, routeModeOf(group.map((troop) => troop.role)));
    if (route === null) {
      for (const troop of group) await ctx.db.patch(troop._id, { stationedAt: building._id });
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
      specialization: 'relay',
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
  /**
   * **A point answers nobody, for now.** Finding who defends a coordinate means knowing which
   * region contains it, and the server holds no polygons — `region-index.json` gives one point
   * per region, which names a place and contains nothing. Naming the nearest region instead
   * would resolve a combat against the wrong garrison, which is worse than resolving none.
   * Until the index bakes a point-to-region answer, one designates a region to walk at what
   * stands on it. A garrison on the way still intercepts: that contact is a distance, not a
   * containment, and it works already.
   */
  if (target.kind === 'point') return null;
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

/** An interceptor is a garrison or a column, and both answer the same question: who is here. */
async function forceOf(
  ctx: MutationCtx,
  reference: string,
): Promise<{
  playerId: Id<'players'>;
  troops: ReadonlyArray<Doc<'troops'>>;
  movementId: Id<'movements'> | null;
} | null> {
  const [kind, id] = reference.split(':');
  if (kind === 'outpost') {
    const outpost = await ctx.db.get(id as Id<'outposts'>);
    if (!outpost) return null;
    return {
      playerId: outpost.playerId,
      troops: await troopsStationedAt(ctx, outpost._id),
      movementId: null,
    };
  }
  const movement = await ctx.db.get(id as Id<'movements'>);
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
