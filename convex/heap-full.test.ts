import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { dropHeap, passHeap, stampHeap, takeHeap } from './heaps';
import { economyOf } from './resources';
import schema from './schema';
import { modules } from './test.setup';
import {
  foundSeat,
  joinSeat,
  placeHq,
  pointIn,
  seatIn,
  unclocked,
  type Seat,
} from './seats.fixture';

/**
 * **Une dépêche quand le tas d'une exploitation est plein** (#555). Le tas se lit paresseusement :
 * l'instant du plein n'est un événement nulle part, donc un job planifié le fait naître, relit
 * tout à son échéance, et ne dit rien d'un tas pris, rasé, capturé ou déjà annoncé.
 */
const boot = () => convexTest({ schema, modules, transactionLimits: true });
type Bench = ReturnType<typeof boot>;

const HOUR = 3_600_000;
const MIDDAY = Date.UTC(2026, 8, 9, 12);
const MOSELLE = 'FRA-5328'; // coal: a level 1 mine heaps 12 an hour up to 288, a day's worth
const NORD = 'FRA-5334';
const NO_REST = { startMinutes: 0, endMinutes: 0 };

async function launched(t: Bench) {
  const { seat, code } = await foundSeat(t, 'Pierre', 0.5);
  const guest = await joinSeat(t, code, 'Léa');
  await t.mutation(api.players.reserveNation, { ...seat, nation: 'france' });
  await t.mutation(api.players.declareReady, { ...seat, ready: true });
  await t.mutation(api.players.reserveNation, { ...guest, nation: 'ussr' });
  await t.mutation(api.players.declareReady, { ...guest, ready: true });
  await t.mutation(api.seasons.launch, seat);
  await unclocked(t);
  await placeHq(t, seat);
  await placeHq(t, guest);
  for (const one of [seat, guest]) {
    const player = await playerOf(t, one);
    await t.run((ctx) => ctx.db.patch(player._id, { restWindow: NO_REST }));
  }
  return { seat, guest };
}

const playerOf = (t: Bench, seat: Seat) => t.run((ctx) => seatIn(ctx, seat));

/** An exploitation born now: a heap empty since this instant, no row. `foundation` carries the
 *  mark whose level 1 pays the national stock directly and heaps nothing. */
async function exploitation(t: Bench, seat: Seat, regionId = MOSELLE, foundation = false) {
  const player = await playerOf(t, seat);
  return t.run((ctx) =>
    ctx.db.insert('buildings', {
      seasonId: player.seasonId,
      playerId: player._id,
      key: 'mine',
      regionId,
      point: pointIn(regionId),
      level: 1,
      outpostId: null,
      ...(foundation ? { foundationMark: true as const } : {}),
    }),
  );
}

/** What the building's birth schedules: the constructions call this once the row is written. */
const born = (t: Bench, id: Id<'buildings'>) =>
  t.mutation(internal.heapFull.check, { buildingId: id });

const settleAll = (t: Bench) => t.finishAllScheduledFunctions(vi.runAllTimers);

const noticesOf = (t: Bench, seat: Seat) =>
  t.run(async (ctx) => {
    const player = await seatIn(ctx, seat);
    return (
      await ctx.db
        .query('notices')
        .withIndex('byPlayer', (q) => q.eq('playerId', player._id))
        .collect()
    ).filter((notice) => notice.kind === 'heapFull');
  });

const readingOf = (t: Bench, seat: Seat, id: Id<'buildings'>) =>
  t.run(async (ctx) => {
    const player = await seatIn(ctx, seat);
    return (await economyOf(ctx, player._id, Date.now())).heaps[id]!;
  });

const take = (t: Bench, seat: Seat, id: Id<'buildings'>, amount: number) =>
  t.run(async (ctx) => {
    const player = await seatIn(ctx, seat);
    const reading = (await economyOf(ctx, player._id, Date.now())).heaps[id]!;
    await takeHeap(ctx, (await ctx.db.get(id))!, reading, amount, Date.now());
  });

