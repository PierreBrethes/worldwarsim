import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
import { RESOURCES, type ResourceKey } from '../src/domain/ids';
import { carryCapacityOf, trimLootToCapacity, type ResourceAmounts } from '../src/domain/loot';
import { CARRY_CAPACITY_BY_ROLE } from './constants';
import type { TroopAddress } from './movement/forces';

type StationedLoad = {
  readonly seasonId: Id<'seasons'>;
  readonly playerId: Id<'players'>;
  readonly troopIds: ReadonlyArray<Id<'troops'>>;
  readonly stationedAt: TroopAddress;
  readonly loot: ResourceAmounts;
  readonly plunderReportId?: Id<'plunderReports'>;
};

export type HomewardCargo = {
  readonly playerId: Id<'players'>;
  readonly troopIds: ReadonlyArray<Id<'troops'>>;
  readonly loot: ResourceAmounts;
  readonly plunderReportId?: Id<'plunderReports'>;
};

export type CombatCargoSnapshot =
  | {
      readonly kind: 'movement';
      readonly sourceId: Id<'movements'>;
      readonly playerId: Id<'players'>;
      readonly troopIds: ReadonlyArray<Id<'troops'>>;
      readonly loot: ResourceAmounts;
      readonly plunderReportId?: Id<'plunderReports'>;
    }
  | {
      readonly kind: 'stationed';
      readonly sourceId: Id<'stationedLoot'>;
      readonly playerId: Id<'players'>;
      readonly troopIds: ReadonlyArray<Id<'troops'>>;
      readonly loot: ResourceAmounts;
      readonly plunderReportId?: Id<'plunderReports'>;
    };

const addAmounts = (left: ResourceAmounts, right: ResourceAmounts): Record<ResourceKey, number> =>
  Object.fromEntries(RESOURCES.map((key) => [key, left[key] + right[key]])) as Record<
    ResourceKey,
    number
  >;

const difference = (before: ResourceAmounts, after: ResourceAmounts): Record<ResourceKey, number> =>
  Object.fromEntries(
    RESOURCES.map((key) => [key, Math.max(0, before[key] - after[key])]),
  ) as Record<ResourceKey, number>;

const hasLoot = (loot: ResourceAmounts): boolean => RESOURCES.some((key) => loot[key] > 0);
const sameAmounts = (left: ResourceAmounts, right: ResourceAmounts): boolean =>
  RESOURCES.every((key) => left[key] === right[key]);

export async function addPlunderLoss(
  ctx: MutationCtx,
  reportId: Id<'plunderReports'> | undefined,
  lost: ResourceAmounts,
): Promise<void> {
  if (reportId === undefined || !hasLoot(lost)) return;
  const report = await ctx.db.get(reportId);
  if (report === null) return;
  const previous =
    report.lost ??
    (Object.fromEntries(RESOURCES.map((key) => [key, 0])) as Record<ResourceKey, number>);
  await ctx.db.patch(reportId, { lost: addAmounts(previous, lost) });
}

async function capacityOf(
  ctx: MutationCtx,
  troopIds: ReadonlyArray<Id<'troops'>>,
): Promise<number> {
  const troops = (await Promise.all(troopIds.map((troopId) => ctx.db.get(troopId)))).filter(
    (troop): troop is Doc<'troops'> => troop !== null,
  );
  return carryCapacityOf(
    troops.map((troop) => ({
      role: troop.role,
      strength: troop.currentStrength,
      nominalStrength: troop.nominalStrength,
    })),
    CARRY_CAPACITY_BY_ROLE,
  );
}

const shareForCapacity = (
  loot: ResourceAmounts,
  capacity: number,
  totalCapacity: number,
): Record<ResourceKey, number> => {
  const totalLoot = RESOURCES.reduce((sum, key) => sum + loot[key], 0);
  return trimLootToCapacity(loot, totalCapacity <= 0 ? 0 : (totalLoot * capacity) / totalCapacity);
};

/**
 * Read before casualties land. This is deliberately a named boundary: S6b can transfer cargo
 * from this intact snapshot before `settleCombatCargo` turns the uncarried remainder into loss.
 */
