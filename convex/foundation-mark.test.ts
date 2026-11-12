import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api, internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { extractionSites } from './resources';
import schema from './schema';
import { modules } from './test.setup';
import { foundSeat, joinSeat, placeHq, seatIn, pointIn } from './seats.fixture';
import type { Seat } from './seats.fixture';

const boot = () => convexTest({ schema, modules, transactionLimits: true });
type Bench = ReturnType<typeof boot>;

const MOSELLE = 'FRA-5328'; // coal

async function launched(t: Bench) {
  const { seat, code } = await foundSeat(t, 'Pierre', 0.5);
  const guest = await joinSeat(t, code, 'Léa');
  await t.mutation(api.players.reserveNation, { ...seat, nation: 'france' });
  await t.mutation(api.players.declareReady, { ...seat, ready: true });
  await t.mutation(api.players.reserveNation, { ...guest, nation: 'ussr' });
  await t.mutation(api.players.declareReady, { ...guest, ready: true });
  await t.mutation(api.seasons.launch, seat);
  await placeHq(t, seat);
  await placeHq(t, guest);
  return seat;
}

const mines = (t: Bench) =>
  t.run(async (ctx) => (await ctx.db.query('buildings').collect()).filter((b) => b.key === 'mine'));

const placeMine = (t: Bench, seat: Seat, regionId: string) =>
  t.mutation(api.constructions.start, {
    ...seat,
    building: 'mine',
    regionId,
    point: pointIn(regionId),
  });

async function enrich(t: Bench, seat: Seat) {
  await t.run(async (ctx) => {
    const player = await seatIn(ctx, seat);
    for (const row of await ctx.db
      .query('resources')
      .withIndex('byPlayer', (q) => q.eq('playerId', player._id))
      .collect())
      await ctx.db.patch(row._id, { stock: 10_000, updatedAt: Date.now() });
    const hq = (await ctx.db
      .query('buildings')
      .withIndex('byPlayer', (q) => q.eq('playerId', player._id))
      .collect())!.find((b) => b.key === 'hq')!;
    await ctx.db.patch(hq._id, { level: 5 });
  });
}

describe('the foundation mark (ADR 0041 §3)', () => {
  it('marks a free exploitation, never the headquarters, never a paid one', async () => {
    const t = boot();
    const seat = await launched(t);
    expect(
      (await t.run((ctx) => ctx.db.query('buildings').collect())).filter(
        (b) => b.key === 'hq' && b.foundationMark,
      ),
    ).toEqual([]);

    await placeMine(t, seat, MOSELLE);
    expect(await mines(t)).toMatchObject([{ regionId: MOSELLE, foundationMark: true }]);

    // The coal debt is settled: a second coal mine is paid for, and stands unmarked.
    await enrich(t, seat);
    const paid = await placeMine(t, seat, MOSELLE).catch(() => null);
    expect((await mines(t)).filter((b) => b.foundationMark)).toHaveLength(1);
    void paid;
  });

  it('serves the mark to its owner, in me.buildings', async () => {
    const t = boot();
    const seat = await launched(t);
    await placeMine(t, seat, MOSELLE);
    const view = await t.query(api.view.playerView, seat);
    expect(view.me.buildings.find((b) => b.key === 'mine')).toMatchObject({ foundationMark: true });
    expect(view.me.buildings.find((b) => b.key === 'hq')).not.toHaveProperty('foundationMark');
  });

  it('survives a raise', async () => {
    const t = boot();
    const seat = await launched(t);
    await placeMine(t, seat, MOSELLE);
    await enrich(t, seat);
    await placeMine(t, seat, MOSELLE); // the raise to level 2
    const work = (await t.run((ctx) => ctx.db.query('constructions').collect()))[0]!;
    await t.run((ctx) => ctx.db.patch(work._id, { finishesAt: Date.now() }));
    await t.mutation(internal.constructions.finish, { constructionId: work._id });
    expect(await mines(t)).toMatchObject([{ level: 2, foundationMark: true }]);
  });

  it('is not given back by a rebuilt exploitation after a raze', async () => {
    const t = boot();
    const seat = await launched(t);
    await placeMine(t, seat, MOSELLE);
    const [first] = await mines(t);
    await t.mutation(api.buildings.demolish, { ...seat, buildingId: first!._id });
    await enrich(t, seat);
    await placeMine(t, seat, MOSELLE);
    const standing = (await mines(t)).filter((b) => b._id !== first!._id);
    expect(standing.filter((b) => b.foundationMark)).toEqual([]);
  });
});

describe('the harvest reads the mark', () => {
  const site = (mark: true | undefined) =>
    extractionSites(
      [
        {
          _id: 'b' as Id<'buildings'>,
          key: 'mine',
          regionId: MOSELLE,
          point: pointIn(MOSELLE),
          level: 3,
          foundationMark: mark,
        } as Doc<'buildings'>,
      ],
      new Map([[MOSELLE, 'p']]),
      'p',
      false,
      'mondiale',
    )[0]!;

  it('pays a marked site its level 1 nationally, the rest to the heap', () => {
    const marked = site(true);
    expect(marked.nationalPerHour).toBeGreaterThan(0);
    expect(marked.heapPerHour).toBeGreaterThan(0);
    expect(marked.nationalPerHour + marked.heapPerHour).toBeCloseTo(marked.perHour);
  });

  it('sends everything of an unmarked site to the heap', () => {
    const plain = site(undefined);
    expect(plain.nationalPerHour).toBe(0);
    expect(plain.heapPerHour).toBeCloseTo(plain.perHour);
  });
});
