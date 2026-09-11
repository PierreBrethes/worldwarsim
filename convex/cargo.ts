import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { RESOURCES, type ResourceKey } from '../src/domain/ids';
import { carryCapacityOf, trimLootToCapacity, type ResourceAmounts } from '../src/domain/loot';
import { CARRY_CAPACITY_BY_ROLE } from './constants';
import { materializeRecoveryRemainder } from './lootCrates';
import type { TroopAddress } from './movement/forces';
import { creditToStorage } from './resources';
import { planCargoReturn, startCargoReturn } from './movement/cargoReturn';
import { hostAtPoint } from './routes';

export type CargoLoad = {
  readonly loot: ResourceAmounts;
  readonly plunderReportId?: Id<'plunderReports'>;
  readonly recoveryId?: Id<'lootRecoveries'>;
  readonly collectionId?: Id<'lootCollections'>;
};

type StationedLoad = CargoLoad & {
  readonly seasonId: Id<'seasons'>;
  readonly playerId: Id<'players'>;
  readonly troopIds: ReadonlyArray<Id<'troops'>>;
  readonly stationedAt: TroopAddress;
};

export type HomewardCargo = {
  readonly playerId: Id<'players'>;
  readonly troopIds: ReadonlyArray<Id<'troops'>>;
  readonly loads: ReadonlyArray<CargoLoad>;
};

export type CombatCargoSnapshot =
  | {
      readonly kind: 'movement';
      readonly sourceId: Id<'movements'>;
      readonly playerId: Id<'players'>;
      readonly troopIds: ReadonlyArray<Id<'troops'>>;
      readonly loads: ReadonlyArray<CargoLoad>;
    }
  | {
      readonly kind: 'stationed';
      readonly sourceIds: ReadonlyArray<Id<'stationedLoot'>>;
      readonly playerId: Id<'players'>;
      readonly troopIds: ReadonlyArray<Id<'troops'>>;
      readonly loads: ReadonlyArray<CargoLoad>;
    };

export type CombatCargoSettlement = {
  readonly homeward: ReadonlyArray<HomewardCargo>;
  readonly destroyed: ReadonlyArray<CombatCargoSnapshot>;
};

const emptyAmounts = (): Record<ResourceKey, number> =>
  Object.fromEntries(RESOURCES.map((key) => [key, 0])) as Record<ResourceKey, number>;

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

const sameStation = (left: TroopAddress, right: TroopAddress): boolean => {
  if (left === null || right === null) return left === right;
  if (typeof left === 'string' || typeof right === 'string') return left === right;
  return left.lon === right.lon && left.lat === right.lat;
};

export const cargoTotal = (loads: ReadonlyArray<CargoLoad>): Record<ResourceKey, number> =>
  loads.reduce((total, load) => addAmounts(total, load.loot), emptyAmounts());

const sameLoads = (left: ReadonlyArray<CargoLoad>, right: ReadonlyArray<CargoLoad>): boolean =>
  left.length === right.length &&
  left.every(
    (load, index) =>
      load.plunderReportId === right[index]?.plunderReportId &&
      load.recoveryId === right[index]?.recoveryId &&
      load.collectionId === right[index]?.collectionId &&
      sameAmounts(load.loot, right[index]!.loot),
  );

export function movementCargoLoads(movement: Doc<'movements'>): ReadonlyArray<CargoLoad> {
  if (movement.lootLoads !== undefined) return movement.lootLoads;
  if (movement.loot === undefined) return [];
  return [
    {
      loot: movement.loot,
      ...(movement.plunderReportId === undefined
        ? {}
        : { plunderReportId: movement.plunderReportId }),
    },
  ];
}

export function movementCargoFields(loads: ReadonlyArray<CargoLoad>) {
  const kept = loads.filter((load) => hasLoot(load.loot));
  if (kept.length === 0) return {};
  if (
    kept.length === 1 &&
    kept[0]!.recoveryId === undefined &&
    kept[0]!.collectionId === undefined
  ) {
    const [load] = kept;
    return {
      loot: load!.loot,
      ...(load!.plunderReportId === undefined ? {} : { plunderReportId: load!.plunderReportId }),
    };
  }
  return {
    lootLoads: kept.map((load) => ({
      loot: load.loot,
      ...(load.plunderReportId === undefined ? {} : { plunderReportId: load.plunderReportId }),
      ...(load.recoveryId === undefined ? {} : { recoveryId: load.recoveryId }),
      ...(load.collectionId === undefined ? {} : { collectionId: load.collectionId }),
    })),
  };
}

