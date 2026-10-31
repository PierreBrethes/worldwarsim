import { convexTest } from 'convex-test';
import { describe, expect, it, vi } from 'vitest';
import { internal } from './_generated/api';
import { GAME_TABLES } from './dev';
import schema from './schema';
import { modules } from './test.setup';
import { foundSeat, joinSeat, placeHq, seatIn } from './seats.fixture';
import { api } from './_generated/api';

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

async function twoNations() {
  const t = convexTest({ schema, modules });
  const { seat, code } = await foundSeat(t, 'Pierre', 0.5);
  const guest = await joinSeat(t, code, 'Léa');
  await t.mutation(api.players.reserveNation, { ...seat, nation: 'france' });
  await t.mutation(api.players.declareReady, { ...seat, ready: true });
  await t.mutation(api.players.reserveNation, { ...guest, nation: 'uk' });
  await t.mutation(api.players.declareReady, { ...guest, ready: true });
  await t.mutation(api.seasons.launch, seat);
  const playerId = await t.run(async (ctx) => (await seatIn(ctx, seat))._id);
  return { t, seat, playerId };
}

describe('dev.spawnTroops', () => {
  it('stands a rank 2 at its own strength, and refuses a rank the role does not have', async () => {
    const { t, playerId } = await twoNations();
    const at = { lon: 2.3, lat: 48.8 };
    await t.mutation(internal.dev.spawnTroops, {
      playerId,
      role: 'infantry',
      count: 1,
      tier: 2,
      ...at,
    });
    await t.mutation(internal.dev.spawnTroops, {
      playerId,
      role: 'armor',
      count: 1,
      tier: 2,
      ...at,
    });
    await t.mutation(internal.dev.spawnTroops, { playerId, role: 'armor', count: 1, ...at });
    const spawned = await t.run((ctx) =>
      ctx.db
        .query('troops')
        .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
        .collect(),
    );
    const rank = (role: string, tier: number) =>
      spawned.find((troop) => troop.role === role && troop.tier === tier);
    expect(rank('infantry', 2)).toMatchObject({ nominalStrength: 30, currentStrength: 30 });
    expect(rank('armor', 2)).toMatchObject({ nominalStrength: 6 });
    expect(rank('armor', 1)).toMatchObject({ nominalStrength: 12 });
    await expect(
      t.mutation(internal.dev.spawnTroops, {
        playerId,
        role: 'artillery',
        count: 1,
        tier: 2,
        ...at,
      }),
    ).rejects.toThrow('no tier 2');
  });
});

describe('dev.finishRecruitments', () => {
  it('brings a queued rank 2 out of its barracks now, not at the end of its training', async () => {
    vi.useFakeTimers();
    try {
      const { t, seat, playerId } = await twoNations();
      await placeHq(t, seat);
      const regionId = 'FRA-5323';
      const barracks = await t.run(async (ctx) => {
        const player = (await ctx.db.get(playerId))!;
        await ctx.db.patch(playerId, { researched: ['infantryMk2'] });
        return ctx.db.insert('buildings', {
          seasonId: player.seasonId,
          playerId,
          key: 'barracks',
          regionId,
          point: { lon: 4.1, lat: 49.0 },
          level: 1,
        });
      });
      await t.mutation(internal.dev.fillStocks, { seasonId: seat.seasonId, stock: 4000 });
      await t.mutation(api.troops.recruit, {
        ...seat,
        buildingId: barracks,
        role: 'infantry',
        tier: 2,
      });
      const standing = () =>
        t.run(async (ctx) =>
          (
            await ctx.db
              .query('troops')
              .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
              .collect()
          ).filter((troop) => troop.tier === 2),
        );
      expect(await standing()).toHaveLength(0);

      expect(await t.mutation(internal.dev.finishRecruitments, { playerId })).toBe(1);
      await vi.advanceTimersByTimeAsync(1);
      await t.finishInProgressScheduledFunctions();

      const [recruit] = await standing();
      expect(recruit).toMatchObject({ role: 'infantry', tier: 2, stationedAt: barracks });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('dev scenes read by the capture', () => {
  it('stands a review of every nation at its own capital', async () => {
    const { t, seat } = await twoNations();
    const capitals = await t.mutation(internal.dev.reviewScene, { seasonId: seat.seasonId });
    expect(Object.keys(capitals).sort()).toEqual(['france', 'uk']);
    const standing = await t.run((ctx) => ctx.db.query('troops').collect());
    for (const [nation, [lon, lat]] of Object.entries(capitals)) {
      const there = standing.filter(
        (troop) =>
          troop.stationedAt !== null &&
          typeof troop.stationedAt === 'object' &&
          'lon' in troop.stationedAt &&
          troop.stationedAt.lon === lon &&
          troop.stationedAt.lat === lat,
      );
      expect(there.map((troop) => troop.role).sort(), nation).toEqual([
        'armor',
        'infantry',
        'infantry',
      ]);
    }
  });

  it('puts a mine out of every outpost reach, which the view says', async () => {
    const { t, seat, playerId } = await twoNations();
    const at = await t.mutation(internal.dev.unreachedMineScene, { playerId });
    const view = await t.query(api.view.playerView, seat);
    expect(view.me.buildings.find((building) => building.key === 'mine')).toMatchObject({
      point: at,
      unreached: true,
    });
    expect(view.me.buildings.find((building) => building.key === 'hq')?.unreached).toBeUndefined();
  });
});

describe('dev.levelsScene', () => {
  it('keeps the cards the player already holds', async () => {
    const { t, playerId } = await twoNations();
    await t.mutation(internal.dev.grantCards, { playerId, cards: ['infantryMk2'] });

    await t.mutation(internal.dev.levelsScene, { playerId });

    const { researched } = (await t.run((ctx) => ctx.db.get(playerId)))!;
    expect(researched).toEqual(['infantryMk2', 'transmissions1', 'transmissions2']);
  });
});
