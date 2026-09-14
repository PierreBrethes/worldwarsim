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
import {
  isPlunderTarget,
  plunderOrderRefusalOf,
  movementSlots,
  refusalDetails,
  refusalOf,
  landCostOf,
  routeModeOf,
  type Column,
  type MovementAim,
} from '../../src/domain/movement-orders';
import { carriesSurveyedInstallation } from '../../src/domain/objectives';
import { relayedCostUnits } from '../../src/domain/route-timing';
import type { ComputedRoute } from '../../src/domain/routing';
import { buildingLevel } from '../buildings';
import {
  MAX_HQ_LEVEL,
  RELAY_SPEED_MULTIPLIER,
  detectionRangeOf,
  outpostReachKm,
  routeMinutes,
} from '../constants';
import { fail } from '../errors';
import { movementCargoFields, takeStationedCargo } from '../cargo';
import { regionAtRoutePoint } from '../regionGeometry';
import { pointOfBuilding, regionFacts } from '../regions';
import { coastAtPoint, hostAtPoint, landAtPoint, routeBetween } from '../routes';
import { surveyFromPoint } from '../surveys';
import { reassessDetection } from './detection';
import { asPoint, movementsOf, outpostsOf, pointOf, type TroopAddress } from './forces';

/** ADR 0019 §1: a building, the outpost a column garrisons, or the plain point it was left
 *  standing on. Exactly one of the three, never two, never none. */
