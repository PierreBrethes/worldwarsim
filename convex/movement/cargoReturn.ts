import { internal } from '../_generated/api';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import type { LonLat } from '../../src/domain/geo';
import type { UnitRole } from '../../src/domain/ids';
import { landCostOf, routeModeOf } from '../../src/domain/movement-orders';
import { heldOver } from '../holding';
import { allRegions, regionFacts } from '../regions';
import { routeToRegions } from '../routes';
import { asPoint } from './forces';
import { pacedMinutes } from './pace';

export type CargoReturnPlan =
  | {
      readonly kind: 'standing';
      readonly regionId: string;
      readonly point: { lon: number; lat: number };
    }
  | {
      readonly kind: 'route';
      readonly regionId: string;
      readonly point: { lon: number; lat: number };
      readonly hostCountry: string;
      readonly points: Array<{ lon: number; lat: number }>;
      readonly legs: Array<{ medium: 'land' | 'sea' | 'air'; distanceUnits: number }>;
      readonly distanceUnits: number;
      readonly costUnits: number;
      readonly landCost: number;
      readonly minutes: number;
    };

/** Choose the first reachable held frontier from the actual cargo point. Nothing stored on an
 * earlier troop address may turn an absent route into a delivery. */
export async function planCargoReturn(
  ctx: MutationCtx,
  {
    seasonId,
    playerId,
    from,
    roles,
    now,
  }: {
    seasonId: Id<'seasons'>;
    playerId: Id<'players'>;
    from: LonLat;
    roles: ReadonlyArray<UnitRole>;
    now: number;
  },
): Promise<CargoReturnPlan | null> {
  const regions = allRegions();
  const held = await heldOver(ctx, seasonId, regions, now);
  const destinations = regions.filter((region) => held.get(region.id) === playerId);
  const planned = routeToRegions(from, destinations, routeModeOf(roles), landCostOf(roles));
  if (planned === null) return null;
  if (planned.kind === 'standing') {
    return { kind: 'standing', regionId: planned.regionId, point: asPoint(planned.point) };
  }
  const region = regionFacts(planned.regionId);
  if (region === null) return null;
  return {
    kind: 'route',
    regionId: planned.regionId,
    point: asPoint(planned.point),
    hostCountry: region.country,
    points: planned.route.points.map(asPoint),
    legs: planned.route.legs.map((leg) => ({ ...leg })),
    distanceUnits: planned.route.distanceUnits,
    costUnits: planned.route.costUnits,
    landCost: planned.route.landCost,
    minutes: await pacedMinutes(ctx, playerId, planned.route, now),
  };
}

export function canFollowCargoReturnPlan(
  plan: CargoReturnPlan,
  roles: ReadonlyArray<UnitRole>,
): boolean {
  if (plan.kind === 'standing') return true;
  const mode = routeModeOf(roles);
  return plan.legs.every(({ medium }) => {
    if (medium === 'air') return mode === 'air';
    if (medium === 'sea') return mode === 'naval' || mode === 'combined';
    return mode === 'land' || mode === 'combined';
  });
}

/** File the one physical return shape consumed by `completeLootDelivery`, regardless of whether
 * its loads came from the original expedition or a later recovery. */
export async function startCargoReturn(
  ctx: MutationCtx,
  {
    seasonId,
    playerId,
    from,
    troopIds,
    plan,
    cargoFields,
    now,
  }: {
    seasonId: Id<'seasons'>;
    playerId: Id<'players'>;
    from: LonLat;
    troopIds: ReadonlyArray<Id<'troops'>>;
    plan: Extract<CargoReturnPlan, { kind: 'route' }>;
    cargoFields: Partial<Pick<Doc<'movements'>, 'loot' | 'lootLoads' | 'plunderReportId'>>;
    now: number;
  },
): Promise<Id<'movements'>> {
  const arrivesAt = now + plan.minutes * 60_000;
  const movementId = await ctx.db.insert('movements', {
    seasonId,
    playerId,
    type: 'return',
    fromBuildingId: null,
    target: { kind: 'point', point: plan.point },
    from: asPoint(from),
    to: plan.point,
    hostCountry: plan.hostCountry,
    points: [...plan.points],
    legs: [...plan.legs],
    distanceUnits: plan.distanceUnits,
    costUnits: plan.costUnits,
    landCost: plan.landCost,
    troopIds: [...troopIds],
    departedAt: now,
    arrivesAt,
    lootDelivery: { regionId: plan.regionId, point: plan.point },
    ...cargoFields,
  });
  /** Le plein de Bakou se recompte depuis l'arrivée du retour. */
  for (const troopId of troopIds) await ctx.db.patch(troopId, { fuelAt: arrivesAt });
  await ctx.scheduler.runAt(arrivesAt, internal.movements.arrive, { movementId });
  return movementId;
}
