import { v } from 'convex/values';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { internalMutation, mutation, query } from './_generated/server';
import type { QueryCtx } from './_generated/server';
import {
  DECOY_PACE,
  foundingRefusal,
  landCostOf,
  refusalOf,
  routeModeOf,
  type Column,
} from '../src/domain/movement-orders';
import { windowExit } from '../src/domain/rest-window';
import type { ComputedRoute } from '../src/domain/routing';
import { playerBuildings } from './buildings';
import { resolveContact } from './combat';
import { DECOY_COST, routeMinutes } from './constants';
import { fail } from './errors';
import {
  attachHome,
  engageAt,
  exposeDecoy,
  fadeAt,
  forgetMovement,
  recallAt,
  standAt,
  walkHome,
} from './movement/arrival';
import { fileSightings, scheduleInterception } from './movement/detection';
import {
  asPoint,
  forceOf,
  movementsOf,
  pointOf,
  recognises,
  troopsCarriedBy,
} from './movement/forces';
import {
  aimOf,
  claimSlot,
  columnOf,
  decoyGate,
  departureOf,
  march,
  pacedMinutes,
  sameStation,
  troopsAmong,
} from './movement/orders';
import { homeCountryOf, nearestRegion } from './regions';
import { debit } from './resources';
import { hostAtPoint, routeBetween } from './routes';
import { playerByToken, requirePlayable, seasonStillPlays } from './seasons';
import {
  ATTACK_TARGET,
  CONTACT_FORCE,
  LON_LAT,
  MOVEMENT_ORIGIN,
  MOVEMENT_TYPE,
  SPECIALIZATION,
} from './validators';

/**
 * The ordering surface, and nothing else: every `api.movements.*` door lives here. Foundation,
 * attack and raid are ordered, plus the decoy (ADR 0006) and the return nobody orders (ADR 0019).
 * The helpers are in `convex/movement/`: `orders` files a departure, `detection` fills the fog,
 * `arrival` resolves the far end, `forces` answers who stands where.
 */

/** ADR 0019 §1: one founds where one stands, and the founding column becomes the garrison of
 *  its own point (`garnison-adresse.md`). */
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

    /** `troopIds` is a manifest, not a second attachment, so standing at the point is not
     *  enough: a column that left it is on the road. */
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

    /** The server holds no polygons, so whose ground this is is the nearest region's — the only
     *  containment it has. A region already carrying a building of mine is `FRIENDLY_TARGET`. */
    const here = nearestRegion(pointOf(point));
    const buildings = await playerBuildings(ctx, player._id);
    const refusal = foundingRefusal(
      troops.map((troop) => troop.role),
      here !== null && buildings.some((building) => building.regionId === here.id),
    );
    if (refusal !== null) fail(refusal, {});

    const outpostId = await ctx.db.insert('outposts', {
      seasonId: season._id,
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
    await ctx.db.insert('notices', {
      playerId: player._id,
      at: Date.now(),
      kind: 'outpostFounded',
      hostCountry: hostAtPoint(pointOf(point)),
      specialization,
    });
    return { outpostId };
  },
});

/** ADR 0019 §7: go there and stay — a slot like any other (ADR 0006), and the only order whose
 *  column has an address at the end of it. **`marchTo`, not `march`**: `march` is the corridor
 *  all three orders walk down, and the name was taken before the type existed. */
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
      season,
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
      season,
      type: 'attack',
      origin,
      troopIds,
      aim: await aimOf(ctx, target),
    });
  },
});

/** ADR 0004: a raid marches at an outpost and nothing else, and winning the engagement is what
 *  deactivates it — one that fails to clear the garrison has walked for nothing. */
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
      season,
      type: 'raid',
      origin,
      troopIds,
      aim: await aimOf(ctx, { kind: 'outpost', outpostId }),
    });
  },
});

/**
 * ADR 0006 and design sheet 04: an empty manifest, filed, paced and caught exactly like a march.
 * Flat `DECOY_COST` plus a slot — a free feint would drown the espionage in noise and the server
 * in fan-out. There is no argument to pass troops in: a decoy that could name a manifest is a
 * march spelled another way.
 */
