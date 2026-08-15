import { v } from 'convex/values';
import { query } from './_generated/server';
import { BUILDINGS, type BuildingKey } from '../src/domain/ids';
import { nationInk } from '../src/domain/nations';
import { cappedByHq, levelOf, playerBuildings } from './buildings';
import { buildCost, buildMinutes, buildingCap, type Costs } from './constants';
import { fail } from './errors';
import { homeCountryOf, regionFacts, regionsOf } from './regions';
import { economyOf, snapshotAll } from './resources';
import { playerByToken } from './seasons';

export const playerView = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const { player, season } = await playerByToken(ctx, token);
    if (season.status !== 'launched') fail('SEASON_NOT_LAUNCHED');
    const now = Date.now();

    const economy = await economyOf(ctx, player._id, now);
    const buildings = await playerBuildings(ctx, player._id);
    const hqLevel = levelOf(buildings, 'hq');
    const construction = await ctx.db
      .query('constructions')
      .withIndex('byPlayer', (q) => q.eq('playerId', player._id))
      .unique();

    /**
     * The ground a player may build on: his home country, plus any region already carrying
     * one of his buildings. Not the map — what he may act on, which is the whole point of
     * `PlayerView`. It went from "the regions carrying a deposit" to the entire home country
     * the day construction moved onto the map: a barracks needs no deposit, so an empty
     * region is a site now, and the panel cannot offer what it was never told about.
     */
    const home = homeCountryOf(player.nation);
    const carrying = new Map(
      (home === null ? [] : regionsOf(home)).map((facts) => [facts.id, facts]),
    );
    for (const building of buildings) {
      const facts = regionFacts(building.regionId);
      if (facts) carrying.set(facts.id, facts);
    }

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

    const buildCatalog = Object.fromEntries(
      BUILDINGS.map((key) => [key, { cost: buildCost(key, 1), minutes: buildMinutes(key, 1) }]),
    ) as Record<BuildingKey, { cost: Costs; minutes: number }>;

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
        resources: snapshotAll(economy),
        // The slots follow the headquarters since the logistics centre was dissolved
        // (ADR 0015). One slot outlives the building: a nation always has one movement to
        // make, even with its capital flattened.
        slots: { total: 1 + hqLevel, used: 0 },
        // The construction screen needs it to know how high it may offer to build: nothing
        // rises above the headquarters (`cappedByHq`).
        hqLevel,
        /**
         * The global ceiling on standing buildings. Without it the construction screen cannot
         * tell what it may offer, and would propose a building the server then refuses — worse
         * than a greyed-out line, because the refusal only lands after the click.
         *
         * The count of standing buildings is not served beside it: `buildings` below is the
         * whole list, so its length *is* the count. Two numbers for one fact would diverge.
         */
        buildingCap: buildingCap(hqLevel),
        buildings: buildings.map((building) => ({
          key: building.key,
          regionId: building.regionId,
          level: building.level,
          nextLevelCost: buildCost(building.key, building.level + 1),
          nextLevelMinutes: buildMinutes(building.key, building.level + 1),
          cappedByHq: cappedByHq(building.key, building.level, hqLevel),
        })),
        regions: [...carrying.values()].map((facts) => ({
          id: facts.id,
          name: facts.name,
          deposit: facts.deposit,
          coastal: facts.coastal,
          buildings: buildings
            .filter((building) => building.regionId === facts.id)
            .map((building) => ({ key: building.key, level: building.level })),
        })),
        // The region and the key travel with it because the map plants the crane on the
        // ground: a region name is a caption, not an anchor.
        construction: construction
          ? {
              name: construction.building,
              key: construction.building,
              regionId: construction.regionId,
              regionName: regionFacts(construction.regionId)?.name ?? construction.regionId,
              minutesLeft: Math.max(0, (construction.finishesAt - now) / 60_000),
            }
          : null,
        armyPresent,
      },
      /**
       * What a first level costs, for the fifteen keys. The client needs it to price the lines
       * of the construction panel before anything stands there, and balance numbers stay where
       * they belong — `convex/constants.ts`, never a second table in the bundle.
       */
      buildCatalog,
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
