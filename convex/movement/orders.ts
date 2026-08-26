/**
 * Filing a departure: resolve the aim and the origin, claim the slot, refuse or route, insert
 * the row and hand it to the fog. One rule decides what may be ordered — `refusalOf` in
 * `src/domain/movement-orders.ts`, the very function the compass rose filters its fan with
 * (ADR 0015) — the slots come from the headquarters (ADR 0006), and the pace is read once, at
 * departure, relays included (ADR 0018 §3).
 */

import { internal } from '../_generated/api';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import type { LonLat } from '../../src/domain/geo';
import type { BuildingKey } from '../../src/domain/ids';
import {
  liftOf,
  movementSlots,
  refusalOf,
  landCostOf,
  routeModeOf,
  type Column,
  type MovementAim,
} from '../../src/domain/movement-orders';
import { relayedCostUnits } from '../../src/domain/route-timing';
import type { ComputedRoute } from '../../src/domain/routing';
import { PROJECTION_BY_DOMAIN } from '../../src/domain/troops';
import { buildingLevel } from '../buildings';
import {
  OUTPOST_REACH_KM,
  RELAY_SPEED_MULTIPLIER,
  routeMinutes,
  SEASON_FORMATS,
  formatOf,
} from '../constants';
import { fail } from '../errors';
import { regionFacts } from '../regions';
import { hostAtPoint, routeBetween } from '../routes';
import { fileSightings, scheduleInterception } from './detection';
import { asPoint, movementsOf, outpostsOf, pointOf, type TroopAddress } from './forces';

/** ADR 0019 §1: a building, the outpost a column garrisons, or the plain point it was left
 *  standing on. Exactly one of the three, never two, never none. */
type MarchOrigin =
  | { readonly kind: 'building'; readonly buildingId: Id<'buildings'> }
  | { readonly kind: 'outpost'; readonly outpostId: Id<'outposts'> }
  | { readonly kind: 'point'; readonly point: { readonly lon: number; readonly lat: number } };

/** `regionId` is `null` for an outpost, and that null is the rule rather than a hole: ADR 0019
 *  §2, a garrison walks, it does not embark. */
type Departure = {
  readonly point: LonLat;
  readonly name: string;
  readonly regionId: string | null;
  /** The address the troops must already be standing at to be ordered out of it. */
  readonly stationId: TroopAddress;
  /** What a return walks back to — an outpost keeps its garrison on the spot and needs none. */
  readonly fromBuildingId: Id<'buildings'> | null;
};

