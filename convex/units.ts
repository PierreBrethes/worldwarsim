import { v } from 'convex/values';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { internalMutation, mutation, query } from './_generated/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { accruedStock } from '../src/domain/off-season';
import { TIERS_BY_ROLE } from '../src/domain/troops';
import type { BuildingKey, ResourceKey, UnitRole } from '../src/domain/ids';
import {
  COST_BY_ROLE,
  MAX_QUEUED_BATCHES,
  MAX_UNITS_PER_BATCH,
  TIER_2_INDUSTRY_LEVEL,
  industrySpeed,
  recruitmentCost,
} from './constants';
import { fail } from './errors';
import { credit, debit } from './resources';
import { playerByToken } from './seasons';

const UNIT_ROLE = v.union(
  v.literal('infantry'),
  v.literal('armor'),
  v.literal('landTransport'),
  v.literal('fighter'),
  v.literal('bomber'),
  v.literal('airTransport'),
  v.literal('escort'),
  v.literal('cargo'),
  v.literal('carrier'),
);

const UNIT_TIER = v.union(v.literal(1), v.literal(2));

/**
 * What the production surface needs to know, and nothing more: it does not go through
 * `PlayerView`, which describes the board and has no reason to carry a cost grid.
 */
export const workshop = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const { player, season } = await playerByToken(ctx, token);
    if (season.status !== 'launched') fail('SEASON_NOT_LAUNCHED');
    const now = Date.now();

    const industryLevel = await buildingLevel(ctx, player._id, 'industry');
    const roster = await ctx.db
      .query('units')
      .withIndex('byPlayer', (q) => q.eq('playerId', player._id))
      .collect();
    const queue = await queueOf(ctx, player._id);

    const rows = await ctx.db
      .query('resources')
      .withIndex('byPlayer', (q) => q.eq('playerId', player._id))
      .collect();
    const resource = (key: ResourceKey) => {
      const row = rows.find((candidate) => candidate.key === key);
      if (!row) fail('MISSING_RESOURCE', { resource: key });
      return {
        stock: Math.floor(accruedStock(row, now, row.cap ?? undefined)),
        ratePerHour: row.ratePerHour,
        cap: row.cap,
      };
    };

    // A waiting batch's due time is derived from the ones ahead: nothing is dated in the
    // database until a batch has started, otherwise every cancellation would re-date it all.
    let cursor = now;
    const datedQueue = queue.map((batch) => {
      const duration =
        batch.finishesAt === null
          ? recruitmentCost(batch.role, batch.tier, batch.count, industryLevel).minutes * 60_000
          : 0;
      const finishesAt = batch.finishesAt ?? cursor + duration;
      cursor = finishesAt;
      return {
        id: batch._id,
        role: batch.role,
        tier: batch.tier,
        count: batch.count,
        started: batch.finishesAt !== null,
        minutesLeft: Math.max(0, (finishesAt - now) / 60_000),
      };
    });

    return {
      nation: player.nation ?? '?',
      industryLevel,
      speed: industrySpeed(industryLevel),
      tier2Unlocked: industryLevel >= TIER_2_INDUSTRY_LEVEL,
      requiredIndustryLevel: TIER_2_INDUSTRY_LEVEL,
      maxBatch: MAX_UNITS_PER_BATCH,
      maxQueue: MAX_QUEUED_BATCHES,
      supply: resource('supply'),
      steel: resource('steel'),
      manpower: resource('manpower'),
      roster: roster.map(({ role, tier, count }) => ({ role, tier, count })),
      queue: datedQueue,
      grid: (Object.keys(COST_BY_ROLE) as ReadonlyArray<UnitRole>).map((role) => ({
        role,
        tiers: TIERS_BY_ROLE[role],
        unit: recruitmentCost(role, 1, 1, industryLevel),
        unitTier2:
          TIERS_BY_ROLE[role] === 2 ? recruitmentCost(role, 2, 1, industryLevel) : null,
      })),
    };
  },
});

