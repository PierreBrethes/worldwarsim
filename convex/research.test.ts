import { convexTest } from 'convex-test';
import { describe, expect, it, vi } from 'vitest';
import { api, internal } from './_generated/api';
import { RESEARCH_SPEC } from './constants';
import { levelSpeed } from '../src/domain/level-speed';
import { capitalRegionOf, pointOfRegion } from './regions';
import schema from './schema';
import { modules } from './test.setup';
import { foundSeat, joinSeat, placeHq, seatIn } from './seats.fixture';
import type { Seat } from './seats.fixture';

const boot = () => convexTest({ schema, modules, transactionLimits: true });

async function launchedSeason(t: ReturnType<typeof boot>): Promise<Seat> {
  const { seat, code } = await foundSeat(t, 'Pierre', 0.5);
  const guest = await joinSeat(t, code, 'Léa');
  await t.mutation(api.players.reserveNation, { ...seat, nation: 'france' });
  await t.mutation(api.players.declareReady, { ...seat, ready: true });
  await t.mutation(api.players.reserveNation, { ...guest, nation: 'ussr' });
  await t.mutation(api.players.declareReady, { ...guest, ready: true });
  await t.mutation(api.seasons.launch, seat);
  return seat;
}

/** **Un Centre de recherche debout**, posé d'un coup près de la capitale : la règle se lit sur
 *  lui, pas sur son chantier. */
async function placeCenter(t: ReturnType<typeof boot>, seat: Seat, level = 1) {
  return t.run(async (ctx) => {
    const player = await seatIn(ctx, seat);
    const regionId = capitalRegionOf('france');
    const { lon, lat } = pointOfRegion(regionId);
    return ctx.db.insert('buildings', {
      seasonId: player.seasonId,
      playerId: player._id,
      key: 'researchCenter',
      regionId,
      point: { lon: lon + 0.6, lat },
      level,
      outpostId: null,
    });
  });
}

const research = async (t: ReturnType<typeof boot>, seat: Seat) =>
  (await t.query(api.view.playerView, seat)).me.research;