async function replaceMovementCargo(
  ctx: MutationCtx,
  movementId: Id<'movements'>,
  loads: ReadonlyArray<CargoLoad>,
  clearDelivery = false,
): Promise<void> {
  await ctx.db.patch(movementId, {
    loot: undefined,
    lootLoads: undefined,
    plunderReportId: undefined,
    ...(clearDelivery ? { lootDelivery: undefined } : {}),
    ...movementCargoFields(loads),
  });
}

export async function takeMovementCargo(
  ctx: MutationCtx,
  movement: Doc<'movements'>,
): Promise<ReadonlyArray<CargoLoad>> {
  const current = await ctx.db.get(movement._id);
  if (current === null) return [];
  const loads = movementCargoLoads(current);
  if (loads.length > 0) await replaceMovementCargo(ctx, current._id, [], true);
  return loads;
}

export async function addPlunderLoss(
  ctx: MutationCtx,
  reportId: Id<'plunderReports'> | undefined,
  lost: ResourceAmounts,
): Promise<void> {
  if (reportId === undefined || !hasLoot(lost)) return;
  const report = await ctx.db.get(reportId);
  if (report === null) return;
  await ctx.db.patch(reportId, { lost: addAmounts(report.lost ?? emptyAmounts(), lost) });
}

async function addPlunderDelivery(
  ctx: MutationCtx,
  reportId: Id<'plunderReports'> | undefined,
  delivered: ResourceAmounts,
): Promise<void> {
  if (reportId === undefined || !hasLoot(delivered)) return;
  const report = await ctx.db.get(reportId);
  if (report === null) return;
  await ctx.db.patch(reportId, {
    delivered: addAmounts(report.delivered ?? emptyAmounts(), delivered),
  });
}

async function addRecoveryAmounts(
  ctx: MutationCtx,
  recoveryId: Id<'lootRecoveries'> | undefined,
  field: 'delivered' | 'lost',
  amounts: ResourceAmounts,
): Promise<void> {
  if (recoveryId === undefined || !hasLoot(amounts)) return;
  const recovery = await ctx.db.get(recoveryId);
  if (recovery === null) return;
  await ctx.db.patch(recoveryId, {
    [field]: addAmounts(recovery[field] ?? emptyAmounts(), amounts),
  });
}

async function addCollectionAmounts(
  ctx: MutationCtx,
  collectionId: Id<'lootCollections'> | undefined,
  field: 'delivered' | 'lost',
  amounts: ResourceAmounts,
): Promise<void> {
  if (collectionId === undefined || !hasLoot(amounts)) return;
  const collection = await ctx.db.get(collectionId);
  if (collection === null) return;
  await ctx.db.patch(collectionId, {
    [field]: addAmounts(collection[field] ?? emptyAmounts(), amounts),
  });
}

async function addCargoLoss(ctx: MutationCtx, load: CargoLoad, lost: ResourceAmounts) {
  if (load.collectionId !== undefined) {
    await addCollectionAmounts(ctx, load.collectionId, 'lost', lost);
  } else if (load.recoveryId !== undefined) {
    await addRecoveryAmounts(ctx, load.recoveryId, 'lost', lost);
  } else {
    await addPlunderLoss(ctx, load.plunderReportId, lost);
  }
}

const capacityOf = (troops: ReadonlyArray<Doc<'troops'>>): number =>
  carryCapacityOf(
    troops.map((troop) => ({
      role: troop.role,
      strength: troop.currentStrength,
      nominalStrength: troop.nominalStrength,
    })),
    CARRY_CAPACITY_BY_ROLE,
  );

function allocateToLoads(
  loads: ReadonlyArray<CargoLoad>,
  target: ResourceAmounts,
): ReadonlyArray<CargoLoad> {
  const allocated = loads.map(() => emptyAmounts());
  for (const key of RESOURCES) {
    const positive = loads
      .map((load, index) => ({ index, amount: load.loot[key] }))
      .filter(({ amount }) => amount > 0);
    const available = positive.reduce((sum, { amount }) => sum + amount, 0);
    let assigned = 0;
    for (const { index, amount } of positive) {
      const share =
        index === positive.at(-1)?.index
          ? Math.min(amount, Math.max(0, target[key] - assigned))
          : Math.min(amount, available <= 0 ? 0 : (amount / available) * target[key]);
      allocated[index]![key] = share;
      assigned += share;
    }
  }
  return loads.map((load, index) => ({
    loot: allocated[index]!,
    ...(load.plunderReportId === undefined ? {} : { plunderReportId: load.plunderReportId }),
    ...(load.recoveryId === undefined ? {} : { recoveryId: load.recoveryId }),
    ...(load.collectionId === undefined ? {} : { collectionId: load.collectionId }),
  }));
}

