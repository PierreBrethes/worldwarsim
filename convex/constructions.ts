import { v } from 'convex/values';
import { canonicalBuildingKey } from '../src/domain/ids';
import type { LonLat } from '../src/domain/geo';
import { internalMutation, mutation } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { internal } from './_generated/api';
import { EXPLOITED_DEPOSITS, placementRefusal } from '../src/domain/economy';
import { depositOfRegion } from '../src/domain/world';
import { nearestOutpost } from '../src/domain/outposts';
import { buildingAt, buildingCostKey, cappedByHq, playerBuildings } from './buildings';
import {
  HQ_LEVEL_AT_LAUNCH,
  LISTENING_STATION_RADIUS_KM,
  MAX_HQ_LEVEL,
  outpostReachKm,
  unlockLevel,
  buildCost,
  buildMinutes,
  homeSlots,
  nominalStrength,
  settlesDebt,
} from './constants';
import { coastAtPoint, hostAtPoint } from './routes';
import { fail, type ErrorCode } from './errors';
import { foundationOwed, regionFacts } from './regions';
import { anchorAt, anchored, reachOf, sameSite, sitesOf, type Site, type Sites } from './sites';
import { credit, debit } from './resources';
import { fileSurvey } from './surveys';
import { playerOf, playingSeason, requirePlayable } from './seasons';
import { BUILDING_KEY, LON_LAT } from './validators';
import { reassessDetection } from './movement/detection';

/** A refusal, carried rather than thrown: the same rule is read at two doors, and only one of
 *  them answers a player. At the other one it cancels an entry and refunds it. */
type Refusal = { readonly code: ErrorCode; readonly details?: Record<string, unknown> };

/**
 * **Is this placement one the season still owes?** Asked in two places that must agree — the
 * refusal, where a due key escapes the building ceiling, and the bill, where it costs nothing —
 * so it is asked once and answered here.
 *
 * A first level only: raising a building is never a debt the season owes.
 *
 * **La dette se lit sur le gisement de la région visée**, pas sur la seule clé : une seconde
 * mine posée sur du charbon se paie, et celle du fer reste offerte. Le quartier général est la
 * dette que le sol ne nomme pas (`settlesDebt`) : il s'acquitte où le joueur le pose.
 */
const owedFreely = (
  nation: string | null,
  buildings: ReadonlyArray<Doc<'buildings'>>,
  building: Doc<'constructions'>['building'],
  regionId: string,
): boolean =>
  (buildingAt(buildings, building, regionId)?.level ?? 0) === 0 &&
  foundationOwed(
    nation,
    buildings.map((held) => ({ key: held.key, deposit: depositOfRegion(held.regionId) })),
  ).some((due) => settlesDebt(due, { key: building, deposit: depositOfRegion(regionId) }));

/**
 * **A point belongs to the port, and to its placement, and to nothing else** (ADR 0013,
 * revision of 04/09).
 *
 * Three refusals, and the third is the only one a legitimate client can meet: it is the race
 * between the ghost and the ground it snapped onto. The first two answer a client that made up
 * its own gesture — a mine with a coordinate, a port without one.
 *
 * **What is never checked here is that the point falls inside the region**, and it cannot be:
 * the server holds no admin-1 polygon (`regions.ts` — 2.5 MB drawn for the screen). The client
 * guarantees it, and the consequence of a twisted one is bounded: it files its port in the
 * wrong region, it does not gain a second one — `regionId` is what holds "one building per
 * region", and the placement, the site budget and the coastal rule are all read off it.
 */
function pointRefusal(
  building: Doc<'constructions'>['building'],
  regionId: string,
  raising: boolean,
  point: { readonly lon: number; readonly lat: number } | undefined,
): Refusal | null {
  /** A raise never moves what stands: the port keeps the quay it was founded on. */
  if (building !== 'port' || raising) {
    return point === undefined ? null : { code: 'POINT_FOR_PORT_ONLY', details: { building } };
  }
  if (point === undefined) return { code: 'PORT_NEEDS_A_COAST_POINT', details: { regionId } };
  const lonLat: LonLat = [point.lon, point.lat];
  if (!coastAtPoint(lonLat)) return { code: 'PORT_NEEDS_A_COAST_POINT', details: { regionId } };
  const region = regionFacts(regionId);
  const host = hostAtPoint(lonLat);
  if (region !== null && host !== region.country) {
    return { code: 'POINT_OUTSIDE_REGION', details: { regionId, host } };
  }
  return null;
}