export const recruit = mutation({
  args: { token: v.string(), role: UNIT_ROLE, tier: UNIT_TIER, count: v.number() },
  handler: async (ctx, { token, role, tier, count }) => {
    const { player, season } = await playerByToken(ctx, token);
    if (season.status !== 'launched') fail('SEASON_NOT_LAUNCHED');

    if (!Number.isInteger(count) || count < 1) fail('BATCH_TOO_SMALL');
    if (count > MAX_UNITS_PER_BATCH) fail('BATCH_TOO_LARGE', { maximum: MAX_UNITS_PER_BATCH });
    if (tier > TIERS_BY_ROLE[role]) fail('SINGLE_TIER_ROLE');

    const industryLevel = await buildingLevel(ctx, player._id, 'industry');
    if (tier === 2 && industryLevel < TIER_2_INDUSTRY_LEVEL) {
      fail('TIER_2_LOCKED', { requiredLevel: TIER_2_INDUSTRY_LEVEL });
    }

    const queue = await queueOf(ctx, player._id);
    if (queue.length >= MAX_QUEUED_BATCHES) fail('QUEUE_FULL', { maximum: MAX_QUEUED_BATCHES });

    const now = Date.now();
    const cost = recruitmentCost(role, tier, count, industryLevel);
    await debit(
      ctx,
      player._id,
      { supply: cost.supply, steel: cost.steel, manpower: cost.manpower },
      now,
    );

    const last = queue[queue.length - 1];
    const recruitmentId = await ctx.db.insert('recruitments', {
      playerId: player._id,
      role,
      tier,
      count,
      rank: last ? last.rank + 1 : 0,
      finishesAt: null,
    });
    if (queue.length === 0) await startHead(ctx, player._id, now);
    return { cost, rank: last ? last.rank + 1 : 0, recruitmentId };
  },
});

/**
 * Only what has not started gets refunded. A running batch has already consumed workshop
 * time, and cancelling it midway would open a free round trip between steel and time.
 */
export const cancel = mutation({
  args: { token: v.string(), recruitmentId: v.id('recruitments') },
  handler: async (ctx, { token, recruitmentId }) => {
    const { player } = await playerByToken(ctx, token);
    const batch = await ctx.db.get(recruitmentId);
    if (!batch || batch.playerId !== player._id) fail('UNKNOWN_BATCH');
    if (batch.finishesAt !== null) fail('BATCH_ALREADY_STARTED');

    const industryLevel = await buildingLevel(ctx, player._id, 'industry');
    const cost = recruitmentCost(batch.role, batch.tier, batch.count, industryLevel);
    await credit(
      ctx,
      player._id,
      { supply: cost.supply, steel: cost.steel, manpower: cost.manpower },
      Date.now(),
    );
    await ctx.db.delete(recruitmentId);
    return { refunded: cost };
  },
});

export const deliver = internalMutation({
  args: { recruitmentId: v.id('recruitments') },
  handler: async (ctx, { recruitmentId }) => {
    const batch = await ctx.db.get(recruitmentId);
    if (!batch) return;

    const roster = await ctx.db
      .query('units')
      .withIndex('byPlayer', (q) => q.eq('playerId', batch.playerId))
      .collect();
    const row = roster.find(
      (candidate) => candidate.role === batch.role && candidate.tier === batch.tier,
    );
    if (row) {
      await ctx.db.patch(row._id, { count: row.count + batch.count });
    } else {
      await ctx.db.insert('units', {
        playerId: batch.playerId,
        role: batch.role,
        tier: batch.tier,
        count: batch.count,
      });
    }
    await ctx.db.delete(recruitmentId);
    await startHead(ctx, batch.playerId, Date.now());
  },
});

/**
 * The queue advances on its own, rest window included: the window forbids a movement from
 * *arriving*, it stops neither constructions nor production.
 */
async function startHead(
  ctx: MutationCtx,
  playerId: Id<'players'>,
  now: number,
): Promise<void> {
  const queue = await queueOf(ctx, playerId);
  const head = queue[0];
  if (!head || head.finishesAt !== null) return;

  const industryLevel = await buildingLevel(ctx, playerId, 'industry');
  const { minutes } = recruitmentCost(head.role, head.tier, head.count, industryLevel);
  const finishesAt = now + minutes * 60_000;
  await ctx.db.patch(head._id, { finishesAt });
  await ctx.scheduler.runAt(finishesAt, internal.units.deliver, { recruitmentId: head._id });
}

async function queueOf(ctx: QueryCtx, playerId: Id<'players'>): Promise<Array<Doc<'recruitments'>>> {
  const batches = await ctx.db
    .query('recruitments')
    .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
    .collect();
  return batches.sort((a, b) => a.rank - b.rank);
}

async function buildingLevel(
  ctx: QueryCtx,
  playerId: Id<'players'>,
  key: BuildingKey,
): Promise<number> {
  const buildings = await ctx.db
    .query('buildings')
    .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
    .collect();
  return buildings.find((candidate) => candidate.key === key)?.level ?? 1;
}
