import { v } from 'convex/values';
import { query } from './_generated/server';
import { nationInk } from '../src/domain/nations';
import { cappedByHq, levelOf, playerBuildings } from './buildings';
import { constructionMinutes, levelCost } from './constants';
import { fail } from './errors';
import { resourceRows, resourceSnapshot } from './resources';
import { playerByToken } from './seasons';

export const playerView = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const { player, season } = await playerByToken(ctx, token);
    if (season.status !== 'launched') fail('SEASON_NOT_LAUNCHED');
    const now = Date.now();

    const rows = await resourceRows(ctx, player._id);
    const buildings = await playerBuildings(ctx, player._id);
    const hqLevel = levelOf(buildings, 'hq');
    const construction = await ctx.db
      .query('constructions')
      .withIndex('byPlayer', (q) => q.eq('playerId', player._id))
      .unique();

    // Tiers are summed here: the board counts riflemen, only the workshop distinguishes
    // their equipment.
    const units = await ctx.db
      .query('units')
      .withIndex('byPlayer', (q) => q.eq('playerId', player._id))
      .collect();
    const armyPresent: Record<string, number> = {};
    for (const unit of units) {
      if (unit.count > 0) armyPresent[unit.role] = (armyPresent[unit.role] ?? 0) + unit.count;
    }

    const others = (
      await ctx.db
        .query('players')
        .withIndex('bySeason', (q) => q.eq('seasonId', season._id))
        .collect()
    ).filter((entry) => entry._id !== player._id);

    // Placeholders, listed so they are not mistaken for served data. Each one waits on a
    // schema slice that is not written (see `CLAUDE.md`, "ce qui reste"):
    //   `number: 1`      — a season is unique and never renumbered; a season history would.
    //   `progress: 0`    — victory progress belongs to the doctrines, surface 4.8.
    //   `slots.used: 0`  — counts movements in flight, which do not exist yet (4.7).
    //   `arcs`/`journal` — same: no movement, so no arc to draw and no dispatch to file.
    //   `lastIntel`      — intelligence is surface 4.9.
    // `travelMinutesPer1000km: 14` is different: it is a measured value (simulation report),
    // hard-coded here until the seasons table carries its own pace.
    return {
      season: {
        number: 1,
        durationHours: season.durationHours,
        elapsedHours: season.launchedAt === null ? 0 : (now - season.launchedAt) / 3_600_000,
        players: others.length + 1,
        playableRegion: season.playableRegion ?? 'world',
        travelMinutesPer1000km: 14,
      },
      me: {
        nation: player.nation ?? '?',
        ink: nationInk(player.nation),
        doctrine: player.doctrine ?? 'domination',
        progress: 0,
        restWindow: player.restWindow,
        supply: resourceSnapshot(rows, 'supply', now),
        steel: resourceSnapshot(rows, 'steel', now),
        manpower: resourceSnapshot(rows, 'manpower', now),
        slots: { total: 1 + levelOf(buildings, 'logistics'), used: 0 },
        buildings: buildings.map((building) => ({
          key: building.key,
          level: building.level,
          nextLevelCost: levelCost(building.level + 1),
          nextLevelMinutes: constructionMinutes(building.level + 1),
          cappedByHq: cappedByHq(building.key, building.level, hqLevel),
        })),
        construction: construction
          ? { name: construction.building, minutesLeft: Math.max(0, (construction.finishesAt - now) / 60_000) }
          : null,
        armyPresent,
      },
      arcs: [],
      journal: [],
      loadedAt: now,
      opponents: others.map((other) => ({
        nation: other.nation ?? other.nickname,
        ink: nationInk(other.nation),
        restWindow: other.restWindow,
        lastIntel: '—',
      })),
    };
  },
});
