import { v } from 'convex/values';
import { query } from './_generated/server';
import { fail } from './errors';
import type { QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import type { LonLat } from '../src/domain/geo';
import { BUILDINGS, type BuildingKey } from '../src/domain/ids';
import { nationInk } from '../src/domain/nations';
import { movementSlots } from '../src/domain/movement-orders';
import type { TroopStation } from '../src/domain/player-view';
import { cappedByHq, levelOf, playerBuildings, totalLevelOf } from './buildings';
import {
  buildCost,
  buildMinutes,
  buildingCap,
  formatOf,
  isCommanded,
  tier2HqLevel,
  unlockLevel,
  troopCap,
  type Costs,
} from './constants';
import { engagementsOf } from './combat';
import { capReliefOf, queueOf } from './constructions';
import { movementsOf, outpostsOf } from './movement/forces';
import { restHold } from './movements';
import { foundationOwed, homeCountryOf, regionFacts, regionsOf } from './regions';
import { isAnchored } from './upkeep';
import { hostAtPoint } from './routes';
import { OUTLOOK_HOURS, economyOf, extractionSites, maxOrderOf, snapshotAll } from './resources';
import { isAtWar, playerByToken, requireStarted, warEntryOf } from './seasons';
import { troopsOf } from './troops';
import { reductionTarget, standingsOf } from './victory';

export const playerView = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const { player, season } = await playerByToken(ctx, token);
    requireStarted(season);
    /** A seat taken on a running season is not a nation yet: its owner holds no flag, and the
     *  board has nothing to draw. He is sent back to the lobby, to enter the war (`enterWar`). */
    if (!isAtWar(player, season)) fail('NOT_AT_WAR');
    const now = Date.now();

    const economy = await economyOf(ctx, player._id, now);
    const buildings = await playerBuildings(ctx, player._id);
    const hqLevel = levelOf(buildings, 'hq');
    const queue = await queueOf(ctx, player._id);
    /** The head of the queue is the only entry a `finishesAt` ever dates, so it is the only one
     *  the banner and the map can put a crane on — the rest is a list waiting its turn. */
    const construction = queue[0] ?? null;

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
    /** The very set the settlement priced a moment ago (`economyOf`), not a second reading of
     *  "who is far from home": one arbitration, one answer. */
    const unsupplied = new Set<string>(economy.upkeep.unsuppliedTroopIds);

    /**
     * A troop attached to a building that no longer stands **comes home** — it is not lost,
     * and it is not re-hung on the headquarters (ADR 0014, rule 3 of the project). The move is
     * resolved on reading rather than written back: a query cannot write, and a row pointing at
     * a razed building means exactly "at home" until something else moves it.
     */
    const standing = new Set<string>(buildings.map((building) => building._id));
    const garrisoned = new Set<string>(outposts.map((outpost) => outpost._id));
    /**
     * The address, in the shape the screen reads (ADR 0019 §1). A point keeps its coordinates and
     * gains the country hosting it: the client holds no geometry and could not name the place a
     * column was left in otherwise.
     */
    const stationOf = (troop: (typeof troops)[number]): TroopStation => {
      const address = troop.stationedAt;
      if (address === null) return { kind: 'home' };
      if (typeof address !== 'string') {
        return {
          kind: 'point',
          lonLat: [address.lon, address.lat],
          country: hostAtPoint([address.lon, address.lat]),
        };
      }
      if (garrisoned.has(address)) return { kind: 'outpost', outpostId: address };
      return standing.has(address) ? { kind: 'building', buildingId: address } : { kind: 'home' };
    };

    // The board counts troops by role and forgets their tier: only the workshop distinguishes
    // equipment. The strengths travel per troop, just below.
    //
    // A garrison is left out: it is reported on its outpost's own line, and counting it here
    // too would show the same column twice in the inventory — once at home, once in Arabia.
    const armyPresent: Record<string, number> = {};
    for (const troop of troops) {
      if (stationOf(troop).kind === 'outpost') continue;
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

    const seats = await ctx.db
      .query('players')
      .withIndex('bySeason', (q) => q.eq('seasonId', season._id))
      .collect();
    /** The belligerents, never the seats: somebody who joined a running season and is still
     *  choosing his flag is nobody's opponent yet, and would show up as a nation-less one. */
    const others = seats.filter((entry) => entry._id !== player._id && isAtWar(entry, season));

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
          total: movementSlots(hqLevel),
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
         * **What the next headquarters level would carry**, `null` at the top of the ladder.
         * Served rather than derived on the client for the reason the ceiling itself is: the
         * line that says "un quartier général niveau 2 le porte à 8" and the refusal that
         * raised it have to be the same two numbers, and a client-side copy of `buildingCap`
         * is how they stop being one (ADR 0015, révision du 24/08 — rien d'affiché sans sa
         * condition, et une condition qui se chiffre est un plan).
         */
        capRelief: capReliefOf(format, hqLevel),
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
          player.nation,
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
          /** **The point every rule measures from**, and now the one the map draws from too: a
           *  listening station's reach is a circle around it, and drawing that circle around
           *  the region layer's own centroid instead would put the ring tens of kilometres off
           *  the radius the fog actually applies. It is the player's own region — nothing about
           *  anybody else travels with it. */
          point: facts.point,
          buildings: buildings
            .filter((building) => building.regionId === facts.id)
            .map((building) => ({ key: building.key, level: building.level })),
        })),
        // The region and the key travel with it because the map plants the crane on the
        // ground: a region name is a caption, not an anchor.
        construction:
          construction !== null && construction.finishesAt !== null
            ? {
                id: construction._id,
                name: construction.building,
                key: construction.building,
                regionId: construction.regionId,
                regionName: regionFacts(construction.regionId)?.name ?? construction.regionId,
                minutesLeft: Math.max(0, (construction.finishesAt - now) / 60_000),
              }
            : null,
        /**
         * **What is paid for and waiting its turn**, in the order it will be built. It carries
         * no due time and cannot: nothing behind the head is dated in the database, precisely
         * so that a cancellation re-dates nothing (`constructions.ts`). What the screen shows
         * beside a queued line is its rank, not a countdown it would have had to invent.
         */
        constructionQueue: queue.slice(1).map((entry) => ({
          id: entry._id,
          name: entry.building,
          key: entry.building,
          regionId: entry.regionId,
          regionName: regionFacts(entry.regionId)?.name ?? entry.regionId,
          level: entry.level,
        })),
        armyPresent,
        /**
         * What the army costs to hold, and how much of it is standing where nobody feeds it
         * (ADR 0019 §4). The food rate in `resources` is already net of `foodPerHour`; this is
         * the breakdown of that one number, never a second figure to reconcile with it.
         */
        upkeep: {
          troops: economy.upkeep.troops,
          unsupplied: economy.upkeep.unsupplied,
          foodPerHour: economy.upkeep.foodPerHour,
        },
        starving: economy.starving,
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
          /** Read off the same pass that priced it: the badge on the card and the food rate in
           *  the strip cannot disagree, because only one of them was ever computed. */
          supplied: !unsupplied.has(troop._id),
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
            landCost: movement.landCost,
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
      /**
       * **The other half of the fog, and the only one there is** (ADR 0005, ADR 0019 §5): what a
       * posted troop of the player's saw pass within `SCOUT_RADIUS_KM`. Every row is his own —
       * the `sightings` ledger is indexed by observer, so this reading never touches the
       * movements of the board at large and the fan-out of the naive query does not exist
       * (`WWS/docs/technique/brouillard-et-fanout.md`).
       *
       * **Nothing here can leak a type or a composition, because nothing here carries one.** The
       * thread, the endpoints, the media and the two dates: that is exactly what design sheet 04
       * grants a detected movement that has not been identified, and it is the condition the
       * decoy exists on. The nation is not served either — a sentry sees a column go by, not a
       * flag; identification stays the business of the agent and the buildings that carry it.
       *
       * A window that has not opened yet is not served at all. Past its close, the row stays and
       * turns into the last known position ADR 0005 asks for — the client reads the two dates
       * and decides which of the two states it is in.
       */
      detected: await detectedArcs(ctx, player, outposts, now),
      /**
       * **Who came in after the launch, and when.** Everybody reads the same list: a new
       * belligerent is not a secret — his flag is on the map from his first hour, and the
       * journal is the only channel that says a nation has entered the war (nothing else on the
       * board announces it).
       *
       * The launch itself is not in here. Those nations did not *enter* the war, they opened
       * it, and a headline naming all of them at the same minute is a mobilisation order, not
       * news.
       */
      warEntries: seats.flatMap((seat) => {
        const at = warEntryOf(seat, season);
        if (at === null || season.launchedAt === null || at <= season.launchedAt) return [];
        return [{ nickname: seat.nickname, nation: seat.nation ?? seat.nickname, at }];
      }),
      /**
       * **What happened to the player without him asking**, raw — a site finished, a company
       * delivered, a column landed, a point founded or put out of service, a thread a sentry
       * saw, a pass fought dry. Each row was written by the job that did the thing (`NOTICE`).
       *
       * Ids and numbers only, like every other dispatch (ADR 0016). The one thing resolved here
       * is the **region name**: the client holds no region table, and an id in a headline would
       * be worse than no headline.
       */
      notices: (
        await ctx.db
          .query('notices')
          .withIndex('byPlayer', (q) => q.eq('playerId', player._id))
          .collect()
      ).map(named),
      /** The hour he last closed the window, `null` while he never has: the client decides what
       *  is unread from it, and nothing on the server counts dispatches. */
      journalReadAt: player.journalReadAt ?? null,
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