export async function combatCargoSnapshot(
  ctx: MutationCtx,
  seasonId: Id<'seasons'>,
  troopIds: ReadonlySet<string>,
): Promise<ReadonlyArray<CombatCargoSnapshot>> {
  const [movements, stationed] = await Promise.all([
    ctx.db
      .query('movements')
      .withIndex('bySeason', (q) => q.eq('seasonId', seasonId))
      .collect(),
    ctx.db
      .query('stationedLoot')
      .withIndex('bySeason', (q) => q.eq('seasonId', seasonId))
      .collect(),
  ]);
  return [
    ...movements
      .filter(
        (movement) =>
          movement.loot !== undefined && movement.troopIds.some((id) => troopIds.has(id)),
      )
      .map((movement) => ({
        kind: 'movement' as const,
        sourceId: movement._id,
        playerId: movement.playerId,
        troopIds: movement.troopIds,
        loot: movement.loot!,
        ...(movement.plunderReportId === undefined
          ? {}
          : { plunderReportId: movement.plunderReportId }),
      })),
    ...stationed
      .filter((load) => load.troopIds.some((id) => troopIds.has(id)))
      .map((load) => ({
        kind: 'stationed' as const,
        sourceId: load._id,
        playerId: load.playerId,
        troopIds: load.troopIds,
        loot: load.loot,
        ...(load.plunderReportId === undefined ? {} : { plunderReportId: load.plunderReportId }),
      })),
  ];
}

export async function settleCombatCargo(
  ctx: MutationCtx,
  snapshots: ReadonlyArray<CombatCargoSnapshot>,
  outcomes: ReadonlyArray<{
    readonly id: string;
    readonly state: 'standing' | 'routed' | 'destroyed';
  }>,
): Promise<ReadonlyArray<HomewardCargo>> {
  const stateOf = new Map(outcomes.map((outcome) => [outcome.id, outcome.state]));
  const homeward: Array<HomewardCargo> = [];

  for (const snapshot of snapshots) {
    const source = await ctx.db.get(snapshot.sourceId);
    if (source === null || source.loot === undefined || !sameAmounts(source.loot, snapshot.loot)) {
      continue;
    }
    const standingIds = snapshot.troopIds.filter(
      (id) => stateOf.get(id) !== 'destroyed' && stateOf.get(id) !== 'routed',
    );
    const routedIds = snapshot.troopIds.filter((id) => stateOf.get(id) === 'routed');
    const [standingCapacity, routedCapacity] = await Promise.all([
      capacityOf(ctx, standingIds),
      capacityOf(ctx, routedIds),
    ]);
    const totalCapacity = standingCapacity + routedCapacity;
    const kept = trimLootToCapacity(snapshot.loot, totalCapacity);
    const standingLoot = shareForCapacity(kept, standingCapacity, totalCapacity);
    const routedLoot = difference(kept, standingLoot);
    await addPlunderLoss(ctx, snapshot.plunderReportId, difference(snapshot.loot, kept));

    if (snapshot.kind === 'movement') {
      if (standingIds.length > 0 && hasLoot(standingLoot)) {
        await ctx.db.patch(snapshot.sourceId, { troopIds: standingIds, loot: standingLoot });
      } else {
        await ctx.db.patch(snapshot.sourceId, {
          loot: undefined,
          lootDelivery: undefined,
          plunderReportId: undefined,
        });
      }
    } else if (standingIds.length > 0 && hasLoot(standingLoot)) {
      await ctx.db.patch(snapshot.sourceId, { troopIds: standingIds, loot: standingLoot });
    } else {
      const load = await ctx.db.get(snapshot.sourceId);
      if (load !== null) await ctx.db.delete(snapshot.sourceId);
    }

    if (routedIds.length > 0 && hasLoot(routedLoot)) {
      homeward.push({
        playerId: snapshot.playerId,
        troopIds: routedIds,
        loot: routedLoot,
        ...(snapshot.plunderReportId === undefined
          ? {}
          : { plunderReportId: snapshot.plunderReportId }),
      });
    }
  }
  return homeward;
}

/** Zero is a reportable result of an expedition, but it is not cargo to preserve. */
export async function stationLoot(
  ctx: MutationCtx,
  load: StationedLoad,
): Promise<Id<'stationedLoot'> | null> {
  if (!hasLoot(load.loot)) return null;
  return ctx.db.insert('stationedLoot', {
    ...load,
    troopIds: [...load.troopIds],
  });
}

export async function stationMovementLoot(
  ctx: MutationCtx,
  movement: Doc<'movements'>,
  stationedAt: TroopAddress,
): Promise<Id<'stationedLoot'> | null> {
  if (movement.loot === undefined) return null;
  return stationLoot(ctx, {
    seasonId: movement.seasonId,
    playerId: movement.playerId,
    troopIds: movement.troopIds,
    stationedAt,
    loot: movement.loot,
    ...(movement.plunderReportId === undefined
      ? {}
      : { plunderReportId: movement.plunderReportId }),
  });
}