async function fitCargoLoads(
  ctx: MutationCtx,
  loads: ReadonlyArray<CargoLoad>,
  capacity: number,
  notice?: { readonly playerId: Id<'players'>; readonly at: number },
): Promise<ReadonlyArray<CargoLoad>> {
  const fitted = allocateToLoads(loads, trimLootToCapacity(cargoTotal(loads), capacity));
  for (let index = 0; index < loads.length; index += 1) {
    await addCargoLoss(ctx, loads[index]!, difference(loads[index]!.loot, fitted[index]!.loot));
  }
  const lost = difference(cargoTotal(loads), cargoTotal(fitted));
  if (notice !== undefined && hasLoot(lost)) {
    await ctx.db.insert('notices', { ...notice, kind: 'lootLost', loot: lost });
  }
  return fitted;
}

export async function recordCargoDelivery(
  ctx: MutationCtx,
  loads: ReadonlyArray<CargoLoad>,
  delivered: ResourceAmounts,
  lost: ResourceAmounts,
  notice: {
    readonly playerId: Id<'players'>;
    readonly regionId: string;
    readonly at: number;
  },
): Promise<void> {
  const deliveredByLoad = allocateToLoads(loads, delivered);
  const lostByLoad = allocateToLoads(loads, lost);
  for (let index = 0; index < loads.length; index += 1) {
    const load = loads[index]!;
    if (load.collectionId !== undefined) {
      await addCollectionAmounts(ctx, load.collectionId, 'delivered', deliveredByLoad[index]!.loot);
      await addCollectionAmounts(ctx, load.collectionId, 'lost', lostByLoad[index]!.loot);
    } else if (load.recoveryId !== undefined) {
      await addRecoveryAmounts(ctx, load.recoveryId, 'delivered', deliveredByLoad[index]!.loot);
      await addRecoveryAmounts(ctx, load.recoveryId, 'lost', lostByLoad[index]!.loot);
    } else {
      await addPlunderDelivery(ctx, load.plunderReportId, deliveredByLoad[index]!.loot);
      await addPlunderLoss(ctx, load.plunderReportId, lostByLoad[index]!.loot);
    }
  }
  if (hasLoot(delivered) || hasLoot(lost)) {
    await ctx.db.insert('notices', {
      ...notice,
      kind: 'lootDelivered',
      delivered,
      lost,
    });
  }
}

export function splitCargoLoads(
  loads: ReadonlyArray<CargoLoad>,
  capacities: ReadonlyArray<number>,
): ReadonlyArray<ReadonlyArray<CargoLoad>> {
  const totalCapacity = capacities.reduce((sum, capacity) => sum + Math.max(0, capacity), 0);
  const groups = capacities.map(() => [] as Array<CargoLoad>);
  for (const load of loads) {
    const totalLoot = RESOURCES.reduce((sum, key) => sum + load.loot[key], 0);
    let assigned = emptyAmounts();
    capacities.forEach((capacity, index) => {
      const remaining = difference(load.loot, assigned);
      const share =
        index === capacities.length - 1
          ? remaining
          : trimLootToCapacity(
              load.loot,
              totalCapacity <= 0 ? 0 : (totalLoot * Math.max(0, capacity)) / totalCapacity,
            );
      assigned = addAmounts(assigned, share);
      if (hasLoot(share)) {
        groups[index]!.push({
          loot: share,
          ...(load.plunderReportId === undefined ? {} : { plunderReportId: load.plunderReportId }),
          ...(load.recoveryId === undefined ? {} : { recoveryId: load.recoveryId }),
          ...(load.collectionId === undefined ? {} : { collectionId: load.collectionId }),
        });
      }
    });
  }
  return groups;
}

type StationedCargoComponent = {
  readonly rows: ReadonlyArray<Doc<'stationedLoot'>>;
  readonly carriers: ReadonlyArray<Doc<'troops'>>;
};