/**
 * The one thing a notice cannot carry across the wire: a region **name**. The client holds no
 * region table, so an id would reach the headline raw. Everything else travels untouched — the
 * shape is the union the schema stores, member for member, so a kind added there breaks the
 * compilation here rather than reaching the journal as a row nobody words.
 */
function named(notice: Doc<'notices'>) {
  const nameOf = (regionId: string) => regionFacts(regionId)?.name ?? regionId;
  switch (notice.kind) {
    case 'constructionCancelled':
    case 'constructionFinished':
      return { ...notice, regionName: nameOf(notice.regionId) };
    case 'recruitmentDelivered':
      return {
        ...notice,
        site:
          notice.site === null
            ? null
            : { building: notice.site.building, regionName: nameOf(notice.site.regionId) },
      };
    default:
      return notice;
  }
}

/**
 * **What the player's sentries saw pass** (ADR 0005, ADR 0019 §5, design sheet 04). Rows are read
 * off his own index — the fog is a ledger per observer, never a filtered scan of the movements
 * table (`WWS/docs/technique/brouillard-et-fanout.md`).
 *
 * What travels is the thread, its two endpoints, the media and the two dates. **Neither the type
 * nor the composition nor the nation is here**, and none of them is fetched: that is what design
 * sheet 04 grants an unidentified movement, and it is the condition the decoy exists on. A sentry
 * watches a column go past; it does not read its flag.
 *
 * `headingAtMe` is the third ink of design sheet 04, decided on the destination alone: the
 * arrival lands on ground the player recognises — his own soil, or the reach of one of his
 * outposts. It is the same reading the aim already gives him (`recognises`, `isAnchored`), so
 * the critical ink and the "recognised ground" marker never disagree.
 */
