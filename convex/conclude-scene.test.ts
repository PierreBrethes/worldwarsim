import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, internal } from './_generated/api';
import { verdictTimingOf } from '../src/domain/final-edition-read';
import schema from './schema';
import { modules } from './test.setup';
import { foundSeat, joinSeat, type Seat } from './seats.fixture';

/**
 * **La scène de démo qui conclut une Mondiale** (#455, `dev:concludeScene`) : elle passe par la
 * porte du jeu, et la chaîne de clôture en tire une archive riche — ou n'en tire rien quand la
 * scène la retient, pour capturer l'attente.
 */
const boot = () => convexTest({ schema, modules, transactionLimits: true });

async function launchedSeason(t: ReturnType<typeof boot>) {
  const { seat, code } = await foundSeat(t, 'Pierre');
  const seats: Array<[Seat, string]> = [
    [seat, 'france'],
    [await joinSeat(t, code, 'Léa'), 'ussr'],
    [await joinSeat(t, code, 'Marc'), 'germany'],
  ];
  for (const [who, nation] of seats) {
    await t.mutation(api.players.reserveNation, { ...who, nation });
    await t.mutation(api.players.declareReady, { ...who, ready: true });
  }
  await t.mutation(api.seasons.launch, seat);
  return seat;
}

async function closeTheSeason(t: ReturnType<typeof boot>) {
  for (let link = 0; link < 40; link++) {
    await vi.advanceTimersByTimeAsync(1);
    await t.finishInProgressScheduledFunctions();
  }
}

describe('the demo scene that concludes a Mondiale', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 17, 12, 0, 0));
  });
  afterEach(() => vi.useRealTimers());

  it('concludes on the points three hours ahead, and the chain prints a full archive', async () => {
    const t = boot();
    const seat = await launchedSeason(t);
    await t.mutation(internal.dev.concludeScene, { seasonId: seat.seasonId, reason: 'points' });
    await closeTheSeason(t);

    const read = await t.query(api.finalEdition.ofSeason, seat);
    if (read.state !== 'ready') throw new Error(`no final edition: ${read.state}`);
    const { edition } = read;
    expect(edition.verdict).toMatchObject({ reason: 'points', winnerNation: 'france' });
    expect(verdictTimingOf({ ...edition, reason: edition.verdict.reason })).toEqual({
      kind: 'ahead',
      hours: 3,
    });
    const page = Object.fromEntries(edition.nations.map((one) => [one.nation, one]));
    expect(page.germany!.exit).toMatchObject({ kind: 'eliminated' });
    expect(page.france!.series.length).toBeGreaterThan(5);
    expect(page.france!.figures.destroyed + page.ussr!.figures.destroyed).toBeGreaterThan(0);
    expect(edition.points.filter((point) => point.hands.at(-1)?.nation === 'france')).toHaveLength(
      4,
    );
    expect(edition.points.some((point) => point.hands.some((hand) => hand.nation === null))).toBe(
      true,
    );
    expect(edition.moments.map((moment) => moment.kind)).toContain('contact');
  });

  it('holds the chain back when asked, so the edition reads pending', async () => {
    const t = boot();
    const seat = await launchedSeason(t);
    await t.mutation(internal.dev.concludeScene, {
      seasonId: seat.seasonId,
      reason: 'closed',
      hold: true,
    });
    await closeTheSeason(t);
    expect(await t.query(api.finalEdition.ofSeason, seat)).toEqual({ state: 'pending' });
  });
});
