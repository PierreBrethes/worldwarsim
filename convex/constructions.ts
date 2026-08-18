import { v } from 'convex/values';
import { internalMutation, mutation } from './_generated/server';
import { internal } from './_generated/api';
import { EXPLOITED_DEPOSITS, placementRefusal } from '../src/domain/economy';
import { nearestOutpostKm } from '../src/domain/outposts';
import { buildingAt, cappedByHq, levelOf, playerBuildings } from './buildings';
import {
  OUTPOST_REACH_KM,
  SEASON_FORMATS,
  UNLOCKED_AT,
  buildCost,
  buildMinutes,
  buildingCap,
  foundationOwed,
  formatOf,
} from './constants';
import { outpostsOf, pointOf } from './movements';
import { fail } from './errors';
import { homeCountryOf, regionFacts } from './regions';
import { debit } from './resources';
import { playerByToken, requirePlayable } from './seasons';
import { BUILDING_KEY } from './validators';

/** An outpost row, as the reach reads it: a point and nothing else. */
const reachSource = (outpost: { point: { lon: number; lat: number } }) => ({
  point: pointOf(outpost.point),
});

export const start = mutation({
  args: { token: v.string(), building: BUILDING_KEY, regionId: v.string() },
  handler: async (ctx, { token, building, regionId }) => {
    const { player, season } = await playerByToken(ctx, token);
    requirePlayable(season);

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
     * **Home, or within reach of one of the player's outposts** (ADR 0015). The reach is a
     * radius in kilometres, never a count of regions — Natural Earth cuts the United Kingdom
     * into 232 districts and Germany into 16, so a radius counted in regions would let a
     * cartography vendor balance the season. How many regions it covers therefore varies by
     * country: that is the geography speaking.
     *
     * Nothing else moves. A well in Arabia is a building like any other — it wants its
     * deposit, it takes the single site of its region, it counts against the ceiling the
     * headquarters carries, and it will be lootable the day looting exists.
     */
    if (region.country !== homeCountryOf(player.nation)) {
      const outposts = await outpostsOf(ctx, player._id);
      const nearest = nearestOutpostKm(region.point, outposts.map(reachSource));
      if (nearest === null || nearest > OUTPOST_REACH_KM) {
        fail('OUT_OF_OUTPOST_REACH', {
          regionId,
          reachKm: OUTPOST_REACH_KM,
          nearestKm: nearest === null ? null : Math.round(nearest),
        });
      }
    }

    const buildings = await playerBuildings(ctx, player._id);
    if (
      building === 'hq' &&
      buildings.some((held) => held.key === 'hq' && held.regionId !== regionId)
    ) {
      fail('HQ_ALREADY_BUILT');
    }

    const hqLevel = levelOf(buildings, 'hq');
    const cap = buildingCap(hqLevel);
    const refusal = placementRefusal(
      building,
      region,
      {
        onRegion: buildings.find((held) => held.regionId === regionId)?.key ?? null,
        standing: buildings.length,
        cap,
        hqLevel,
      },
      UNLOCKED_AT[building],
    );
    if (refusal === 'REGION_TAKEN') {
      fail(refusal, {
        regionId,
        standing: buildings.find((held) => held.regionId === regionId)?.key,
      });
    }
    if (refusal === 'BUILDING_CAP_REACHED') fail(refusal, { cap, hqLevel });
    // The refusal names its threshold: "demande un QG de niveau 3" is a plan, "impossible" is
    // a wall — and the tier is the one refusal a player can always act on.
    if (refusal === 'BUILDING_LOCKED') {
      fail(refusal, { building, requiredLevel: UNLOCKED_AT[building], hqLevel });
    }
    if (refusal === 'DEPOSIT_REQUIRED') {
      fail(refusal, { building, expected: EXPLOITED_DEPOSITS[building], found: region.deposit });
    }
    if (refusal === 'NOT_COASTAL') fail(refusal, { regionId });

    const format = formatOf(season.durationHours);
    const maximum = SEASON_FORMATS[format].maxHqLevel;
    const level = (buildingAt(buildings, building, regionId)?.level ?? 0) + 1;
    if (building === 'hq' && level > maximum) fail('MAX_LEVEL_REACHED', { maximum });
    if (cappedByHq(building, level - 1, hqLevel)) fail('CAPPED_BY_HQ');

    const now = Date.now();

    /**
     * **The foundation is placed, never offered.** Choosing the region is the one gesture of
     * the opening that is a decision; the price and the wait on what is not one are what the
     * format takes back. So as long as a key of the foundation is still owed, its first
     * placement costs nothing and stands at once — every other rule above having already had
     * its say, without exception: deposit, one building per region, home country, the ceiling
     * the headquarters carries, and the single construction at a time.
     *
     * It opens no construction of its own: there is nothing to wait for.
     */
    if (
      level === 1 &&
      foundationOwed(
        format,
        buildings.map((held) => held.key),
      ).includes(building)
    ) {
      await ctx.db.insert('buildings', { playerId: player._id, key: building, regionId, level: 1 });
      return { finishesAt: now, cost: {}, level };
    }

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