export const decoy = mutation({
  args: { token: v.string(), origin: MOVEMENT_ORIGIN, point: LON_LAT },
  handler: async (ctx, { token, origin, point }) => {
    const { player, season } = await playerByToken(ctx, token);
    requirePlayable(season);

    await claimSlot(ctx, player._id, season);

    const departure = await departureOf(ctx, player._id, origin);
    if (departure === null) {
      if (origin.kind === 'outpost') fail('UNKNOWN_OUTPOST', { outpostId: origin.outpostId });
      fail('UNKNOWN_BUILDING');
    }
    if (!(await decoyGate(ctx, player._id, departure))) fail('NO_DECOY_ORIGIN', {});

    const aim = await aimOf(ctx, { kind: 'point', point });
    /** ADR 0015, one rule and two callers, asked here of an empty pile. */
    const refusal = refusalOf('decoy', aim.aim, emptyColumn());
    if (refusal !== null) fail(refusal, { type: 'decoy' });

    const route = routeBetween(
      departure.point,
      aim.point,
      routeModeOf(DECOY_PACE),
      landCostOf(DECOY_PACE),
    );
    if (route === null) fail('NO_LAND_ROUTE', { from: departure.name, to: aim.name });

    const now = Date.now();
    await debit(ctx, player._id, DECOY_COST, now);

    /** A decoy that ignored its owner's relays would arrive at an hour no real column of his
     *  ever keeps, and the fog would tell the two apart on the clock alone. */
    const minutes = await pacedMinutes(ctx, player._id, route, now);
    const arrivesAt = now + minutes * 60_000;
    const movementId = await ctx.db.insert('movements', {
      seasonId: season._id,
      playerId: player._id,
      type: 'decoy',
      fromBuildingId: departure.fromBuildingId,
      target: aim.target,
      from: asPoint(departure.point),
      to: asPoint(aim.point),
      hostCountry: aim.host,
      points: route.points.map(asPoint),
      legs: route.legs.map((leg) => ({ medium: leg.medium, distanceUnits: leg.distanceUnits })),
      distanceUnits: route.distanceUnits,
      costUnits: route.costUnits,
      landCost: route.landCost,
      troopIds: [],
      departedAt: now,
      arrivesAt,
    });
    await ctx.scheduler.runAt(arrivesAt, internal.movements.arrive, { movementId });
    /** **Indiscernible means the same two calls, in the same order** — a decoy filed by a
     *  different path would be a decoy one could tell apart by the rows it leaves. */
    const filed = (await ctx.db.get(movementId))!;
    await scheduleInterception(ctx, filed);
    await fileSightings(ctx, filed);
    return { movementId, minutes, arrivesAt };
  },
});

/** No role opens a door, and no ground of the player's is consulted for a point. */
const emptyColumn = (): Column => ({
  roles: [],
  myRegionIds: new Set(),
  myOutpostIds: new Set(),
  departureBuildings: new Set(),
});

/**
 * What the player sees before he pays: the route the march will store (ADR 0012) and the rest
 * window it would stall in (design sheet 07). **It refuses nothing** — the fan only ever offered
 * legal types (ADR 0015), and a query that failed would turn a hover into an error.
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

    /** **A decoy reads its own pace and not the armed pile's** (`DECOY_PACE`): a column is still
     *  selected when the player picks the feint, and its trip would promise an hour the decoy
     *  never keeps. */
    const troops = await troopsAmong(ctx, player._id, troopIds);
    const column = await columnOf(ctx, player._id, troops, departure);
    const pace = type === 'decoy' ? DECOY_PACE : column.roles;

    const { point, name, host } = await aimOf(ctx, target);
    const route = routeBetween(departure.point, point, routeModeOf(pace), landCostOf(pace));
    if (route === null) return null;

    const now = Date.now();
    const minutes = await pacedMinutes(ctx, player._id, route, now);
    const arrivesAt = now + minutes * 60_000;
    return {
      minutes,
      arrivesAt,
      /** The card owes the player the reason for an hour he did not expect: an acceleration
       *  nothing on screen accounts for reads as a bug, not as a reward. */
      relayed: routeMinutes(route.costUnits) - minutes,
      holdUntil: await restHold(ctx, player._id, host, arrivesAt),
      recognised: await recognises(ctx, player, point),
      /** A decoy carries nobody, whatever is armed behind the card. */
      troops: type === 'decoy' ? 0 : troopIds.length,
      type,
      destinationName: name,
      originName: departure.name,
      route: routeFacts(route),
    };
  },
});

const routeFacts = (route: ComputedRoute) => ({
  mode: route.mode,
  points: route.points.map(asPoint),
  distanceUnits: route.distanceUnits,
  costUnits: route.costUnits,
  landCost: route.landCost,
  legs: route.legs.map((leg) => ({ medium: leg.medium, distanceUnits: leg.distanceUnits })),
});

