import { v } from 'convex/values';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { internalMutation, mutation, query } from './_generated/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { PROJECTION_BY_DOMAIN, TIERS_BY_ROLE, projectionKeyOf } from '../src/domain/troops';
import type { UnitDomain } from '../src/domain/troops';
import type { BuildingKey, UnitRole } from '../src/domain/ids';
import { levelOf, playerBuildings, totalLevelOf } from './buildings';
import {
  COST_BY_ROLE,
  MAX_QUEUED_BATCHES,
  chainSpeed,
  formatOf,
  nominalStrength,
  recruitmentCost,
  roleHqLevel,
  tier2HqLevel,
  troopCap,
} from './constants';
import { fail } from './errors';
import { regionFacts } from './regions';
import { credit, debit, economyOf, snapshotOf } from './resources';
import {
  playerByToken,
  playingSeason,
  requirePlayable,
  requireStarted,
  seasonStillPlays,
} from './seasons';
import { UNIT_ROLE, UNIT_TIER } from './validators';

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
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const { player, season } = await playerByToken(ctx, token);
    requireStarted(season);
    const now = Date.now();

    const buildings = await playerBuildings(ctx, player._id);
    const hqLevel = levelOf(buildings, 'hq');
    const format = formatOf(season.durationHours);
    const tier2 = tier2HqLevel(format);
    const troops = await troopsOf(ctx, player._id);
    const waiting = await recruitmentsOf(ctx, player._id);
    const economy = await economyOf(ctx, player._id, now);

    const facilities = buildings
      .filter((building) => DOMAIN_OF_PROJECTION.has(building.key))
      .map((building) => ({
        id: building._id,
        key: building.key,
        domain: DOMAIN_OF_PROJECTION.get(building.key)!,
        level: building.level,
        regionId: building.regionId,
        regionName: regionFacts(building.regionId)?.name ?? building.regionId,
        queue: dateQueue(
          waiting.filter((batch) => batch.buildingId === building._id).sort(byRank),
          hqLevel,
          now,
        ),
      }));

    return {
      // The instant the queue was dated. Without it the client cannot tell a remaining time
      // from a countdown: `minutesLeft` is relative to this reading, and re-reading it as
      // "now" on every beat froze the queue's clock at its served value.
      loadedAt: now,
      nation: player.nation ?? '?',
      hqLevel,
      speed: chainSpeed(hqLevel),
      // The threshold of the format, never the constant: the case the screen greys out and the
      // recruitment the server refuses read the same number, computed once (ADR 0017).
      tier2Unlocked: hqLevel >= tier2,
      requiredHqLevel: tier2,
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
        unlockedAtHqLevel: roleHqLevel(role, format),
        unit: priced(role, 1, hqLevel),
        unitTier2: TIERS_BY_ROLE[role] === 2 ? priced(role, 2, hqLevel) : null,
      })),
    };
  },
});

export const recruit = mutation({
  args: {
    token: v.string(),
    buildingId: v.id('buildings'),
    role: UNIT_ROLE,
    tier: UNIT_TIER,
  },
  handler: async (ctx, { token, buildingId, role, tier }) => {
    const { player, season } = await playerByToken(ctx, token);
    requirePlayable(season);

    const building = await ctx.db.get(buildingId);
    if (!building || building.playerId !== player._id) fail('UNKNOWN_BUILDING');
    const expected = projectionKeyOf(role);
    if (building.key !== expected)
      fail('WRONG_PROJECTION_BUILDING', { expected, found: building.key });
    if (tier > TIERS_BY_ROLE[role]) fail('SINGLE_TIER_ROLE');

    const buildings = await playerBuildings(ctx, player._id);
    const hqLevel = levelOf(buildings, 'hq');
    const format = formatOf(season.durationHours);
    const tier2 = tier2HqLevel(format);
    if (tier === 2 && hqLevel < tier2) {
      fail('TIER_2_LOCKED', { requiredLevel: tier2 });
    }
    // The tank waits for the level that arms its counter, whatever tier is asked for.
    const roleLevel = roleHqLevel(role, format);
    if (hqLevel < roleLevel) fail('ROLE_LOCKED', { role, requiredLevel: roleLevel });

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
 * Only what has not started gets refunded. A running batch has already consumed the line's
 * time, and cancelling it midway would open a free round trip between matter and time.
 */
export const cancel = mutation({
  args: { token: v.string(), recruitmentId: v.id('recruitments') },
  handler: async (ctx, { token, recruitmentId }) => {
    const { player, season } = await playerByToken(ctx, token);
    requirePlayable(season);
    const batch = await ctx.db.get(recruitmentId);
    if (!batch || batch.playerId !== player._id) fail('UNKNOWN_BATCH');
    if (batch.finishesAt !== null) fail('BATCH_ALREADY_STARTED');

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
 * **Every troop of one season, and of no other.** What a contact sweeps when the question is
 * "who stands here" rather than "what is mine": the camps a departing column can walk into, the
 * defence that answers a point. The season filter lives here alone — a sweep without it lets a
 * garrison of a test game defend ground in the skirmish.
 */
export async function seasonTroops(
  ctx: QueryCtx,
  seasonId: Id<'seasons'>,
): Promise<Array<Doc<'troops'>>> {
  return ctx.db
    .query('troops')
    .withIndex('bySeason', (q) => q.eq('seasonId', seasonId))
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

  const hqLevel = await hqLevelOf(ctx, head.playerId);
  const { minutes } = recruitmentCost(head.role, head.tier, hqLevel);
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

async function recruitmentsOf(
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
function dateQueue(queue: ReadonlyArray<Doc<'recruitments'>>, hqLevel: number, now: number) {
  let cursor = now;
  return queue.map((batch) => {
    const duration =
      batch.finishesAt === null
        ? recruitmentCost(batch.role, batch.tier, hqLevel).minutes * 60_000
        : 0;
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
