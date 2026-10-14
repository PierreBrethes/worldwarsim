import { v } from 'convex/values';
import { canonicalBuildingKey, isOutpostWork, type BuildingKey } from '../src/domain/ids';
import type { LonLat } from '../src/domain/geo';
import { internalMutation, mutation } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { internal } from './_generated/api';
import { EXPLOITED_DEPOSITS, placementRefusal } from '../src/domain/economy';
import { outpostRaiseHold, type OutpostRaiseHold } from '../src/domain/construction';
import { depositOfRegion } from '../src/domain/world';
import { buildingAt, buildingCostKey, cappedByHq, playerBuildings } from './buildingReads';
import {
  HQ_LEVEL_AT_LAUNCH,
  LISTENING_STATION_RADIUS_KM,
  MAX_HQ_LEVEL,
  OUTPOST_MAX_LEVEL,
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
import { foundationOwedBy, regionFacts, regionOfOutpost } from './regions';
import { anchorAt, anchored, sameSite, sitesOf, type Site, type Sites } from './sites';
import { credit, debit, economyOf, settle } from './resources';
import { fileSurvey, surveyFoundation } from './surveys';
import { playerOf, playingSeason, requirePlayable } from './seats';
import { BUILDING_KEY, LON_LAT } from './validators';
import { reportChange, settleBeforeChange } from './production';
import { reassessDetection } from './movement/detection';
import { pointOf } from './movement/forces';
import { refuseInBlitz } from './blitz';

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
  player: Doc<'players'>,
  buildings: ReadonlyArray<Doc<'buildings'>>,
  building: BuildingKey,
  regionId: string,
): boolean =>
  (buildingAt(buildings, building, regionId)?.level ?? 0) === 0 &&
  foundationOwedBy(player, buildings).some((due) =>
    settlesDebt(due, { key: building, deposit: depositOfRegion(regionId) }),
  );

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
  building: BuildingKey,
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
    refuseInBlitz(season);

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
    if (owedFreely(player, buildings, building, regionId)) {
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
 * **Un avant-poste se monte, comme un bâtiment** (précision du 15/09 de l'ADR 0020 §10). Le
 * niveau existait au schéma depuis toujours — la portée, les emplacements, l'entretien et la
 * détection le lisaient tous — et rien ne l'écrivait : la fiche d'un point plein disait
 * « améliorez-le » sans qu'aucun geste ne le permette, ce qui est le pire des deux.
 *
 * Une entrée dans la **même file**, sous le même `rank` et le même `finishesAt` : ce n'est pas
 * une seconde file de chantiers, c'est un chantier. Ce qui la distingue d'un bâtiment est
 * `outpostId`, et rien d'autre — elle ne prend aucune région, aucun emplacement, et la règle
 * « une entrée par région » ne la voit pas.
 *
 * Rien n'est exigé de la garnison ni du quartier général : l'avant-poste est déjà debout. Ce
 * qu'un raid interdit, c'est de **rénover sous le feu** (`OUTPOST_DISABLED`).
 */
export const raiseOutpost = mutation({
  args: { token: v.string(), seasonId: v.id('seasons'), outpostId: v.id('outposts') },
  handler: async (ctx, { token, seasonId, outpostId }) => {
    const { player, season } = await playerOf(ctx, token, seasonId);
    requirePlayable(player, season);
    refuseInBlitz(season);
    const outpost = await ctx.db.get(outpostId);
    if (outpost === null || outpost.playerId !== player._id) fail('UNKNOWN_OUTPOST');

    const now = Date.now();
    const queue = await queueOf(ctx, player._id);
    const level = outpost.level + 1;
    const cost = buildCost('outpost', level);
    const hold = outpostRaiseHold(
      {
        level: outpost.level,
        disabled: disabledAt(outpost, now),
        queued: queue.some((entry) => entry.outpostId === outpostId),
        stocks: (await economyOf(ctx, player._id, now)).stocks,
      },
      cost,
      OUTPOST_MAX_LEVEL,
    );
    if (hold !== null) refuseRaise(hold);

    await debit(ctx, player._id, cost, now);
    const last = queue[queue.length - 1];
    const rank = last ? last.rank + 1 : 0;
    const constructionId = await ctx.db.insert('constructions', {
      playerId: player._id,
      building: 'outpost',
      outpostId,
      /** L'écran nomme le lieu de tout ce qui est en file ; ce n'est pas une réservation de sol.
       *  Un point d'avant le champ de région n'en a pas, et la ligne se lit par son pays. */
      regionId: regionOfOutpost(outpost) ?? '',
      level,
      rank,
      finishesAt: null,
    });
    await startHead(ctx, player._id, now);

    const written = await ctx.db.get(constructionId);
    return { finishesAt: written?.finishesAt ?? null, cost, level, rank };
  },
});

/** Hors service tant que la borne n'est pas passée, **inclusivement** — la même lecture que la
 *  couleur (`convex/holding.ts`), pour que les deux ne se contredisent pas d'une milliseconde. */
const disabledAt = (outpost: Doc<'outposts'>, now: number): boolean =>
  outpost.disabledUntil !== null && outpost.disabledUntil >= now;

/** La phrase du refus, une par empêchement. `materials` double `debit`, qui refuserait de toute
 *  façon : elle est là pour que le bouton et la mutation lisent la même règle jusqu'au bout. */
function refuseRaise(hold: OutpostRaiseHold): never {
  if (hold.kind === 'maxLevel') fail('MAX_LEVEL_REACHED', { maximum: hold.maximum });
  if (hold.kind === 'disabled') fail('OUTPOST_DISABLED');
  if (hold.kind === 'alreadyQueued') fail('OUTPOST_RAISE_QUEUED');
  fail('INSUFFICIENT_RESOURCE', {
    resource: hold.resource,
    needed: hold.needed,
    available: Math.floor(hold.available),
  });
}

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

    if (isOutpostWork(construction.building)) {
      await finishRaise(ctx, construction, season._id);
      return;
    }

    /** The hours up to now were worked by the buildings as they stood: settle them before the
     *  level or the building below changes the rates, or the new shape is paid backwards over
     *  the whole build time. */
    await settle(ctx, construction.playerId, Date.now());
    const buildings = await playerBuildings(ctx, construction.playerId);
    const standing = buildingAt(
      buildings,
      canonicalBuildingKey(construction.building),
      construction.regionId,
    );
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
          [{ point: facts.point, radiusKm: LISTENING_STATION_RADIUS_KM }],
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
 * **La fin d'une élévation est le quatrième événement de couleur** (ADR 0020 §6, précision du
 * 15/09). Un rayon qui passe de 120 à 180 km relie des bâtiments qui ne l'étaient pas — les
 * siens, et ceux d'en face qu'il déborde — donc c'est la même séquence obligatoire que la
 * fondation, la désactivation et sa fin : **régler à l'ancienne couleur, écrire, rapporter**.
 * L'ordre inverse appliquerait la nouvelle couleur rétroactivement aux heures déjà tenues.
 *
 * Et le sol neuf du cercle entre dans les relevés, par le même déclencheur que la fondation :
 * un rayon élargi est une portée de plus, et une portée neuve n'a rien relevé tant qu'un
 * événement ne le lui a pas demandé — il n'y a pas d'horloge dans ce jeu.
 */
async function finishRaise(
  ctx: MutationCtx,
  construction: Doc<'constructions'>,
  seasonId: Id<'seasons'>,
): Promise<void> {
  const outpostId = construction.outpostId;
  const outpost = outpostId === undefined ? null : await ctx.db.get(outpostId);
  await ctx.db.delete(construction._id);
  if (outpost === null) return;

  const at = Date.now();
  const before = await settleBeforeChange(ctx, seasonId, at);
  await ctx.db.patch(outpost._id, { level: construction.level });
  await reportChange(ctx, seasonId, before, at);

  const ground = regionOfOutpost(outpost);
  await surveyFoundation(
    ctx,
    seasonId,
    pointOf(outpost.point),
    outpostReachKm(construction.level),
    at,
  );
  /** Chez le seul propriétaire : un point qui grandit se **relève** — la portée élargie entre
   *  dans les relevés de qui regarde — il ne s'annonce pas (ADR 0005). */
  await ctx.db.insert('notices', {
    playerId: construction.playerId,
    at,
    kind: 'outpostRaised',
    hostCountry: outpost.hostCountry,
    point: outpost.point,
    regionId: ground,
    level: construction.level,
  });
  await reassessDetection(ctx, seasonId);
  await startHead(ctx, construction.playerId, at);
}

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

    /**
     * **Une élévation en tête attend la fin d'une désactivation, elle ne s'annule pas** (décision
     * 3a du 15/09). On ne rénove pas sous le feu, mais on n'a pas non plus perdu le droit de
     * rénover : le point est toujours là et le chantier est payé. La file s'arrête donc derrière
     * lui, et il prend son propre rendez-vous à la fin de la désactivation — comme celle-ci prend
     * le sien (`production.scheduleRestore`). Il n'y a pas d'horloge à interroger.
     *
     * Le niveau maximal, lui, est un droit qui a disparu : rien ne rouvrirait cette entrée, donc
     * elle se rembourse comme un chantier de bâtiment refusé.
     */
    if (isOutpostWork(head.building)) {
      const outpost = head.outpostId === undefined ? null : await ctx.db.get(head.outpostId);
      if (outpost !== null && !disabledAt(outpost, now) && outpost.level < OUTPOST_MAX_LEVEL) {
        await runHead(ctx, head, now);
        return;
      }
      if (outpost !== null && disabledAt(outpost, now)) {
        await ctx.scheduler.runAt(outpost.disabledUntil! + 1, internal.constructions.resume, {
          playerId,
        });
        return;
      }
      await refundHead(ctx, playerId, head, now);
      continue;
    }

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
      await refundHead(ctx, playerId, head, now);
      continue;
    }

    await runHead(ctx, head, now);
    return;
  }
}

