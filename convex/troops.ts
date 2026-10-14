import { v } from 'convex/values';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { internalMutation, mutation, query } from './_generated/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { PROJECTION_BY_DOMAIN, TIERS_BY_ROLE, projectionKeyOf } from '../src/domain/troops';
import type { UnitDomain } from '../src/domain/troops';
import type { BuildingKey, UnitRole } from '../src/domain/ids';
import { levelOf, playerBuildings, totalLevelOf } from './buildingReads';
import { blitzRecruitRefusalOf, fundsAt } from '../src/domain/blitz';
import { modeOf } from '../src/domain/season-mode';
import { creditFunds, fundsOf, isBlitz, spendFunds } from './blitz';
import {
  BLITZ,
  COST_BY_ROLE,
  MAX_QUEUED_BATCHES,
  TIER_2_HQ_LEVEL,
  chainSpeed,
  nominalStrength,
  recruitmentCost,
  roleHqLevel,
  roleSiteLevel,
  troopCap,
} from './constants';
import { fail } from './errors';
import { regionFacts } from './regions';
import { credit, debit, economyOf, snapshotOf, settle } from './resources';
import {
  playerOf,
  playingSeason,
  requirePlayable,
  requireStarted,
  seasonStillPlays,
} from './seats';
import { UNIT_ROLE, UNIT_TIER } from './validators';
import { reassessDetection } from './movement/detection';

/** Derived from the domain table rather than written a second time: one key, one domain. */
const DOMAIN_OF_PROJECTION = new Map<BuildingKey, UnitDomain>(
  (Object.entries(PROJECTION_BY_DOMAIN) as ReadonlyArray<[UnitDomain, BuildingKey]>).map(
    ([domain, key]) => [key, domain],
  ),
);

/**
 * What the production surface needs to know, and nothing more: it does not go through
 * `PlayerView`, which describes the board and has no reason to carry a cost grid.
 */
export const workshop = query({
  args: { token: v.string(), seasonId: v.id('seasons') },
  handler: async (ctx, { token, seasonId }) => {
    const { player, season } = await playerOf(ctx, token, seasonId);
    requireStarted(season);
    const now = Date.now();

    const buildings = await playerBuildings(ctx, player._id);
    const hqLevel = levelOf(buildings, 'hq');
    const troops = await troopsOf(ctx, player._id);
    const waiting = await recruitmentsOf(ctx, player._id);
    const economy = await economyOf(ctx, player._id, now);

    const blitz = modeOf(season.mode) === 'blitz';
    const facilities = buildings
      .filter(
        (building) => DOMAIN_OF_PROJECTION.has(building.key) || (blitz && building.key === 'hq'),
      )
      .map((building) => ({
        id: building._id,
        key: building.key,
        domain: DOMAIN_OF_PROJECTION.get(building.key) ?? 'land',
        level: building.level,
        regionId: building.regionId,
        regionName: regionFacts(building.regionId)?.name ?? building.regionId,
        queue: dateQueue(
          waiting.filter((batch) => batch.buildingId === building._id).sort(byRank),
          blitz ? null : hqLevel,
          now,
        ),
      }));

    return {
      // The instant the queue was dated. Without it the client cannot tell a remaining time
      // from a countdown: `minutesLeft` is relative to this reading, and re-reading it as
      // "now" on every beat froze the queue's clock at its served value.
      loadedAt: now,
      /** La Blitz paie en fonds, une marque par rôle, sans palier : l'abaque le lit ici. */
      blitz,
      nation: player.nation ?? '?',
      hqLevel,
      speed: chainSpeed(hqLevel),
      // Served rather than left to the client: the case the screen greys out and the
      // recruitment the server refuses read the same number (ADR 0017).
      tier2Unlocked: hqLevel >= TIER_2_HQ_LEVEL,
      requiredHqLevel: TIER_2_HQ_LEVEL,
      maxQueue: MAX_QUEUED_BATCHES,
      // Standing troops and queued batches share one ceiling, otherwise the queue is where a
      // nation stores the army it is not allowed to have.
      troopCap: troopCap(totalLevelOf(buildings, 'billets')),
      troopsInService: troops.length,
      troopsQueued: waiting.length,
      alloy: snapshotOf(economy, 'alloy'),
      facilities,
      roster: roster(troops),
      grid: (Object.keys(COST_BY_ROLE) as ReadonlyArray<UnitRole>).map((role) => ({
        role,
        tiers: TIERS_BY_ROLE[role],
        producedBy: projectionKeyOf(role),
        /**
         * What the headquarters must reach before this role is recruitable at all — zero for
         * the roles their projection building already carries. Served, like the mark-2
         * threshold above, so the line the screen greys and the recruitment the server refuses
         * are the same number.
         */
        unlockedAtHqLevel: roleHqLevel(role),
        /** L'autre verrou, local : le niveau que le bâtiment qui forme doit atteindre (67b).
         *  Servi comme le précédent — l'abaque le dit en toutes lettres sans rien posséder,
         *  et la modale de site le compare au niveau de *son* bâtiment. */
        unlockedAtSiteLevel: roleSiteLevel(role),
        unit: priced(role, 1, hqLevel),
        unitTier2: TIERS_BY_ROLE[role] === 2 ? priced(role, 2, hqLevel) : null,
      })),
    };
  },
});

