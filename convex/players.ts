import { v } from 'convex/values';
import { mutation } from './_generated/server';
import { NATIONS } from './constants';
import { fail } from './errors';
import { playerByToken } from './seasons';

export const reserveNation = mutation({
  args: { token: v.string(), nation: v.union(v.string(), v.null()) },
  handler: async (ctx, { token, nation }) => {
    const { player, season } = await playerByToken(ctx, token);
    if (season.status !== 'lobby') fail('SEASON_ALREADY_LAUNCHED');
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
  args: {
    token: v.string(),
    doctrine: v.union(v.literal('domination'), v.literal('hegemony'), v.literal('influence')),
  },
  handler: async (ctx, { token, doctrine }) => {
    const { player, season } = await playerByToken(ctx, token);
    if (season.status !== 'lobby') fail('SEASON_ALREADY_LAUNCHED');
    await ctx.db.patch(player._id, { doctrine });
  },
});

export const declareReady = mutation({
  args: { token: v.string(), ready: v.boolean() },
  handler: async (ctx, { token, ready }) => {
    const { player, season } = await playerByToken(ctx, token);
    if (season.status !== 'lobby') fail('SEASON_ALREADY_LAUNCHED');
    if (ready && (player.nation === null || player.doctrine === null)) {
      fail('NATION_AND_DOCTRINE_REQUIRED');
    }
    await ctx.db.patch(player._id, { ready });
  },
});

export const setRestWindow = mutation({
  args: { token: v.string(), startMinutes: v.number(), endMinutes: v.number() },
  handler: async (ctx, { token, startMinutes, endMinutes }) => {
    const { player } = await playerByToken(ctx, token);
    for (const minutes of [startMinutes, endMinutes]) {
      if (!Number.isInteger(minutes) || minutes < 0 || minutes >= 1440) {
        fail('INVALID_REST_WINDOW');
      }
    }
    await ctx.db.patch(player._id, { restWindow: { startMinutes, endMinutes } });
  },
});