async function detectedArcs(
  ctx: QueryCtx,
  player: Doc<'players'>,
  outposts: ReadonlyArray<Doc<'outposts'>>,
  now: number,
) {
  const anchors = outposts.map((outpost) => ({
    point: [outpost.point.lon, outpost.point.lat] as LonLat,
  }));
  const home = homeCountryOf(player.nation);

  const sightings = await ctx.db
    .query('sightings')
    .withIndex('byPlayer', (q) => q.eq('playerId', player._id))
    .collect();

  const seen = [];
  for (const sighting of sightings) {
    /** A window that has not opened is not information yet. Past its close the row stays: the
     *  arc becomes the last known position ADR 0005 asks for, and the client decides which of
     *  the two states the two dates put it in. */
    if (sighting.from > now) continue;
    const movement = await ctx.db.get(sighting.movementId);
    if (movement === null) continue;
    seen.push({
      id: movement._id,
      from: movement.from,
      to: movement.to,
      points: movement.points,
      legs: movement.legs,
      distanceUnits: movement.distanceUnits,
      costUnits: movement.costUnits,
      landCost: movement.landCost,
      departedAt: movement.departedAt,
      arrivesAt: movement.arrivesAt,
      headingAtMe: isAnchored([movement.to.lon, movement.to.lat], home, anchors),
      seenFrom: sighting.from,
      seenTo: sighting.to,
      /** **Ce que le joueur a de lui-même**, jamais de la colonne : le détecteur est une ligne
       *  de son propre plateau, et la station se nomme par sa région parce que c'est la seule
       *  qu'il puisse montrer du doigt sur sa carte. Deux stations sinon se lisent pareil. */
      detector: sighting.detector,
      detectorRegion: await regionOfStation(ctx, sighting),
    });
  }
  return seen;
}

/** The region a station listens from, and nothing for the three other detectors: the ground has
 *  no name of its own here, an outpost is named by the country the card already carries, and a
 *  camp is a pile at a point, which is not a place. */
async function regionOfStation(ctx: QueryCtx, sighting: Doc<'sightings'>): Promise<string | null> {
  if (sighting.detector !== 'station' || sighting.detectorId === null) return null;
  const building = await ctx.db.get(sighting.detectorId as Id<'buildings'>);
  return building === null ? null : (regionFacts(building.regionId)?.name ?? null);
}
