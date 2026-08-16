import { v } from 'convex/values';
import { query } from './_generated/server';
import { BUILDINGS, type BuildingKey } from '../src/domain/ids';
import { nationInk } from '../src/domain/nations';
import { cappedByHq, levelOf, playerBuildings, totalLevelOf } from './buildings';
import {
  buildCost,
  buildMinutes,
  buildingCap,
  isCommanded,
  troopCap,
  type Costs,
} from './constants';
import { fail } from './errors';
import { homeCountryOf, regionFacts, regionsOf } from './regions';
import { OUTLOOK_HOURS, economyOf, extractionSites, maxOrderOf, snapshotAll } from './resources';
import { playerByToken } from './seasons';
import { troopsOf } from './troops';

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

    const troops = await troopsOf(ctx, player._id);

    /**
     * A troop attached to a building that no longer stands **comes home** — it is not lost,
     * and it is not re-hung on the headquarters (ADR 0014, rule 3 of the project). The move is
     * resolved on reading rather than written back: a query cannot write, and a row pointing at
     * a razed building means exactly "at home" until something else moves it.
     */
    const standing = new Set(buildings.map((building) => building._id));
    const stationOf = (troop: (typeof troops)[number]) =>
      troop.stationedAt !== null && standing.has(troop.stationedAt) ? troop.stationedAt : null;

    // The board counts troops by role and forgets their tier: only the workshop distinguishes
    // equipment. The strengths travel per troop, just below.
    const armyPresent: Record<string, number> = {};
    for (const troop of troops) armyPresent[troop.role] = (armyPresent[troop.role] ?? 0) + 1;

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
        /**
         * The three chains and what each one is doing — the industry window's whole reason to
         * exist. The state comes out of the settlement itself (`settleStocks`), never out of a
         * second reading of the stocks: a client that re-derived "à sec" from a stock at zero
         * would call a chain starved the very instant a mine keeps it fed hour for hour.
         *
         * The level is summed over the sites, like the rate it explains: two foundries at one
         * convert what one at two does.
         */
        chains: economy.chains.map(({ conversion, state, missing, made }) => {
          const lot = economy.orders.find((order) => order.chain === conversion.by) ?? null;
          return {
            by: conversion.by,
            output: conversion.output,
            inputs: conversion.inputs.map(([resource, quantity]) => ({ resource, quantity })),
            /**
             * **The real rate first, the nominal second.** A starved arsenal printing "3 / h"
             * beside "À SEC — ALLIAGE" tells the player he is making three an hour; he is
             * making none. The real one is what the outlook actually pushed through, so it
             * cannot disagree with the badge next to it.
             */
            perHour: made / OUTLOOK_HOURS,
            nominalPerHour: conversion.perHour,
            level: totalLevelOf(buildings, conversion.by),
            state,
            missing,
            commanded: isCommanded(conversion.by),
            order: lot === null ? null : { ordered: lot.ordered, produced: Math.floor(lot.produced) },
            maxOrder: maxOrderOf(economy, conversion.by),
          };
        }),
        /** What each exploitation pulls out, site by site — `resources` only carries the sum,
         *  which cannot name the mine that sits on nothing. */
        extraction: extractionSites(buildings),
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
          // The instance, not the key: a nation can hold three barracks, and a link that
          // carried `barracks` would open the one in Normandy for a click in Brittany.
          id: building._id,
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
        /**
         * How many troops may stand at once, carried by the billets (ADR 0014). Served beside
         * the troops themselves so the board can say "18 / 24" without a second count of its
         * own — the list below is complete, so its length is the count.
         */
        troopCap: troopCap(totalLevelOf(buildings, 'billets')),
        troops: troops.map((troop) => ({
          id: troop._id,
          role: troop.role,
          tier: troop.tier,
          strength: troop.currentStrength,
          nominalStrength: troop.nominalStrength,
          stationedAt: stationOf(troop),
        })),
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
