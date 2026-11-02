import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
import type { SupplyLoad } from '../src/domain/logistics';
import {
  difference,
  emptyAmounts,
  hasLoot,
  trimLootToCapacity,
  type ResourceAmounts,
} from '../src/domain/loot';
import { LOOT_CRATE_HOURS } from './constants';
import { reassessLootCrateDetection, reassessLootCrateSightings } from './movement/detection';
import { ensureLootRumor } from './lootRumors';

async function cancelExpiration(
  ctx: MutationCtx,
  jobId: Id<'_scheduled_functions'> | undefined,
): Promise<void> {
  if (jobId === undefined) return;
  try {
    await ctx.scheduler.cancel(jobId);
  } catch {
    // A running expiry validates the crate before writing.
  }
}

/** Move the S6b-1 remainder into its sole physical representation. The indexed lookup is the
 * idempotence guard for callers replaying the same recovery inside a later integration. */
export async function materializeRecoveryRemainder(
  ctx: MutationCtx,
  recoveryId: Id<'lootRecoveries'>,
  now = Date.now(),
): Promise<Id<'lootCrates'> | null> {
  const recovery = await ctx.db.get(recoveryId);
  if (recovery === null) return null;
  const season = await ctx.db.get(recovery.seasonId);
  if (season === null || season.concludedAt !== null) return null;
  const existing = await ctx.db
    .query('lootCrates')
    .withIndex('byRecovery', (q) => q.eq('recoveryId', recoveryId))
    .unique();
  if (existing !== null) {
    if (hasLoot(recovery.remainder)) await ctx.db.patch(recoveryId, { remainder: emptyAmounts() });
    await ensureLootRumor(ctx, {
      seasonId: recovery.seasonId,
      engagementId: recovery.engagementId,
      point: [recovery.point.lon, recovery.point.lat],
      appearedAt: recovery.at,
    });
    return now >= existing.expiresAt ? null : existing._id;
  }
  if (!hasLoot(recovery.remainder)) return null;

  const expiresAt = recovery.at + LOOT_CRATE_HOURS * 3_600_000;
  if (now >= expiresAt) {
    await ctx.db.patch(recoveryId, { remainder: emptyAmounts() });
    return null;
  }
  const crateId = await ctx.db.insert('lootCrates', {
    seasonId: recovery.seasonId,
    recoveryId,
    point: recovery.point,
    appearedAt: recovery.at,
    expiresAt,
    loot: recovery.remainder,
  });
  await ctx.db.patch(recoveryId, { remainder: emptyAmounts() });
  const expirationJobId = await ctx.scheduler.runAt(expiresAt, internal.lootCrates.expire, {
    crateId,
    expectedAt: expiresAt,
  });
  await ctx.db.patch(crateId, { expirationJobId });
  await ensureLootRumor(ctx, {
    seasonId: recovery.seasonId,
    engagementId: recovery.engagementId,
    point: [recovery.point.lon, recovery.point.lat],
    appearedAt: recovery.at,
  });
  await reassessLootCrateDetection(ctx, recovery.seasonId, now);
  return crateId;
}

export type CrateTake = {
  readonly recoveryId: Id<'lootRecoveries'>;
  readonly loot: ResourceAmounts;
};

/** Atomic physical take used after the S6c coordinator has sorted every due mission. Convex then
 * serializes each remainder update, so no two collectors can receive the same unit. */
export async function takeLootFromCrate(
  ctx: MutationCtx,
  crateId: Id<'lootCrates'>,
  capacity: number,
  at = Date.now(),
): Promise<CrateTake | null> {
  const crate = await ctx.db.get(crateId);
  if (crate === null || capacity <= 0) return null;
  const season = await ctx.db.get(crate.seasonId);
  if (season === null || season.concludedAt !== null) return null;
  if (at >= crate.expiresAt) {
    await cancelExpiration(ctx, crate.expirationJobId);
    await ctx.db.delete(crateId);
    await reassessLootCrateDetection(ctx, crate.seasonId, at);
    return null;
  }

  const taken = trimLootToCapacity(crate.loot, capacity);
  if (!hasLoot(taken)) return null;
  const remaining = difference(crate.loot, taken);
  if (hasLoot(remaining)) await ctx.db.patch(crateId, { loot: remaining });
  else {
    await cancelExpiration(ctx, crate.expirationJobId);
    await ctx.db.delete(crateId);
  }
  if (hasLoot(remaining)) await reassessLootCrateSightings(ctx, crate.seasonId, at);
  else await reassessLootCrateDetection(ctx, crate.seasonId, at);
  return { recoveryId: crate.recoveryId, loot: taken };
}

/**
 * **Un transport détruit laisse une caisse** (ADR 0028 §4) : sa charge tombe au point de la
 * passe, sous la forme de tout butin abandonné — un fait de reprise sans rien de repris, et le
 * reste qui devient caisse, sa rumeur et ses relevés. Son propriétaire apprend la perte.
 */
export async function dropTransportCrate(
  ctx: MutationCtx,
  {
    seasonId,
    engagementId,
    ownerId,
    finderId,
    load,
    point,
    at,
  }: {
    seasonId: Id<'seasons'>;
    engagementId: Id<'engagements'>;
    ownerId: Id<'players'>;
    finderId: Id<'players'>;
    load: SupplyLoad;
    point: { lon: number; lat: number };
    at: number;
  },
): Promise<void> {
  const remainder = { ...emptyAmounts(), ...load };
  if (!hasLoot(remainder)) return;
  const recoveryId = await ctx.db.insert('lootRecoveries', {
    seasonId,
    engagementId,
    dispossessedPlayerId: ownerId,
    recoveringPlayerId: finderId,
    point,
    at,
    recovered: emptyAmounts(),
    remainder,
  });
  await materializeRecoveryRemainder(ctx, recoveryId, at);
  await ctx.db.insert('notices', { playerId: ownerId, at, kind: 'lootLost', loot: remainder });
}