export const start = mutation({
  args: {
    token: v.string(),
    seasonId: v.id('seasons'),
    building: BUILDING_KEY,
    regionId: v.string(),
    /** **The port's own coast point, and nobody else's** (ADR 0013, revision of 04/09). */
    point: v.optional(LON_LAT),
  },
  handler: async (ctx, { token, seasonId, building, regionId, point }) => {
    const { player, season } = await playerOf(ctx, token, seasonId);
    requirePlayable(player, season);

    /**
     * **The queue is unbounded and paid in advance** (decision of 25/08). The objection the
     * single site answered was a queue that *promised* a stacking the server refuses; an entry
     * that has already settled its bill promises nothing — the server took it.
     *
     * So every rule below is read against what stands **plus what is queued**: two entries can
     * never aim at the same region, and a pledge counts against the ceiling the headquarters
     * carries. The queue is where a nation would otherwise keep the buildings it is not
     * allowed to have.
     */
    const queue = await queueOf(ctx, player._id);
    const refusal = await refusalFor(ctx, player, building, regionId, queue);
    if (refusal) fail(refusal.code, refusal.details);

    const buildings = await playerBuildings(ctx, player._id);
    const standing = buildingAt(buildings, building, regionId);
    const misplaced = pointRefusal(building, regionId, standing !== undefined, point);
    if (misplaced) fail(misplaced.code, misplaced.details);
    const level = (standing?.level ?? 0) + 1;
    const now = Date.now();

    /**
     * **The foundation is placed, never offered.** Choosing the region is the one gesture of
     * the opening that is a decision; the price and the wait on what is not one are what the
     * season takes back. So as long as a key of the foundation is still owed, its first
     * placement costs nothing and stands at once — every other rule above having already had
     * its say: deposit, one building per region, home country.
     *
     * It never enters the queue: there is nothing to wait for and nothing to bill, so it has
     * no rank, no refund and no turn — a playtest lost three free placements behind a paid
     * mill the day it did (19/08).
     */
    if (owedFreely(player.nation, buildings, building, regionId)) {
      /** **Le QG se pose au niveau du lancement**, les extracteurs au premier — la seule
       *  différence entre les dettes du socle, et elle vient de l'ADR 0017 §2 : ce que le
       *  quartier général ouvre (les paliers, les emplacements, les slots) n'a jamais été une
       *  décision du joueur, seulement l'endroit. */
      const placed = building === 'hq' ? HQ_LEVEL_AT_LAUNCH : 1;
      const standingId = await ctx.db.insert('buildings', {
        seasonId: season._id,
        playerId: player._id,
        key: building,
        regionId,
        level: placed,
        ...anchored(await anchorAt(ctx, player, regionId)),
      });
      if (building === 'hq') await garrisonTheGift(ctx, player, season._id, standingId);
      return { finishesAt: now, cost: {}, level: placed, rank: null };
    }

    const costKey = standing === undefined ? building : buildingCostKey(standing);
    const cost = buildCost(costKey, level);
    await debit(ctx, player._id, cost, now);

    const last = queue[queue.length - 1];
    const rank = last ? last.rank + 1 : 0;
    const constructionId = await ctx.db.insert('constructions', {
      playerId: player._id,
      building: costKey,
      regionId,
      level,
      rank,
      finishesAt: null,
      ...(point === undefined ? {} : { point }),
    });
    await startHead(ctx, player._id, now);

    const written = await ctx.db.get(constructionId);
    return { finishesAt: written?.finishesAt ?? null, cost, level, rank };
  },
});

/**
 * **Une compagnie d'infanterie, en garnison au quartier général** (décision du 25/08, déplacée
 * le 13/09). Une nation qui ouvre sans rien debout n'a aucune réponse à une colonne qui entre
 * chez elle le premier soir, et une caserne est à trois décisions de là.
 *
 * Elle naissait à la dotation ; elle naît maintenant avec le QG, parce que c'est lui qui lui
 * donne une adresse — et jamais à une élévation : seul le premier QG, celui que le socle offre,
 * l'amène.
 *
 * La conséquence est acceptée plutôt qu'esquivée : cette compagnie compte dans le **nominal**
 * que la règle de réduction mesure (`src/domain/victory.ts`), donc un joueur qui ne tient que
 * son infanterie offerte et la perd tombe sous la moitié de son nominal — scalpable par qui la
 * lui a prise. C'est le prix d'ouvrir avec une défense, et la forme dont la victoire de test doit
 * être remplacée, jamais rafistolée.
 */
