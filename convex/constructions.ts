import { v } from 'convex/values';
import { internalMutation, mutation } from './_generated/server';
import { internal } from './_generated/api';
import { accruedStock } from '../src/domain/off-season';
import { cappedByHq, levelOf, playerBuildings } from './buildings';
import { STARTING, constructionMinutes, levelCost } from './constants';
import { fail } from './errors';
import { resourceRow } from './resources';
import { playerByToken } from './seasons';
import { BUILDING_KEY } from './validators';

export const start = mutation({
  args: { token: v.string(), building: BUILDING_KEY },
  handler: async (ctx, { token, building }) => {
    const { player, season } = await playerByToken(ctx, token);
    if (season.status !== 'launched') fail('SEASON_NOT_LAUNCHED');

    const running = await ctx.db
      .query('constructions')
      .withIndex('byPlayer', (q) => q.eq('playerId', player._id))
      .unique();
    if (running) fail('CONSTRUCTION_IN_PROGRESS');

    const buildings = await playerBuildings(ctx, player._id);
    const target = buildings.find((candidate) => candidate.key === building);
    if (!target) fail('UNKNOWN_BUILDING');
    if (cappedByHq(building, target.level, levelOf(buildings, 'hq'))) fail('CAPPED_BY_HQ');

    const now = Date.now();
    const cost = levelCost(target.level + 1);
    const supply = await resourceRow(ctx, player._id, 'supply');
    const available = accruedStock(supply, now);
    if (available < cost) {
      fail('INSUFFICIENT_RESOURCE', { resource: 'supply', needed: cost, available: Math.floor(available) });
    }
    await ctx.db.patch(supply._id, { stock: available - cost, updatedAt: now });

    const finishesAt = now + constructionMinutes(target.level + 1) * 60_000;
    const constructionId = await ctx.db.insert('constructions', { playerId: player._id, building, finishesAt });
    await ctx.scheduler.runAt(finishesAt, internal.constructions.finish, { constructionId });
    return { finishesAt, cost };
  },
});

export const finish = internalMutation({
  args: { constructionId: v.id('constructions') },
  handler: async (ctx, { constructionId }) => {
    const construction = await ctx.db.get(constructionId);
    if (!construction) return;
    const buildings = await playerBuildings(ctx, construction.playerId);
    const target = buildings.find((candidate) => candidate.key === construction.building);
    if (target) {
      const level = target.level + 1;
      await ctx.db.patch(target._id, { level });
      if (construction.building === 'conscription') {
        const now = Date.now();
        const manpower = await resourceRow(ctx, construction.playerId, 'manpower');
        await ctx.db.patch(manpower._id, {
          stock: accruedStock(manpower, now, manpower.cap ?? undefined),
          updatedAt: now,
          ratePerHour: STARTING.manpower.ratePerHour * level,
          cap: STARTING.manpower.cap * level,
        });
      }
    }
    await ctx.db.delete(constructionId);
  },
});
