import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
import { emptyStocks } from '../src/domain/economy';
import { RESOURCES, canonicalBuildingKey } from '../src/domain/ids';
import { carryCapacityOf, lootFromSurplus, type ResourceAmounts } from '../src/domain/loot';
import { landCostOf, routeModeOf } from '../src/domain/movement-orders';
import {
  BASE_CAP,
  CARRY_CAPACITY_BY_ROLE,
  PLUNDER_DISABLED_HOURS,
  PLUNDER_HOURS_PRESENT,
} from './constants';
import { resolveContact } from './combat';
import { heldOver } from './holding';
import { plunderTargetAt } from './movement/orders';
import { defenceOf, pointOf, troopsCarriedBy } from './movement/forces';
import { asPoint } from './movement/forces';
import { forgetMovement, walkHome } from './movement/arrival';
import { pacedMinutes } from './movement/orders';
import { clipToStorage, creditToStorage, debit, economyOf } from './resources';
import { scheduleRestore, settleBeforeChange } from './production';
import { allRegions, regionFacts } from './regions';
import { routeToRegions } from './routes';
import { isRouteEntryPoint } from './region-geometry';
import { seasonStillPlays } from './seasons';
import { addPlunderLoss, stationLoot } from './cargo';

const targetAt = async (
  ctx: MutationCtx,
  movement: Doc<'movements'>,
  now: number,
): Promise<Doc<'buildings'> | null> => {
  const buildingId = movement.plunder?.buildingId;
  if (buildingId === undefined) return null;
  const player = await ctx.db.get(movement.playerId);
  return player === null ? null : plunderTargetAt(ctx, player, buildingId, now);
};

const returnEmpty = async (
  ctx: MutationCtx,
  movement: Doc<'movements'>,
  troops: ReadonlyArray<Doc<'troops'>>,
  now: number,
) => {
  await walkHome(ctx, { winners: troops, beaten: [] }, pointOf(movement.to), now);
  await forgetMovement(ctx, movement._id);
};

async function startPresence(
  ctx: MutationCtx,
  movement: Doc<'movements'>,
  troops: ReadonlyArray<Doc<'troops'>>,
  now: number,
  engagementId: Id<'engagements'> | null,
): Promise<void> {
  const until = now + PLUNDER_HOURS_PRESENT * 3_600_000;
  const returnPlan = await planReturn(ctx, movement, troops, now);
  await ctx.db.patch(movement._id, {
    troopIds: troops.map((troop) => troop._id),
    from: movement.to,
    points: [movement.to],
    legs: [],
    distanceUnits: 0,
    costUnits: 0,
    departedAt: now,
    arrivesAt: until,
    plunder: {
      phase: 'presence',
      buildingId: movement.plunder!.buildingId,
      until,
      engagementId,
      returnRegionId: returnPlan?.regionId ?? null,
      returnPlan,
    },
  });
  await ctx.scheduler.runAt(until, internal.movements.completePlunderPresence, {
    movementId: movement._id,
    expectedAt: until,
  });
}

type PresenceMission = Extract<NonNullable<Doc<'movements'>['plunder']>, { phase: 'presence' }>;
type ReturnPlan = NonNullable<PresenceMission['returnPlan']>;

async function planReturn(
  ctx: MutationCtx,
  movement: Doc<'movements'>,
  troops: ReadonlyArray<Doc<'troops'>>,
  now: number,
): Promise<ReturnPlan | null> {
  const regions = allRegions();
  const held = await heldOver(ctx, movement.seasonId, regions, now);
  const destinations = regions.filter((region) => held.get(region.id) === movement.playerId);
  const roles = troops.map((troop) => troop.role);
  const planned = routeToRegions(
    pointOf(movement.to),
    destinations,
    routeModeOf(roles),
    landCostOf(roles),
  );
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
    minutes: await pacedMinutes(ctx, movement.playerId, planned.route, now),
  };
}

async function plannedReturnStillHeld(
  ctx: MutationCtx,
  movement: Doc<'movements'>,
  now: number,
): Promise<boolean | null> {
  const regionId =
    movement.plunder?.phase === 'presence' && movement.plunder.returnPlan != null
      ? movement.plunder.returnPlan.regionId
      : movement.plunder?.returnRegionId;
  if (regionId === undefined || regionId === null) return null;
  const region = regionFacts(regionId);
  if (region === null) return null;
  return (
    (await heldOver(ctx, movement.seasonId, [region], now)).get(regionId) === movement.playerId
  );
}

async function standAtTarget(
  ctx: MutationCtx,
  troops: ReadonlyArray<Doc<'troops'>>,
  movement: Doc<'movements'>,
): Promise<void> {
  for (const troop of troops) await ctx.db.patch(troop._id, { stationedAt: movement.to });
}