/** Le chantier part : sa date d'échéance est écrite, et son rendez-vous pris. C'est le seul
 *  endroit du jeu où un chantier est daté — une entrée en attente ne l'est nulle part. */
async function runHead(ctx: MutationCtx, head: Doc<'constructions'>, now: number): Promise<void> {
  const finishesAt = now + buildMinutes(head.building, head.level) * 60_000;
  await ctx.db.patch(head._id, { finishesAt });
  await ctx.scheduler.runAt(finishesAt, internal.constructions.finish, {
    constructionId: head._id,
  });
}

/** L'entrée dont le droit a disparu : remboursée entière, dite au journal, effacée. La dépêche
 *  nomme la clé telle qu'elle a été payée — `outpost` comprise, que le journal nomme par `raiseWork`. */
async function refundHead(
  ctx: MutationCtx,
  playerId: Id<'players'>,
  head: Doc<'constructions'>,
  now: number,
): Promise<void> {
  await credit(ctx, playerId, buildCost(head.building, head.level), now);
  await ctx.db.insert('notices', {
    playerId,
    at: now,
    kind: 'constructionCancelled',
    building: head.building,
    regionId: head.regionId,
  });
  await ctx.db.delete(head._id);
}

/** **Le rendez-vous qu'une élévation en attente prend pour elle-même** : la désactivation finie,
 *  la file repart. Idempotent comme `startHead`, donc un second réveil ne coûte rien. */
