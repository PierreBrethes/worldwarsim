import { convexTest } from 'convex-test';
import { describe, expect, it, vi } from 'vitest';
import { api } from './_generated/api';
import { recruitmentCost } from './constants';
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

/** Extraction outposts do not exist: without this nudge, nothing is producible. */
async function creditSteel(t: ReturnType<typeof boot>, token: string, stock: number) {
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
    const steel = rows.find((row) => row.key === 'steel');
    if (!steel) throw new Error('steel row missing');
    await ctx.db.patch(steel._id, { stock, updatedAt: Date.now() });
  });
}

describe('production queue', () => {
  it('only starts the head batch and leaves the followers waiting', async () => {
    const t = boot();
    const token = await launchedSeason(t);
    await creditSteel(t, token, 2000);

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
      await creditSteel(t, token, 2000);
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
    await creditSteel(t, token, 2000);
    await t.mutation(api.units.recruit, { token, role: 'infantry', tier: 1, count: 1 });
    await t.mutation(api.units.recruit, { token, role: 'armor', tier: 1, count: 2 });

    const before = await t.query(api.units.workshop, { token });
    const inChain = before.queue[0]!;
    const waiting = before.queue[1]!;
    const cost = recruitmentCost('armor', 1, 2, before.industryLevel);

    await expect(
      t.mutation(api.units.cancel, { token, recruitmentId: inChain.id }),
    ).rejects.toThrow('BATCH_ALREADY_STARTED');

    await t.mutation(api.units.cancel, { token, recruitmentId: waiting.id });

    const after = await t.query(api.units.workshop, { token });
    expect(after.queue).toHaveLength(1);
    expect(after.steel.stock).toBe(before.steel.stock + cost.steel);
    expect(after.manpower.stock).toBe(before.manpower.stock + cost.manpower);
  });

  it('clips the manpower refund at the conscription cap', async () => {
    const t = boot();
    const token = await launchedSeason(t);
    await creditSteel(t, token, 2000);
    await t.mutation(api.units.recruit, { token, role: 'infantry', tier: 1, count: 1 });
    const order = await t.mutation(api.units.recruit, {
      token,
      role: 'infantry',
      tier: 1,
      count: 1,
    });

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
      const manpower = rows.find((row) => row.key === 'manpower');
      if (!manpower?.cap) throw new Error('cap missing');
      await ctx.db.patch(manpower._id, { stock: manpower.cap, updatedAt: Date.now() });
    });

    await t.mutation(api.units.cancel, { token, recruitmentId: order.recruitmentId });

    const after = await t.query(api.units.workshop, { token });
    expect(after.manpower.cap).not.toBeNull();
    expect(after.manpower.stock).toBe(after.manpower.cap);
  });

  it('rejects a missing tier and tier 2 without the industrial complex', async () => {
    const t = boot();
    const token = await launchedSeason(t);
    await creditSteel(t, token, 2000);

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
   * A unit is bought with steel, and steel only comes from extraction outposts, which do not
   * exist yet: a fresh nation can therefore produce nothing at all.
   */
  it('leaves a fresh nation unable to produce anything', async () => {
    const t = boot();
    const token = await launchedSeason(t);
    const workshop = await t.query(api.units.workshop, { token });

    expect(workshop.steel.stock).toBe(0);
    expect(workshop.grid.every((entry) => entry.unit.steel > 0)).toBe(true);
    await expect(
      t.mutation(api.units.recruit, { token, role: 'infantry', tier: 1, count: 1 }),
    ).rejects.toThrow('INSUFFICIENT_RESOURCE');
  });
});
