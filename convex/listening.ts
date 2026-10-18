import { v } from 'convex/values';
import { internalMutation } from './_generated/server';
import { reassessDetection } from './movement/detection';
import { playingSeason } from './seats';

/**
 * **Re-read the ears when the coal that feeds them runs out or comes back** (ADR 0028 §1). The
 * economy is settled lazily, so nothing else wakes the detection at the instant a post goes
 * silent; `resources.ts` schedules this job on that instant and on the events around it.
 */
export const reassess = internalMutation({
  args: { playerId: v.id('players') },
  handler: async (ctx, { playerId }) => {
    const season = await playingSeason(ctx, playerId);
    if (season !== null) await reassessDetection(ctx, season._id);
  },
});