export const recruit = mutation({
  args: {
    token: v.string(),
    seasonId: v.id('seasons'),
    buildingId: v.id('buildings'),
    role: UNIT_ROLE,
    tier: UNIT_TIER,
  },
  handler: async (ctx, { token, seasonId, buildingId, role, tier }) => {
    const { player, season } = await playerOf(ctx, token, seasonId);
    requirePlayable(player, season);

    const building = await ctx.db.get(buildingId);
    if (!building || building.playerId !== player._id) fail('UNKNOWN_BUILDING');
    if (modeOf(season.mode) === 'blitz') return recruitInBlitz(ctx, player, building, role);
    const expected = projectionKeyOf(role);
    if (building.key !== expected)
      fail('WRONG_PROJECTION_BUILDING', { expected, found: building.key });
    if (tier > TIERS_BY_ROLE[role]) fail('SINGLE_TIER_ROLE');

    const buildings = await playerBuildings(ctx, player._id);
    const hqLevel = levelOf(buildings, 'hq');
    if (tier === 2 && hqLevel < TIER_2_HQ_LEVEL) {
      fail('TIER_2_LOCKED', { requiredLevel: TIER_2_HQ_LEVEL });
    }
    // The tank waits for the level that arms its counter, whatever tier is asked for.
    const roleLevel = roleHqLevel(role);
    if (hqLevel < roleLevel) fail('ROLE_LOCKED', { role, requiredLevel: roleLevel });
    // And the local one: the site itself has to have been raised to the role (67b).
    const siteLevel = roleSiteLevel(role);
    if (building.level < siteLevel)
      fail('SITE_LEVEL_LOCKED', { building: building.key, requiredLevel: siteLevel });

    /**
     * The queue counts against the ceiling. Leaving it out would make the queue a way of
     * holding an army the billets do not allow, and the ceiling would only ever be reached
     * for a reading.
     */
    const cap = troopCap(totalLevelOf(buildings, 'billets'));
    const standing = (await troopsOf(ctx, player._id)).length;
    const queued = (await recruitmentsOf(ctx, player._id)).length;
    if (standing + queued >= cap) fail('TROOP_CAP_REACHED', { cap, standing, queued });

    const queue = await queueOf(ctx, buildingId);
    if (queue.length >= MAX_QUEUED_BATCHES) fail('QUEUE_FULL', { maximum: MAX_QUEUED_BATCHES });

    const now = Date.now();
    const cost = recruitmentCost(role, tier, hqLevel);
    await debit(ctx, player._id, { alloy: cost.alloy }, now);

    const last = queue[queue.length - 1];
    const rank = last ? last.rank + 1 : 0;
    const recruitmentId = await ctx.db.insert('recruitments', {
      playerId: player._id,
      buildingId,
      role,
      tier,
      rank,
      finishesAt: null,
    });
    /**
     * Unconditional, because `startHead` is idempotent on a queue already running: what it also
     * picks up is a head a famine left undated (D3). A player who orders again after feeding his
     * nation should not have to wait for a second event to restart the line.
     */
    await startHead(ctx, buildingId, now);
    return { cost, rank, recruitmentId };
  },
});

/**
 * **Recruter en Blitz** : dans un bâtiment de production qu'on tient, payé en fonds, une marque
 * par rôle, sans palier ni plafond affiché. Le refus est celui que la modale lit
 * (`blitzRecruitRefusalOf`).
 */