async function stationedCargoComponents(
  ctx: QueryCtx,
  seasonId: Id<'seasons'>,
  playerId: Id<'players'>,
): Promise<ReadonlyArray<StationedCargoComponent>> {
  const [movements, rows] = await Promise.all([
    ctx.db
      .query('movements')
      .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
      .collect(),
    ctx.db
      .query('stationedLoot')
      .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
      .collect(),
  ]);
  const marching = new Set(movements.flatMap((movement) => movement.troopIds));
  const states = await Promise.all(
    rows
      .filter((row) => row.seasonId === seasonId)
      .map(async (row) => ({
        row,
        carriers: (await Promise.all(row.troopIds.map((troopId) => ctx.db.get(troopId)))).filter(
          (troop): troop is Doc<'troops'> =>
            troop !== null &&
            troop.seasonId === seasonId &&
            troop.playerId === playerId &&
            sameStation(troop.stationedAt, row.stationedAt) &&
            !marching.has(troop._id),
        ),
      })),
  );
  const remaining = states.filter(({ carriers }) => carriers.length > 0);
  const components: Array<StationedCargoComponent> = [];
  while (remaining.length > 0) {
    const first = remaining.shift()!;
    const joined = [first];
    const carrierIds = new Set(first.carriers.map((troop) => troop._id));
    let grew = true;
    while (grew) {
      grew = false;
      for (let index = remaining.length - 1; index >= 0; index -= 1) {
        const candidate = remaining[index]!;
        if (
          !sameStation(candidate.row.stationedAt, first.row.stationedAt) ||
          !candidate.carriers.some((troop) => carrierIds.has(troop._id))
        ) {
          continue;
        }
        joined.push(remaining.splice(index, 1)[0]!);
        for (const troop of candidate.carriers) carrierIds.add(troop._id);
        grew = true;
      }
    }
    components.push({
      rows: joined.map(({ row }) => row),
      carriers: [
        ...new Map(
          joined.flatMap(({ carriers }) => carriers).map((troop) => [troop._id, troop]),
        ).values(),
      ],
    });
  }
  return components;
}

const cargoLoadOf = (row: Doc<'stationedLoot'>): CargoLoad => ({
  loot: row.loot,
  ...(row.plunderReportId === undefined ? {} : { plunderReportId: row.plunderReportId }),
  ...(row.recoveryId === undefined ? {} : { recoveryId: row.recoveryId }),
  ...(row.collectionId === undefined ? {} : { collectionId: row.collectionId }),
});

export async function stationedCargoGroups(
  ctx: QueryCtx,
  seasonId: Id<'seasons'>,
  playerId: Id<'players'>,
) {
  return (await stationedCargoComponents(ctx, seasonId, playerId)).map((component) => ({
    troopIds: component.carriers.map((troop) => troop._id),
    stationedAt: component.rows[0]!.stationedAt,
    loads: component.rows.map(cargoLoadOf),
    capacity: capacityOf(component.carriers),
  }));
}

