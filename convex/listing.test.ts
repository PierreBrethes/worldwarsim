import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';
import { modules } from './test.setup';
import { joinSeat, signIn, type Seat } from './seats.fixture';
import { seatsOf } from './seats';
import { LISTED_MINIMUM } from '../src/domain/listing';

const boot = () => convexTest({ schema, modules, transactionLimits: true });
type Bench = ReturnType<typeof boot>;

/** Jeudi 26/11/2026, 13:50 UTC. */
const NOW = Date.UTC(2026, 10, 26, 13, 50);
const TOMORROW_TWO_PM = Date.UTC(2026, 10, 27, 14);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

async function listed(t: Bench, seatCap = 8) {
  const token = await signIn(t, 'Ysé');
  const { code, seasonId } = await t.mutation(api.seasons.create, {
    token,
    compensation: 0.5,
    mode: 'mondiale',
    seatCap,
  });
  const founder: Seat = { token, seasonId };
  await t.mutation(api.seasons.configure, { ...founder, listed: true });
  return { founder, code };
}

const seasonOf = (t: Bench, seat: Seat) => t.run((ctx) => ctx.db.get(seat.seasonId));

const pendingDepartures = (t: Bench) =>
  t.run(async (ctx) =>
    (await ctx.db.system.query('_scheduled_functions').collect()).filter(
      (job) => job.name.includes('depart') && job.state.kind === 'pending',
    ),
  );

describe('the classifieds', () => {
  it('show a listed Mondiale to a player without a lobby, with what decides to join', async () => {
    const t = boot();
    const { code } = await listed(t, 6);
    await t.mutation(api.seasons.create, {
      token: await signIn(t, 'Privé'),
      compensation: 0.5,
      mode: 'mondiale',
    });
    const stranger = await signIn(t, 'Koval');
    const ads = await t.query(api.seasons.listings, { token: stranger });
    expect(ads).toEqual([
      expect.objectContaining({
        code,
        founder: 'Ysé',
        players: 1,
        minimum: LISTED_MINIMUM,
        maximum: 6,
        departureAt: null,
      }),
    ]);
  });

  it('leave out a lobby the reader already sits at', async () => {
    const t = boot();
    const { founder } = await listed(t);
    expect(await t.query(api.seasons.listings, { token: founder.token })).toEqual([]);
  });

  it('are a Mondiale thing: a Blitz is not listed', async () => {
    const t = boot();
    const token = await signIn(t, 'Koval');
    const { seasonId } = await t.mutation(api.seasons.create, {
      token,
      compensation: 0.5,
      mode: 'blitz',
      theatre: 'europe',
      scheduledAt: NOW + 3_600_000,
    });
    await expect(
      t.mutation(api.seasons.configure, { token, seasonId, listed: true }),
    ).rejects.toThrow(/SETTING_NOT_IN_MODE/);
  });
});

