import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { internal } from './_generated/api';
import { GAME_TABLES } from './dev';
import schema from './schema';
import { modules } from './test.setup';
import { foundSeat } from './seats.fixture';

describe('dev.reset', () => {
  it('empties every game table, however many documents, and cancels pending jobs', async () => {
    const t = convexTest({ schema, modules });
    const { seat } = await foundSeat(t, 'Pierre', 0.5);
    await t.run(async (ctx) => {
      const player = await ctx.db
        .query('players')
        .withIndex('bySeason', (q) => q.eq('seasonId', seat.seasonId))
        .first();
      for (let k = 0; k < 450; k++)
        await ctx.db.insert('notices', {
          playerId: player!._id,
          at: k,
          kind: 'outpostFounded',
          hostCountry: 'BEL',
          point: { lon: 4, lat: 50 },
          specialization: 'relay',
        });
      await ctx.scheduler.runAfter(60_000, internal.press.publish, { playerId: player!._id });
    });

    await t.action(internal.dev.reset, {});

    await t.run(async (ctx) => {
      for (const table of GAME_TABLES) expect(await ctx.db.query(table).first()).toBeNull();
      expect(await ctx.db.query('accounts').first()).not.toBeNull();
      const jobs = await ctx.db.system.query('_scheduled_functions').collect();
      expect(jobs.filter((job) => job.state.kind === 'pending')).toEqual([]);
    });
  });
});