/**
 * The far end of every movement (design sheet 07 for the rest window, ADR 0014 for the pass).
 * **A return never engages**, and that is a decision: the rout ended that engagement, and a
 * beaten column arriving in arms would be resolved twice for one defeat.
 */
export const arrive = internalMutation({
  args: { movementId: v.id('movements') },
  handler: async (ctx, { movementId }) => {
    const movement = await ctx.db.get(movementId);
    if (!movement) return;
    if (!(await seasonStillPlays(ctx, movement.playerId))) return;

    const now = Date.now();
    const held = await restHold(ctx, movement.playerId, movement.hostCountry, now);
    if (held !== null) {
      await ctx.db.patch(movementId, { arrivesAt: held });
      await ctx.scheduler.runAt(held, internal.movements.arrive, { movementId });
      /** Fiche 11 §4.1. Filed at the hold, once — the reschedule lands past the window, so it
       *  cannot file a second. */
      await ctx.db.insert('notices', {
        playerId: movement.playerId,
        at: now,
        kind: 'movementStalled',
        hostCountry: movement.hostCountry,
        resolvesAt: held,
      });
      return;
    }

    if (movement.type === 'attack' || movement.type === 'raid') {
      await engageAt(ctx, movement, movement.type, now);
    } else if (movement.type === 'march') await standAt(ctx, movement, now);
    else if (movement.type === 'decoy') await fadeAt(ctx, movement, now);
    else if (movement.type === 'recall') await recallAt(ctx, movement);
    else await attachHome(ctx, movement);

    /** **The three arrivals nothing else accounts for**: the others leave an engagement or file
     *  their own notice. Without this a player came back to "rien à signaler" after eight quiet
     *  hours. */
    if (movement.type === 'march' || movement.type === 'recall' || movement.type === 'return') {
      await ctx.db.insert('notices', {
        playerId: movement.playerId,
        at: now,
        kind: 'columnArrived',
        movementType: movement.type,
        hostCountry: movement.hostCountry,
        troops: movement.troopIds.length,
      });
    }

    await forgetMovement(ctx, movementId);
  },
});

/** ADR 0008: the interceptor takes the initiative. Date and place were settled at departure
 *  (`src/domain/interception.ts`), and everything can have changed since — that is ordinary, and
 *  it means nothing happens. */
export const intercept = internalMutation({
  args: {
    movementId: v.id('movements'),
    by: CONTACT_FORCE,
    point: LON_LAT,
  },
  handler: async (ctx, { movementId, by, point }) => {
    const movement = await ctx.db.get(movementId);
    if (!movement) return;
    if (!(await seasonStillPlays(ctx, movement.playerId))) return;
    const owner = await ctx.db.get(movement.playerId);
    if (!owner) return;

    const interceptor = await forceOf(ctx, by);
    if (interceptor === null || interceptor.troops.length === 0) return;
    if (interceptor.playerId === movement.playerId) return;

    const now = Date.now();
    /** **A decoy caught on the road is not a battle, it is a discovery** (design sheet 04): no
     *  round is paid for, or the feint would be a weapon against the ammunition. */
    if (movement.type === 'decoy') {
      await exposeDecoy(ctx, movement, interceptor.playerId, now);
      await forgetMovement(ctx, movement._id);
      return;
    }

    const marching = await troopsCarriedBy(ctx, movement);
    if (marching.length === 0) return;

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
    /** Breaking off the whole march would make one cheap contact worth an entire order. */
    const carriedOn = movement.troopIds.filter((troopId) => left.has(troopId));
    if (carriedOn.length === 0) await forgetMovement(ctx, movement._id);
    else await ctx.db.patch(movement._id, { troopIds: carriedOn });

    if (interceptor.movementId !== null) {
      const carrier = await ctx.db.get(interceptor.movementId);
      if (carrier) {
        const kept = carrier.troopIds.filter(
          (troopId) => !routed.some((troop) => troop._id === troopId),
        );
        if (kept.length === 0) await forgetMovement(ctx, carrier._id);
        else await ctx.db.patch(carrier._id, { troopIds: kept });
      }
    }
    /** Only the beaten take a road here: what still stands has carried on down its own. */
    await walkHome(ctx, { winners: [], beaten: routed }, pointOf(point), now);
  },
});

/** Design sheet 07: the rest window forbids arrivals at a player, never departures — neutral
 *  ground has nobody to wake. Shared by the arrival, which stalls, and by the preview, which
 *  says so before the slot is spent. */
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
