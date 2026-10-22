import { v } from 'convex/values';
import {
  canonicalBuildingKey,
  isOutpostWork,
  type BuildingKey,
  type ResearchCard,
} from '../src/domain/ids';
import { buildingLockOf } from '../src/domain/research';
import type { LonLat } from '../src/domain/geo';
import { internalMutation, mutation } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { internal } from './_generated/api';
import {
  BUILDING_SPACING_KM,
  EXPLOITED_DEPOSITS,
  nearestBuilding,
  placementRefusal,
} from '../src/domain/economy';
import {
  outpostRaiseHold,
  raiseRefusalOf,
  type OutpostRaiseHold,
} from '../src/domain/construction';
import { depositAt, type DepositPoint } from '../src/domain/world';
import {
  buildingAt,
  buildingCostKey,
  cappedByHq,
  levelOf,
  playerBuildings,
  queueOf,
  samePoint,
  seasonBuildings,
} from './buildingReads';
import {
  HQ_LEVEL_AT_LAUNCH,
  LISTENING_STATION_RADIUS_KM,
  MAX_HQ_LEVEL,
  OUTPOST_MAX_LEVEL,
  outpostReachKm,
  buildCost,
  nominalStrength,
  settlesDebt,
} from './constants';
import { buildableAtPoint, pointInRegion } from './routes';
import { isOnRegionCoast } from './coast';
import { fail, type ErrorCode } from './errors';
import { foundationOwedBy, pointOfBuilding, regionFacts, regionOfOutpost } from './regions';
import { anchorAt, anchored, isReached, sitesOf } from './sites';
import { credit, debit, economyOf, settle } from './resources';
import { fileSurvey, surveyFoundation } from './surveys';
import { playerOf, playingSeason, requirePlayable } from './seats';
import { BUILDING_KEY, LON_LAT } from './validators';
import { reportChange, settleBeforeChange } from './production';
import { reassessDetection } from './movement/detection';
import { pointOf } from './movement/forces';
import { refuseInBlitz } from './blitz';
import { followCenter } from './research';
import { worksMinutes } from '../src/domain/level-speed';

/** A refusal, carried rather than thrown: the same rule is read at two doors, and only one of
 *  them answers a player. At the other one it cancels an entry and refunds it. */
type Refusal = { readonly code: ErrorCode; readonly details?: Record<string, unknown> };

type Point = { readonly lon: number; readonly lat: number };

/**
 * **Is this placement one the season still owes?** Asked in two places that must agree — the
 * refusal, where a due key escapes the building ceiling, and the bill, where it costs nothing —
 * so it is asked once and answered here.
 *
 * A first level only: raising a building is never a debt the season owes.
 *
 * **La dette se lit sur le gisement du point visé** (ADR 0029), pas sur la seule clé : une
 * seconde mine posée sur du charbon se paie, et celle du fer reste offerte. Le quartier général
 * est la dette que le sol ne nomme pas (`settlesDebt`) : il s'acquitte où le joueur le pose.
 */
const owedFreely = (
  player: Doc<'players'>,
  buildings: ReadonlyArray<Doc<'buildings'>>,
  building: BuildingKey,
  point: Point,
): boolean =>
  buildingAt(buildings, building, point) === undefined &&
  foundationOwedBy(player, buildings).some((due) =>
    settlesDebt(due, {
      key: building,
      deposit: depositAt(pointOfBuilding({ point }))?.deposit ?? null,
    }),
  );