export async function selectedStationedCargo(
  ctx: QueryCtx,
  {
    seasonId,
    playerId,
    stationedAt,
    troops,
  }: {
    seasonId: Id<'seasons'>;
    playerId: Id<'players'>;
    stationedAt: TroopAddress;
    troops: ReadonlyArray<Doc<'troops'>>;
  },
): Promise<ReadonlyArray<CargoLoad>> {
  const selected = new Set(troops.map((troop) => troop._id));
  const departing: Array<CargoLoad> = [];
  for (const component of await stationedCargoComponents(ctx, seasonId, playerId)) {
    if (!sameStation(component.rows[0]!.stationedAt, stationedAt)) continue;
    const selectedCarriers = component.carriers.filter((troop) => selected.has(troop._id));
    if (selectedCarriers.length === 0) continue;
    const stayingCarriers = component.carriers.filter((troop) => !selected.has(troop._id));
    const capacities = [capacityOf(selectedCarriers), capacityOf(stayingCarriers)] as const;
    const sources = component.rows.map(cargoLoadOf);
    const fitted = allocateToLoads(
      sources,
      trimLootToCapacity(cargoTotal(sources), capacities[0] + capacities[1]),
    );
    for (const load of fitted) departing.push(...splitCargoLoads([load], capacities)[0]!);
  }
  return departing;
}

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
  const stationedInCombat = stationed.filter((load) =>
    load.troopIds.some((id) => troopIds.has(id)),
  );
  const remaining = [...stationedInCombat];
  const stationedComponents: Array<typeof stationedInCombat> = [];
  while (remaining.length > 0) {
    const component = [remaining.shift()!];
    const carrierIds = new Set(component[0]!.troopIds);
    let grew = true;
    while (grew) {
      grew = false;
      for (let index = remaining.length - 1; index >= 0; index -= 1) {
        if (
          remaining[index]!.playerId !== component[0]!.playerId ||
          !remaining[index]!.troopIds.some((id) => carrierIds.has(id))
        ) {
          continue;
        }
        const [joined] = remaining.splice(index, 1);
        component.push(joined!);
        for (const id of joined!.troopIds) carrierIds.add(id);
        grew = true;
      }
    }
    stationedComponents.push(component);
  }

  return [
    ...movements
      .map((movement) => ({ movement, loads: movementCargoLoads(movement) }))
      .filter(
        ({ movement, loads }) =>
          loads.length > 0 && movement.troopIds.some((id) => troopIds.has(id)),
      )
      .map(({ movement, loads }) => ({
        kind: 'movement' as const,
        sourceId: movement._id,
        playerId: movement.playerId,
        troopIds: movement.troopIds,
        loads,
      })),
    ...stationedComponents.map((component) => ({
      kind: 'stationed' as const,
      sourceIds: component.map((load) => load._id),
      playerId: component[0]!.playerId,
      troopIds: [...new Set(component.flatMap((load) => load.troopIds))],
      loads: component.map((load) => ({
        loot: load.loot,
        ...(load.plunderReportId === undefined ? {} : { plunderReportId: load.plunderReportId }),
        ...(load.recoveryId === undefined ? {} : { recoveryId: load.recoveryId }),
        ...(load.collectionId === undefined ? {} : { collectionId: load.collectionId }),
      })),
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
  recoverablePlayerId: Id<'players'>,
  at: number,
): Promise<CombatCargoSettlement> {
  const stateOf = new Map(outcomes.map((outcome) => [outcome.id, outcome.state]));
  const homeward: Array<HomewardCargo> = [];
  const destroyed: Array<CombatCargoSnapshot> = [];

  for (const snapshot of snapshots) {
    const current = await (async (): Promise<{ loads: ReadonlyArray<CargoLoad> }> => {
      if (snapshot.kind === 'movement') {
        const source = await ctx.db.get(snapshot.sourceId);
        return {
          loads: source === null ? [] : movementCargoLoads(source),
        };
      }
      const sources = await Promise.all(snapshot.sourceIds.map((sourceId) => ctx.db.get(sourceId)));
      return {
        loads: sources.flatMap((source) =>
          source === null
            ? []
            : [
                {
                  loot: source.loot,
                  ...(source.plunderReportId === undefined
                    ? {}
                    : { plunderReportId: source.plunderReportId }),
                  ...(source.recoveryId === undefined ? {} : { recoveryId: source.recoveryId }),
                  ...(source.collectionId === undefined
                    ? {}
                    : { collectionId: source.collectionId }),
                },
              ],
        ),
      };
    })();
    if (!sameLoads(current.loads, snapshot.loads)) continue;

    if (
      snapshot.playerId === recoverablePlayerId &&
      snapshot.troopIds.length > 0 &&
      snapshot.troopIds.every((id) => stateOf.get(id) === 'destroyed')
    ) {
      destroyed.push(snapshot);
      continue;
    }

    const standingIds = snapshot.troopIds.filter(
      (id) => stateOf.get(id) !== 'destroyed' && stateOf.get(id) !== 'routed',
    );
    const routedIds = snapshot.troopIds.filter((id) => stateOf.get(id) === 'routed');
    const [standingTroops, routedTroops] = await Promise.all([
      Promise.all(standingIds.map((id) => ctx.db.get(id))),
      Promise.all(routedIds.map((id) => ctx.db.get(id))),
    ]);
    const standingCapacity = capacityOf(
      standingTroops.filter((troop): troop is Doc<'troops'> => troop !== null),
    );
    const routedCapacity = capacityOf(
      routedTroops.filter((troop): troop is Doc<'troops'> => troop !== null),
    );
    const fitted = await fitCargoLoads(ctx, snapshot.loads, standingCapacity + routedCapacity, {
      playerId: snapshot.playerId,
      at,
    });
    const bySource = fitted.map((load) =>
      splitCargoLoads([load], [standingCapacity, routedCapacity]),
    );
    const standingLoads = bySource.flatMap(([loads = []]) => loads);
    const routedLoads = bySource.flatMap(([, loads = []]) => loads);

    if (snapshot.kind === 'movement') {
      await replaceMovementCargo(ctx, snapshot.sourceId, standingLoads, standingLoads.length === 0);
      if (standingLoads.length > 0) {
        await ctx.db.patch(snapshot.sourceId, { troopIds: standingIds });
      }
    } else {
      for (let index = 0; index < snapshot.sourceIds.length; index += 1) {
        const [load] = bySource[index]?.[0] ?? [];
        const source = await ctx.db.get(snapshot.sourceIds[index]!);
        if (source === null) continue;
        if (load === undefined) await ctx.db.delete(source._id);
        else {
          await ctx.db.patch(source._id, {
            troopIds: standingIds,
            loot: load.loot,
            plunderReportId: load.plunderReportId,
            recoveryId: load.recoveryId,
            collectionId: load.collectionId,
          });
        }
      }
    }

    if (routedIds.length > 0 && routedLoads.length > 0) {
      homeward.push({ playerId: snapshot.playerId, troopIds: routedIds, loads: routedLoads });
    }
  }
  return { homeward, destroyed };
}

type RecoveryCarrierGroup = {
  readonly troops: ReadonlyArray<Doc<'troops'>>;
  readonly freeCapacity: number;
  readonly movement?: Doc<'movements'>;
  readonly stationedAt?: TroopAddress;
};

const amountTotal = (amounts: ResourceAmounts): number =>
  RESOURCES.reduce((sum, key) => sum + amounts[key], 0);

async function recoveryCarrierGroups(
  ctx: MutationCtx,
  seasonId: Id<'seasons'>,
  playerId: Id<'players'>,
  troopIds: ReadonlyArray<string>,
): Promise<ReadonlyArray<RecoveryCarrierGroup>> {
  const standing = (await Promise.all(troopIds.map((id) => ctx.db.get(id as Id<'troops'>)))).filter(
    (troop): troop is Doc<'troops'> =>
      troop !== null && troop.seasonId === seasonId && troop.playerId === playerId,
  );
  const available = new Map(standing.map((troop) => [troop._id, troop]));
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
  const groups: Array<RecoveryCarrierGroup> = [];

  for (const movement of movements
    .filter((candidate) => candidate.playerId === playerId)
    .sort(
      (left, right) => left._creationTime - right._creationTime || (left._id < right._id ? -1 : 1),
    )) {
    const troops = movement.troopIds.flatMap((id) => {
      const troop = available.get(id);
      return troop === undefined ? [] : [troop];
    });
    if (troops.length === 0) continue;
    for (const troop of troops) available.delete(troop._id);
    groups.push({
      troops,
      movement,
      freeCapacity: Math.max(
        0,
        capacityOf(troops) - amountTotal(cargoTotal(movementCargoLoads(movement))),
      ),
    });
  }

  const stationary: Array<{ stationedAt: TroopAddress; troops: Array<Doc<'troops'>> }> = [];
  for (const troop of [...available.values()].sort(
    (left, right) => left._creationTime - right._creationTime || (left._id < right._id ? -1 : 1),
  )) {
    const group = stationary.find((candidate) =>
      sameStation(candidate.stationedAt, troop.stationedAt),
    );
    if (group === undefined) stationary.push({ stationedAt: troop.stationedAt, troops: [troop] });
    else group.troops.push(troop);
  }
  for (const group of stationary) {
    const ids = new Set(group.troops.map((troop) => troop._id));
    const loads = stationed
      .filter(
        (load) =>
          load.playerId === playerId &&
          sameStation(load.stationedAt, group.stationedAt) &&
          load.troopIds.some((id) => ids.has(id)),
      )
      .map((load) => ({
        loot: load.loot,
        ...(load.plunderReportId === undefined ? {} : { plunderReportId: load.plunderReportId }),
        ...(load.recoveryId === undefined ? {} : { recoveryId: load.recoveryId }),
        ...(load.collectionId === undefined ? {} : { collectionId: load.collectionId }),
      }));
    groups.push({
      troops: group.troops,
      stationedAt: group.stationedAt,
      freeCapacity: Math.max(0, capacityOf(group.troops) - amountTotal(cargoTotal(loads))),
    });
  }
  return groups.filter((group) => group.freeCapacity > 0);
}

/** A destroyed enemy carrier releases its intact pre-loss snapshot once. The winner receives
 * only what its standing groups can still carry; the rest remains at the engagement point on
 * the private recovery fact for S6b-2. */
export async function recoverDestroyedCombatCargo(
  ctx: MutationCtx,
  {
    seasonId,
    engagementId,
    destroyed,
    recoveringPlayerId,
    standingTroopIds,
    point,
    at,
  }: {
    seasonId: Id<'seasons'>;
    engagementId: Id<'engagements'>;
    destroyed: ReadonlyArray<CombatCargoSnapshot>;
    recoveringPlayerId: Id<'players'>;
    standingTroopIds: ReadonlyArray<string>;
    point: { lon: number; lat: number };
    at: number;
  },
): Promise<void> {
  const groups = await recoveryCarrierGroups(ctx, seasonId, recoveringPlayerId, standingTroopIds);
  let capacity = groups.reduce((sum, group) => sum + group.freeCapacity, 0);
  const recoveredLoads: Array<CargoLoad> = [];

  for (const snapshot of destroyed) {
    const currentMovement =
      snapshot.kind === 'movement' ? await ctx.db.get(snapshot.sourceId) : null;
    const currentStationed =
      snapshot.kind === 'stationed'
        ? await Promise.all(snapshot.sourceIds.map((sourceId) => ctx.db.get(sourceId)))
        : [];
    const currentLoads =
      snapshot.kind === 'movement'
        ? currentMovement === null
          ? []
          : movementCargoLoads(currentMovement)
        : currentStationed.flatMap((source) =>
            source === null
              ? []
              : [
                  {
                    loot: source.loot,
                    ...(source.plunderReportId === undefined
                      ? {}
                      : { plunderReportId: source.plunderReportId }),
                    ...(source.recoveryId === undefined ? {} : { recoveryId: source.recoveryId }),
                    ...(source.collectionId === undefined
                      ? {}
                      : { collectionId: source.collectionId }),
                  },
                ],
          );
    if (!sameLoads(currentLoads, snapshot.loads)) continue;

    if (snapshot.kind === 'movement') await replaceMovementCargo(ctx, snapshot.sourceId, [], true);
    else {
      for (const sourceId of snapshot.sourceIds) await ctx.db.delete(sourceId);
    }

    for (const load of snapshot.loads) {
      if (!hasLoot(load.loot)) continue;
      const recovered = trimLootToCapacity(load.loot, capacity);
      const remainder = difference(load.loot, recovered);
      capacity = Math.max(0, capacity - amountTotal(recovered));
      await addCargoLoss(ctx, load, load.loot);
      const recoveryId = await ctx.db.insert('lootRecoveries', {
        seasonId,
        engagementId,
        dispossessedPlayerId: snapshot.playerId,
        recoveringPlayerId,
        point,
        at,
        ...(load.plunderReportId === undefined
          ? {}
          : { sourcePlunderReportId: load.plunderReportId }),
        ...(load.recoveryId === undefined ? {} : { sourceRecoveryId: load.recoveryId }),
        ...(load.collectionId === undefined ? {} : { sourceCollectionId: load.collectionId }),
        recovered,
        remainder,
      });
      if (hasLoot(recovered)) {
        await ctx.db.insert('notices', {
          playerId: recoveringPlayerId,
          at,
          kind: 'lootRecovered',
          hostCountry: hostAtPoint([point.lon, point.lat]),
          loot: recovered,
        });
      }
      await materializeRecoveryRemainder(ctx, recoveryId, at);
      if (hasLoot(recovered)) recoveredLoads.push({ loot: recovered, recoveryId });
    }
    const lost = cargoTotal(snapshot.loads);
    if (hasLoot(lost)) {
      await ctx.db.insert('notices', {
        playerId: snapshot.playerId,
        at,
        kind: 'lootLost',
        loot: lost,
      });
    }
  }

  const distributed = splitCargoLoads(
    recoveredLoads,
    groups.map((group) => group.freeCapacity),
  );
  for (let index = 0; index < groups.length; index += 1) {
    const group = groups[index]!;
    const loads = distributed[index]!;
    if (loads.length === 0) continue;
    if (group.movement !== undefined) {
      const movement = await ctx.db.get(group.movement._id);
      if (movement !== null) {
        await replaceMovementCargo(ctx, movement._id, [...movementCargoLoads(movement), ...loads]);
      }
    } else {
      const from = [point.lon, point.lat] as const;
      const plan = await planCargoReturn(ctx, {
        seasonId,
        playerId: recoveringPlayerId,
        from,
        roles: group.troops.map((troop) => troop.role),
        now: at,
      });
      if (plan?.kind === 'route') {
        await startCargoReturn(ctx, {
          seasonId,
          playerId: recoveringPlayerId,
          from,
          troopIds: group.troops.map((troop) => troop._id),
          plan,
          cargoFields: movementCargoFields(loads),
          now: at,
        });
        continue;
      }
      if (plan?.kind === 'standing') {
        const credited = await creditToStorage(ctx, recoveringPlayerId, cargoTotal(loads), at);
        await recordCargoDelivery(ctx, loads, credited.delivered, credited.lost, {
          playerId: recoveringPlayerId,
          regionId: plan.regionId,
          at,
        });
        continue;
      }
      for (const troop of group.troops) await ctx.db.patch(troop._id, { stationedAt: point });
      await stationCargoLoads(ctx, {
        seasonId,
        playerId: recoveringPlayerId,
        troopIds: group.troops.map((troop) => troop._id),
        stationedAt: point,
        loads,
      });
    }
  }
}

/** Zero is a reportable result of an expedition, but it is not cargo to preserve. */
export async function stationLoot(
  ctx: MutationCtx,
  load: StationedLoad,
): Promise<Id<'stationedLoot'> | null> {
  if (!hasLoot(load.loot)) return null;
  return ctx.db.insert('stationedLoot', { ...load, troopIds: [...load.troopIds] });
}

export async function stationCargoLoads(
  ctx: MutationCtx,
  {
    seasonId,
    playerId,
    troopIds,
    stationedAt,
    loads,
  }: {
    seasonId: Id<'seasons'>;
    playerId: Id<'players'>;
    troopIds: ReadonlyArray<Id<'troops'>>;
    stationedAt: TroopAddress;
    loads: ReadonlyArray<CargoLoad>;
  },
): Promise<void> {
  for (const load of loads) {
    await stationLoot(ctx, { seasonId, playerId, troopIds, stationedAt, ...load });
  }
}

export async function stationMovementLoot(
  ctx: MutationCtx,
  movement: Doc<'movements'>,
  stationedAt: TroopAddress,
): Promise<void> {
  await stationCargoLoads(ctx, {
    seasonId: movement.seasonId,
    playerId: movement.playerId,
    troopIds: movement.troopIds,
    stationedAt,
    loads: movementCargoLoads(movement),
  });
}

export async function takeStationedCargo(
  ctx: MutationCtx,
  {
    seasonId,
    playerId,
    stationedAt,
    troops,
  }: {
    seasonId: Id<'seasons'>;
    playerId: Id<'players'>;
    stationedAt: TroopAddress;
    troops: ReadonlyArray<Doc<'troops'>>;
  },
): Promise<ReadonlyArray<CargoLoad>> {
  const selected = new Set(troops.map((troop) => troop._id));
  const marching = new Set(
    (
      await ctx.db
        .query('movements')
        .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
        .collect()
    ).flatMap((movement) => movement.troopIds),
  );
  const loads = (
    await ctx.db
      .query('stationedLoot')
      .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
      .collect()
  ).filter((load) => load.seasonId === seasonId && sameStation(load.stationedAt, stationedAt));
  const states = await Promise.all(
    loads.map(async (load) => ({
      load,
      carriers: (await Promise.all(load.troopIds.map((troopId) => ctx.db.get(troopId)))).filter(
        (troop): troop is Doc<'troops'> =>
          troop !== null &&
          troop.seasonId === seasonId &&
          troop.playerId === playerId &&
          sameStation(troop.stationedAt, stationedAt) &&
          !marching.has(troop._id),
      ),
    })),
  );
  const remaining = [...states];
  const components: Array<typeof states> = [];
  while (remaining.length > 0) {
    const component = [remaining.shift()!];
    const carrierIds = new Set(component[0]!.carriers.map((troop) => troop._id));
    let grew = true;
    while (grew) {
      grew = false;
      for (let index = remaining.length - 1; index >= 0; index -= 1) {
        if (!remaining[index]!.carriers.some((troop) => carrierIds.has(troop._id))) continue;
        const [joined] = remaining.splice(index, 1);
        component.push(joined!);
        for (const troop of joined!.carriers) carrierIds.add(troop._id);
        grew = true;
      }
    }
    components.push(component);
  }

  const departing: Array<CargoLoad> = [];
  for (const component of components) {
    const carriers = [
      ...new Map(
        component.flatMap(({ carriers }) => carriers).map((troop) => [troop._id, troop]),
      ).values(),
    ];
    const selectedCarriers = carriers.filter((troop) => selected.has(troop._id));
    const stayingCarriers = carriers.filter((troop) => !selected.has(troop._id));
    const capacities = [capacityOf(selectedCarriers), capacityOf(stayingCarriers)] as const;
    const sources = component.map(({ load }) => ({
      loot: load.loot,
      ...(load.plunderReportId === undefined ? {} : { plunderReportId: load.plunderReportId }),
      ...(load.recoveryId === undefined ? {} : { recoveryId: load.recoveryId }),
      ...(load.collectionId === undefined ? {} : { collectionId: load.collectionId }),
    }));
    const fitted = await fitCargoLoads(ctx, sources, capacities[0] + capacities[1], {
      playerId,
      at: Date.now(),
    });
    for (let index = 0; index < component.length; index += 1) {
      const [selectedLoads = [], stayingLoads = []] = splitCargoLoads([fitted[index]!], capacities);
      departing.push(...selectedLoads);
      const row = component[index]!.load;
      if (stayingLoads.length === 0) await ctx.db.delete(row._id);
      else {
        await ctx.db.patch(row._id, {
          troopIds: stayingCarriers.map((troop) => troop._id),
          loot: stayingLoads[0]!.loot,
          plunderReportId: stayingLoads[0]!.plunderReportId,
          recoveryId: stayingLoads[0]!.recoveryId,
          collectionId: stayingLoads[0]!.collectionId,
        });
      }
    }
  }
  return departing;
}
