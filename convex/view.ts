import { v } from 'convex/values';
import { query } from './_generated/server';
import { BUILDINGS, type BuildingKey } from '../src/domain/ids';
import { nationInk } from '../src/domain/nations';
import { cappedByHq, levelOf, playerBuildings, totalLevelOf } from './buildings';
import {
  buildCost,
  buildMinutes,
  buildingCap,
  foundationOwed,
  formatOf,
  isCommanded,
  tier2HqLevel,
  unlockLevel,
  troopCap,
  type Costs,
} from './constants';
import { engagementsOf } from './combat';
import { movementsOf, outpostsOf, restHold } from './movements';
import { homeCountryOf, regionFacts, regionsOf } from './regions';
import { OUTLOOK_HOURS, economyOf, extractionSites, maxOrderOf, snapshotAll } from './resources';
import { playerByToken, requireStarted } from './seasons';
import { troopsOf } from './troops';
import { reductionTarget, standingsOf } from './victory';

export const playerView = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const { player, season } = await playerByToken(ctx, token);
    requireStarted(season);
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
    const outposts = await outpostsOf(ctx, player._id);
    const movements = await movementsOf(ctx, player._id);

    /**
     * A troop attached to a building that no longer stands **comes home** — it is not lost,
     * and it is not re-hung on the headquarters (ADR 0014, rule 3 of the project). The move is
     * resolved on reading rather than written back: a query cannot write, and a row pointing at
     * a razed building means exactly "at home" until something else moves it.
     */
    const standing = new Set<string>(buildings.map((building) => building._id));
    const garrisoned = new Set<string>(outposts.map((outpost) => outpost._id));
    const isGarrisoned = (troop: (typeof troops)[number]) =>
      troop.stationedAt !== null && garrisoned.has(troop.stationedAt);
    const stationOf = (troop: (typeof troops)[number]) =>
      troop.stationedAt !== null &&
      (standing.has(troop.stationedAt) || garrisoned.has(troop.stationedAt))
        ? troop.stationedAt
        : null;

    // The board counts troops by role and forgets their tier: only the workshop distinguishes
    // equipment. The strengths travel per troop, just below.
    //
    // A garrison is left out: it is reported on its outpost's own line, and counting it here
    // too would show the same column twice in the inventory — once at home, once in Arabia.
    const armyPresent: Record<string, number> = {};
    for (const troop of troops) {
      if (isGarrisoned(troop)) continue;
      armyPresent[troop.role] = (armyPresent[troop.role] ?? 0) + 1;
    }

    const format = formatOf(season.durationHours);

    const buildCatalog = Object.fromEntries(
      BUILDINGS.map((key) => [
        key,
        {
          cost: buildCost(key, 1),
          minutes: buildMinutes(key, 1),
          // The tier travels with the price so the panel offers exactly what the server takes.
          unlockedAtHqLevel: unlockLevel(key, format),
        },
      ]),
    ) as Record<BuildingKey, { cost: Costs; minutes: number; unlockedAtHqLevel: number }>;

    const others = (
      await ctx.db
        .query('players')
        .withIndex('bySeason', (q) => q.eq('seasonId', season._id))
        .collect()
    ).filter((entry) => entry._id !== player._id);

    /**
     * **The board of the test victory, public and named** (`convex/victory.ts`). It is the one
     * place `PlayerView` deliberately hands over something about everybody rather than about
     * me — and it is a departure from design sheet 05, not an oversight: without a secret
     * doctrine there is nothing for a secret to protect, and a first skirmish between friends
     * wants the ribbing. It leaks nothing the fog is for: a capacity is neither a position, nor
     * a composition, nor a heading.
     *
     * Read at the instant, every time: a player who rebuilds over the bar leaves the count of
     * the man who put him under it.
     */
    const standings = await standingsOf(ctx, season._id);
    const nationOf = new Map(
      standings.map((standing) => [
        standing.player._id,
        standing.player.nation ?? standing.player.nickname,
      ]),
    );
    const winnerId = season.winnerId ?? null;
    const winner =
      winnerId === null
        ? null
        : (standings.find((standing) => standing.player._id === winnerId) ?? null);

    // Placeholders, listed so they are not mistaken for served data. Each one waits on a
    // schema slice that is not written (see `CLAUDE.md`, "ce qui reste"):
    //   `number: 1`      — a season is unique and never renumbered; a season history would.
    //   `progress: 0`    — victory progress belongs to the doctrines, surface 4.8.
    //   `journal`        — the dispatches are built on the client from `reports` below.
    //   `lastIntel`      — intelligence is surface 4.9.
    // `travelMinutesPer1000km: 14` is different: it is a measured value (simulation report),
    // hard-coded here until the seasons table carries its own pace.
    return {
      season: {
        number: 1,
        // The format is what the screens read to know how high a headquarters may climb and
        // what the season still owes: one table in `constants.ts`, no second copy in the
        // bundle.
        format,
        durationHours: season.durationHours,
        elapsedHours: season.launchedAt === null ? 0 : (now - season.launchedAt) / 3_600_000,
        players: others.length + 1,
        playableRegion: season.playableRegion ?? 'world',
        travelMinutesPer1000km: 14,
        /** Test scaffolding — it goes whole with the doctrines of design sheet 05. */
        reduction: {
          target: reductionTarget(standings.length),
          concludedAt: season.concludedAt ?? null,
          winnerNation: winner?.player.nation ?? null,
          standings: standings.map((standing) => ({
            nation: standing.player.nation,
            nickname: standing.player.nickname,
            isMine: standing.player._id === player._id,
            isReduced: standing.isReduced,
            reduced: standing.reduced,
          })),
        },
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
            order:
              lot === null ? null : { ordered: lot.ordered, produced: Math.floor(lot.produced) },
            maxOrder: maxOrderOf(economy, conversion.by),
          };
        }),
        /** What each exploitation pulls out, site by site — `resources` only carries the sum,
         *  which cannot name the mine that sits on nothing. */
        extraction: extractionSites(buildings),
        // The slots follow the headquarters since the logistics centre was dissolved
        // (ADR 0015). One slot outlives the building: a nation always has one movement to
        // make, even with its capital flattened.
        slots: {
          total: 1 + hqLevel,
          // A return is not an order and holds nothing (`movements.ts`), so it is not counted.
          used: movements.filter((movement) => movement.type !== 'return').length,
        },
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
        buildingCap: buildingCap(format, hqLevel),
        /**
         * The headquarters level that opens mark 2 **in this format** (ADR 0017). Served rather
         * than read off a constant by the screen: the line that says "verrouillé jusqu'au QG 3"
         * and the recruitment that refuses tier 2 have to be the same number, and a client-side
         * copy of the rule is how they stop being one.
         */
        tier2HqLevel: tier2HqLevel(format),
        /**
         * What the season still owes, in placement order — free and immediate wherever the
         * player decides to put it. Served rather than derived on the client: the format lives
         * in one table, and a season whose foundation is not placed is a state the screen has
         * to be able to say out loud.
         */
        foundation: foundationOwed(
          format,
          buildings.map((building) => building.key),
        ),
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
        /**
         * **Mine only.** An opponent's outpost is exactly the kind of thing the fog exists to
         * hide (ADR 0005), and the way not to leak it is not to fetch it.
         *
         * `garrison` is a head count of the troops attached to the point — the founding column,
         * until something else can move one. It is an address and nothing more: what a garrison
         * *does* when attacked is the combat pass's to say.
         */
        outposts: outposts.map((outpost) => ({
          id: outpost._id,
          hostCountry: outpost.hostCountry,
          lonLat: [outpost.point.lon, outpost.point.lat] as [number, number],
          specialization: outpost.specialization,
          level: outpost.level,
          garrison: troops.filter((troop) => troop.stationedAt === outpost._id).length,
          /** Minutes until a raided point comes back, `null` when it is standing. Served as a
           *  countdown rather than an instant, like every other due time on the board. */
          disabledMinutesLeft:
            outpost.disabledUntil !== null && outpost.disabledUntil > now
              ? (outpost.disabledUntil - now) / 60_000
              : null,
          isMine: true,
        })),
      },
      /**
       * **What the engagements of this player amount to**, attacked and attacking alike — the
       * raw material of the journal, and later of the visual replay. Numbers only: the French
       * is built on the client (ADR 0016), and re-resolving a pass to display it is how two
       * accounts of the same battle start disagreeing.
       */
      reports: (await engagementsOf(ctx, player._id)).map((engagement) => {
        const side =
          engagement.attackerId === player._id ? ('attacker' as const) : ('defender' as const);
        const tally = (of: 'attacker' | 'defender') => {
          const rows = engagement.troops.filter((troop) => troop.side === of);
          return {
            troops: rows.length,
            lost: rows.reduce(
              (sum, troop) => sum + (troop.strengthBefore - troop.strengthAfter),
              0,
            ),
            routed: rows.filter((troop) => troop.state === 'routed').length,
            destroyed: rows.filter((troop) => troop.state === 'destroyed').length,
          };
        };
        return {
          id: engagement._id,
          at: engagement.at,
          cause: engagement.cause,
          side,
          won: engagement.winner === side,
          hostCountry: engagement.hostCountry,
          outpostDisabled: engagement.disabledUntil !== null,
          mine: tally(side),
          theirs: tally(side === 'attacker' ? 'defender' : 'attacker'),
          /**
           * **Named on purpose**, like the board above it: the journal writes "X a réduit Y" so
           * the table is legible from the account rather than from a second count. Both nations
           * were in the same battle — neither learns anything from being named.
           */
          reduced: engagement.reducedDefender
            ? {
                by: nationOf.get(engagement.attackerId) ?? '?',
                whom: nationOf.get(engagement.defenderId) ?? '?',
              }
            : null,
        };
      }),
      /**
       * What a first level costs, for the fifteen keys. The client needs it to price the lines
       * of the construction panel before anything stands there, and balance numbers stay where
       * they belong — `convex/constants.ts`, never a second table in the bundle.
       */
      buildCatalog,
      /**
       * **Mine only, and that is the whole design of this field.** An enemy movement is exactly
       * what the fog exists to hide (ADR 0005): the way not to leak it is not to fetch it, and
       * the day intelligence serves detected arcs they will come through a field of their own,
       * with neither a type nor a composition to lose.
       *
       * The route travels whole — the polyline, the legs, the two costs — because the map draws
       * the thread from it and the pawn walks it. It was written once, at departure, from the
       * grid the server itself routed on (ADR 0012): nothing here recomputes a geometry to
       * display it.
       */
      movements: await Promise.all(
        movements.map(async (movement) => {
          const barracks =
            movement.fromBuildingId === null ? null : await ctx.db.get(movement.fromBuildingId);
          const origin = barracks === null ? null : regionFacts(barracks.regionId);
          const destination =
            movement.target.kind === 'region' ? regionFacts(movement.target.regionId) : null;
          return {
            id: movement._id,
            type: movement.type,
            from: movement.from,
            to: movement.to,
            points: movement.points,
            legs: movement.legs,
            distanceUnits: movement.distanceUnits,
            costUnits: movement.costUnits,
            originCountry: origin?.country ?? movement.hostCountry,
            originName: origin?.name ?? movement.hostCountry,
            destinationCountry: movement.hostCountry,
            destinationName: destination?.name ?? movement.hostCountry,
            /** The troops it carries: they keep their address, so the board has to know which
             *  ones are on the road before it offers them to a second order. */
            troopIds: movement.troopIds,
            roles: movement.troopIds.flatMap((troopId) => {
              const troop = troops.find((candidate) => candidate._id === troopId);
              return troop ? [troop.role] : [];
            }),
            departedAt: movement.departedAt,
            arrivesAt: movement.arrivesAt,
            /** The target's rest window, if the arrival bites it: the column then waits at the
             *  border until it closes (design sheet 07). */
            holdUntil: await restHold(ctx, player._id, movement.hostCountry, movement.arrivesAt),
          };
        }),
      ),
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
