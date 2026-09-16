import { v } from 'convex/values';
import { query } from './_generated/server';
import { fail } from './errors';
import type { QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { pathLengthKm, pointsAhead, type LonLat } from '../src/domain/geo';
import { distanceProgressAt, type MarchingForce } from '../src/domain/interception';
import { seenSegment } from '../src/domain/sighting-segment';
import { isStanding, type OutpostReach } from '../src/domain/outposts';
import {
  canonicalBuildingKey,
  isOutpostWork,
  BUILDINGS,
  RESOURCES,
  type BuildCostKey,
  type BuildingKey,
} from '../src/domain/ids';
import { carryCapacityOf } from '../src/domain/loot';
import { coveredRegions } from '../src/domain/control';
import { isNation, nationInk } from '../src/domain/nations';
import { depositOfRegion } from '../src/domain/world';
import { movementSlots } from '../src/domain/movement-orders';
import { NOTICES_SERVED, type TroopStation } from '../src/domain/player-view';
import { buildingCostKey, cappedByHq, levelOf, playerBuildings, totalLevelOf } from './buildings';
import {
  FOUNDER_ABSENCE_NOTICE_HOURS,
  MAX_PLAYERS,
  PRESS_EDITION_HOURS,
  TIER_2_HQ_LEVEL,
  buildCost,
  buildMinutes,
  OUTPOST_MAX_LEVEL,
  outpostReachKm,
  CARRY_CAPACITY_BY_ROLE,
  LAST_KNOWN_HOURS,
  isCommanded,
  unlockLevel,
  troopCap,
  type Costs,
} from './constants';
import { engagementsOf } from './combat';
import { homeSlotReliefOf, queueOf } from './constructions';
import { sitesOf, type Site } from './sites';
import { movementsOf, outpostsOf, pointOf, specializationsServed } from './movement/forces';
import { marchingForce } from './movement/detection';
import { heldOver } from './holding';
import { restHold } from './movements';
import {
  allRegions,
  capitalRegionOf,
  foundationOwed,
  homeCountryOf,
  regionFacts,
  regionOfOutpost,
  regionsOf,
} from './regions';
import { anchorOf, isAnchored } from './upkeep';
import { coastAtPoint, GRID_STEP_KM, hostAtPoint, landAtPoint } from './routes';
import { OUTLOOK_HOURS, economyOf, maxOrderOf, snapshotAll } from './resources';
import {
  concludeOpensAt,
  concludeRefusal,
  founderOf,
  isAtWar,
  lastSeenOf,
  playerOf,
  requireStarted,
  warEntryOf,
} from './seasons';
import { recruitmentsOf, troopsOf } from './troops';
import { reductionTarget, standingsOf } from './victory';
import { cargoTotal, movementCargoLoads, stationedCargoGroups } from './cargo';

/** La clé d'une ligne de file telle que l'écran la lit : un `depot` historique reprend son nom
 *  canonique, une élévation d'avant-poste garde le sien — elle n'est pas un bâtiment. */
const workKey = (building: BuildCostKey): BuildCostKey =>
  isOutpostWork(building) ? building : canonicalBuildingKey(building);

export const playerView = query({
  args: { token: v.string(), seasonId: v.id('seasons') },
  handler: (ctx, { token, seasonId }) => viewOf(ctx, token, seasonId),
});

/**
 * **La vue d'un joueur, en fonction.** `playerView` n'est plus qu'une porte : l'export de la
 * saison de référence (`dev.snapshot`) sert exactement ce que le plateau reçoit, et il le sert en
 * appelant ceci plutôt qu'en recopiant une projection. Une copie aurait divergé au premier champ
 * ajouté, et l'état de référence aurait recommencé à décrire un jeu qui n'existe plus — la panne
 * même que l'ancien simulateur laissait derrière lui.
 */
export async function viewOf(ctx: QueryCtx, token: string, seasonId: Id<'seasons'>) {
  const { player, season } = await playerOf(ctx, token, seasonId);
  requireStarted(season);
  /** A seat taken on a running season is not a nation yet: its owner holds no flag, and the
   *  board has nothing to draw. He is sent back to the lobby, to enter the war (`enterWar`). */
  if (!isAtWar(player, season)) fail('NOT_AT_WAR');
  const now = Date.now();

  const economy = await economyOf(ctx, player._id, now);
  const buildings = await playerBuildings(ctx, player._id);
  const hqLevel = levelOf(buildings, 'hq');
  /** Every site of his and what is left on it, read by the one function both doors of the
   *  placement rule read (`convex/sites.ts`). */
  const sites = await sitesOf(ctx, player);
  const queue = await queueOf(ctx, player._id);
  /** The head of the queue is the only entry a `finishesAt` ever dates, so it is the only one
   *  the banner and the map can put a crane on — the rest is a list waiting its turn. */
  const construction = queue[0] ?? null;

  /**
   * The ground a player may build on: his home country, any region already carrying one of his
   * buildings, and **the whole circle of each of his outposts** — the reach, not its centre.
   * Not the map — what he may act on, which is the whole point of `PlayerView`. It went from
   * "the regions carrying a deposit" to the entire home country the day construction moved onto
   * the map: a barracks needs no deposit, so an empty region is a site now, and the panel
   * cannot offer what it was never told about.
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
  const recruiting = await recruitmentsOf(ctx, player._id);
  const outposts = await outpostsOf(ctx, player._id);
  /**
   * **Le cercle entier d'un avant-poste, pas seulement la région de son point** (ADR 0020 §1 :
   * là où je tiens est là où je peux bâtir). Servir le seul sol du point laissait le joueur voir
   * tenu — `heldOver` tient le cercle depuis toujours — ce que la vue ne lui offrait pas :
   * `siteOf` répond `null` pour une région absente d'ici, et le panneau le lit comme « rien ne
   * se bâtit là ».
   *
   * Les mêmes détecteurs que le relevé du sol (`standingObserversOf`), aux mêmes conditions :
   * la région du point est couverte quelle que soit sa taille (précision du 04/09), et **un
   * point hors service couvre encore** — il ancre toujours (§10), et le serveur accepterait ce
   * que la vue refuserait d'offrir. Le budget d'emplacements ne bouge pas pour autant : il reste
   * celui du point (`convex/sites.ts`), partagé entre toutes ses régions.
   */
  const reaches = outposts
    /** **Un chantier n'atteint rien** (révision du 15/09) : il n'offre aucun emplacement, donc
     *  il n'ouvre aucun sol — le serveur refuserait ce que la vue offrirait. */
    .filter((outpost) => isStanding(outpost, now))
    .map((outpost) => ({
      point: pointOf(outpost.point),
      radiusKm: outpostReachKm(outpost.level),
      regionId: regionOfOutpost(outpost),
    }));
  const reached = coveredRegions(allRegions(), reaches);
  for (const facts of allRegions()) if (reached.has(facts.id)) carrying.set(facts.id, facts);
  /**
   * **La couleur du sol qu'il peut bâtir**, lue par la fonction unique (`convex/holding.ts`) que
   * la carte, le classement et le relevé lisent aussi. Elle est servie par région parce que
   * c'est là que le joueur la lit — la modale d'un site, la colonne d'une filière et la carte
   * « à faire maintenant » posent toutes la même question sur la même région.
   */
  const held = await heldOver(ctx, season._id, [...carrying.values()], now);

  const locked = await specializationsServed(ctx, season._id, outposts);
  const sealed = outposts.map((outpost) => ({
    outpost,
    specializationLocked: locked.has(outpost._id),
  }));
  const movements = await movementsOf(ctx, player._id);
  const surveyedInstallations = (
    await ctx.db
      .query('regionSightings')
      .withIndex('byPlayerHasInstallations', (q) =>
        q.eq('playerId', player._id).eq('hasInstallations', true),
      )
      .collect()
  ).flatMap((survey) =>
    (survey.installations ?? []).map((installation) => ({
      id: installation.buildingId,
      key: canonicalBuildingKey(installation.key),
      regionId: survey.regionId,
    })),
  );
  const lootSightings = await ctx.db
    .query('lootCrateSightings')
    .withIndex('byPlayer', (q) => q.eq('playerId', player._id))
    .collect();
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
  const stationOfAddress = (address: (typeof troops)[number]['stationedAt']): TroopStation => {
    if (address === null) return { kind: 'home' };
    if (typeof address !== 'string') {
      const point: LonLat = [address.lon, address.lat];
      return {
        kind: 'point',
        lonLat: point,
        country: hostAtPoint(point),
        afloat: !landAtPoint(point),
        coastal: coastAtPoint(point),
      };
    }
    if (garrisoned.has(address)) return { kind: 'outpost', outpostId: address };
    return standing.has(address) ? { kind: 'building', buildingId: address } : { kind: 'home' };
  };
  const stationOf = (troop: (typeof troops)[number]): TroopStation =>
    stationOfAddress(troop.stationedAt);

  const stationedCargo = await stationedCargoGroups(ctx, season._id, player._id);
  const totalOf = (amounts: ReturnType<typeof cargoTotal>): number =>
    RESOURCES.reduce((sum, resource) => sum + amounts[resource], 0);
  const capacityOf = (carriers: ReadonlyArray<(typeof troops)[number]>): number =>
    carryCapacityOf(
      carriers.map((troop) => ({
        role: troop.role,
        strength: troop.currentStrength,
        nominalStrength: troop.nominalStrength,
      })),
      CARRY_CAPACITY_BY_ROLE,
    );
  const cargoView = (
    loads: ReadonlyArray<ReturnType<typeof movementCargoLoads>[number]>,
    capacity: number,
  ) => {
    const loot = cargoTotal(loads);
    const carried = totalOf(loot);
    return { loot, carried, capacity, free: Math.max(0, capacity - carried) };
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

  const buildCatalog = Object.fromEntries(
    BUILDINGS.map((key) => [
      key,
      {
        cost: buildCost(key, 1),
        minutes: buildMinutes(key, 1),
        // The tier travels with the price so the panel offers exactly what the server takes.
        unlockedAtHqLevel: unlockLevel(key),
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
   * me, and that is the point: the condition is unique, so it is read out loud (ADR 0020 §4),
   * and a first skirmish between friends wants the ribbing. It leaks nothing the fog is for:
   * a capacity is neither a position, nor a composition, nor a heading.
   *
   * Read at the instant, every time: a player who rebuilds over the bar leaves the count of
   * the man who put him under it.
   *
   * **Et il reste dans la vue, sciemment** (enquête sur les bornes, 05/09) : le tableau lit les
   * troupes de chaque belligérant et, par `executionerOf`, les passes qu'il a subies — c'est la
   * seule lecture de `playerView` qui grandisse avec le nombre de joueurs et qu'aucune fenêtre
   * ne borne. Le sortir dans une query à part le rendrait moins cher au chargement du plateau,
   * et ce serait du travail sur un échafaudage condamné : la Domination simplifiée part entière
   * avec la part de carte (ADR 0020), elle ne s'amende pas. Le jour où elle part, ce coût part
   * avec elle ; d'ici là il est connu, et c'est tout ce qu'on lui demande.
   */
  /**
   * **La seule sortie de `lastSeenAt`, et elle ne parle que du fondateur.** Une « dernière
   * connexion » servie pour un autre siège serait un canal sur les plages de repos (ADR 0005) :
   * on saurait quand frapper. Ce qui sort ici est une durée d'absence, d'un seul joueur, dont
   * l'absence a une conséquence de règle publique — et seulement quand la porte est proche
   * (`FOUNDER_ABSENCE_NOTICE_HOURS`) ou déjà ouverte. Le reste du temps : `null`, et le plateau
   * n'a pas de ligne.
   */
  const founder = founderOf(seats);
  const opensAt = founder === null ? null : concludeOpensAt(founder, season);
  const founderAbsence =
    founder === null || opensAt === null
      ? null
      : opensAt - now > FOUNDER_ABSENCE_NOTICE_HOURS * 3_600_000
        ? null
        : {
            hours: Math.max(0, now - lastSeenOf(founder, season)) / 3_600_000,
            concludeOpensAt: opensAt,
          };

  const press = await lastEdition(ctx, season._id, player._id);

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
  //   `progress: 0`    — victory progress waits on the share of the map (ADR 0020),
  //                      surface 4.8.
  //   `journal`        — the dispatches are built on the client from `reports` below.
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
      /** Test scaffolding — it goes whole the day the share of the map replaces it
       *  (ADR 0020). */
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
      /** Le seul pouvoir que le plateau réserve au fondateur : clore une saison sans horloge
       *  (`seasons.conclude`). Rien d'autre n'en dépend. */
      creator: player.creator,
      /**
       * **Ce que `seasons.conclude` accepterait de lui, à cet instant**, par la fonction que la
       * mutation lit elle-même (ADR 0015) : le bouton n'est jamais grisé, il est là ou il n'y
       * est pas. C'est le fondateur, et le doyen quand le fondateur ne revient plus.
       */
      mayConclude:
        season.status === 'launched' &&
        player.defeated !== true &&
        concludeRefusal(player, seats, season, now) === null,
      founderAbsence,
      /** **Il observe.** Le plateau se lit entier — c'est bien sa vue, portée par ses
       *  détecteurs restants — et les surfaces d'action se présentent sans leurs boutons :
       *  l'interface ne promet pas ce que `requirePlayable` refuse déjà (audit du 25/08). */
      defeated: player.defeated ?? false,
      ink: nationInk(player.nation),
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
      extraction: economy.extraction,
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
       * **Le seul point qu'on connaisse d'une nation qui n'a rien bâti** : la capitale de 1940,
       * servie pour cadrer le plateau d'un joueur dont le quartier général n'est pas encore posé
       * (décision 1b du 13/09). Le client n'a pas la table — `CAPITAL_REGION` vit avec l'index
       * des régions, côté serveur — et la position du pays ne convient pas : elle tombe au
       * centre des États-Unis, à deux mille kilomètres de Washington.
       *
       * Servi toujours, lu seulement à `hqLevel === 0` : un cadrage n'est pas un secret, et un
       * champ qui apparaît et disparaît est un champ qu'un écran oublie de traiter.
       */
      capitalPoint: isNation(player.nation)
        ? (regionFacts(capitalRegionOf(player.nation))?.point ?? null)
        : null,
      /**
       * **The placements, site by site** (ADR 0020 §10): national soil first, then one line
       * per outpost. Without them the construction screen cannot tell what it may offer, and
       * would propose a building the server then refuses — worse than a greyed-out line,
       * because the refusal only lands after the click.
       *
       * `taken` counts what **stands**; the prepaid queue is added by the screen, which holds
       * it in `constructionQueue`. Two servings of one count would diverge, and the exemption
       * of the foundation is the server's own reading of its own debt.
       */
      siteSlots: sites.budgets.map((budget) => ({
        site: siteRef(budget.site)!,
        taken: budget.taken,
        total: budget.total,
      })),
      /**
       * **What the next headquarters level would carry at home**, `null` at the top of the
       * ladder. Served rather than derived on the client for the reason the placements
       * themselves are: the line that says "un quartier général niveau 2 les porte à 4" and
       * the refusal that raised it have to be the same two numbers, and a client-side copy of
       * `homeSlots` is how they stop being one (ADR 0015, révision du 24/08 — rien d'affiché
       * sans sa condition, et une condition qui se chiffre est un plan).
       */
      homeSlotRelief: homeSlotReliefOf(hqLevel),
      /**
       * The headquarters level that opens mark 2 (ADR 0017). Served rather than read off a
       * constant by the screen: the line that says "verrouillé jusqu'au QG 3" and the
       * recruitment that refuses tier 2 have to be the same number, and a client-side copy of
       * the rule is how they stop being one.
       */
      tier2HqLevel: TIER_2_HQ_LEVEL,
      /**
       * What the season still owes, in placement order — free and immediate wherever the
       * player decides to put it. Served rather than derived on the client: the debt is read
       * off the ground, and a season whose foundation is not placed is a state the screen has
       * to be able to say out loud.
       */
      foundation: foundationOwed(
        player.nation,
        buildings.map((building) => ({
          key: building.key,
          deposit: depositOfRegion(building.regionId),
        })),
      ),
      buildings: buildings.map((building) => ({
        // The instance, not the key: a nation can hold three barracks, and a link that
        // carried `barracks` would open the one in Normandy for a click in Brittany.
        id: building._id,
        key: canonicalBuildingKey(building.key),
        regionId: building.regionId,
        /**
         * **Where it stands, when it does not stand at its region's point** — the port and
         * nothing else so far (ADR 0013, revision of 04/09). `null` leaves the mast hanging
         * from the region, which is where the map layer has always planted it: serving the
         * resolved point for every building would move fifteen masts off the ground they
         * are drawn on, for one that needed moving.
         */
        point:
          building.point === undefined
            ? null
            : ([building.point.lon, building.point.lat] as [number, number]),
        level: building.level,
        nextLevelCost: buildCost(buildingCostKey(building), building.level + 1),
        nextLevelMinutes: buildMinutes(buildingCostKey(building), building.level + 1),
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
          .map((building) => ({ key: canonicalBuildingKey(building.key), level: building.level })),
        /**
         * **Whose placements a building here would spend** — `null` is national soil, an id
         * is the outpost that reaches it, and an absent site is ground no point of his covers
         * any more (a destroyed outpost). Served rather than re-derived: the anchor is a
         * radius the server owns, and a client copy of it would offer a site that is not
         * there.
         */
        site: siteRef(sites.siteAt(facts.id)),
        /**
         * **La région porte-t-elle sa couleur** (ADR 0020 §6) — c'est ce qui décide si ce qui s'y
         * tient produit. Servi par région et non par bâtiment : c'est la région qui est tenue ou
         * perdue, et une mine et une fonderie posées sur le même sol ne peuvent pas répondre
         * différemment. Son propre pays est toujours relié, ce que la règle rend seule.
         */
        linked: held.get(facts.id) === player._id,
      })),
      // The region and the key travel with it because the map plants the crane on the
      // ground: a region name is a caption, not an anchor.
      construction:
        construction !== null && construction.finishesAt !== null
          ? {
              id: construction._id,
              name: construction.building,
              key: workKey(construction.building),
              /** Ce que cette ligne monte quand elle ne bâtit pas : l'écran la range dans la même
               *  file et n'en plante aucune grue (précision du 15/09). */
              outpostId: construction.outpostId ?? null,
              regionId: construction.regionId,
              regionName: regionFacts(construction.regionId)?.name ?? construction.regionId,
              /** The crane stands on the quay from the moment the port is enqueued: the point
               *  was chosen at the order, and the mast has no reason to wait for `finish`. */
              point:
                construction.point === undefined
                  ? null
                  : ([construction.point.lon, construction.point.lat] as [number, number]),
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
        key: workKey(entry.building),
        outpostId: entry.outpostId ?? null,
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
        /** The other half of the drain since ADR 0020 §10: the empire, priced by level. It
         *  is served split from the army's because the two are repaired by opposite moves. */
        outposts: economy.upkeep.outposts,
      },
      starving: economy.starving,
      /**
       * How many troops may stand at once, carried by the billets (ADR 0014). Served beside
       * the troops themselves so the board can say "18 / 24" without a second count of its
       * own — the list below is complete, so its length is the count.
       */
      troopCap: troopCap(totalLevelOf(buildings, 'billets')),
      /**
       * **Les bâtiments de projection qui forment quelque chose**, et rien de la file
       * elle-même : c'est la seule question qu'une carte « à faire maintenant » pose, et la
       * file complète a déjà sa fenêtre (`troops.workshop`). Servi plutôt que déduit des
       * troupes — une caserne qui vient de livrer n'est pas une caserne occupée.
       */
      recruiting: [...new Set(recruiting.map((batch) => batch.buildingId as string))],
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
      stationedCargo: stationedCargo.map((group) => ({
        troopIds: group.troopIds,
        stationedAt: stationOfAddress(group.stationedAt),
        cargo: cargoView(group.loads, group.capacity),
      })),
      /**
       * **Mine only.** An opponent's outpost is exactly the kind of thing the fog exists to
       * hide (ADR 0005), and the way not to leak it is not to fetch it.
       *
       * `garrison` is a head count of the troops attached to the point — the founding column,
       * until something else can move one. It is an address and nothing more: what a garrison
       * *does* when attacked is the combat pass's to say.
       */
      outposts: sealed.map(({ outpost, specializationLocked }) => ({
        id: outpost._id,
        hostCountry: outpost.hostCountry,
        lonLat: [outpost.point.lon, outpost.point.lat] as [number, number],
        /** **Le sol qu'il tient d'office**, quelle que soit la taille de la région (précision
         *  du 04/09). Servi plutôt que redeviné : le client n'a ni polygone ni index, et le
         *  repli des points d'avant le champ est une lecture du serveur. */
        regionId: regionOfOutpost(outpost),
        specialization: outpost.specialization,
        level: outpost.level,
        /** **L'heure où le chantier devient un point**, `null` pour un point debout (révision
         *  du 15/09). Une date plutôt qu'un compte à rebours : le cachet du mât et la ligne du
         *  panneau la lisent tous deux, et un point levé n'en porte plus. */
        standsAt: isStanding(outpost, now) ? null : (outpost.standsAt ?? null),
        garrison: troops.filter((troop) => troop.stationedAt === outpost._id).length,
        /** Minutes until a raided point comes back, `null` when it is standing. Served as a
         *  countdown rather than an instant, like every other due time on the board. */
        disabledMinutesLeft:
          outpost.disabledUntil !== null && outpost.disabledUntil > now
            ? (outpost.disabledUntil - now) / 60_000
            : null,
        isMine: true,
        /** Le métier se règle sur le panneau du point tant qu'aucune passe ne l'a lu
         *  (`specializationServed`) — servi plutôt que redérivé : l'écran et le refus du
         *  serveur lisent la même réponse. */
        specializationLocked,
        /** **Ce qu'une élévation coûterait**, servi comme celui d'un bâtiment : les nombres
         *  d'équilibrage ont une seule maison (précision du 15/09). Au dernier niveau il n'y a
         *  pas de suivant — la facture est vide et le panneau dit « niveau maximal ». */
        nextLevelCost:
          outpost.level >= OUTPOST_MAX_LEVEL ? {} : buildCost('outpost', outpost.level + 1),
        nextLevelMinutes:
          outpost.level >= OUTPOST_MAX_LEVEL ? 0 : buildMinutes('outpost', outpost.level + 1),
        atMaxLevel: outpost.level >= OUTPOST_MAX_LEVEL,
      })),
    },
    /**
     * **La dernière édition du classement, et jamais un recalcul** (`classement-bareme.md` §3).
     * C'est tout le point de la table : entre deux éditions le classement **ne bouge pas**, et
     * une vue qui repèserait les bâtiments à chaque chargement ferait de la presse un moniteur
     * — recruter entre deux éditions ne doit rien changer à ce que la page affiche.
     *
     * **Industrie et militaire ne sortent que pour soi.** Les autres n'ont que le territoire,
     * le général et les faits d'armes (décision 80) : le général se lit, il ne se décompose
     * pas, et le garde-fou tient ici, à la couture — pas dans un filtre du client.
     *
     * `null` tant qu'aucune édition n'a paru, ce qui est l'état des trois premières heures
     * d'une saison : la page le dit en une phrase plutôt que d'afficher une table à zéro.
     */
    press,
    /**
     * **What the engagements of this player amount to**, attacked and attacking alike — the
     * raw material of the journal, and later of the visual replay. Numbers only: the French
     * is built on the client (ADR 0016), and re-resolving a pass to display it is how two
     * accounts of the same battle start disagreeing.
     *
     * The last `REPORTS_SERVED` of them (`engagementsOf`), and the blow-by-blow of none: the
     * detail hangs in `strikes`, read one pass at a time the day the replay asks for it.
     */
    reports: (await engagementsOf(ctx, player._id)).map((engagement) => {
      const side =
        engagement.attackerId === player._id ? ('attacker' as const) : ('defender' as const);
      const tally = (of: 'attacker' | 'defender') => {
        const rows = engagement.troops.filter((troop) => troop.side === of);
        return {
          troops: rows.length,
          lost: rows.reduce((sum, troop) => sum + (troop.strengthBefore - troop.strengthAfter), 0),
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
    /** **Le prix et la durée de la fondation**, du même barème que l'élévation au niveau 1 : un
     *  seul tarif pour poser le point et pour le monter (révision du 15/09). */
    outpostFoundation: { cost: buildCost('outpost', 1), minutes: buildMinutes('outpost', 1) },
    surveyedInstallations,
    lootSightings: lootSightings
      .filter((sighting) => sighting.seasonId === season._id)
      .map((sighting) => ({
        id: sighting._id,
        point: [sighting.point.lon, sighting.point.lat] as [number, number],
        loot: sighting.loot,
        seenAt: sighting.seenAt,
        present: sighting.present,
        current: sighting.current,
      })),
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
     *
     * **Un leurre encore en vol ne passe plus le fil** : il a été retiré du jeu le 29/08/2026
     * et le mot a quitté le vocabulaire du domaine (`src/domain/ids.ts`). Le filtre est ce qui
     * permet au littéral de rester legacy en base sans que le client ait à connaître un type
     * qui n'existe plus (`convex/validators.ts`).
     */
    movements: await Promise.all(
      movements.filter(notDecoyMovement).map(async (movement) => {
        const barracks =
          movement.fromBuildingId === null ? null : await ctx.db.get(movement.fromBuildingId);
        const origin = barracks === null ? null : regionFacts(barracks.regionId);
        const destination =
          movement.target.kind === 'region'
            ? regionFacts(movement.target.regionId)
            : movement.target.kind === 'building'
              ? regionFacts((await ctx.db.get(movement.target.buildingId))?.regionId ?? '')
              : null;
        const carriers = movement.troopIds.flatMap((troopId) => {
          const troop = troops.find((candidate) => candidate._id === troopId);
          return troop === undefined ? [] : [troop];
        });
        const mission =
          movement.plunder !== undefined
            ? {
                kind: 'plunder' as const,
                phase: movement.plunder.phase,
                buildingId: movement.plunder.buildingId,
                presenceEndsAt:
                  movement.plunder.phase === 'presence' ? movement.plunder.until : null,
              }
            : movement.lootCollection !== undefined
              ? {
                  kind: 'collection' as const,
                  sightingId: movement.lootCollection.sightingId,
                }
              : movement.lootDelivery !== undefined
                ? {
                    kind: 'cargoReturn' as const,
                    regionId: movement.lootDelivery.regionId,
                  }
                : null;
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
          cargo: cargoView(movementCargoLoads(movement), capacityOf(carriers)),
          mission,
          roles: movement.troopIds.flatMap((troopId) => {
            const troop = troops.find((candidate) => candidate._id === troopId);
            return troop ? [troop.role] : [];
          }),
          departedAt: movement.departedAt,
          arrivesAt: movement.arrivesAt,
          /** The target's rest window, if the arrival bites it: the column then waits at the
           *  border until it closes (design sheet 07). **A hold already taken is not recomputed**:
           *  `arrive` pushed `arrivesAt` to the exit of the window, and that instant sits outside
           *  it — recomputing would answer `null` and put the column back on the road. */
          heldAt: movement.heldAt ?? null,
          holdUntil:
            movement.heldAt !== undefined
              ? movement.arrivesAt
              : await restHold(ctx, player._id, movement.hostCountry, movement.arrivesAt),
        };
      }),
    ),
    /**
     * **The other half of the fog, and the only one there is** (ADR 0005, ADR 0019 §5): what a
     * troop of the player's saw pass within the maximum range of its roles. Every row is his own —
     * the `sightings` ledger is indexed by observer, so this reading never touches the
     * movements of the board at large and the fan-out of the naive query does not exist
     * (`WWS/docs/technique/brouillard-et-fanout.md`).
     *
     * **Nothing here can leak a type or a composition, because nothing here carries one.** The
     * thread, the endpoints, the media and the two dates: that is exactly what design sheet 04
     * grants a detected movement that has not been identified. The nation is not served
     * either — a sentry sees a column go by, not a flag; identification stays the business of
     * the agent and the buildings that carry it.
     *
     * A window that has not opened yet is not served at all. Past its close, the row stays and
     * turns into the last known position ADR 0005 asks for — the client reads the two dates
     * and decides which of the two states it is in.
     */
    detected: await detectedArcs(ctx, player, outposts, now),
    /**
     * **Ce qu'on a relevé de posé** (ADR 0024 §1) : une position, un milieu, deux dates, et ce
     * que le joueur a de *lui-même* — le détecteur qui l'a pris. **Rien ne porte une composition,
     * un effectif ni une nation, parce que rien n'en est lu** : le camp est un endroit où quelque
     * chose se tient, et l'identifier reste le métier de l'agent (fiche 04).
     *
     * Une ligne fermée devient une dernière position connue, comme un arc — et s'efface au même
     * délai (`LAST_KNOWN_HOURS`), parce que le brouillard périme l'information au lieu de
     * l'éterniser.
     */
    camps: (
      await ctx.db
        .query('campSightings')
        .withIndex('byPlayer', (q) => q.eq('playerId', player._id))
        .collect()
    ).flatMap((camp) =>
      camp.seasonId !== season._id ||
      (camp.until !== null && camp.until <= now - LAST_KNOWN_HOURS * 3_600_000)
        ? []
        : [
            {
              id: camp._id,
              point: [camp.point.lon, camp.point.lat] as LonLat,
              medium: camp.medium,
              since: camp.since,
              seenMinutesAgo: camp.until === null ? null : (now - camp.until) / 60_000,
              detector: camp.detector,
              detectorRegion: camp.detectorRegion,
              lastKnown: camp.until !== null,
            },
          ],
    ),
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
     *
     * **The last `NOTICES_SERVED`, newest first**, and the gap design sheet 01 flagged is
     * closed with them: a season wrote these without limit and the board read them all on every
     * load. The window is served, never paginated — the journal answers "what changed while I
     * was away", and nothing scrolls back to the founding.
     */
    notices: (
      await ctx.db
        .query('notices')
        .withIndex('byPlayerAt', (q) => q.eq('playerId', player._id).lte('at', now))
        .order('desc')
        .take(NOTICES_SERVED)
    )
      .filter(notDecoyNotice)
      .map(named),
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
}

/**
 * **La dernière édition parue, telle que la page de presse la lit.** Deux lectures indexées et
 * rien d'autre : les lignes de l'édition la plus récente de la saison, et les deux dernières du
 * joueur — dont sort le delta, qui est la seule chose que la page calcule.
 *
 * **Le cloisonnement est ici.** `mine` porte les cinq chiffres ; `others` en porte trois. Une
 * industrie d'adversaire ne sort pas du serveur, donc aucun client, aucune capture de requête et
 * aucun bug d'affichage ne peut la révéler — c'est la même défense que les états d'arc.
 */
async function lastEdition(ctx: QueryCtx, seasonId: Id<'seasons'>, playerId: Id<'players'>) {
  /** Une édition écrit exactement une ligne par joueur, et le salon plafonne à `MAX_PLAYERS` :
   *  la dernière fenêtre de cette taille contient donc l'édition entière, jamais moins. */
  const recent = await ctx.db
    .query('editions')
    .withIndex('bySeasonAt', (q) => q.eq('seasonId', seasonId))
    .order('desc')
    .take(MAX_PLAYERS);
  const at = recent[0]?.at;
  if (at === undefined) return null;
  const edition = recent.filter((line) => line.at === at);

  const own = await ctx.db
    .query('editions')
    .withIndex('byPlayerAt', (q) => q.eq('playerId', playerId))
    .order('desc')
    .take(2);
  const mine = own[0] ?? null;
  /** L'édition d'avant, `null` à la première : un delta depuis le néant serait une progression
   *  inventée, et la fenêtre Nation n'imprime alors aucun signe. */
  const before = own[1] ?? null;

  const seats = await ctx.db
    .query('players')
    .withIndex('bySeason', (q) => q.eq('seasonId', seasonId))
    .collect();
  const seatOf = new Map(seats.map((seat) => [seat._id as string, seat]));

  /** Le rang se lit sur le territoire, le premier en haut (79a) — calculé sur l'édition et non
   *  sur l'état, comme tout le reste de cette réponse. */
  const ranked = [...edition].sort((left, right) => right.territory - left.territory);
  const rankOf = new Map(ranked.map((line, index) => [line._id as string, index + 1]));

  return {
    at,
    /** `null` sur une édition finale : plus rien ne suit, et une « prochaine édition » y serait
     *  un rendez-vous qui n'aura pas lieu. */
    next: mine?.final === true ? null : at + PRESS_EDITION_HOURS * 3_600_000,
    final: mine?.final ?? false,
    mine:
      mine === null
        ? null
        : {
            rank: rankOf.get(mine._id as string) ?? 1,
            /** Le pseudo et le drapeau voyagent avec ma ligne parce qu'elle **est** une ligne du
             *  tableau : la page m'imprime à mon rang comme les autres, et sans eux le client
             *  devrait reconstituer mon nom depuis une seconde source. */
            nickname: seatOf.get(playerId as string)?.nickname ?? '',
            nation: seatOf.get(playerId as string)?.nation ?? null,
            defeated: seatOf.get(playerId as string)?.defeated ?? false,
            territory: mine.territory,
            industry: mine.industry,
            military: mine.military,
            deeds: mine.deeds,
            general: mine.general,
            /** L'heure de l'édition précédente, pour que la fenêtre Nation puisse dire
             *  « depuis l'édition de 11:00:00 » plutôt qu'un « depuis la dernière fois ». */
            since: before?.at ?? null,
            delta:
              before === null
                ? null
                : {
                    territory: mine.territory - before.territory,
                    industry: mine.industry - before.industry,
                    military: mine.military - before.military,
                    deeds: mine.deeds - before.deeds,
                    general: mine.general - before.general,
                  },
          },
    /** **Trois chiffres, et le troisième est un compteur d'activité.** Ni `industry` ni
     *  `military` ne figurent ici, et c'est structurel : ils ne sont pas omis à l'affichage,
     *  ils ne sont pas construits. */
    others: ranked.flatMap((line) => {
      if (line.playerId === playerId) return [];
      const seat = seatOf.get(line.playerId as string);
      return [
        {
          playerId: line.playerId,
          nickname: seat?.nickname ?? '',
          nation: seat?.nation ?? null,
          rank: rankOf.get(line._id as string) ?? 1,
          territory: line.territory,
          general: line.general,
          deeds: line.deeds,
          defeated: seat?.defeated ?? false,
        },
      ];
    }),
  };
}

/**
 * **Ce que le retrait du leurre laisse en base, et que rien ne doit servir** (29/08/2026). Les
 * littéraux `decoy` restent dans le schéma le temps d'un wipe — un mouvement en vol, des dépêches
 * déjà déposées — mais le client ne connaît plus le mot : ni `MovementType`, ni l'union `Notice`
 * ne le portent. Le filtre est la couture entre les deux, et il vaut mieux qu'une migration : la
 * saison est jetable (ADR 0001), le mot part avec elle.
 */
const notDecoyMovement = <T extends { readonly type: string }>(
  movement: T,
): movement is T & { readonly type: Exclude<T['type'], 'decoy'> } => movement.type !== 'decoy';

const notDecoyNotice = <T extends { readonly kind: string }>(
  notice: T,
): notice is T & { readonly kind: Exclude<T['kind'], `decoy${string}`> } =>
  !notice.kind.startsWith('decoy');

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
    case 'garrisonEntered':
    case 'lootTaken':
    case 'sitePlundered':
    case 'siteSabotaged':
      return { ...notice, regionName: nameOf(notice.regionId) };
    case 'lootDelivered':
      return { ...notice, regionName: nameOf(notice.regionId) };
    /** Un point d'avant le champ de région n'en a aucune : la dépêche se contente alors de son
     *  pays, qu'elle porte de toute façon. */
    case 'outpostRaised':
      return {
        ...notice,
        regionName: notice.regionId === null ? null : nameOf(notice.regionId),
      };
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
 * **What travels is the stretch the window covers**, its media, its heading on leaving the radius
 * and the estimated arrival (design sheet 04, decision 4a of 13/09/2026). Not the whole thread,
 * and therefore not the destination: serving both declared endpoints taught the first sentry
 * where the column was going, which is the one thing the fog is there to keep. **Neither the type
 * nor the composition nor the nation is here** either, and none of them is fetched. A sentry
 * watches a column go past; it does not read its flag, and it does not read its orders.
 *
 * `headingAtMe` is the third ink of design sheet 04 and, without a destination, an **estimate**:
 * the heading is prolonged over what the column has left to walk, and the ink turns critical if
 * any of those points falls on ground the player recognises — his own soil, or the reach of one
 * of his outposts (`isAnchored`, the same reading the aim already gives him). A column that
 * passes beside him without coming for him is no longer critical; the label says « estimé ».
 */
async function detectedArcs(
  ctx: QueryCtx,
  player: Doc<'players'>,
  outposts: ReadonlyArray<Doc<'outposts'>>,
  now: number,
) {
  const anchors = outposts.map(anchorOf);
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
    /**
     * **Le mouvement est fini, le souvenir reste** (ADR 0024 §2). Le tronçon a été figé à la
     * disparition (`forgetMovement`) : il n'y a plus de route à rejouer, donc rien à
     * recalculer — l'arc est un souvenir, et un souvenir ne marche pas. Passé
     * `LAST_KNOWN_HOURS` il n'est plus servi du tout, et la réévaluation le ramasse.
     */
    if (movement === null) {
      const frozen = sighting.frozen;
      if (frozen === undefined || frozen.closedAt <= now - LAST_KNOWN_HOURS * 3_600_000) continue;
      seen.push({
        id: sighting._id as string,
        from: frozen.points[0] ?? { lon: 0, lat: 0 },
        to: frozen.points[frozen.points.length - 1] ?? { lon: 0, lat: 0 },
        points: frozen.points,
        legs: frozen.legs,
        distanceUnits: frozen.distanceUnits,
        costUnits: frozen.costUnits,
        landCost: undefined,
        /** Rien n'arrive plus : la date d'arrivée *est* celle de la fermeture, et le pion se
         *  tient au bout du fil. */
        arrivesAt: frozen.closedAt,
        headingDegrees: frozen.headingDegrees,
        /** Il ne reste rien à marcher : le cap ne se prolonge sur rien, et seul le point vu
         *  peut encore tomber sur du sol reconnu. */
        headingAtMe: isAnchored(
          [
            frozen.points[frozen.points.length - 1]?.lon ?? 0,
            frozen.points[frozen.points.length - 1]?.lat ?? 0,
          ],
          home,
          anchors,
        ),
        seenFrom: sighting.from,
        seenTo: frozen.closedAt,
        detector: sighting.detector,
        detectorRegion: await regionOfStation(ctx, sighting),
      });
      continue;
    }
    const force = marchingForce(movement);
    const segment = seenSegment(force, sighting.from, sighting.to);
    const exit = segment.points[segment.points.length - 1]!;
    seen.push({
      id: movement._id as string,
      from: coordsOf(segment.points[0]!),
      /** The far end of the **stretch**, not of the trip: on a window that closes before the
       *  arrival these two differ, and that difference is the whole of decision 4a. */
      to: coordsOf(exit),
      points: segment.points.map(coordsOf),
      legs: segment.legs,
      distanceUnits: segment.distanceUnits,
      costUnits: segment.costUnits,
      landCost: movement.landCost,
      arrivesAt: movement.arrivesAt,
      headingDegrees: segment.headingDegrees,
      headingAtMe: headingReachesMe(
        force,
        exit,
        segment.headingDegrees,
        sighting.to,
        home,
        anchors,
      ),
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

const coordsOf = (point: LonLat) => ({ lon: point[0], lat: point[1] });

/**
 * **« Cap sur moi », estimated** (rule 5 of decision 4a). Without a destination the question is
 * answered by prolonging the heading from the last point seen, over the distance the column has
 * left to walk, at the mesh of the very grid that says whose ground a point is. The point seen
 * counts too: a column caught standing on my soil is coming for me whatever it does next.
 */
function headingReachesMe(
  force: MarchingForce,
  exit: LonLat,
  headingDegrees: number,
  seenTo: number,
  home: string | null,
  anchors: ReadonlyArray<OutpostReach>,
): boolean {
  const left = pathLengthKm(force.points) * (1 - distanceProgressAt(force, seenTo));
  return [exit, ...pointsAhead(exit, headingDegrees, left, GRID_STEP_KM)].some((point) =>
    isAnchored(point, home, anchors),
  );
}

/** The region a station listens from, and nothing for the three other detectors: the ground has
 *  no name of its own here, an outpost is named by the country the card already carries, and a
 *  camp is a pile at a point, which is not a place. */
async function regionOfStation(ctx: QueryCtx, sighting: Doc<'sightings'>): Promise<string | null> {
  if (sighting.detector !== 'station' || sighting.detectorId === null) return null;
  if (sighting.detectorRegion !== undefined) return sighting.detectorRegion;
  const building = await ctx.db.get(sighting.detectorId as Id<'buildings'>);
  return building === null ? null : (regionFacts(building.regionId)?.name ?? null);
}

/**
 * A site as the client reads it: `null` for the ground no living point of his reaches,
 * `{ outpostId: null }` for national soil, an id for an outpost. The two forms of a site are
 * already exclusive in one field, so a discriminated union here would only add a tag the
 * `null` carries by itself.
 */
const siteRef = (site: Site | null): { readonly outpostId: Id<'outposts'> | null } | null =>
  site === null ? null : { outpostId: site.kind === 'home' ? null : site.outpostId };