async function recruitInBlitz(
  ctx: MutationCtx,
  player: Doc<'players'>,
  building: Doc<'buildings'>,
  role: UnitRole,
) {
  const now = Date.now();
  const troops =
    (await troopsOf(ctx, player._id)).length + (await recruitmentsOf(ctx, player._id)).length;
  const funds = fundsAt(await fundsOf(ctx, player, now), now);
  const refusal = blitzRecruitRefusalOf({ site: building.key, role, funds, troops });
  if (refusal !== null) {
    fail(refusal, { needed: BLITZ.rolePrice[role], held: Math.floor(funds), found: building.key });
  }
  await spendFunds(ctx, player._id, BLITZ.rolePrice[role], now);
  const queue = await queueOf(ctx, building._id);
  const rank = (queue[queue.length - 1]?.rank ?? -1) + 1;
  const recruitmentId = await ctx.db.insert('recruitments', {
    playerId: player._id,
    buildingId: building._id,
    role,
    tier: 1,
    rank,
    finishesAt: null,
  });
  await startHead(ctx, building._id, now);
  return { cost: { alloy: 0, minutes: BLITZ.recruitMinutes }, rank, recruitmentId };
}

/**
 * Only what has not started gets refunded. A running batch has already consumed the line's
 * time, and cancelling it midway would open a free round trip between matter and time.
 */
export const cancel = mutation({
  args: { token: v.string(), seasonId: v.id('seasons'), recruitmentId: v.id('recruitments') },
  handler: async (ctx, { token, seasonId, recruitmentId }) => {
    const { player, season } = await playerOf(ctx, token, seasonId);
    requirePlayable(player, season);
    const batch = await ctx.db.get(recruitmentId);
    if (!batch || batch.playerId !== player._id) fail('UNKNOWN_BATCH');
    if (batch.finishesAt !== null) fail('BATCH_ALREADY_STARTED');

    if (modeOf(season.mode) === 'blitz') {
      await creditFunds(ctx, player._id, BLITZ.rolePrice[batch.role], Date.now());
      await ctx.db.delete(recruitmentId);
      return { refunded: { alloy: 0, minutes: BLITZ.recruitMinutes } };
    }
    const hqLevel = await hqLevelOf(ctx, player._id);
    const cost = recruitmentCost(batch.role, batch.tier, hqLevel);
    await credit(ctx, player._id, { alloy: cost.alloy }, Date.now());
    await ctx.db.delete(recruitmentId);
    return { refunded: cost };
  },
});

/**
 * A finished batch **is** a troop — never a counter that goes up (ADR 0014). It is attached to
 * the building that formed it; if that building is gone by then, it comes home rather than
 * arriving nowhere.
 */
export const deliver = internalMutation({
  args: { recruitmentId: v.id('recruitments') },
  handler: async (ctx, { recruitmentId }) => {
    const batch = await ctx.db.get(recruitmentId);
    if (!batch) return;
    const season = await playingSeason(ctx, batch.playerId);
    if (season === null) return;

    /** The hours of the queue were eaten by the army as it stood: settle them before the new
     *  mouth is counted, or its upkeep is charged backwards over the whole formation. */
    await settle(ctx, batch.playerId, Date.now());
    const strength = nominalStrength(batch.role, batch.tier);
    const station = await ctx.db.get(batch.buildingId);
    await ctx.db.insert('troops', {
      seasonId: season._id,
      playerId: batch.playerId,
      role: batch.role,
      tier: batch.tier,
      nominalStrength: strength,
      currentStrength: strength,
      stationedAt: station ? batch.buildingId : null,
    });
    /** The site travels with the delivery, `null` when it was razed while the batch formed —
     *  the company comes home rather than dying for it, and the dispatch has to say which. */
    await ctx.db.insert('notices', {
      playerId: batch.playerId,
      at: Date.now(),
      kind: 'recruitmentDelivered',
      role: batch.role,
      site: station === null ? null : { building: station.key, regionId: station.regionId },
    });
    await ctx.db.delete(recruitmentId);
    await reassessDetection(ctx, season._id);
    await startHead(ctx, batch.buildingId, Date.now());
  },
});

/**
 * **The queues, restarted where hunger left them.** Called from the one place a stock is banked
 * (`resources.ts`), on the events that can end a famine and on no clock at all: a farm going up,
 * a lot refunded, an army that shrank. It re-reads the economy rather than trusting the caller,
 * so a wake-up that finds the player still hungry does nothing and says nothing.
 *
 * One pass over the buildings that hold an undated head — `startHead` is idempotent, so a queue
 * already running is left exactly as it is.
 */
export const resumeQueues = internalMutation({
  args: { playerId: v.id('players') },
  handler: async (ctx, { playerId }) => {
    if (!(await seasonStillPlays(ctx, playerId))) return;
    const now = Date.now();
    if ((await economyOf(ctx, playerId, now)).starving) return;
    const waiting = await recruitmentsOf(ctx, playerId);
    for (const buildingId of new Set(waiting.map((batch) => batch.buildingId))) {
      await startHead(ctx, buildingId, now);
    }
  },
});