async function garrisonTheGift(
  ctx: MutationCtx,
  player: Doc<'players'>,
  seasonId: Id<'seasons'>,
  hq: Id<'buildings'>,
): Promise<void> {
  const strength = nominalStrength('infantry', 1);
  await ctx.db.insert('troops', {
    seasonId,
    playerId: player._id,
    role: 'infantry',
    tier: 1,
    nominalStrength: strength,
    currentStrength: strength,
    stationedAt: hq,
  });
}

/**
 * Only what has not started gets refunded — the patron of `troops.cancel`, and for the same
 * reason: a running site has already consumed the queue's time, and taking it back midway
 * would open a free round trip between matter and time.
 */
export const cancel = mutation({
  args: { token: v.string(), seasonId: v.id('seasons'), constructionId: v.id('constructions') },
  handler: async (ctx, { token, seasonId, constructionId }) => {
    const { player, season } = await playerOf(ctx, token, seasonId);
    requirePlayable(player, season);
    const entry = await ctx.db.get(constructionId);
    if (!entry || entry.playerId !== player._id) fail('UNKNOWN_CONSTRUCTION');
    if (entry.finishesAt !== null) fail('CONSTRUCTION_ALREADY_STARTED');

    const refunded = buildCost(entry.building, entry.level);
    await credit(ctx, player._id, refunded, Date.now());
    await ctx.db.delete(constructionId);
    return { refunded };
  },
});

export const finish = internalMutation({
  args: { constructionId: v.id('constructions') },
  handler: async (ctx, { constructionId }) => {
    const construction = await ctx.db.get(constructionId);
    if (!construction) return;
    const season = await playingSeason(ctx, construction.playerId);
    if (season === null) return;

    const buildings = await playerBuildings(ctx, construction.playerId);
    const standing = buildingAt(buildings, construction.building, construction.regionId);
    if (standing) {
      await ctx.db.patch(standing._id, { level: construction.level });
    } else {
      /** The anchor is decided **here**, at the placement, and never read again: whatever is
       *  founded later leaves this building on the site that carried it (`schema.ts`). */
      const player = await ctx.db.get(construction.playerId);
      await ctx.db.insert('buildings', {
        seasonId: season._id,
        playerId: construction.playerId,
        key: canonicalBuildingKey(construction.building),
        ...(construction.building === 'depot' ? { costKey: 'depot' as const } : {}),
        regionId: construction.regionId,
        level: construction.level,
        /** The point chosen at the order, carried whole: `finish` decides nothing about where
         *  a port stands — the player did, hours earlier, and a second choice here could
         *  disagree with the mast the queue has been drawing since. */
        ...(construction.point === undefined ? {} : { point: construction.point }),
        ...(player === null ? {} : anchored(await anchorAt(ctx, player, construction.regionId))),
      });
    }
    await ctx.db.delete(constructionId);
    /** **Une station qui vient d'ouvrir relève le sol qu'elle écoute** (ADR 0020 §5) : c'est une
     *  portée de plus, et une portée neuve n'a rien relevé tant qu'un événement ne le lui a pas
     *  demandé — il n'y a pas d'horloge pour le faire à sa place. */
    if (construction.building === 'listening') {
      const facts = regionFacts(construction.regionId);
      if (facts !== null) {
        await fileSurvey(
          ctx,
          construction.playerId,
          [{ point: facts.point, radiusKm: LISTENING_STATION_RADIUS_KM, regionId: null }],
          Date.now(),
        );
      }
      await reassessDetection(ctx, season._id);
    }
    /** The one channel that says a site is standing: nothing else on the board announces it,
     *  and a player who was away sees only the finished building, never the moment. */
    await ctx.db.insert('notices', {
      playerId: construction.playerId,
      at: Date.now(),
      kind: 'constructionFinished',
      building: construction.building,
      regionId: construction.regionId,
      level: construction.level,
    });
    await startHead(ctx, construction.playerId, Date.now());
  },
});

/**
 * **The second door.** An entry was accepted against the world as it stood at the enqueue; by
 * the time its turn comes the world may have taken the right back — a region lost, a ceiling
 * that came down, a tier that closed. Nothing then starts on a right that no longer exists:
 * the entry is cancelled, refunded whole, and the player is told in the journal.
 *
 * Idempotent on a queue already running, like `troops.startHead`, so every caller may call it
 * unconditionally. It re-reads the state itself rather than trusting whoever woke it.
 */
