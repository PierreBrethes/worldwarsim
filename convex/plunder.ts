import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
import { emptyStocks } from '../src/domain/economy';
import { canonicalBuildingKey, RESOURCES } from '../src/domain/ids';
import { carryCapacityOf, lootFromSurplus } from '../src/domain/loot';
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
import {
  cargoTotal,
  movementCargoFields,
  movementCargoLoads,
  recordCargoDelivery,
  stationCargoLoads,
  takeMovementCargo,
} from './cargo';

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
  const loads = movementCargoLoads(movement);
  await walkHome(
    ctx,
    { winners: troops, beaten: [] },
    pointOf(movement.to),
    now,
    loads.length === 0 ? [] : [{ playerId: movement.playerId, troopIds: movement.troopIds, loads }],
  );
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
  loads: ReadonlyArray<ReturnType<typeof movementCargoLoads>[number]>,
): Promise<void> {
  await standAtTarget(ctx, troops, movement);
  await stationCargoLoads(ctx, {
    seasonId: movement.seasonId,
    playerId: movement.playerId,
    troopIds: troops.map((troop) => troop._id),
    stationedAt: movement.to,
    loads,
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
  loads: ReadonlyArray<ReturnType<typeof movementCargoLoads>[number]>,
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
    lootDelivery: { regionId: plan.regionId, point: plan.point },
    ...movementCargoFields(loads),
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
  const existingLoads = movementCargoLoads(movement);
  const existingAmounts = cargoTotal(existingLoads);
  const existingCargo = RESOURCES.reduce((sum, key) => sum + existingAmounts[key], 0);
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
        ) - Math.max(0, existingCargo),
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
    const takenLoad = { loot: taken, plunderReportId: reportId };
    const allLoads = [...existingLoads, takenLoad];
    if ((await plannedReturnStillHeld(ctx, movement, now)) === false) {
      await standAtTarget(ctx, troops, movement);
      await stationCargoLoads(ctx, {
        seasonId: movement.seasonId,
        playerId: movement.playerId,
        troopIds: troops.map((troop) => troop._id),
        stationedAt: movement.to,
        loads: existingLoads,
      });
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
            loads: allLoads,
          },
        ],
      );
      if (returnMovementId !== undefined) await ctx.db.patch(reportId, { returnMovementId });
    } else if (
      movement.plunder.returnPlan === null ||
      !canFollowPlan(movement.plunder.returnPlan, troops)
    ) {
      await keepLootAtTarget(ctx, movement, troops, allLoads);
    } else if (movement.plunder.returnPlan.kind === 'standing') {
      await standAtTarget(ctx, troops, movement);
      const result = await creditToStorage(ctx, movement.playerId, cargoTotal(allLoads), now);
      await recordCargoDelivery(ctx, allLoads, result.delivered, result.lost);
    } else {
      const returnMovementId = await startPlannedReturn(
        ctx,
        movement,
        troops,
        movement.plunder.returnPlan,
        allLoads,
        now,
      );
      await ctx.db.patch(reportId, { returnMovementId });
    }
  } else {
    await walkHome(
      ctx,
      { winners: troops, beaten: [] },
      pointOf(movement.to),
      now,
      existingLoads.length === 0
        ? []
        : [{ playerId: movement.playerId, troopIds: movement.troopIds, loads: existingLoads }],
    );
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
  const loads = movementCargoLoads(movement);
  if (stamp === undefined || loads.length === 0) return false;

  const current = await ctx.db.get(movement._id);
  if (current === null || movementCargoLoads(current).length === 0) return true;
  const reports = await Promise.all(
    loads.map((load) =>
      load.plunderReportId === undefined ? null : ctx.db.get(load.plunderReportId),
    ),
  );
  const recoveries = await Promise.all(
    loads.map((load) => (load.recoveryId === undefined ? null : ctx.db.get(load.recoveryId))),
  );
  if (
    reports.some(
      (report) =>
        report !== null &&
        (report.attackerId !== movement.playerId || report.seasonId !== movement.seasonId),
    ) ||
    reports.some(
      (report, index) => loads[index]!.plunderReportId !== undefined && report === null,
    ) ||
    recoveries.some(
      (recovery) =>
        recovery !== null &&
        (recovery.recoveringPlayerId !== movement.playerId ||
          recovery.seasonId !== movement.seasonId),
    ) ||
    recoveries.some(
      (recovery, index) => loads[index]!.recoveryId !== undefined && recovery === null,
    ) ||
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
    await recordCargoDelivery(ctx, loads, emptyStocks(), cargoTotal(loads));
    await takeMovementCargo(ctx, current);
    return true;
  }

  const result = await creditToStorage(ctx, movement.playerId, cargoTotal(loads), now);
  await recordCargoDelivery(ctx, loads, result.delivered, result.lost);
  await takeMovementCargo(ctx, current);
  return true;
}