export async function troopsOf(
  ctx: QueryCtx,
  playerId: Id<'players'>,
): Promise<Array<Doc<'troops'>>> {
  return ctx.db
    .query('troops')
    .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
    .collect();
}

/**
 * A queue advances on its own, rest window included: the window forbids a movement from
 * *arriving*, it stops neither constructions nor production.
 *
 * One queue per building, so a delivery only ever wakes its own line — two barracks never
 * wait on each other.
 */
async function startHead(
  ctx: MutationCtx,
  buildingId: Id<'buildings'>,
  now: number,
): Promise<void> {
  const queue = await queueOf(ctx, buildingId);
  const head = queue[0];
  if (!head || head.finishesAt !== null) return;

  /**
   * **A hungry nation forms nothing** (`consommation-continue.md` D3). The queue *stops*, it is
   * never cancelled: the batch keeps its rank and its matter, it simply is not dated, and
   * `resumeQueues` dates it the moment the food comes back. Nothing dies of a famine — rule 3
   * of the project — so this is the whole of what hunger does, and it is meant to be felt at
   * once rather than discovered later.
   *
   * A batch **already** dated runs to its end: its time was bought before the reserve ran out,
   * and taking it back would be an attrition on the queue by another name.
   */
  if ((await economyOf(ctx, head.playerId, now)).starving) return;

  const player = await ctx.db.get(head.playerId);
  const blitz = player !== null && (await isBlitz(ctx, player.seasonId));

  const minutes = blitz
    ? BLITZ.recruitMinutes
    : recruitmentCost(head.role, head.tier, await hqLevelOf(ctx, head.playerId)).minutes;
  const finishesAt = now + minutes * 60_000;
  await ctx.db.patch(head._id, { finishesAt });
  await ctx.scheduler.runAt(finishesAt, internal.troops.deliver, { recruitmentId: head._id });
}

async function queueOf(
  ctx: QueryCtx,
  buildingId: Id<'buildings'>,
): Promise<Array<Doc<'recruitments'>>> {
  const batches = await ctx.db
    .query('recruitments')
    .withIndex('byBuilding', (q) => q.eq('buildingId', buildingId))
    .collect();
  return batches.sort(byRank);
}

export async function recruitmentsOf(
  ctx: QueryCtx,
  playerId: Id<'players'>,
): Promise<Array<Doc<'recruitments'>>> {
  return ctx.db
    .query('recruitments')
    .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
    .collect();
}

const hqLevelOf = async (ctx: QueryCtx, playerId: Id<'players'>): Promise<number> =>
  levelOf(await playerBuildings(ctx, playerId), 'hq');

const byRank = (a: Doc<'recruitments'>, b: Doc<'recruitments'>): number => a.rank - b.rank;

const priced = (role: UnitRole, tier: 1 | 2, hqLevel: number) => ({
  ...recruitmentCost(role, tier, hqLevel),
  strength: nominalStrength(role, tier),
});

/**
 * A waiting batch's due time is derived from the ones ahead of it in **its own** queue:
 * nothing is dated in the database until a batch has started, otherwise every cancellation
 * would re-date everything behind it.
 */
function dateQueue(
  queue: ReadonlyArray<Doc<'recruitments'>>,
  /** `null` en Blitz : une recrue y sort en `BLITZ.recruitMinutes`, sans QG ni marque. */
  hqLevel: number | null,
  now: number,
) {
  let cursor = now;
  return queue.map((batch) => {
    const minutes =
      hqLevel === null
        ? BLITZ.recruitMinutes
        : recruitmentCost(batch.role, batch.tier, hqLevel).minutes;
    const duration = batch.finishesAt === null ? minutes * 60_000 : 0;
    const finishesAt = batch.finishesAt ?? cursor + duration;
    cursor = finishesAt;
    return {
      id: batch._id,
      role: batch.role,
      tier: batch.tier,
      strength: nominalStrength(batch.role, batch.tier),
      started: batch.finishesAt !== null,
      minutesLeft: Math.max(0, (finishesAt - now) / 60_000),
    };
  });
}

/** What the workshop shows above each role: how many stand, by equipment tier. */
function roster(troops: ReadonlyArray<Doc<'troops'>>) {
  const counts = new Map<string, { role: UnitRole; tier: 1 | 2; count: number }>();
  for (const troop of troops) {
    const key = `${troop.role}-${troop.tier}`;
    const seen = counts.get(key);
    if (seen) seen.count += 1;
    else counts.set(key, { role: troop.role, tier: troop.tier, count: 1 });
  }
  return [...counts.values()];
}