async function startHead(ctx: MutationCtx, playerId: Id<'players'>, now: number): Promise<void> {
  const player = await ctx.db.get(playerId);
  if (!player) return;
  const season = await ctx.db.get(player.seasonId);
  if (!season) return;

  for (;;) {
    const head = (await queueOf(ctx, playerId))[0];
    if (!head || head.finishesAt !== null) return;

    // The head is measured against what stands, and against nothing queued: everything else in
    // the queue is behind it and has not happened.
    const refusal = await refusalFor(
      ctx,
      player,
      canonicalBuildingKey(head.building),
      head.regionId,
      [],
    );
    if (refusal) {
      await credit(ctx, playerId, buildCost(head.building, head.level), now);
      await ctx.db.insert('notices', {
        playerId,
        at: now,
        kind: 'constructionCancelled',
        building: head.building,
        regionId: head.regionId,
      });
      await ctx.db.delete(head._id);
      continue;
    }

    const finishesAt = now + buildMinutes(head.building, head.level) * 60_000;
    await ctx.db.patch(head._id, { finishesAt });
    await ctx.scheduler.runAt(finishesAt, internal.constructions.finish, {
      constructionId: head._id,
    });
    return;
  }
}

/**
 * **The whole of the placement rule, read once.** Both doors call it — the enqueue, where it
 * answers the player, and the start of a head, where it decides whether the entry still has a
 * right to exist. Two copies would drift, and the drift would be a site rising on a right the
 * player lost.
 *
 * `pledged` is what the queue adds to the state for this reading: the whole queue at the
 * enqueue, nothing at all for a head.
 */
async function refusalFor(
  ctx: QueryCtx,
  player: Doc<'players'>,
  building: Doc<'constructions'>['building'],
  regionId: string,
  pledged: ReadonlyArray<Doc<'constructions'>>,
): Promise<Refusal | null> {
  const region = regionFacts(regionId);
  if (!region) return { code: 'UNKNOWN_REGION', details: { regionId } };

  const sites = await sitesOf(ctx, player);

  /**
   * **Home, or within reach of one of the player's outposts** (ADR 0015). The reach is a
   * radius in kilometres, never a count of regions — Natural Earth cuts the United Kingdom
   * into 232 districts and Germany into 16, so a radius counted in regions would let a
   * cartography vendor balance the season. How many regions it covers therefore varies by
   * country: that is the geography speaking.
   *
   * The very same radius names the **site** the placement will hang from (`siteFor`): where
   * one may build and whose placements one spends are one question, asked once.
   */
  const site = sites.siteAt(regionId);
  if (site === null) {
    /** **Le rayon nommé est celui du point le plus proche**, puisque c'est lui qui vient de ne pas
     *  y arriver : un chiffre commun n'existe plus depuis que la portée suit le niveau. Sans aucun
     *  point, c'est ce qu'ouvrirait le premier — la phrase dit alors ce qu'il faudrait. */
    const nearest = nearestOutpost(region.point, sites.outposts.map(reachOf));
    return {
      code: 'OUT_OF_OUTPOST_REACH',
      details: {
        regionId,
        reachKm: nearest === null ? outpostReachKm(1) : nearest.nearest.reachKm,
        nearestKm: nearest === null ? null : Math.round(nearest.km),
      },
    };
  }

  const { buildings, hqLevel } = sites;
  if (
    building === 'hq' &&
    buildings.some((held) => held.key === 'hq' && held.regionId !== regionId)
  ) {
    return { code: 'HQ_ALREADY_BUILT' };
  }

  /**
   * **Le quartier général d'abord** (décision 1b du 13/09). Ce n'est pas une seconde garde : à
   * niveau 0 `placementRefusal` refuse déjà toute autre clé, puisque `UNLOCKED_AT` les demande
   * toutes à 1. Ce qu'il en sortait était `BUILDING_LOCKED` — « la mine demande un quartier
   * général de niveau 1 » —, une phrase qui nomme un palier là où il n'y a qu'un ordre de pose.
   * Le refus est donc renommé ici, là où la cause est lisible, et pas ajouté.
   */
  if (building !== 'hq' && hqLevel === 0) return { code: 'HQ_FIRST' };

  /**
   * **One entry per region, standing or queued.** The ground under a pledge is taken though
   * nothing rises on it yet: two entries aiming at the same region would leave two buildings
   * on it once the second `finish` lands, and a raise queued twice would bill a level nobody
   * can reach. It is also what keeps the level of an entry knowable at the enqueue.
   */
  const claimed = pledged.find((entry) => entry.regionId === regionId);
  if (claimed) {
    return { code: 'REGION_TAKEN', details: { regionId, standing: claimed.building } };
  }

  const onRegion = buildings.find((held) => held.regionId === regionId)?.key ?? null;
  const budget = sites.budgetOf(site);
  const slots = budget?.total ?? 0;
  const requiredLevel = unlockLevel(building);
  /**
   * **The placements of this site, standing plus pledged** — never a national total (ADR 0020
   * §10). A pledge on a bare region is a building coming; a pledge on a region that already
   * carries one is a raise, and a raise moves neither the count nor the site's budget. Only
   * the pledges aimed at **this** site count: a queue filling an outpost holds nothing back at
   * home, which is the whole point of the local budget.
   */
  const taken =
    (budget?.taken ?? 0) +
    pledged.filter(
      (entry) =>
        !buildings.some((held) => held.regionId === entry.regionId) &&
        anchorOfRegion(sites, entry.regionId, site),
    ).length;

  /**
   * **A key the season owes is never refused by the placements** (decision of 25/08). It was,
   * and it made a debt of the season unpayable by a rule of the season: an American ground is
   * owed five extractors where a level-1 headquarters carries two placements. Depuis le 13/09 le
   * QG lui-même en dépend — `homeSlots(0)` vaut zéro, et sa propre pose serait refusée par le
   * budget d'un sol qu'il n'a pas encore ouvert.
   *
   * Since ADR 0020 §10 the foundation is out of the count altogether (`sitesOf`), so this only
   * covers the moment of the placement itself — the debt outranks a site already full, and what
   * it puts down never fills one.
   */
  const owed = owedFreely(player.nation, buildings, building, regionId);

  const refusal = placementRefusal(
    building,
    region,
    { onRegion, taken, slots: owed ? Number.POSITIVE_INFINITY : slots, hqLevel },
    requiredLevel,
  );
  if (refusal === 'UNKNOWN_BUILDING') return { code: refusal };
  if (refusal === 'REGION_TAKEN')
    return { code: refusal, details: { regionId, standing: onRegion } };
  /**
   * **The refusal names the site that is full, never a national total.** "Sol national : 2
   * emplacements sur 2" and "avant-poste : 1 sur 1" call for opposite moves — raise the
   * headquarters, or raise that point — and a single figure could name neither.
   */
  if (refusal === 'SITE_SLOTS_FULL') {
    return {
      code: refusal,
      details:
        site.kind === 'home'
          ? { site: 'home', taken, slots, hqLevel, ...homeRelief(hqLevel) }
          : { site: 'outpost', taken, slots },
    };
  }
  // The refusal names its threshold: "demande un QG de niveau 3" is a plan, "impossible" is
  // a wall — and the tier is the one refusal a player can always act on.
  if (refusal === 'BUILDING_LOCKED') {
    return { code: refusal, details: { building, requiredLevel, hqLevel } };
  }
  if (refusal === 'DEPOSIT_REQUIRED') {
    return {
      code: refusal,
      details: { building, expected: EXPLOITED_DEPOSITS[building], found: region.deposit },
    };
  }
  if (refusal === 'NOT_COASTAL') return { code: refusal, details: { regionId } };

  const maximum = MAX_HQ_LEVEL;
  const level = (buildingAt(buildings, building, regionId)?.level ?? 0) + 1;
  if (building === 'hq' && level > maximum)
    return { code: 'MAX_LEVEL_REACHED', details: { maximum } };
  if (cappedByHq(building, level - 1, hqLevel)) return { code: 'CAPPED_BY_HQ' };
  return null;
}