async function keepLootAtTarget(
  ctx: MutationCtx,
  movement: Doc<'movements'>,
  troops: ReadonlyArray<Doc<'troops'>>,
  loot: ResourceAmounts,
  reportId: Id<'plunderReports'>,
): Promise<void> {
  await standAtTarget(ctx, troops, movement);
  await stationLoot(ctx, {
    seasonId: movement.seasonId,
    playerId: movement.playerId,
    troopIds: troops.map((troop) => troop._id),
    stationedAt: movement.to,
    loot,
    plunderReportId: reportId,
  });
}

function canFollowPlan(plan: ReturnPlan, troops: ReadonlyArray<Doc<'troops'>>): boolean {
  if (plan.kind === 'standing') return true;
  const mode = routeModeOf(troops.map((troop) => troop.role));
  return plan.legs.every(({ medium }) => {
    if (medium === 'air') return mode === 'air';
    if (medium === 'sea') return mode === 'naval' || mode === 'combined';
    return mode === 'land' || mode === 'combined';
  });
}

async function startPlannedReturn(
  ctx: MutationCtx,
  movement: Doc<'movements'>,
  troops: ReadonlyArray<Doc<'troops'>>,
  plan: Extract<ReturnPlan, { kind: 'route' }>,
  loot: ResourceAmounts,
  reportId: Id<'plunderReports'>,
  now: number,
): Promise<Id<'movements'>> {
  const arrivesAt = now + plan.minutes * 60_000;
  const movementId = await ctx.db.insert('movements', {
    seasonId: movement.seasonId,
    playerId: movement.playerId,
    type: 'return',
    fromBuildingId: null,
    target: { kind: 'point', point: plan.point },
    from: movement.to,
    to: plan.point,
    hostCountry: plan.hostCountry,
    points: plan.points,
    legs: plan.legs,
    distanceUnits: plan.distanceUnits,
    costUnits: plan.costUnits,
    landCost: plan.landCost,
    troopIds: troops.map((troop) => troop._id),
    departedAt: now,
    arrivesAt,
    loot,
    lootDelivery: { regionId: plan.regionId, point: plan.point },
    plunderReportId: reportId,
  });
  await ctx.scheduler.runAt(arrivesAt, internal.movements.arrive, { movementId });
  return movementId;
}

export async function arriveForPlunder(
  ctx: MutationCtx,
  movement: Doc<'movements'>,
  now: number,
): Promise<void> {
  if (movement.plunder?.phase !== 'outbound') return;
  const target = await targetAt(ctx, movement, now);
  const troops = await troopsCarriedBy(ctx, movement);
  if (target === null || !troops.some((troop) => troop.role === 'infantry')) {
    await returnEmpty(ctx, movement, troops, now);
    return;
  }

  const defence = await defenceOf(ctx, movement);
  if (defence !== null) {
    const { engagementId, engagement, routed, routedCargo } = await resolveContact(ctx, {
      seasonId: movement.seasonId,
      attacker: { playerId: movement.playerId, troops },
      defender: { playerId: defence.playerId, troops: defence.troops },
      cause: 'arrival',
      point: movement.to,
      hostCountry: movement.hostCountry,
      outpostId: defence.outpostId,
      disabledUntil: null,
      at: now,
    });
    void engagementId;
    const stateOf = new Map(engagement.outcomes.map((outcome) => [outcome.id, outcome.state]));
    const standing = troops.filter((troop) => stateOf.get(troop._id) === 'standing');
    if (engagement.winner === 'attacker' && standing.some((troop) => troop.role === 'infantry')) {
      await walkHome(ctx, { winners: [], beaten: routed }, pointOf(movement.to), now, routedCargo);
      await startPresence(ctx, movement, standing, now, engagementId);
      return;
    }
    const survivors = troops.filter((troop) => stateOf.get(troop._id) !== 'destroyed');
    await walkHome(
      ctx,
      { winners: survivors, beaten: routed },
      pointOf(movement.to),
      now,
      routedCargo,
    );
    await forgetMovement(ctx, movement._id);
    return;
  }

  await startPresence(ctx, movement, troops, now, null);
}

