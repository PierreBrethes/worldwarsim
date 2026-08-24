import { v } from 'convex/values';
import { mutation } from './_generated/server';
import type { Doc } from './_generated/dataModel';
import { NATIONS, restWindowFrom } from './constants';
import { fail } from './errors';
import { isAtWar, playerByToken } from './seasons';
import { DOCTRINE } from './validators';

/**
 * **The choices of the lobby seal at the player's own entry into war**, not at the season's
 * launch. For everybody present at the launch the two hours are the same one; for a latecomer
 * they are not, and he has a nation and a doctrine to pick on a season already running
 * (`seasons.enterWar`).
 *
 * A concluded season answers with its own code: it is not "already launched", it is over.
 */
function requireStillChoosing(player: Doc<'players'>, season: Doc<'seasons'>): void {
  if (season.status === 'concluded') fail('SEASON_CONCLUDED');
  if (isAtWar(player, season)) fail('SEASON_ALREADY_LAUNCHED');
}

export const reserveNation = mutation({
  args: { token: v.string(), nation: v.union(v.string(), v.null()) },
  handler: async (ctx, { token, nation }) => {
    const { player, season } = await playerByToken(ctx, token);
    requireStillChoosing(player, season);
    if (nation === null) {
      await ctx.db.patch(player._id, { nation: null, ready: false });
      return;
    }
    if (!NATIONS.includes(nation as (typeof NATIONS)[number])) fail('UNKNOWN_NATION');
    const present = await ctx.db
      .query('players')
      .withIndex('bySeason', (q) => q.eq('seasonId', season._id))
      .collect();
    const holder = present.find((entry) => entry.nation === nation);
    if (holder && holder._id !== player._id) {
      fail('NATION_TAKEN', { nation, nickname: holder.nickname });
    }
    await ctx.db.patch(player._id, { nation });
  },
});

export const chooseDoctrine = mutation({
  args: { token: v.string(), doctrine: DOCTRINE },
  handler: async (ctx, { token, doctrine }) => {
    const { player, season } = await playerByToken(ctx, token);
    requireStillChoosing(player, season);
    await ctx.db.patch(player._id, { doctrine });
  },
});

export const declareReady = mutation({
  args: { token: v.string(), ready: v.boolean() },
  handler: async (ctx, { token, ready }) => {
    const { player, season } = await playerByToken(ctx, token);
    requireStillChoosing(player, season);
    if (ready && (player.nation === null || player.doctrine === null)) {
      fail('NATION_AND_DOCTRINE_REQUIRED');
    }
    await ctx.db.patch(player._id, { ready });
  },
});

/**
 * The rest window is declared before entering the war and frozen there, like the nation and the
 * doctrine. Left open mid-season it becomes a shield one slides: the window is public, so a
 * player who sees a movement heading his way could move his hours over its arrival and buy
 * himself a stall at the border. Being able to promise "I sleep at these hours" only means
 * something if the promise cannot move once the shooting starts.
 *
 * The cost, assumed: over a 7-day season, a player whose real schedule changes cannot follow.
 */
export const setRestWindow = mutation({
  args: { token: v.string(), startMinutes: v.number() },
  handler: async (ctx, { token, startMinutes }) => {
    const { player, season } = await playerByToken(ctx, token);
    if (isAtWar(player, season)) fail('REST_WINDOW_FROZEN');
    if (!Number.isInteger(startMinutes) || startMinutes < 0 || startMinutes >= 1440) {
      fail('INVALID_REST_WINDOW');
    }
    await ctx.db.patch(player._id, { restWindow: restWindowFrom(startMinutes) });
  },
});