export type MarchOrigin =
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
  /**
   * **Read off the point, once, here, on the routing grid** — the very cell `onLand` was read on
   * when the point was aimed at. It used to be read off the polygon (`hostAtPoint === ''`), and
   * the two disagree on every coastal strip narrower than half a cell: land for the polygon, sea
   * for the grid. A hull sent there was accepted — the target is not on land — and never left,
   * asked for a quay on water. One geometry per question, and this question is the grid's.
   * A building and an outpost stand on ground by construction.
   */
  readonly afloat: boolean;
  /**
   * **La plage d'où une coque repart** (ADR 0019 §2, révision du 04/09). Une colonne débarquée
   * se tient sur un point de côte : elle y est arrivée par la mer, et lui réclamer un quai
   * l'échouerait là pour la saison. Un bâtiment porte déjà sa porte, un avant-poste n'embarque
   * pas — `false` pour les deux, et ce n'est pas un trou.
   */
  readonly coastal: boolean;
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
      afloat: false,
      coastal: false,
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
      afloat: !landAtPoint(point),
      coastal: coastAtPoint(point),
    };
  }
  const building = await ctx.db.get(origin.buildingId);
  if (!building || building.playerId !== playerId) return null;
  const region = regionFacts(building.regionId);
  const stand = pointOfBuilding(building);
  if (!region || stand === null) return null;
  return {
    point: stand,
    name: region.name,
    regionId: building.regionId,
    stationId: building._id,
    fromBuildingId: building._id,
    afloat: false,
    coastal: false,
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
export type Aimed = {
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

/**
 * Resolve only an expedition target frozen in this observer's survey. Every truth check keeps
 * the same opaque refusal; arrival uses the narrower revalidation below without serving it.
 */
export async function surveyedPlunderTarget(
  ctx: QueryCtx,
  player: Doc<'players'>,
  buildingId: Id<'buildings'>,
): Promise<Doc<'buildings'>> {
  const building = await revalidatePlunderTarget(ctx, player, buildingId);
  const survey = await ctx.db
    .query('regionSightings')
    .withIndex('byPlayerRegion', (q) =>
      q.eq('playerId', player._id).eq('regionId', building.regionId),
    )
    .unique();
  if (!(survey?.installations ?? []).some((seen) => seen.buildingId === buildingId)) {
    fail('UNKNOWN_BUILDING');
  }
  return building;
}

/** A surveyed enemy installation is an aim only for plunder; normal building aims stay mine. */
export async function surveyedPlunderAim(
  ctx: QueryCtx,
  player: Doc<'players'>,
  buildingId: Id<'buildings'>,
): Promise<Aimed> {
  const building = await surveyedPlunderTarget(ctx, player, buildingId);
  const region = regionFacts(building.regionId);
  const point = pointOfBuilding(building);
  if (region === null || point === null) fail('UNKNOWN_BUILDING');
  return {
    aim: { kind: 'building', buildingId: building._id, key: building.key },
    target: { kind: 'building', buildingId: building._id },
    point,
    name: region.name,
    host: region.country,
  };
}

/** Arrival revalidation is internal state handling: it never returns a reason or a target view. */
export async function revalidatePlunderTarget(
  ctx: QueryCtx,
  player: Doc<'players'>,
  buildingId: Id<'buildings'>,
  at = Date.now(),
): Promise<Doc<'buildings'>> {
  const building = await plunderTargetAt(ctx, player, buildingId, at);
  if (building === null) fail('UNKNOWN_BUILDING');
  return building;
}

/** One truth gate for filing, arrival and take. The opaque wrappers decide only whether the
 * caller needs an error or a no-op return. */
export async function plunderTargetAt(
  ctx: QueryCtx,
  player: Doc<'players'>,
  buildingId: Id<'buildings'>,
  at: number,
): Promise<Doc<'buildings'> | null> {
  const building = await ctx.db.get(buildingId);
  if (
    building === null ||
    building.seasonId !== player.seasonId ||
    building.playerId === player._id ||
    !isPlunderTarget(building.key) ||
    (building.disabledUntil !== undefined && building.disabledUntil >= at)
  ) {
    return null;
  }

  return building;
}

/**
 * **Ce que le relevé de ce joueur-là porte dans cette région** (ADR 0024 §4). La même question que
 * la rose pose à `view.surveyedInstallations`, posée ici sur la table qui la sert — et tranchée
 * par la même fonction pure des deux côtés du fil (`carriesSurveyedInstallation`).
 */
async function surveyedIn(
  ctx: QueryCtx,
  playerId: Id<'players'>,
  regionId: string | null,
): Promise<boolean> {
  if (regionId === null) return false;
  const survey = await ctx.db
    .query('regionSightings')
    .withIndex('byPlayerRegion', (q) => q.eq('playerId', playerId).eq('regionId', regionId))
    .unique();
  /** Le relevé range ses installations sous la région de sa ligne ; la vue les sert à plat, une
   *  par région. C'est la même liste des deux côtés, à la forme près. */
  return carriesSurveyedInstallation(
    regionId,
    (survey?.installations ?? []).map(() => ({ regionId })),
  );
}

/** Ce qu'un ordre peut nommer sur le fil. Le camp n'est pas une cible **stockée** : il se résout
 *  en sa position, et c'est cette position que le document garde (ADR 0024 §4). */
export type AimTarget =
  | (Doc<'movements'>['target'] & { kind: 'region' | 'outpost' | 'point' | 'building' })
  | { readonly kind: 'camp'; readonly campId: Id<'campSightings'> };

export async function aimOf(
  ctx: QueryCtx,
  /** Read for one target only: a building is aimed at by its owner and by nobody else. */
  playerId: Id<'players'>,
  target: AimTarget,
): Promise<Aimed> {
  /** **A point is kept as it was aimed** (ADR 0019 §1): nothing looks up what stands there. Only
   *  the country is read off it, because the rest window is owed to whoever owns the ground. */
  if (target.kind === 'point') {
    const point = pointOf(target.point);
    const country = hostAtPoint(point);
    return {
      aim: {
        kind: 'point',
        lon: point[0],
        lat: point[1],
        coastal: coastAtPoint(point),
        onLand: landAtPoint(point),
        surveyed: await surveyedIn(ctx, playerId, regionAtRoutePoint(point)),
      },
      target: { kind: 'point', point: target.point },
      point,
      name: country,
      host: country,
    };
  }
  /**
   * **Un camp relevé se résout en sa position, et rien d'autre** (ADR 0024 §4). C'est le relevé
   * du joueur qui répond — jamais la pile vraie : elle peut avoir levé le camp, et c'est le
   * sujet. Le relevé d'un autre joueur n'existe pas pour celui-ci, et un camp qu'on n'a pas
   * relevé se refuse du mot d'un point vide.
   */
  if (target.kind === 'camp') {
    const camp = await ctx.db.get(target.campId);
    if (camp === null || camp.playerId !== playerId) fail('NOTHING_TO_ATTACK');
    const point = pointOf(camp.point);
    const country = hostAtPoint(point);
    return {
      aim: {
        kind: 'camp',
        campId: camp._id,
        lon: point[0],
        lat: point[1],
        hostCountry: country,
      },
      target: { kind: 'point', point: camp.point },
      point,
      name: country,
      host: country,
    };
  }
  if (target.kind === 'outpost') {
    const outpost = await ctx.db.get(target.outpostId);
    if (!outpost) fail('UNKNOWN_OUTPOST', { outpostId: target.outpostId });
    const anchor = pointOf(outpost.point);
    return {
      aim: {
        kind: 'outpost',
        outpostId: outpost._id,
        hostCountry: outpost.hostCountry,
        coastal: coastAtPoint(anchor),
      },
      target: { kind: 'outpost', outpostId: outpost._id },
      point: anchor,
      name: outpost.hostCountry,
      host: outpost.hostCountry,
    };
  }
  /**
   * **One enters one's own buildings and nobody else's** (decision 64b). Somebody else's is
   * answered exactly as a building that does not exist — the same word the departure uses for
   * it — because saying « pas à vous » would confirm that something stands there (ADR 0005).
   * The point is the region's, the only coordinate a building has (`stanceOf`).
   */
  if (target.kind === 'building') {
    const building = await ctx.db.get(target.buildingId);
    if (!building || building.playerId !== playerId) fail('UNKNOWN_BUILDING');
    const region = regionFacts(building.regionId);
    const stand = pointOfBuilding(building);
    if (!region || stand === null) fail('UNKNOWN_REGION', { regionId: building.regionId });
    return {
      aim: { kind: 'building', buildingId: building._id, key: building.key },
      target: { kind: 'building', buildingId: building._id },
      point: stand,
      name: region.name,
      host: region.country,
    };
  }
  const region = regionFacts(target.regionId);
  if (!region) fail('UNKNOWN_REGION', { regionId: target.regionId });
  return {
    aim: {
      kind: 'region',
      regionId: region.id,
      country: region.country,
      surveyed: await surveyedIn(ctx, playerId, region.id),
    },
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
    afloat: departure.afloat,
    coastal: departure.coastal,
  };
}

/** Same shape and reason as `capReliefOf`: "montez le QG" is advice, "un quartier général niveau
 *  3 les porte à 4" is a plan. Both numbers come out of `movementSlots`, never recopied. */
const slotRelief = (hqLevel: number) =>
  hqLevel >= MAX_HQ_LEVEL
    ? {}
    : { nextHqLevel: hqLevel + 1, nextSlots: movementSlots(hqLevel + 1) };

/**
 * ADR 0006, carried by the headquarters since ADR 0015 dissolved the logistics centre. The count
 * comes from `movementSlots`, the very function `view.ts` fills the banner from — a placeholder
 * constant once capped this door at one while the banner promised `1 + hqLevel`. **A return does
 * not count**: holding a slot hostage while a beaten column walks back punishes one defeat twice.
 */
export async function claimSlot(ctx: MutationCtx, playerId: Id<'players'>): Promise<void> {
  const hqLevel = await buildingLevel(ctx, playerId, 'hq');
  const maximum = movementSlots(hqLevel);
  const flying = (await movementsOf(ctx, playerId)).filter(
    (movement) => movement.type !== 'return',
  );
  if (flying.length >= maximum) {
    fail('MOVEMENT_IN_FLIGHT', { maximum, hqLevel, ...slotRelief(hqLevel) });
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
    plunder,
  }: {
    playerId: Id<'players'>;
    /** Read for its id alone: a movement is filed under the season it flies in. */
    season: Doc<'seasons'>;
    type: 'march' | 'attack' | 'raid';
    origin: MarchOrigin;
    troopIds: ReadonlyArray<Id<'troops'>>;
    aim: Aimed;
    plunder?: { readonly buildingId: Id<'buildings'> };
  },
) {
  await claimSlot(ctx, playerId);

  /** **Where the column stands, and nothing more** (ADR 0019 §1): the origin only has to be the
   *  address the troops hang from, so a garrison abroad is not ordered out of a barracks. */
  const departure = await departureOf(ctx, playerId, origin);
  if (departure === null) {
    if (origin.kind === 'outpost') fail('UNKNOWN_OUTPOST', { outpostId: origin.outpostId });
    fail('UNKNOWN_BUILDING');
  }

  const troops: Array<Doc<'troops'>> = [];
  const marching = new Set(
    (await movementsOf(ctx, playerId)).flatMap((movement) => movement.troopIds),
  );
  for (const troopId of troopIds) {
    const troop = await ctx.db.get(troopId);
    if (!troop || troop.playerId !== playerId) fail('UNKNOWN_TROOP', { troopId });
    if (!sameStation(troop.stationedAt, departure.stationId) || marching.has(troopId)) {
      fail('TROOP_NOT_AT_ORIGIN', { troopId });
    }
    troops.push(troop);
  }

  /** **The refusal comes before the route**: nothing in it reads a trip any more (design sheet
   *  09), so an order the fan should never have offered costs nothing — the whole of ADR 0015. */
  const column = await columnOf(ctx, playerId, troops, departure);
  const refusal =
    plunder === undefined
      ? refusalOf(type, aim.aim, column)
      : plunderOrderRefusalOf(aim.aim as Extract<MovementAim, { kind: 'building' }>, column, false);
  if (refusal !== null) fail(refusal, { type, ...refusalDetails(aim.aim, column) });

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
  const cargo = await takeStationedCargo(ctx, {
    seasonId: season._id,
    playerId,
    stationedAt: departure.stationId,
    troops,
  });
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
    ...(plunder === undefined
      ? {}
      : { plunder: { phase: 'outbound' as const, buildingId: plunder.buildingId } }),
    ...movementCargoFields(cargo),
  });
  await ctx.scheduler.runAt(arrivesAt, internal.movements.arrive, { movementId });
  /** The document rather than its parts: the sweep has to read the order exactly as the arrival
   *  will, and the surest way to say that is to hand it the same row. */
  const filed = (await ctx.db.get(movementId))!;
  await reassessDetection(ctx, filed.seasonId, now);
  /** **Le départ est un point d'échantillonnage** (ADR 0020 §5), et le seul du trajet qui tombe
   *  maintenant : le couloir se relève à l'arrivée, quand il aura été marché. */
  await surveyFromPoint(ctx, playerId, departure.point, now, detectionRangeOf(column.roles));
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
    .map((outpost) => ({
      point: pointOf(outpost.point),
      reachKm: outpostReachKm(outpost.level),
    }));

  return routeMinutes(relayedCostUnits({ route, relays, multiplier: RELAY_SPEED_MULTIPLIER }));
}
