import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
import { internal } from './_generated/api';
import { RESOURCES } from '../src/domain/ids';
import { carryCapacityOf } from '../src/domain/loot';
import { cargoTotal, movementCargoLoads, takeMovementCargo, type CargoLoad } from './cargo';
import { CARRY_CAPACITY_BY_ROLE } from './constants';
import { fail } from './errors';
import { takeLootFromCrate } from './lootCrates';
import { forgetMovement, walkHome } from './movement/arrival';
import { pointOf, troopsCarriedBy } from './movement/forces';
import { aimOf, march, type MarchOrigin } from './movement/orders';
import { restHold } from './movement/rest';
import { requirePlayable, seasonStillPlays } from './seasons';
import { surveyAlongRoute } from './surveys';
import { hostAtPoint } from './routes';

const amountTotal = (amounts: ReturnType<typeof cargoTotal>): number =>
  RESOURCES.reduce((sum, key) => sum + amounts[key], 0);

const capacityOf = (troops: ReadonlyArray<Doc<'troops'>>): number =>
  carryCapacityOf(
    troops.map((troop) => ({
      role: troop.role,
      strength: troop.currentStrength,
      nominalStrength: troop.nominalStrength,
    })),
    CARRY_CAPACITY_BY_ROLE,
  );

/** Internal seam for S8. The target is read only from the observer's ledger: filing the order
 * never asks whether the crate still exists, so a stale sighting cannot become a remote probe. */
export async function startLootCollectionMission(
  ctx: MutationCtx,
  {
    playerId,
    sightingId,
    origin,
    troopIds,
  }: {
    playerId: Id<'players'>;
    sightingId: Id<'lootCrateSightings'>;
    origin: MarchOrigin;
    troopIds: ReadonlyArray<Id<'troops'>>;
  },
) {
  const player = await ctx.db.get(playerId);
  if (player === null) fail('UNKNOWN_TOKEN');
  const season = await ctx.db.get(player.seasonId);
  if (season === null) fail('SEASON_GONE');
  requirePlayable(player, season);

  const sighting = await ctx.db.get(sightingId);
  if (
    sighting === null ||
    sighting.playerId !== playerId ||
    sighting.seasonId !== season._id ||
    !sighting.present
  ) {
    fail('NOT_ORDERABLE');
  }

  const filed = await march(ctx, {
    playerId,
    season,
    type: 'march',
    origin,
    troopIds,
    aim: await aimOf(ctx, playerId, { kind: 'point', point: sighting.point }),
  });
  const movement = await ctx.db.get(filed.movementId);
  if (movement === null) fail('NOT_ORDERABLE');
  const troops = (await troopsCarriedBy(ctx, movement)).filter(
    (troop) => troop.playerId === playerId && troop.seasonId === season._id,
  );
  const freeCapacity = capacityOf(troops) - amountTotal(cargoTotal(movementCargoLoads(movement)));
  if (freeCapacity <= 0) fail('NO_CARGO_CAPACITY');

  await ctx.db.patch(movement._id, {
    lootCollection: {
      sightingId,
      crateId: sighting.crateId,
      orderedAt: movement._creationTime,
    },
  });
  return filed;
}

const compareMissions = (left: Doc<'movements'>, right: Doc<'movements'>): number =>
  left.arrivesAt - right.arrivesAt ||
  left.lootCollection!.orderedAt - right.lootCollection!.orderedAt ||
  (left._id < right._id ? -1 : left._id === right._id ? 0 : 1);

export async function dueLootCollectionMovements(
  ctx: MutationCtx,
  seasonId: Id<'seasons'>,
  crateId: Id<'lootCrates'>,
  at: number,
  inclusive = true,
): Promise<ReadonlyArray<Doc<'movements'>>> {
  const movements = await ctx.db
    .query('movements')
    .withIndex('byLootCollectionCrateArrival', (q) => {
      const forCrate = q.eq('lootCollection.crateId', crateId);
      return inclusive ? forCrate.lte('arrivesAt', at) : forCrate.lt('arrivesAt', at);
    })
    .collect();
  return movements
    .filter(
      (movement) => movement.seasonId === seasonId && movement.lootCollection?.crateId === crateId,
    )
    .sort(compareMissions);
}