export const start = mutation({
  args: {
    token: v.string(),
    seasonId: v.id('seasons'),
    building: BUILDING_KEY,
    /** The region the point lies in, as the board's polygons read it: it carries the colour. */
    regionId: v.string(),
    /** **Where the building goes down** (ADR 0029 §1) — or, for a raise, where it stands. */
    point: LON_LAT,
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
    const refusal = await refusalFor(ctx, player, building, regionId, point, queue);
    if (refusal) fail(refusal.code, refusal.details);

    const buildings = await playerBuildings(ctx, player._id);
    const standing = buildingAt(buildings, building, point);
    const level = (standing?.level ?? 0) + 1;
    const now = Date.now();

    /**
     * **The foundation is placed, never offered.** Choosing the region is the one gesture of
     * the opening that is a decision; the price and the wait on what is not one are what the
     * season takes back. So as long as a key of the foundation is still owed, its first
     * placement costs nothing and stands at once — every other rule above having already had
     * its say: reach, deposit, spacing.
     *
     * It never enters the queue: there is nothing to wait for and nothing to bill, so it has
     * no rank, no refund and no turn — a playtest lost three free placements behind a paid
     * mill the day it did (19/08).
     */
    if (owedFreely(player, buildings, building, point)) {
      /** **Une pose offerte se tient à l'instant** : c'est sa fin de chantier, et la course sur le
       *  gisement s'y tranche comme à `finish` — rien n'est posé, rien n'était dû, le tenant est
       *  relevé et la dépêche le dit. */
      const lost = await lostAtFinish(ctx, season._id, building, point, buildings);
      if (lost !== null) {
        await ctx.db.insert('notices', {
          playerId: player._id,
          at: now,
          kind: 'constructionCancelled',
          building,
          regionId,
          reason: lost.kind,
        });
        await surveyHolder(ctx, player._id, lost, point, now);
        return { finishesAt: null, cost: {}, level: 0, rank: null };
      }
      /** **Le QG se pose au niveau du lancement**, les extracteurs au premier — la seule
       *  différence entre les dettes du socle, et elle vient de l'ADR 0017 §2 : ce que le
       *  quartier général ouvre (les paliers, les slots) n'a jamais été une
       *  décision du joueur, seulement l'endroit. */
      const placed = building === 'hq' ? HQ_LEVEL_AT_LAUNCH : 1;
      const standingId = await ctx.db.insert('buildings', {
        seasonId: season._id,
        playerId: player._id,
        key: building,
        regionId,
        point,
        level: placed,
        ...anchored(await anchorAt(ctx, player, regionId, point)),
        /** Son QG à lui : sa chute l'élimine (M2a), pas celle d'un QG qu'il aurait pris. */
        ...(building === 'hq' ? { homeOf: player._id } : {}),
      });
      if (building === 'hq') await garrisonTheGift(ctx, player, season._id, standingId);
      /** La garnison offerte est un détecteur, et une pose qui se tient à l'instant est une fin de
       *  chantier : comme à `finish`, le brouillard se relit — pour ce joueur seul (#145). */
      await reassessDetection(ctx, season._id, now, player._id);
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
      point,
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
 * `outpostId`, et rien d'autre — elle ne pose rien, et ni l'espacement ni la règle « une entrée
 * par point » ne la voient.
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
    /** Un rendez-vous périmé : le chantier est reparti en file (QG tombé) ou n'est pas encore
     *  à son échéance redatée. Le bon rendez-vous, lui, est déjà pris. */
    if (construction.finishesAt === null || construction.finishesAt > Date.now()) return;

    if (isOutpostWork(construction.building)) {
      await finishRaise(ctx, construction, season._id);
      return;
    }

    /** The hours up to now were worked by the buildings as they stood: settle them before the
     *  level or the building below changes the rates, or the new shape is paid backwards over
     *  the whole build time. */
    await settle(ctx, construction.playerId, Date.now());
    const buildings = await playerBuildings(ctx, construction.playerId);
    const point = construction.point;
    const standing =
      point === undefined
        ? undefined
        : buildingAt(buildings, canonicalBuildingKey(construction.building), point);
    if (standing) {
      await ctx.db.patch(standing._id, { level: construction.level });
    } else if (point !== undefined) {
      /**
       * **La course se tranche ici** (ADR 0029) : la commande n'a lu que ce que le joueur savait
       * (`spotAt`), et un autre a pu poser sur le gisement, ou un bâtiment pris venir trop près.
       * Perdu, le chantier est annulé et remboursé comme `cancel` ; un gisement découvert pris
       * devient un relevé de son tenant.
       */
      const lost = await lostAtFinish(
        ctx,
        season._id,
        canonicalBuildingKey(construction.building),
        point,
        buildings,
      );
      if (lost !== null) {
        const at = Date.now();
        await refundHead(ctx, construction.playerId, construction, at, lost);
        await surveyHolder(ctx, construction.playerId, lost, point, at);
        await startHead(ctx, construction.playerId, at);
        return;
      }
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
         *  a building stands — the player did, hours earlier, and a second choice here could
         *  disagree with the mast the queue has been drawing since. */
        point,
        ...(player === null
          ? {}
          : anchored(await anchorAt(ctx, player, construction.regionId, point))),
      });
    }
    await ctx.db.delete(constructionId);
    /** **Un Centre de recherche de nouveau debout relance la carte qui l'attendait** (#123). */
    if (standing === undefined && construction.building === 'researchCenter')
      await followCenter(ctx, construction.playerId, Date.now());
    /** **Une station qui vient d'ouvrir relève le sol qu'elle écoute** (ADR 0020 §5) : c'est une
     *  portée de plus, et une portée neuve n'a rien relevé tant qu'un événement ne le lui a pas
     *  demandé — il n'y a pas d'horloge pour le faire à sa place. */
    if (construction.building === 'listening' && point !== undefined) {
      await fileSurvey(
        ctx,
        construction.playerId,
        [{ point: pointOfBuilding({ point }), radiusKm: LISTENING_STATION_RADIUS_KM }],
        Date.now(),
      );
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
 * Idempotent on a queue already running, like `troops.startLanes`, so every caller may call it
 * unconditionally. It re-reads the state itself rather than trusting whoever woke it.
 */
async function startHead(ctx: MutationCtx, playerId: Id<'players'>, now: number): Promise<void> {
  const player = await ctx.db.get(playerId);
  if (!player) return;
  const season = await ctx.db.get(player.seasonId);
  if (!season) return;

  /** Une élévation qui attend la fin d'une désactivation ne tient pas de voie : la suite passe. */
  const waitingOut = new Set<Id<'constructions'>>();

  for (;;) {
    const queue = (await queueOf(ctx, playerId)).filter((entry) => !waitingOut.has(entry._id));
    /** Un chantier à la fois : la tête part quand aucun autre ne monte. */
    const head = queue.some((entry) => entry.finishesAt !== null) ? undefined : queue[0];
    if (!head) return;

    /**
     * **Une élévation en tête attend la fin d'une désactivation, elle ne s'annule pas** (décision
     * 3a du 15/09). On ne rénove pas sous le feu, mais on n'a pas non plus perdu le droit de
     * rénover : le point est toujours là et le chantier est payé. Elle prend son propre
     * rendez-vous à la fin de la désactivation — comme celle-ci prend le sien
     * (`production.scheduleRestore`). Il n'y a pas d'horloge à interroger.
     *
     * Le niveau maximal, lui, est un droit qui a disparu : rien ne rouvrirait cette entrée, donc
     * elle se rembourse comme un chantier de bâtiment refusé.
     */
    if (isOutpostWork(head.building)) {
      const outpost = head.outpostId === undefined ? null : await ctx.db.get(head.outpostId);
      if (outpost !== null && !disabledAt(outpost, now) && outpost.level < OUTPOST_MAX_LEVEL) {
        await runHead(ctx, head, now);
        continue;
      }
      if (outpost !== null && disabledAt(outpost, now)) {
        const at = outpost.disabledUntil! + 1;
        if (outpost.resumeAt !== at) {
          await ctx.scheduler.runAt(at, internal.constructions.resume, { playerId });
          await ctx.db.patch(outpost._id, { resumeAt: at });
        }
        waitingOut.add(head._id);
        continue;
      }
      await refundHead(ctx, playerId, head, now);
      continue;
    }

    // The entry is measured against what stands, and against nothing queued: everything else in
    // the queue has not happened.
    const refusal =
      head.point === undefined
        ? { code: 'UNKNOWN_REGION' as const }
        : await refusalFor(
            ctx,
            player,
            canonicalBuildingKey(head.building),
            head.regionId,
            head.point,
            [],
          );
    if (refusal) {
      await refundHead(ctx, playerId, head, now);
      continue;
    }

    await runHead(ctx, head, now);
  }
}

/** Le chantier part : sa date d'échéance est écrite, et son rendez-vous pris. C'est le seul
 *  endroit du jeu où un chantier est daté — une entrée en attente ne l'est nulle part. */
async function runHead(ctx: MutationCtx, head: Doc<'constructions'>, now: number): Promise<void> {
  /** Daté au départ, au niveau du QG d'alors : élevé plus tard, il ne redate pas ce chantier, le
   *  gain vaut pour la suite (ADR 0031). */
  const hqLevel = levelOf(await playerBuildings(ctx, head.playerId), 'hq');
  const minutes = worksMinutes(head.building, head.level, hqLevel);
  const finishesAt = now + minutes * 60_000;
  await ctx.db.patch(head._id, { finishesAt, minutes });
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
  reason?: LostAtFinish,
): Promise<void> {
  await credit(ctx, playerId, buildCost(head.building, head.level), now);
  await ctx.db.insert('notices', {
    playerId,
    at: now,
    kind: 'constructionCancelled',
    building: head.building,
    regionId: head.regionId,
    ...(reason === undefined ? {} : { reason: reason.kind }),
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
 * `queued` is what the queue adds to the state for this reading: the whole queue at the
 * enqueue, nothing at all for a head.
 *
 * **A point, never a region** (ADR 0029): a building of the same key standing at this very point
 * is a raise, and anything else is a placement measured against the ground under the point and
 * the player's buildings around it — the region only carries the colour.
 */
async function refusalFor(
  ctx: QueryCtx,
  player: Doc<'players'>,
  building: BuildingKey,
  regionId: string,
  point: Point,
  queued: ReadonlyArray<Doc<'constructions'>>,
): Promise<Refusal | null> {
  /** **Une élévation d'avant-poste ne réserve aucun sol** (précision du 15/09) : elle n'est pas
   *  une pose, donc ni l'espacement ni la règle « une entrée par point » ne la voient — le
   *  client la retire de la même façon (`pledgedBuildings`). */
  const pledged = queued.filter((entry) => entry.outpostId === undefined);
  const region = regionFacts(regionId);
  if (!region) return { code: 'UNKNOWN_REGION', details: { regionId } };

  const sites = await sitesOf(ctx, player);
  const { buildings, hqLevel } = sites;
  const lonLat = pointOfBuilding({ point });
  const standing = buildingAt(buildings, building, point);

  /**
   * **The point lies in the region named with it** (`pointInRegion`): the region carries the
   * colour and the surveys, so a twisted client must not pick it. A raise is not asked: its
   * point was checked once. The land of an islet is in its region (#224); a port stands on the
   * water's edge too, so the region's own open-sea coast is in it as well: a quay off Lampedusa or
   * Key West, where neither the raster nor the land reaches.
   */
  if (
    standing === undefined &&
    !pointInRegion(lonLat, region) &&
    !(building === 'port' && isOnRegionCoast(lonLat, regionId))
  ) {
    return { code: 'POINT_OUTSIDE_REGION', details: { regionId } };
  }

  /**
   * **Home, or within reach of one of the player's outposts** (ADR 0015, ADR 0029). The reach is
   * a radius in kilometres from the outpost to the point, never a count of regions.
   */
  const reached = isReached(lonLat, region, sites);

  if (building === 'hq' && buildings.some((held) => held.key === 'hq' && held !== standing)) {
    return { code: 'HQ_ALREADY_BUILT' };
  }

  /**
   * **A raise is `raiseRefusalOf`'s**, the very function the tile in hand and the site sheet read:
   * ground no living site reaches carries nothing more, the headquarters comes first (decision 1b
   * of 13/09) and one entry per point stands — a raise queued twice would bill a level nobody
   * can reach. A placement reads the same last two below, then the spacing.
   */
  const queuedHere = pledged.some(
    (entry) => entry.point !== undefined && samePoint(entry.point, point),
  );
  if (standing !== undefined) {
    const refusal = raiseRefusalOf({
      reached,
      hqLevel: building === 'hq' ? 1 : hqLevel,
      queued: queuedHere,
      cappedByHq: cappedByHq(building, standing.level, hqLevel),
    });
    if (refusal === 'OUT_OF_OUTPOST_REACH') {
      return { code: refusal, details: outOfReachDetails(sites.outposts) };
    }
    if (refusal !== null) return { code: refusal };
  } else {
    if (building !== 'hq' && hqLevel === 0) return { code: 'HQ_FIRST' };
    if (queuedHere) return { code: 'ALREADY_QUEUED_HERE' };
  }

  if (standing === undefined) {
    const lockedBy = buildingLockOf(building, player.researched ?? []);
    const refusal = placementRefusal(
      building,
      await spotAt(ctx, player, building, lonLat, regionId, reached, buildings, pledged),
      hqLevel,
      lockedBy,
    );
    if (refusal !== null)
      return placementRefusalOf(refusal, {
        building,
        lockedBy,
        lonLat,
        buildings,
        pledged,
        outposts: sites.outposts,
      });
  }

  const maximum = MAX_HQ_LEVEL;
  const level = (standing?.level ?? 0) + 1;
  if (building === 'hq' && level > maximum)
    return { code: 'MAX_LEVEL_REACHED', details: { maximum } };
  if (cappedByHq(building, level - 1, hqLevel)) return { code: 'CAPPED_BY_HQ' };
  return null;
}

/** The player's buildings and pledges as the spacing reads them: a key and a point. */
const aroundOf = (
  buildings: ReadonlyArray<Doc<'buildings'>>,
  pledged: ReadonlyArray<Doc<'constructions'>>,
) => [
  ...buildings.map((held) => ({ key: held.key, lonLat: pointOfBuilding(held) })),
  ...pledged.flatMap((entry) =>
    entry.point === undefined || isOutpostWork(entry.building)
      ? []
      : [
          {
            key: canonicalBuildingKey(entry.building),
            lonLat: pointOfBuilding({ point: entry.point }),
          },
        ],
  ),
];

/** The widest reach the player has — the one he would have to bring — or a first point's. */
const outOfReachDetails = (outposts: ReadonlyArray<Doc<'outposts'>>) => {
  const widest = outposts.map((outpost) => outpostReachKm(outpost.level));
  return {
    reachKm: widest.length === 0 ? outpostReachKm(1) : Math.max(...widest),
    hasOutposts: widest.length > 0,
  };
};

/** **Seule une exploitation tient un gisement** (ADR 0029 §3) : un QG ou une caserne posés sur
 *  son point ne l'empêchent pas d'être exploité. */
const exploitsAt = (key: BuildingKey, at: LonLat, deposit: DepositPoint): boolean =>
  EXPLOITED_DEPOSITS[key] !== undefined && depositAt(at) === deposit;

/**
 * **The point as the rule reads it, from the server's side, with what the player knows**: his
 * own exploitations and orders, and the ones he has surveyed — the same entry as
 * `freeDeposits(view)`. Anything else on the deposit is the fog's: the race is settled at
 * `finish`, and a refusal here would be a free survey of the whole map.
 */
async function spotAt(
  ctx: QueryCtx,
  player: Doc<'players'>,
  key: BuildingKey,
  lonLat: LonLat,
  regionId: string,
  reached: boolean,
  buildings: ReadonlyArray<Doc<'buildings'>>,
  pledged: ReadonlyArray<Doc<'constructions'>>,
) {
  const deposit = depositAt(lonLat);
  const surveyed =
    deposit === null
      ? []
      : (
          await ctx.db
            .query('regionSightings')
            .withIndex('byPlayerHasInstallations', (q) =>
              q.eq('playerId', player._id).eq('hasInstallations', true),
            )
            .collect()
        ).flatMap((survey) => survey.installations ?? []);
  const known = [
    ...aroundOf(buildings, pledged),
    ...surveyed.map((seen) => ({ key: seen.key, lonLat: pointOfBuilding(seen) })),
  ];
  return {
    reached,
    onLand: buildableAtPoint(lonLat),
    deposit:
      deposit === null
        ? null
        : {
            key: deposit.deposit,
            taken: known.some((held) => exploitsAt(held.key, held.lonLat, deposit)),
          },
    coastal: key === 'port' && isOnRegionCoast(lonLat, regionId),
    nearest: nearestBuilding(lonLat, aroundOf(buildings, pledged)),
    already:
      buildings.some((held) => held.key === key && held.capturedAt === undefined) ||
      pledged.some((entry) => entry.building === key),
  };
}

/** **Un gisement découvert pris devient une découverte** : le relevé du tenant, écrit comme tous
 *  les relevés (`fileSurvey`), sur la seule région où il se tient. */
async function surveyHolder(
  ctx: MutationCtx,
  playerId: Id<'players'>,
  lost: LostAtFinish,
  point: Point,
  at: number,
): Promise<void> {
  if (lost.kind !== 'depositTaken') return;
  const region = regionFacts(lost.regionId);
  if (region === null) return;
  await fileSurvey(
    ctx,
    playerId,
    [{ point: pointOfBuilding({ point }), radiusKm: BUILDING_SPACING_KM }],
    at,
    [region],
  );
}

type LostAtFinish =
  { readonly kind: 'depositTaken'; readonly regionId: string } | { readonly kind: 'tooClose' };

/**
 * **Ce que la fin d'un chantier revérifie** : le gisement, sur la vérité de la saison cette
 * fois, et l'espacement aux bâtiments du joueur — un bâtiment capturé a pu venir trop près.
 */
async function lostAtFinish(
  ctx: QueryCtx,
  seasonId: Id<'seasons'>,
  building: BuildingKey,
  point: Point,
  buildings: ReadonlyArray<Doc<'buildings'>>,
): Promise<LostAtFinish | null> {
  const lonLat = pointOfBuilding({ point });
  const key = canonicalBuildingKey(building);
  const deposit = depositAt(lonLat);
  if (deposit !== null && EXPLOITED_DEPOSITS[key] !== undefined) {
    const holder = (await seasonBuildings(ctx, seasonId)).find((held) =>
      exploitsAt(held.key, pointOfBuilding(held), deposit),
    );
    if (holder !== undefined) return { kind: 'depositTaken', regionId: holder.regionId };
  }
  const nearest = nearestBuilding(lonLat, aroundOf(buildings, []));
  if (nearest !== null && nearest.km < BUILDING_SPACING_KM) return { kind: 'tooClose' };
  return null;
}

/** The refusal with what its sentence needs: the threshold of a tier, the deposit a key wants,
 *  the neighbour too close and the distance to keep. */
function placementRefusalOf(
  refusal: NonNullable<ReturnType<typeof placementRefusal>>,
  {
    building,
    lockedBy,
    lonLat,
    buildings,
    pledged,
    outposts,
  }: {
    readonly building: BuildingKey;
    readonly lockedBy: ResearchCard | null;
    readonly lonLat: LonLat;
    readonly buildings: ReadonlyArray<Doc<'buildings'>>;
    readonly pledged: ReadonlyArray<Doc<'constructions'>>;
    readonly outposts: ReadonlyArray<Doc<'outposts'>>;
  },
): Refusal {
  switch (refusal) {
    case 'UNKNOWN_BUILDING':
    case 'NOT_ON_LAND':
    case 'NOT_COASTAL':
    case 'DEPOSIT_TAKEN':
      return { code: refusal };
    case 'ALREADY_BUILT':
      return { code: refusal, details: { building } };
    case 'HQ_FIRST':
      return { code: refusal };
    // The refusal names its card: « demande la recherche Aviation » is a plan, « impossible » a wall.
    case 'RESEARCH_REQUIRED':
      return { code: refusal, details: { card: lockedBy } };
    case 'DEPOSIT_REQUIRED':
      return { code: refusal, details: { building, expected: EXPLOITED_DEPOSITS[building] } };
    /** **Le rayon nommé est le plus large des siens** — celui qu'il faudrait amener —, ou celui
     *  d'un premier point quand il n'en a aucun. */
    case 'OUT_OF_REACH':
      return { code: 'OUT_OF_OUTPOST_REACH', details: outOfReachDetails(outposts) };
    case 'TOO_CLOSE':
      return {
        code: 'BUILDING_TOO_CLOSE',
        details: {
          near: nearestBuilding(lonLat, aroundOf(buildings, pledged))?.key,
          km: BUILDING_SPACING_KM,
        },
      };
  }
}