describe('a research card put on the research centre', () => {
  it('waits for a research centre, the headquarters never researches', async () => {
    const t = boot();
    const seat = await launchedSeason(t);
    await placeHq(t, seat);
    await expect(t.mutation(api.research.start, { ...seat, card: 'infantryMk2' })).rejects.toThrow(
      'RESEARCH_NEEDS_CENTER',
    );
  });

  it('runs faster at a higher centre', async () => {
    vi.useFakeTimers();
    try {
      const t = boot();
      const seat = await launchedSeason(t);
      await placeHq(t, seat);
      await placeCenter(t, seat, 2);
      const { finishesAt } = await t.mutation(api.research.start, {
        ...seat,
        card: 'infantryMk2',
      });
      expect(finishesAt! - Date.now()).toBe(
        RESEARCH_SPEC.infantryMk2.hours * 3_600_000 * levelSpeed(2),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('is paid at the pose, runs its hours, then opens what it unlocks and says so', async () => {
    vi.useFakeTimers();
    try {
      const t = boot();
      const seat = await launchedSeason(t);
      await placeHq(t, seat);
      await placeCenter(t, seat);
      const before = (await t.query(api.view.playerView, seat)).me.resources.steel.stock;

      await t.mutation(api.research.start, { ...seat, card: 'infantryMk2' });
      const view = await t.query(api.view.playerView, seat);
      expect(view.me.resources.steel.stock).toBeCloseTo(
        before - RESEARCH_SPEC.infantryMk2.cost.steel!,
        0,
      );
      expect(view.me.research.running).toMatchObject({ card: 'infantryMk2' });

      vi.advanceTimersByTime(RESEARCH_SPEC.infantryMk2.hours * 3_600_000);
      await t.finishAllScheduledFunctions(vi.runAllTimers);

      const after = await t.query(api.view.playerView, seat);
      expect(after.me.research).toEqual({ researched: ['infantryMk2'], running: null, queue: [] });
      expect(after.notices.some((notice) => notice.kind === 'researchDone')).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('waits while its centre is razed, keeps what it has run, and runs on at a new one', async () => {
    vi.useFakeTimers();
    try {
      const t = boot();
      const seat = await launchedSeason(t);
      await placeHq(t, seat);
      const centerId = await placeCenter(t, seat);
      await t.mutation(api.research.start, { ...seat, card: 'infantryMk2' });
      const hour = 3_600_000;
      vi.advanceTimersByTime(2 * hour);
      await t.mutation(api.buildings.demolish, { ...seat, buildingId: centerId });

      vi.advanceTimersByTime(RESEARCH_SPEC.infantryMk2.hours * hour);
      await t.finishInProgressScheduledFunctions();
      const waiting = await research(t, seat);
      expect(waiting.researched).toEqual([]);
      expect(waiting.running).toMatchObject({ card: 'infantryMk2', since: null });
      expect(waiting.running?.remainingMs).toBe((RESEARCH_SPEC.infantryMk2.hours - 2) * hour);

      const playerId = await t.run(async (ctx) => (await seatIn(ctx, seat))._id);
      const constructionId = await t.run((ctx) =>
        ctx.db.insert('constructions', {
          playerId,
          building: 'researchCenter',
          regionId: capitalRegionOf('france'),
          point: { ...pointOfRegion(capitalRegionOf('france')), lat: 48.2 },
          level: 1,
          rank: 0,
          finishesAt: Date.now(),
        }),
      );
      await t.mutation(internal.constructions.finish, { constructionId });
      vi.advanceTimersByTime((RESEARCH_SPEC.infantryMk2.hours - 2) * hour);
      await t.finishInProgressScheduledFunctions();
      expect((await research(t, seat)).researched).toEqual(['infantryMk2']);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('the research queue (#165)', () => {
  const hour = 3_600_000;
  const steelOf = async (t: ReturnType<typeof boot>, seat: Seat) =>
    (await t.query(api.view.playerView, seat)).me.resources.steel.stock;

  it('runs the first card, parks the next two, refuses a fourth and a duplicate', async () => {
    vi.useFakeTimers();
    try {
      const t = boot();
      const seat = await launchedSeason(t);
      await placeHq(t, seat);
      await placeCenter(t, seat);
      await t.mutation(api.research.start, { ...seat, card: 'infantryMk2' });
      await t.mutation(api.research.start, { ...seat, card: 'escort' });
      await t.mutation(api.research.start, { ...seat, card: 'armor' });
      expect(await research(t, seat)).toMatchObject({
        running: { card: 'infantryMk2' },
        queue: ['escort', 'armor'],
      });
      await expect(t.mutation(api.research.start, { ...seat, card: 'artillery' })).rejects.toThrow(
        'RESEARCH_FULL',
      );
      await expect(t.mutation(api.research.start, { ...seat, card: 'escort' })).rejects.toThrow(
        'RESEARCH_QUEUED',
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('starts the next card when one ends, its length set by the centre of that moment', async () => {
    vi.useFakeTimers();
    try {
      const t = boot();
      const seat = await launchedSeason(t);
      await placeHq(t, seat);
      const centerId = await placeCenter(t, seat);
      await t.mutation(api.research.start, { ...seat, card: 'infantryMk2' });
      await t.mutation(api.research.start, { ...seat, card: 'escort' });
      await t.run((ctx) => ctx.db.patch(centerId, { level: 2 }));

      vi.advanceTimersByTime(RESEARCH_SPEC.infantryMk2.hours * hour);
      await t.finishInProgressScheduledFunctions();
      const view = await research(t, seat);
      expect(view.researched).toEqual(['infantryMk2']);
      expect(view.queue).toEqual([]);
      expect(view.running).toMatchObject({
        card: 'escort',
        totalMs: RESEARCH_SPEC.escort.hours * hour * levelSpeed(2),
        since: Date.now(),
      });

      vi.advanceTimersByTime(RESEARCH_SPEC.escort.hours * hour * levelSpeed(2));
      await t.finishInProgressScheduledFunctions();
      expect((await research(t, seat)).researched).toEqual(['infantryMk2', 'escort']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('refunds a waiting card whole, closes the file up, and keeps the running card', async () => {
    vi.useFakeTimers();
    try {
      const t = boot();
      const seat = await launchedSeason(t);
      await placeHq(t, seat);
      await placeCenter(t, seat);
      await t.mutation(api.research.start, { ...seat, card: 'infantryMk2' });
      const beforeQueue = await steelOf(t, seat);
      await t.mutation(api.research.start, { ...seat, card: 'escort' });
      await t.mutation(api.research.start, { ...seat, card: 'artillery' });

      await t.mutation(api.research.dequeue, { ...seat, card: 'escort' });
      expect((await research(t, seat)).queue).toEqual(['artillery']);
      await t.mutation(api.research.dequeue, { ...seat, card: 'artillery' });
      expect(await steelOf(t, seat)).toBeCloseTo(beforeQueue, 0);
      await expect(
        t.mutation(api.research.dequeue, { ...seat, card: 'infantryMk2' }),
      ).rejects.toThrow('RESEARCH_RUNNING');
      await expect(t.mutation(api.research.dequeue, { ...seat, card: 'escort' })).rejects.toThrow(
        'RESEARCH_NOT_QUEUED',
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('pauses the whole file with the centre, loses nothing, and picks up where it left off', async () => {
    vi.useFakeTimers();
    try {
      const t = boot();
      const seat = await launchedSeason(t);
      await placeHq(t, seat);
      const centerId = await placeCenter(t, seat);
      await t.mutation(api.research.start, { ...seat, card: 'infantryMk2' });
      await t.mutation(api.research.start, { ...seat, card: 'escort' });
      vi.advanceTimersByTime(2 * hour);
      await t.mutation(api.buildings.demolish, { ...seat, buildingId: centerId });

      vi.advanceTimersByTime(RESEARCH_SPEC.infantryMk2.hours * hour);
      await t.finishInProgressScheduledFunctions();
      const paused = await research(t, seat);
      expect(paused.running).toMatchObject({ card: 'infantryMk2', since: null });
      expect(paused.queue).toEqual(['escort']);

      const playerId = await t.run(async (ctx) => (await seatIn(ctx, seat))._id);
      const constructionId = await t.run((ctx) =>
        ctx.db.insert('constructions', {
          playerId,
          building: 'researchCenter',
          regionId: capitalRegionOf('france'),
          point: { ...pointOfRegion(capitalRegionOf('france')), lat: 48.2 },
          level: 1,
          rank: 0,
          finishesAt: Date.now(),
        }),
      );
      await t.mutation(internal.constructions.finish, { constructionId });
      vi.advanceTimersByTime((RESEARCH_SPEC.infantryMk2.hours - 2) * hour);
      await t.finishInProgressScheduledFunctions();
      const resumed = await research(t, seat);
      expect(resumed.researched).toEqual(['infantryMk2']);
      expect(resumed.running).toMatchObject({ card: 'escort' });
    } finally {
      vi.useRealTimers();
    }
  });
});