async function resolveOne(
  ctx: MutationCtx,
  movement: Doc<'movements'>,
  now: number,
): Promise<void> {
  const current = await ctx.db.get(movement._id);
  if (current === null || current.lootCollection === undefined) return;
  if (!(await seasonStillPlays(ctx, current.playerId))) return;

  const troops = (await troopsCarriedBy(ctx, current)).filter(
    (troop) => troop.playerId === current.playerId && troop.seasonId === current.seasonId,
  );
  await surveyAlongRoute(ctx, current, now);
  if (troops.length === 0) {
    await forgetMovement(ctx, current._id);
    return;
  }

  const priorLoads = await takeMovementCargo(ctx, current);
  const freeCapacity = Math.max(0, capacityOf(troops) - amountTotal(cargoTotal(priorLoads)));
  const taken = await takeLootFromCrate(
    ctx,
    current.lootCollection.crateId,
    freeCapacity,
    current.arrivesAt,
  );
  const loads: Array<CargoLoad> = [...priorLoads];
  if (taken !== null) {
    const existing = await ctx.db
      .query('lootCollections')
      .withIndex('byMovement', (q) => q.eq('movementId', current._id))
      .unique();
    if (existing === null) {
      const collectionId = await ctx.db.insert('lootCollections', {
        seasonId: current.seasonId,
        collectorPlayerId: current.playerId,
        sourceCrateId: current.lootCollection.crateId,
        sourceRecoveryId: taken.recoveryId,
        movementId: current._id,
        at: current.arrivesAt,
        collected: taken.loot,
      });
      await ctx.db.insert('notices', {
        playerId: current.playerId,
        at: current.arrivesAt,
        kind: 'lootCollected',
        hostCountry: hostAtPoint([current.to.lon, current.to.lat]),
        loot: taken.loot,
      });
      loads.push({ loot: taken.loot, collectionId });
    }
  }

  await forgetMovement(ctx, current._id);
  await walkHome(
    ctx,
    { winners: troops, beaten: [] },
    pointOf(current.to),
    now,
    loads.length === 0 ? [] : [{ playerId: current.playerId, troopIds: current.troopIds, loads }],
  );
}

/** Settle every mission that had reached this crate before this callback. Sorting inside the
 * same mutation makes scheduler wake-up order irrelevant; a crate is never shared pro rata. */
export async function resolveLootCollectionArrivals(
  ctx: MutationCtx,
  trigger: Doc<'movements'>,
  now: number,
): Promise<void> {
  const mission = trigger.lootCollection;
  if (mission === undefined) return;
  await resolveDueLootCollectionMissions(ctx, {
    seasonId: trigger.seasonId,
    crateId: mission.crateId,
    at: now,
    inclusive: true,
    now,
  });
}

/** The crate expiry uses this same arbiter directly. Exclusive deadlines keep an arrival exactly
 * at `expiresAt` outside the collection window, while a rest hold moves the mission forward. */
export async function resolveDueLootCollectionMissions(
  ctx: MutationCtx,
  {
    seasonId,
    crateId,
    at,
    inclusive,
    now,
  }: {
    seasonId: Id<'seasons'>;
    crateId: Id<'lootCrates'>;
    at: number;
    inclusive: boolean;
    now: number;
  },
): Promise<void> {
  for (const movement of await dueLootCollectionMovements(ctx, seasonId, crateId, at, inclusive)) {
    const held = await restHold(ctx, movement.playerId, movement.hostCountry, now);
    if (held !== null) {
      await ctx.db.patch(movement._id, { arrivesAt: held });
      await ctx.scheduler.runAt(held, internal.movements.arrive, { movementId: movement._id });
      await ctx.db.insert('notices', {
        playerId: movement.playerId,
        at: now,
        kind: 'movementStalled',
        hostCountry: movement.hostCountry,
        resolvesAt: held,
      });
      continue;
    }
    await resolveOne(ctx, movement, now);
  }
}