describe('the departure of a listed lobby', () => {
  it('is fixed a round hour at least 24 h later when the minimum signs up, and every seat reads it', async () => {
    const t = boot();
    const { founder, code } = await listed(t);
    for (let n = 1; n < LISTED_MINIMUM - 1; n++) await joinSeat(t, code, `J${String(n)}`);
    expect((await seasonOf(t, founder))?.departureAt).toBeUndefined();
    expect(await pendingDepartures(t)).toHaveLength(0);

    vi.setSystemTime(NOW + 5 * 60_000);
    const last = await joinSeat(t, code, 'Dernier');
    expect((await seasonOf(t, founder))?.departureAt).toBe(TOMORROW_TWO_PM);
    expect((await t.query(api.seasons.lobby, last)).listing).toEqual({
      minimum: LISTED_MINIMUM,
      departureAt: TOMORROW_TWO_PM,
    });
    expect(await pendingDepartures(t)).toHaveLength(1);
  });

  it('is brought forward when the lobby fills, and the earlier job no longer launches', async () => {
    const t = boot();
    const { founder, code } = await listed(t, LISTED_MINIMUM + 1);
    for (let n = 1; n < LISTED_MINIMUM; n++) await joinSeat(t, code, `J${String(n)}`);
    vi.setSystemTime(NOW + 30 * 60_000);
    await joinSeat(t, code, 'Plein');
    /** 14:20 + 1 h = 15:20 : la première heure ronde est 16:00. */
    expect((await seasonOf(t, founder))?.departureAt).toBe(Date.UTC(2026, 10, 26, 16));
    expect(await pendingDepartures(t)).toHaveLength(1);

    await t.mutation(internal.seasons.depart, {
      seasonId: founder.seasonId,
      expectedAt: TOMORROW_TWO_PM,
    });
    expect((await seasonOf(t, founder))?.status).toBe('lobby');
  });

  it('launches the season at its hour, nations handed to those who chose none', async () => {
    const t = boot();
    const { founder, code } = await listed(t);
    for (let n = 1; n < LISTED_MINIMUM; n++) await joinSeat(t, code, `J${String(n)}`);
    await t.mutation(api.players.reserveNation, { ...founder, nation: 'france' });
    vi.setSystemTime(TOMORROW_TWO_PM);
    await t.mutation(internal.seasons.depart, {
      seasonId: founder.seasonId,
      expectedAt: TOMORROW_TWO_PM,
    });
    const season = await seasonOf(t, founder);
    expect(season?.status).toBe('launched');
    expect(season?.launchedAt).toBe(TOMORROW_TWO_PM);
    const nations = await t.run(async (ctx) =>
      (await seatsOf(ctx, founder.seasonId)).map((player) => player.nation),
    );
    expect(nations).toContain('france');
    expect(nations.every((nation) => nation !== null)).toBe(true);
    expect(new Set(nations).size).toBe(LISTED_MINIMUM);
  });

  it('is fixed at once when a lobby already at its minimum is listed', async () => {
    const t = boot();
    const token = await signIn(t, 'Ysé');
    const { code, seasonId } = await t.mutation(api.seasons.create, {
      token,
      compensation: 0.5,
      mode: 'mondiale',
    });
    for (let n = 1; n < LISTED_MINIMUM; n++) await joinSeat(t, code, `J${String(n)}`);
    await t.mutation(api.seasons.configure, { token, seasonId, listed: true });
    expect((await t.run((ctx) => ctx.db.get(seasonId)))?.departureAt).toBe(TOMORROW_TWO_PM);
  });
});

describe('the founder of a listed lobby', () => {
  it('does not launch it by hand', async () => {
    const t = boot();
    const { founder, code } = await listed(t);
    for (let n = 1; n < LISTED_MINIMUM; n++) await joinSeat(t, code, `J${String(n)}`);
    await expect(t.mutation(api.seasons.launch, founder)).rejects.toThrow(/LISTED_DEPARTS_ALONE/);
  });

  it('takes the listing back while no departure is fixed, never after', async () => {
    const t = boot();
    const { founder, code } = await listed(t);
    await t.mutation(api.seasons.configure, { ...founder, listed: false });
    expect((await seasonOf(t, founder))?.listed).toBe(false);
    await t.mutation(api.seasons.configure, { ...founder, listed: true });
    for (let n = 1; n < LISTED_MINIMUM; n++) await joinSeat(t, code, `J${String(n)}`);
    await expect(t.mutation(api.seasons.configure, { ...founder, listed: false })).rejects.toThrow(
      /DEPARTURE_FIXED/,
    );
  });

  it('brings the departure forward by lowering the seats to those already signed up', async () => {
    const t = boot();
    const { founder, code } = await listed(t);
    for (let n = 1; n < LISTED_MINIMUM; n++) await joinSeat(t, code, `J${String(n)}`);
    await t.mutation(api.seasons.configure, { ...founder, seatCap: LISTED_MINIMUM });
    expect((await seasonOf(t, founder))?.departureAt).toBe(Date.UTC(2026, 10, 26, 15));
  });
});
