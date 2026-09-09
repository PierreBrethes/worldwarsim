import { v } from 'convex/values';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { internalMutation, type MutationCtx } from './_generated/server';
import { RESOURCES, type ResourceKey } from '../src/domain/ids';
import { trimLootToCapacity, type ResourceAmounts } from '../src/domain/loot';
import { LOOT_CRATE_HOURS } from './constants';
import {
  reassessLootCrateDetection,
  reassessLootCrateSightings,
  refreshLootCrateDetection,
} from './movement/detection';

const emptyAmounts = (): Record<ResourceKey, number> =>
  Object.fromEntries(RESOURCES.map((key) => [key, 0])) as Record<ResourceKey, number>;

const difference = (before: ResourceAmounts, after: ResourceAmounts): Record<ResourceKey, number> =>
  Object.fromEntries(
    RESOURCES.map((key) => [key, Math.max(0, before[key] - after[key])]),
  ) as Record<ResourceKey, number>;

const hasLoot = (loot: ResourceAmounts): boolean => RESOURCES.some((key) => loot[key] > 0);

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
  await reassessLootCrateDetection(ctx, recovery.seasonId, now);
  return crateId;
}

export type CrateTake = {
  readonly recoveryId: Id<'lootRecoveries'>;
  readonly loot: ResourceAmounts;
};

/** Internal S6c seam. Convex serializes competing mutations, so each caller can receive only the
 * quantity left by the one committed before it; the public priority rule remains outside here. */
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

/** A late wake-up uses the original deadline and can only remove the row that still owns it. */
export const expire = internalMutation({
  args: { crateId: v.id('lootCrates'), expectedAt: v.number() },
  handler: async (ctx, { crateId, expectedAt }) => {
    const crate = await ctx.db.get(crateId);
    if (crate === null || crate.expiresAt !== expectedAt || Date.now() < expectedAt) return;
    const season = await ctx.db.get(crate.seasonId);
    if (season === null || season.concludedAt !== null) return;
    await ctx.db.delete(crateId);
    await reassessLootCrateDetection(ctx, crate.seasonId);
  },
});

/** A prediction is only an alarm clock. The observer ledger changes after the callback validates
 * this exact appointment against the board that exists when it wakes. */
export const refreshDetection = internalMutation({
  args: {
    detectionJobId: v.id('lootCrateDetectionJobs'),
    expectedAt: v.number(),
  },
  handler: (ctx, { detectionJobId, expectedAt }) =>
    refreshLootCrateDetection(ctx, detectionJobId, expectedAt),
});