export const resume = internalMutation({
  args: { playerId: v.id('players') },
  handler: async (ctx, { playerId }) => {
    await startHead(ctx, playerId, Date.now());
  },
});

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
  building: BuildingKey,
  regionId: string,
  queued: ReadonlyArray<Doc<'constructions'>>,
): Promise<Refusal | null> {
  /** **Une élévation d'avant-poste ne réserve aucun sol** (précision du 15/09) : elle n'est pas
   *  une pose, donc ni la règle « une entrée par région » ni le compte des emplacements ne la
   *  voient — le client la retire de la même façon (`pledgedBuildings`). */
  const pledged = queued.filter((entry) => entry.outpostId === undefined);
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
    /**
     * **Le refus ne chiffre plus une distance**, depuis que la règle est le disque (révision du
     * 17/09 de l'ADR 0020 §1) : ce qui décide est *le cercle touche-t-il cette région*, et sortir
     * ici la distance au pôle d'inaccessibilité annoncerait « 512 km » d'une frontière qui court à
     * soixante. Le rayon nommé est le plus large des siens — c'est celui qu'il faudrait amener —
     * ou celui d'un premier point quand il n'en a aucun.
     */
    const widest = sites.outposts.map((outpost) => outpostReachKm(outpost.level));
    return {
      code: 'OUT_OF_OUTPOST_REACH',
      details: {
        regionId,
        reachKm: widest.length === 0 ? outpostReachKm(1) : Math.max(...widest),
        hasOutposts: widest.length > 0,
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
  const owed = owedFreely(player, buildings, building, regionId);

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