export async function completePresence(
  ctx: MutationCtx,
  movement: Doc<'movements'>,
  expectedAt: number,
): Promise<void> {
  if (
    movement.plunder?.phase !== 'presence' ||
    movement.plunder.until !== expectedAt ||
    !(await seasonStillPlays(ctx, movement.playerId))
  ) {
    return;
  }

  const now = expectedAt;
  const troops = await troopsCarriedBy(ctx, movement);
  const target = await targetAt(ctx, movement, now);
  if (target === null || !troops.some((troop) => troop.role === 'infantry')) {
    await returnEmpty(ctx, movement, troops, now);
    return;
  }

  await settleBeforeChange(ctx, movement.seasonId, now);
  const isWarehouse = canonicalBuildingKey(target.key) === 'warehouse';
  const taken = isWarehouse
    ? lootFromSurplus(
        (await economyOf(ctx, target.playerId, now)).stocks,
        BASE_CAP,
        carryCapacityOf(
          troops.map((troop) => ({
            role: troop.role,
            strength: troop.currentStrength,
            nominalStrength: troop.nominalStrength,
          })),
          CARRY_CAPACITY_BY_ROLE,
        ),
      )
    : emptyStocks();
  if (isWarehouse) await debit(ctx, target.playerId, taken, now);

  const disabledUntil = now + PLUNDER_DISABLED_HOURS * 3_600_000;
  await ctx.db.patch(target._id, { disabledUntil });
  const storageLost = isWarehouse ? await clipToStorage(ctx, target.playerId, now) : emptyStocks();
  const reportId = await ctx.db.insert('plunderReports', {
    seasonId: movement.seasonId,
    attackerId: movement.playerId,
    defenderId: target.playerId,
    buildingId: target._id,
    building: target.key,
    regionId: target.regionId,
    hostCountry: regionFacts(target.regionId)?.country ?? movement.hostCountry,
    at: now,
    disabledUntil,
    engagementId: movement.plunder.engagementId,
    taken,
    storageLost,
  });
  if (isWarehouse) {
    if ((await plannedReturnStillHeld(ctx, movement, now)) === false) {
      await standAtTarget(ctx, troops, movement);
      await ctx.db.patch(reportId, { delivered: emptyStocks(), lost: taken });
    } else if (movement.plunder.returnPlan === undefined) {
      /** Pre-S6a-2b presence: keep its old homeward behavior, but never infer a delivery. */
      const [returnMovementId] = await walkHome(
        ctx,
        { winners: troops, beaten: [] },
        pointOf(movement.to),
        now,
        [
          {
            playerId: movement.playerId,
            troopIds: troops.map((troop) => troop._id),
            loot: taken,
            plunderReportId: reportId,
          },
        ],
      );
      if (returnMovementId !== undefined) await ctx.db.patch(reportId, { returnMovementId });
    } else if (
      movement.plunder.returnPlan === null ||
      !canFollowPlan(movement.plunder.returnPlan, troops)
    ) {
      await keepLootAtTarget(ctx, movement, troops, taken, reportId);
    } else if (movement.plunder.returnPlan.kind === 'standing') {
      await standAtTarget(ctx, troops, movement);
      const result = await creditToStorage(ctx, movement.playerId, taken, now);
      await ctx.db.patch(reportId, result);
    } else {
      const returnMovementId = await startPlannedReturn(
        ctx,
        movement,
        troops,
        movement.plunder.returnPlan,
        taken,
        reportId,
        now,
      );
      await ctx.db.patch(reportId, { returnMovementId });
    }
  } else {
    await walkHome(ctx, { winners: troops, beaten: [] }, pointOf(movement.to), now);
  }
  await forgetMovement(ctx, movement._id);
  await scheduleRestore(ctx, movement.seasonId, disabledUntil);
}

/** New stamped returns deliver or lose their cargo once; false leaves legacy-safe preservation. */
export async function completeLootDelivery(
  ctx: MutationCtx,
  movement: Doc<'movements'>,
  now: number,
): Promise<boolean> {
  const stamp = movement.lootDelivery;
  const loot = movement.loot;
  const reportId = movement.plunderReportId;
  if (stamp === undefined || loot === undefined || reportId === undefined) return false;

  const current = await ctx.db.get(movement._id);
  if (current === null || current.loot === undefined) return true;
  const report = await ctx.db.get(reportId);
  if (
    report === null ||
    report.attackerId !== movement.playerId ||
    report.seasonId !== movement.seasonId ||
    stamp.point.lon !== movement.to.lon ||
    stamp.point.lat !== movement.to.lat ||
    !isRouteEntryPoint(pointOf(stamp.point), stamp.regionId)
  ) {
    return false;
  }

  const region = regionFacts(stamp.regionId);
  const stillHeld =
    region !== null &&
    (await heldOver(ctx, movement.seasonId, [region], now)).get(region.id) === movement.playerId;
  if (!stillHeld) {
    await addPlunderLoss(ctx, reportId, loot);
    await ctx.db.patch(reportId, {
      delivered: report.delivered ?? emptyStocks(),
    });
    await ctx.db.patch(movement._id, { loot: undefined });
    return true;
  }

  const result = await creditToStorage(ctx, movement.playerId, loot, now);
  const latest = await ctx.db.get(reportId);
  const delivered = latest?.delivered ?? emptyStocks();
  await addPlunderLoss(ctx, reportId, result.lost);
  await ctx.db.patch(reportId, {
    delivered: Object.fromEntries(
      RESOURCES.map((key) => [key, delivered[key] + result.delivered[key]]),
    ) as Record<(typeof RESOURCES)[number], number>,
  });
  await ctx.db.patch(movement._id, { loot: undefined });
  return true;
}
