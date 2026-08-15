import { convexTest } from 'convex-test';
import { describe, expect, it, vi } from 'vitest';
import { api } from './_generated/api';
import { STARTING_STOCK, recruitmentCost } from './constants';
import schema from './schema';
import { modules } from './test.setup';

const boot = () => convexTest(schema, modules);

async function launchedSeason(t: ReturnType<typeof boot>) {
  const { code, token } = await t.mutation(api.seasons.create, {
    nickname: 'Pierre',
    durationHours: 48,
    compensation: 0.5,
  });
  const { token: guest } = await t.mutation(api.seasons.join, { code, nickname: 'Léa' });
  await t.mutation(api.players.reserveNation, { token, nation: 'france' });
  await t.mutation(api.players.chooseDoctrine, { token, doctrine: 'hegemony' });
  await t.mutation(api.players.declareReady, { token, ready: true });
  await t.mutation(api.players.reserveNation, { token: guest, nation: 'ussr' });
  await t.mutation(api.players.chooseDoctrine, { token: guest, doctrine: 'domination' });
  await t.mutation(api.players.declareReady, { token: guest, ready: true });
  await t.mutation(api.seasons.launch, { token });
  return token;
}

/** A fresh nation holds the starting kit and nothing more; the recruitment tests need a
 *  foundry's worth of alloy without spending the season building one. */
async function creditAlloy(t: ReturnType<typeof boot>, token: string, stock: number) {
  await t.run(async (ctx) => {
    const player = await ctx.db
      .query('players')
      .withIndex('byToken', (q) => q.eq('token', token))
      .unique();
    if (!player) throw new Error('player not found');
    const rows = await ctx.db
      .query('resources')
      .withIndex('byPlayer', (q) => q.eq('playerId', player._id))
      .collect();
    const alloy = rows.find((row) => row.key === 'alloy');
    if (!alloy) throw new Error('alloy row missing');
    await ctx.db.patch(alloy._id, { stock, updatedAt: Date.now() });
  });
}

describe('production queue', () => {
  it('only starts the head batch and leaves the followers waiting', async () => {
    const t = boot();
    const token = await launchedSeason(t);
    await creditAlloy(t, token, 2000);

    await t.mutation(api.units.recruit, { token, role: 'infantry', tier: 1, count: 2 });
    await t.mutation(api.units.recruit, { token, role: 'armor', tier: 1, count: 1 });
    await t.mutation(api.units.recruit, { token, role: 'fighter', tier: 1, count: 1 });

    const workshop = await t.query(api.units.workshop, { token });
    expect(workshop.queue.map((batch) => [batch.role, batch.started])).toEqual([
      ['infantry', true],
      ['armor', false],
      ['fighter', false],
    ]);
    // A waiting batch's due time accumulates the ones ahead of it.
    expect(workshop.queue[1]!.minutesLeft).toBeGreaterThan(workshop.queue[0]!.minutesLeft);
    expect(workshop.queue[2]!.minutesLeft).toBeGreaterThan(workshop.queue[1]!.minutesLeft);
  });

  it('chains the next batch when the previous one is delivered', async () => {
    vi.useFakeTimers();
    try {
      const t = boot();
      const token = await launchedSeason(t);
      await creditAlloy(t, token, 2000);
      await t.mutation(api.units.recruit, { token, role: 'infantry', tier: 1, count: 2 });
      await t.mutation(api.units.recruit, { token, role: 'infantry', tier: 1, count: 3 });

      await t.finishAllScheduledFunctions(vi.runAllTimers);

      const workshop = await t.query(api.units.workshop, { token });
      expect(workshop.queue).toHaveLength(0);
      expect(workshop.roster).toEqual([{ role: 'infantry', tier: 1, count: 5 }]);

      const view = await t.query(api.view.playerView, { token });
      expect(view.me.armyPresent).toEqual({ infantry: 5 });
    } finally {
      vi.useRealTimers();
    }
  });

  it('refunds a waiting batch and refuses to cancel the one that started', async () => {
    const t = boot();
    const token = await launchedSeason(t);
    await creditAlloy(t, token, 2000);
    await t.mutation(api.units.recruit, { token, role: 'infantry', tier: 1, count: 1 });
    await t.mutation(api.units.recruit, { token, role: 'armor', tier: 1, count: 2 });

    const before = await t.query(api.units.workshop, { token });
    const inChain = before.queue[0]!;
    const waiting = before.queue[1]!;
    const cost = recruitmentCost('armor', 1, 2, before.hqLevel);

    await expect(
      t.mutation(api.units.cancel, { token, recruitmentId: inChain.id }),
    ).rejects.toThrow('BATCH_ALREADY_STARTED');

    await t.mutation(api.units.cancel, { token, recruitmentId: waiting.id });

    const after = await t.query(api.units.workshop, { token });
    expect(after.queue).toHaveLength(1);
    expect(after.alloy.stock).toBe(before.alloy.stock + cost.alloy);
  });

  it('rejects a missing tier and tier 2 without the headquarters level', async () => {
    const t = boot();
    const token = await launchedSeason(t);
    await creditAlloy(t, token, 2000);

    await expect(
      t.mutation(api.units.recruit, { token, role: 'infantry', tier: 2, count: 1 }),
    ).rejects.toThrow('TIER_2_LOCKED');
    await expect(
      t.mutation(api.units.recruit, { token, role: 'fighter', tier: 2, count: 1 }),
    ).rejects.toThrow('SINGLE_TIER_ROLE');
    await expect(
      t.mutation(api.units.recruit, { token, role: 'infantry', tier: 1, count: 0 }),
    ).rejects.toThrow('BATCH_TOO_SMALL');
  });

  /**
   * The reverse of what this file used to record. Steel came from extraction outposts that do
   * not exist, so a fresh nation could produce nothing at all; the starting kit now carries
   * an advance of alloy, and the first light troops are affordable on the first minute.
   */
  it('lets a fresh nation produce its first troops out of the starting kit', async () => {
    const t = boot();
    const token = await launchedSeason(t);
    const workshop = await t.query(api.units.workshop, { token });

    expect(workshop.alloy.stock).toBe(STARTING_STOCK.alloy);
    expect(workshop.grid.every((entry) => entry.unit.alloy > 0)).toBe(true);
    await t.mutation(api.units.recruit, { token, role: 'infantry', tier: 1, count: 1 });

    const after = await t.query(api.units.workshop, { token });
    expect(after.queue).toHaveLength(1);
  });
});
