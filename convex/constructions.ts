import { v } from 'convex/values';
import { internalMutation, mutation } from './_generated/server';
import { internal } from './_generated/api';
import { EXPLOITED_DEPOSITS, placementRefusal } from '../src/domain/economy';
import { buildingAt, cappedByHq, levelOf, playerBuildings } from './buildings';
import { MAX_HQ_LEVEL, buildCost, buildMinutes, buildingCap } from './constants';
import { fail } from './errors';
import { homeCountryOf, regionFacts } from './regions';
import { debit } from './resources';
import { playerByToken } from './seasons';
import { BUILDING_KEY } from './validators';

export const start = mutation({
  args: { token: v.string(), building: BUILDING_KEY, regionId: v.string() },
  handler: async (ctx, { token, building, regionId }) => {
    const { player, season } = await playerByToken(ctx, token);
    if (season.status !== 'launched') fail('SEASON_NOT_LAUNCHED');

    /**
     * **One construction at a time per player, never one per region** (ADR 0015). `.unique()`
     * is the whole rule, and it is a decision, not a shortcut: a site per region would make
     * expansion speed a gift of Natural Earth's admin-1 cutting — 9 regions for Bolivia, 51
     * for the United States, 101 for France, 232 for the United Kingdom. An order of magnitude
     * of national advantage, handed out by a data file.
     *
     * The day this ceiling bites too hard, the regulator is a **global ceiling carried by the
     * headquarters**, like the movement slots: same building, same mechanic, one idea to
     * remember. Never a counter per region.
     */
    const running = await ctx.db
      .query('constructions')
      .withIndex('byPlayer', (q) => q.eq('playerId', player._id))
      .unique();
    if (running) fail('CONSTRUCTION_IN_PROGRESS');

    const region = regionFacts(regionId);
    if (!region) fail('UNKNOWN_REGION', { regionId });

    /**
     * Home only. Building abroad needs an outpost within reach (ADR 0015), and an outpost
     * carries no region yet — the table does not exist. Inventing a radius here would be
     * inventing the expansion loop; the rule stays closed until outposts land.
     */
    if (region.country !== homeCountryOf(player.nation)) fail('REGION_NOT_HOME', { regionId });

    const buildings = await playerBuildings(ctx, player._id);
    if (building === 'hq' && buildings.some((held) => held.key === 'hq' && held.regionId !== regionId)) {
      fail('HQ_ALREADY_BUILT');
    }

    const hqLevel = levelOf(buildings, 'hq');
    const cap = buildingCap(hqLevel);
    const refusal = placementRefusal(building, region, {
      onRegion: buildings.find((held) => held.regionId === regionId)?.key ?? null,
      standing: buildings.length,
      cap,
    });
    if (refusal === 'REGION_TAKEN') {
      fail(refusal, { regionId, standing: buildings.find((held) => held.regionId === regionId)?.key });
    }
    if (refusal === 'BUILDING_CAP_REACHED') fail(refusal, { cap, hqLevel });
    if (refusal === 'DEPOSIT_REQUIRED') {
      fail(refusal, { building, expected: EXPLOITED_DEPOSITS[building], found: region.deposit });
    }
    if (refusal === 'NOT_COASTAL') fail(refusal, { regionId });

    const level = (buildingAt(buildings, building, regionId)?.level ?? 0) + 1;
    if (building === 'hq' && level > MAX_HQ_LEVEL) fail('MAX_LEVEL_REACHED', { maximum: MAX_HQ_LEVEL });
    if (cappedByHq(building, level - 1, hqLevel)) fail('CAPPED_BY_HQ');

    const now = Date.now();
    const cost = buildCost(building, level);
    await debit(ctx, player._id, cost, now);

    const finishesAt = now + buildMinutes(building, level) * 60_000;
    const constructionId = await ctx.db.insert('constructions', {
      playerId: player._id,
      building,
      regionId,
      finishesAt,
    });
    await ctx.scheduler.runAt(finishesAt, internal.constructions.finish, { constructionId });
    return { finishesAt, cost, level };
  },
});

export const finish = internalMutation({
  args: { constructionId: v.id('constructions') },
  handler: async (ctx, { constructionId }) => {
    const construction = await ctx.db.get(constructionId);
    if (!construction) return;

    const buildings = await playerBuildings(ctx, construction.playerId);
    const standing = buildingAt(buildings, construction.building, construction.regionId);
    if (standing) {
      await ctx.db.patch(standing._id, { level: standing.level + 1 });
    } else {
      await ctx.db.insert('buildings', {
        playerId: construction.playerId,
        key: construction.building,
        regionId: construction.regionId,
        level: 1,
      });
    }
    await ctx.db.delete(constructionId);
  },
});
