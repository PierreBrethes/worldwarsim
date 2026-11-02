import { v } from 'convex/values';
import { internalMutation } from './_generated/server';
import { readPile as readPileAt, reassessDetection } from './movement/detection';
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
    /** Le charbon d'un joueur ne tait que ses propres vigies. */
    if (season !== null) await reassessDetection(ctx, season._id, Date.now(), playerId);
  },
});

/** **Une borne de la fenêtre d'un Guet** (ADR 0037 §5) : la pile se lit à l'ouverture, se fige à
 *  la fin, et la vue de l'observateur se relit avec la ligne. */
export const readPile = internalMutation({
  args: { sightingId: v.id('sightings'), expectedAt: v.number() },
  handler: async (ctx, { sightingId, expectedAt }) => readPileAt(ctx, sightingId, expectedAt),
});