export async function departureOf(
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
    /** **A place is not a thing, so there is nothing to own here**: what makes the order
     *  legitimate is that `march` checks the troops address by address. No building, no gate. */
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

/** **Two addresses are the same when they name the same place.** The point is compared as it was
 *  written — nothing rounds, because an address is copied, never re-measured. */
export const sameStation = (a: TroopAddress, b: TroopAddress): boolean => {
  if (a === null || b === null) return a === b;
  if (typeof a === 'string' || typeof b === 'string') return a === b;
  return a.lon === b.lon && a.lat === b.lat;
};

/** A target resolved to a place. The **legality** of marching there is not decided here — see
 *  `refusalOf` and ADR 0015. */
type Aimed = {
  readonly aim: MovementAim;
  /** The same target in the shape the table stores, brand and all — `MovementAim` is domain
   *  data and knows nothing of Convex ids. */
  readonly target: Doc<'movements'>['target'];
  readonly point: LonLat;
  readonly name: string;
  /** It travels with the target rather than being read back off the aim, because a **point**
   *  does not carry it: only the geometry knows. The open sea alone answers `''`. */
  readonly host: string;
};

export async function aimOf(
  ctx: QueryCtx,
  target: Doc<'movements'>['target'] & { kind: 'region' | 'outpost' | 'point' },
): Promise<Aimed> {
  /** **A point is kept as it was aimed** (ADR 0019 §1): nothing looks up what stands there. Only
   *  the country is read off it, because the rest window is owed to whoever owns the ground. */
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

/** The troops of an order, silently skipping what does not answer — a preview reads them to know
 *  which medium to draw in, and a hover is not the place to raise an error. */
export async function troopsAmong(
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

export async function columnOf(
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

/** Same shape and reason as `capReliefOf`: "montez le QG" is advice, "un quartier général niveau
 *  3 les porte à 4" is a plan. Both numbers come out of `movementSlots`, never recopied. */
const slotRelief = (season: Doc<'seasons'>, hqLevel: number) =>
  hqLevel >= SEASON_FORMATS[formatOf(season.durationHours)].maxHqLevel
    ? {}
    : { nextHqLevel: hqLevel + 1, nextSlots: movementSlots(hqLevel + 1) };

/**
 * ADR 0006, carried by the headquarters since ADR 0015 dissolved the logistics centre. The count
 * comes from `movementSlots`, the very function `view.ts` fills the banner from — a placeholder
 * constant once capped this door at one while the banner promised `1 + hqLevel`. **A return does
 * not count**: holding a slot hostage while a beaten column walks back punishes one defeat twice.
 */
export async function claimSlot(
  ctx: MutationCtx,
  playerId: Id<'players'>,
  season: Doc<'seasons'>,
): Promise<void> {
  const hqLevel = await buildingLevel(ctx, playerId, 'hq');
  const maximum = movementSlots(hqLevel);
  const flying = (await movementsOf(ctx, playerId)).filter(
    (movement) => movement.type !== 'return',
  );
  if (flying.length >= maximum) {
    fail('MOVEMENT_IN_FLIGHT', { maximum, hqLevel, ...slotRelief(season, hqLevel) });
  }
}

export async function march(
  ctx: MutationCtx,
  {
    playerId,
    season,
    type,
    origin,
    troopIds,
    aim,
  }: {
    playerId: Id<'players'>;
    /** Read for the format alone — the ladder a headquarters climbs, which is what the refusal
     *  needs to name the level that would buy the next slot. */
    season: Doc<'seasons'>;
    type: 'march' | 'attack' | 'raid' | 'recall';
    origin: MarchOrigin;
    troopIds: ReadonlyArray<Id<'troops'>>;
    aim: Aimed;
  },
) {
  await claimSlot(ctx, playerId, season);

  /** **Where the column stands, and nothing more** (ADR 0019 §1): the origin only has to be the
   *  address the troops hang from, so a garrison abroad is not ordered out of a barracks. */
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

  /** **The refusal comes before the route**: nothing in it reads a trip any more (design sheet
   *  09), so an order the fan should never have offered costs nothing — the whole of ADR 0015. */
  const column = await columnOf(ctx, playerId, troops, departure);
  const refusal = refusalOf(type, aim.aim, column);
  if (refusal !== null) fail(refusal, { type, ...liftOf(column.roles) });

  const route = routeBetween(
    departure.point,
    aim.point,
    routeModeOf(column.roles),
    landCostOf(column.roles),
  );
  if (route === null) fail('NO_LAND_ROUTE', { from: departure.name, to: aim.name });

  const now = Date.now();
  const minutes = await pacedMinutes(ctx, playerId, route, now);
  const arrivesAt = now + minutes * 60_000;
  const movementId = await ctx.db.insert('movements', {
    seasonId: season._id,
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
    landCost: route.landCost,
    troopIds: [...troopIds],
    departedAt: now,
    arrivesAt,
  });
  await ctx.scheduler.runAt(arrivesAt, internal.movements.arrive, { movementId });
  /** The document rather than its parts: the sweep has to read the order exactly as the arrival
   *  will, and the surest way to say that is to hand it the same row. */
  const filed = (await ctx.db.get(movementId))!;
  await scheduleInterception(ctx, filed);
  await fileSightings(ctx, filed);
  return { movementId, minutes, arrivesAt };
}

/**
 * Design sheet 03, and the one road to a duration in the game: the departure and the preview both
 * come through here, so the hour on the card is the hour the movement will be dated at. ADR 0018
 * §3: the relays are read at departure, and a column that has left is not re-examined.
 */
export async function pacedMinutes(
  ctx: QueryCtx,
  playerId: Id<'players'>,
  route: ComputedRoute,
  at: number,
): Promise<number> {
  const relays = (
    await ctx.db
      .query('outposts')
      .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
      .collect()
  )
    .filter((outpost) => outpost.specialization === 'relay')
    .filter((outpost) => outpost.disabledUntil === null || outpost.disabledUntil <= at)
    .map((outpost) => pointOf(outpost.point));

  return routeMinutes(
    relayedCostUnits({
      route,
      relays,
      reachKm: OUTPOST_REACH_KM,
      multiplier: RELAY_SPEED_MULTIPLIER,
    }),
  );
}

const PROJECTION_KEYS: ReadonlySet<BuildingKey> = new Set(Object.values(PROJECTION_BY_DOMAIN));

/**
 * **Where a decoy may set out from.** A march proves its origin by the manifest it names; a decoy
 * names nobody, so the proof has to be made here or not at all. A troop in flight does not hold a
 * place open: a garrison that has marched off is an empty point like any other.
 */
export async function decoyGate(
  ctx: QueryCtx,
  playerId: Id<'players'>,
  departure: Departure,
): Promise<boolean> {
  const station = departure.stationId;
  if (station === null) return false;
  if (typeof station === 'string') {
    const buildingId = ctx.db.normalizeId('buildings', station);
    const building = buildingId === null ? null : await ctx.db.get(buildingId);
    if (building !== null && PROJECTION_KEYS.has(building.key)) return true;
  }
  const marching = new Set<Id<'troops'>>(
    (await movementsOf(ctx, playerId)).flatMap((movement) => movement.troopIds),
  );
  return (
    await ctx.db
      .query('troops')
      .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
      .collect()
  ).some((troop) => sameStation(troop.stationedAt, station) && !marching.has(troop._id));
}
