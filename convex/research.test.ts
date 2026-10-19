import { convexTest } from 'convex-test';
import { describe, expect, it, vi } from 'vitest';
import { api } from './_generated/api';
import { RESEARCH_SPEC } from './constants';
import { pauseResearch, resumeResearch } from './research';
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

const research = async (t: ReturnType<typeof boot>, seat: Seat) =>
  (await t.query(api.view.playerView, seat)).me.research;

describe('a research card put on the headquarters', () => {
  it('waits for a headquarters to put it on', async () => {
    const t = boot();
    const seat = await launchedSeason(t);
    await expect(t.mutation(api.research.start, { ...seat, card: 'infantryMk2' })).rejects.toThrow(
      'RESEARCH_NEEDS_HQ',
    );
  });

  it('is paid at the pose, runs its hours, then opens what it unlocks and says so', async () => {
    vi.useFakeTimers();
    try {
      const t = boot();
      const seat = await launchedSeason(t);
      await placeHq(t, seat);
      const before = (await t.query(api.view.playerView, seat)).me.resources.steel.stock;

      await t.mutation(api.research.start, { ...seat, card: 'infantryMk2' });
      const view = await t.query(api.view.playerView, seat);
      expect(view.me.resources.steel.stock).toBeCloseTo(
        before - RESEARCH_SPEC.infantryMk2.cost.steel!,
        0,
      );
      expect(view.me.research.running).toMatchObject({ card: 'infantryMk2' });
      await expect(t.mutation(api.research.start, { ...seat, card: 'escort' })).rejects.toThrow(
        'RESEARCH_BUSY',
      );

      vi.advanceTimersByTime(RESEARCH_SPEC.infantryMk2.hours * 3_600_000);
      await t.finishAllScheduledFunctions(vi.runAllTimers);

      const after = await t.query(api.view.playerView, seat);
      expect(after.me.research).toEqual({ researched: ['infantryMk2'], running: null });
      expect(after.notices.some((notice) => notice.kind === 'researchDone')).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('waits while its headquarters is down, and keeps what it has run', async () => {
    vi.useFakeTimers();
    try {
      const t = boot();
      const seat = await launchedSeason(t);
      await placeHq(t, seat);
      await t.mutation(api.research.start, { ...seat, card: 'infantryMk2' });
      const hour = 3_600_000;
      vi.advanceTimersByTime(2 * hour);
      const playerId = await t.run(async (ctx) => (await seatIn(ctx, seat))._id);
      await t.run((ctx) => pauseResearch(ctx, playerId, Date.now()));

      vi.advanceTimersByTime(RESEARCH_SPEC.infantryMk2.hours * hour);
      await t.finishInProgressScheduledFunctions();
      const waiting = await research(t, seat);
      expect(waiting.researched).toEqual([]);
      expect(waiting.running).toMatchObject({ card: 'infantryMk2', since: null });
      expect(waiting.running?.remainingMs).toBe((RESEARCH_SPEC.infantryMk2.hours - 2) * hour);

      await t.run((ctx) => resumeResearch(ctx, playerId, Date.now()));
      vi.advanceTimersByTime((RESEARCH_SPEC.infantryMk2.hours - 2) * hour);
      await t.finishInProgressScheduledFunctions();
      expect((await research(t, seat)).researched).toEqual(['infantryMk2']);
    } finally {
      vi.useRealTimers();
    }
  });
});
