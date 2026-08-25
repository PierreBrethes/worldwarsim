import { v } from 'convex/values';
import { mutation } from './_generated/server';
import { playerByToken, requireStarted } from './seasons';

/**
 * **Lu, c'est ce qu'on a eu le temps de voir.** The hour is stamped when the window is *closed*,
 * never when it is opened: a player who opens the journal and is called away has not read the
 * three dispatches under the fold, and marking them read on the way in would empty his banner
 * without him learning anything.
 *
 * One number for the whole journal, and no per-dispatch flag anywhere: the list is rebuilt from
 * the engagements and the notices on every load, so a set of read ids would drift from it the
 * first time a dispatch was reworded. `unread` is `at > journalReadAt`, decided in one place
 * (`src/domain/journal.ts`).
 *
 * `requireStarted` and not `requirePlayable`: a concluded season is read back before the wipe,
 * and closing its journal is reading, not playing.
 */
export const markRead = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const { player, season } = await playerByToken(ctx, token);
    requireStarted(season);
    await ctx.db.patch(player._id, { journalReadAt: Date.now() });
  },
});
