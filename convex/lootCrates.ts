/**
 * The two jobs a crate schedules, and nothing else: the scheduler holds them by this path
 * (`internal.lootCrates.expire`), and `expire` reaches up into the collection missions. The crate
 * itself lives in `crateStock.ts`, below both, so the missions can take from it without a cycle.
 */

import { v } from 'convex/values';
import { internalMutation } from './_generated/server';
import { reassessDetection, refreshLootCrateDetection } from './movement/detection';
import { resolveDueLootCollectionMissions } from './lootCollections';

/** A late wake-up uses the original deadline and can only remove the row that still owns it. */
export const expire = internalMutation({
  args: { crateId: v.id('lootCrates'), expectedAt: v.number() },
  handler: async (ctx, { crateId, expectedAt }) => {
    const crate = await ctx.db.get(crateId);
    if (crate === null || crate.expiresAt !== expectedAt || Date.now() < expectedAt) return;
    const season = await ctx.db.get(crate.seasonId);
    if (season === null || season.concludedAt !== null) return;
    await resolveDueLootCollectionMissions(ctx, {
      seasonId: crate.seasonId,
      crateId,
      at: expectedAt,
      inclusive: false,
      now: Date.now(),
    });
    if ((await ctx.db.get(crateId)) === null) return;
    await ctx.db.delete(crateId);
    /** Les missions réglées ont pu poser, retenir ou renvoyer des colonnes de plusieurs joueurs :
     *  tout se relit, caisses comprises (#145). */
    await reassessDetection(ctx, crate.seasonId);
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