describe('the heap-full dispatch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  it('falls at the hour the heap filled, to its owner alone', async () => {
    const t = boot();
    const { seat, guest } = await launched(t);
    const mine = await exploitation(t, seat);
    await born(t, mine);
    await settleAll(t);
    expect(await noticesOf(t, seat)).toMatchObject([
      {
        at: MIDDAY + 24 * HOUR,
        building: 'mine',
        regionId: MOSELLE,
        resource: 'coal',
        amount: 288,
        point: pointIn(MOSELLE),
      },
    ]);
    expect(await noticesOf(t, guest)).toEqual([]);
  });

  it('says nothing of a heap taken before it filled, and schedules the next fill', async () => {
    const t = boot();
    const { seat } = await launched(t);
    const mine = await exploitation(t, seat);
    await born(t, mine);
    vi.setSystemTime(MIDDAY + 12 * HOUR);
    await take(t, seat, mine, 100);
    await settleAll(t);
    // 144 − 100 = 44 at noon + 12 h, 244 more at 12 an hour: full 20 h 20 min later.
    expect(await noticesOf(t, seat)).toMatchObject([
      { at: MIDDAY + 12 * HOUR + (244 / 12) * HOUR, amount: 288 },
    ]);
  });

  it('says nothing to the old owner of an exploitation razed before its heap filled', async () => {
    const t = boot();
    const { seat } = await launched(t);
    const mine = await exploitation(t, seat);
    await born(t, mine);
    vi.setSystemTime(MIDDAY + 12 * HOUR);
    await t.run(async (ctx) => {
      await ctx.db.delete(mine);
      await dropHeap(ctx, mine);
    });
    await settleAll(t);
    expect(await noticesOf(t, seat)).toEqual([]);
  });

  it('says nothing to the old owner of an exploitation captured before its heap filled', async () => {
    const t = boot();
    const { seat, guest } = await launched(t);
    const mine = await exploitation(t, seat);
    await born(t, mine);
    vi.setSystemTime(MIDDAY + 12 * HOUR);
    await t.run(async (ctx) => {
      const taker = await seatIn(ctx, guest);
      const owner = await seatIn(ctx, seat);
      const building = (await ctx.db.get(mine))!;
      const heaps = (await economyOf(ctx, owner._id, Date.now())).heaps;
      await ctx.db.patch(mine, { playerId: taker._id, capturedAt: Date.now() });
      await passHeap(ctx, building, heaps, taker._id, Date.now());
    });
    await settleAll(t);
    expect(await noticesOf(t, seat)).toEqual([]);
  });

  it('does not tell a heap that stays full again', async () => {
    const t = boot();
    const { seat } = await launched(t);
    const mine = await exploitation(t, seat);
    await born(t, mine);
    await settleAll(t);
    expect(await noticesOf(t, seat)).toHaveLength(1);
    // A colour change rewrites the row of a full heap, and its job runs once more.
    const owner = await playerOf(t, seat);
    await t.run(async (ctx) => {
      await stampHeap(ctx, (await ctx.db.get(mine))!, owner._id, 288, Date.now());
    });
    await settleAll(t);
    await born(t, mine);
    await settleAll(t);
    expect(await noticesOf(t, seat)).toHaveLength(1);
  });

  it('tells a heap that fills a second time, once it was taken', async () => {
    const t = boot();
    const { seat } = await launched(t);
    const mine = await exploitation(t, seat);
    await born(t, mine);
    await settleAll(t);
    await take(t, seat, mine, 100);
    await settleAll(t);
    expect(await noticesOf(t, seat)).toHaveLength(2);
  });

  it('writes nothing in Blitz', async () => {
    const t = boot();
    const { seat } = await launched(t);
    const mine = await exploitation(t, seat);
    const player = await playerOf(t, seat);
    await t.run((ctx) => ctx.db.patch(player.seasonId, { mode: 'blitz', theatre: 'europe' }));
    await born(t, mine);
    await settleAll(t);
    expect(await noticesOf(t, seat)).toEqual([]);
  });

  it('plans no job for a heap that never fills: a foundation mine at level 1', async () => {
    const t = boot();
    const { seat } = await launched(t);
    const mine = await exploitation(t, seat, MOSELLE, true);
    await born(t, mine);
    const jobs = await t.run((ctx) => ctx.db.system.query('_scheduled_functions').collect());
    expect(jobs.filter((job) => job.name.includes('heapFull'))).toEqual([]);
    await settleAll(t);
    expect(await noticesOf(t, seat)).toEqual([]);
  });

  it('writes the dispatch of a heap that filled while the ground was out of its owner’s sight', async () => {
    const t = boot();
    const { seat } = await launched(t);
    const mine = await exploitation(t, seat);
    vi.setSystemTime(MIDDAY + 30 * HOUR);
    expect((await readingOf(t, seat, mine)).fullSince).toBeCloseTo(MIDDAY + 24 * HOUR, 0);
    await born(t, mine);
    expect(await noticesOf(t, seat)).toMatchObject([{ at: MIDDAY + 24 * HOUR }]);
  });
});

describe('the commissioning of the heap-full dispatch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  it('gives no dispatch to a heap already full, and one to a heap that fills later, once', async () => {
    const t = boot();
    const { seat } = await launched(t);
    const old = await exploitation(t, seat, MOSELLE);
    vi.setSystemTime(MIDDAY + 20 * HOUR);
    const young = await exploitation(t, seat, NORD);
    vi.setSystemTime(MIDDAY + 30 * HOUR); // the old one filled 6 h ago, the young one has 10 h to go
    const sweep = async () => {
      const players = await t.run((ctx) => ctx.db.query('players').collect());
      for (const player of players.filter((one) => one.enteredWarAt != null))
        await t.mutation(internal.heapFull.commission, { playerId: player._id });
    };
    await sweep();
    expect(await noticesOf(t, seat)).toEqual([]);
    await sweep();
    await settleAll(t);
    const told = await noticesOf(t, seat);
    expect(told).toHaveLength(1);
    expect(told[0]).toMatchObject({ regionId: NORD, at: MIDDAY + 20 * HOUR + 24 * HOUR });
    expect((await readingOf(t, seat, old)).fullSince).toBeCloseTo(MIDDAY + 24 * HOUR, 0);
    expect(young).toBeDefined();
  });

  it('hands each belligerent to its own mutation, scheduled', async () => {
    const t = boot();
    await launched(t);
    await t.mutation(internal.dev.commissionHeapFull, {});
    const jobs = await t.run((ctx) => ctx.db.system.query('_scheduled_functions').collect());
    expect(jobs.filter((job) => job.name.includes('heapFull:commission'))).toHaveLength(2);
  });
});