/** Whether a queued entry aims at the very site being measured. A region no site of the
 *  player's reaches any more belongs to none, so it holds nothing back anywhere. */
function anchorOfRegion(sites: Sites, regionId: string, site: Site): boolean {
  const aimed = sites.siteAt(regionId);
  return aimed !== null && sameSite(aimed, site);
}

/**
 * What the next headquarters level would carry **on national soil**, `null` at the top of the
 * ladder. Two numbers rather than a sentence (ADR 0016), and both out of `homeSlots` — the
 * screen that says "un quartier général niveau 2 les porte à 4" and the refusal that raised it
 * must be reading the same ladder, never two copies of it.
 */
export const homeSlotReliefOf = (
  hqLevel: number,
): { readonly nextHqLevel: number; readonly nextSlots: number } | null =>
  hqLevel >= MAX_HQ_LEVEL ? null : { nextHqLevel: hqLevel + 1, nextSlots: homeSlots(hqLevel + 1) };

const homeRelief = (hqLevel: number) => homeSlotReliefOf(hqLevel) ?? {};

/** Everything a player has pledged to build, head first. */
export async function queueOf(
  ctx: QueryCtx,
  playerId: Id<'players'>,
): Promise<Array<Doc<'constructions'>>> {
  const entries = await ctx.db
    .query('constructions')
    .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
    .collect();
  return entries.sort((a, b) => a.rank - b.rank);
}
