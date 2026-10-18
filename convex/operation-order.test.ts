import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';
import { modules } from './test.setup';
import { joinSeat, seatDoc, signIn, type Seat } from './seats.fixture';

const boot = () => convexTest({ schema, modules, transactionLimits: true });
type Bench = ReturnType<typeof boot>;

const NOW = Date.UTC(2026, 9, 14, 16, 46);
const MINUTE = 60_000;
const RENDEZVOUS = NOW + 60 * MINUTE;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

async function blitz(t: Bench, settings: { scheduledAt?: number | null; remind?: boolean } = {}) {
  const token = await signIn(t, 'Koval');
  const { code, seasonId } = await t.mutation(api.seasons.create, {
    token,
    compensation: 0.5,
    mode: 'blitz',
    theatre: 'europe',
    scheduledAt: RENDEZVOUS,
    remind: true,
    ...settings,
  });
  return { founder: { token, seasonId } as Seat, code };
}

async function ready(t: Bench, seat: Seat, nation: string) {
  await t.mutation(api.players.reserveNation, { ...seat, nation });
  await t.mutation(api.players.declareReady, { ...seat, ready: true });
}

describe('the operation order', () => {
  it('is founded with its settings and served to the lobby', async () => {
    const t = boot();
    const { founder } = await blitz(t);
    const lobby = await t.query(api.seasons.lobby, founder);
    expect(lobby.orders).toEqual({
      scheduledAt: RENDEZVOUS,
      remind: true,
      hqCaptureHours: null,
      seatCap: null,
    });
    expect(lobby.maximum).toBe(4);
  });

  it('refuses a rendezvous in a Mondiale, and keeps the hour of HQ capture', async () => {
    const t = boot();
    const token = await signIn(t, 'Ysé');
    await expect(
      t.mutation(api.seasons.create, {
        token,
        compensation: 0.5,
        mode: 'mondiale',
        scheduledAt: RENDEZVOUS,
      }),
    ).rejects.toThrow(/SETTING_NOT_IN_MODE/);
    const { seasonId } = await t.mutation(api.seasons.create, {
      token,
      compensation: 0.5,
      mode: 'mondiale',
      hqCaptureHours: 24,
      seatCap: 5,
    });
    const lobby = await t.query(api.seasons.lobby, { token, seasonId });
    expect(lobby.orders.hqCaptureHours).toBe(24);
    expect(lobby.maximum).toBe(5);
  });

  /** **La durée est un réglage du salon** (ADR 0027 §4) : la Mondiale la tient de sa fondation
   *  et le fondateur la reprend jusqu'au lancement ; la Blitz n'en a pas d'autre que la sienne. */
  it('founds a Mondiale on the duration asked, lets the founder change it, and refuses one on a Blitz', async () => {
    const t = boot();
    const token = await signIn(t, 'Ysé');
    const { seasonId } = await t.mutation(api.seasons.create, {
      token,
      compensation: 0.5,
      mode: 'mondiale',
      durationHours: 5 * 24,
    });
    const seat = { token, seasonId };
    expect((await t.query(api.seasons.lobby, seat)).durationHours).toBe(120);

    await t.mutation(api.seasons.configure, { ...seat, durationHours: 14 * 24 });
    expect((await t.query(api.seasons.lobby, seat)).durationHours).toBe(336);
    await expect(t.mutation(api.seasons.configure, { ...seat, durationHours: 30 })).rejects.toThrow(
      /INVALID_DURATION/,
    );

    const { founder } = await blitz(t);
    await expect(
      t.mutation(api.seasons.configure, { ...founder, durationHours: 168 }),
    ).rejects.toThrow(/SETTING_NOT_IN_MODE/);
    expect((await t.query(api.seasons.lobby, founder)).durationHours).toBe(2);
  });

  it('is changed by the founder alone, before the launch, and every change lifts the readies', async () => {
    const t = boot();
    const { founder, code } = await blitz(t);
    const guest = await joinSeat(t, code, 'Bastien');
    await ready(t, founder, 'uk');
    await ready(t, guest, 'ussr');

    await expect(
      t.mutation(api.seasons.configure, { ...guest, scheduledAt: RENDEZVOUS + MINUTE }),
    ).rejects.toThrow(/CREATOR_ONLY/);
    await t.mutation(api.seasons.configure, { ...founder, theatre: 'mediterranean', seatCap: 3 });

    const lobby = await t.query(api.seasons.lobby, founder);
    expect(lobby.theatre).toBe('mediterranean');
    expect(lobby.maximum).toBe(3);
    expect(lobby.players.map((player) => player.ready)).toEqual([false, false]);

    await expect(t.mutation(api.seasons.configure, { ...founder, seatCap: 1 })).rejects.toThrow(
      /SEATS_OUT_OF_RANGE/,
    );
    await expect(
      t.mutation(api.seasons.configure, { ...founder, scheduledAt: NOW - MINUTE }),
    ).rejects.toThrow(/RENDEZVOUS_PAST/);
  });

  it('closes the door at the seats the founder set', async () => {
    const t = boot();
    const { founder, code } = await blitz(t);
    await t.mutation(api.seasons.configure, { ...founder, seatCap: 2 });
    await joinSeat(t, code, 'Bastien');
    expect((await t.query(api.seasons.invitation, { code })).refusal).toBe('BLITZ_FULL');
  });

  it('serves who is at a Blitz table, and nobody’s presence in a Mondiale', async () => {
    const t = boot();
    const { founder, code } = await blitz(t);
    await joinSeat(t, code, 'Bastien');
    vi.setSystemTime(NOW + 10 * MINUTE);
    await t.mutation(api.players.beatLobby, founder);
    const lobby = await t.query(api.seasons.lobby, founder);
    expect(lobby.players.map((player) => player.seenAt)).toEqual([NOW + 10 * MINUTE, NOW]);

    const token = await signIn(t, 'Ysé');
    const { seasonId } = await t.mutation(api.seasons.create, {
      token,
      compensation: 0.5,
      mode: 'mondiale',
    });
    await t.mutation(api.players.beatLobby, { token, seasonId });
    expect((await seatDoc(t, { token, seasonId })).lobbySeenAt).toBeUndefined();
    const mondiale = await t.query(api.seasons.lobby, { token, seasonId });
    expect(mondiale.players.map((player) => player.seenAt)).toEqual([null]);
    expect((await t.query(api.seasons.invitation, { code })).seats).toEqual([
      { nickname: 'Koval', nation: null, seenAt: NOW + 10 * MINUTE },
      { nickname: 'Bastien', nation: null, seenAt: NOW },
    ]);
  });

  it('waits for an absentee until the rendezvous, then launches with his seat kept', async () => {
    const t = boot();
    const { founder, code } = await blitz(t);
    const guest = await joinSeat(t, code, 'Bastien');
    const gone = await joinSeat(t, code, 'Lise');
    await ready(t, founder, 'uk');
    await ready(t, guest, 'ussr');
    await ready(t, gone, 'france');

    vi.setSystemTime(NOW + 30 * MINUTE);
    await t.mutation(api.players.beatLobby, guest);
    await expect(t.mutation(api.seasons.launch, founder)).rejects.toThrow(/PLAYERS_ABSENT/);

    vi.setSystemTime(RENDEZVOUS + MINUTE);
    await t.mutation(api.players.beatLobby, guest);
    await t.mutation(api.seasons.launch, founder);
    const lobby = await t.query(api.seasons.lobby, founder);
    expect(lobby.status).toBe('launched');
    expect(lobby.players.map((player) => player.nickname)).toEqual(['Koval', 'Bastien', 'Lise']);
  });

  it('gives an absentee without a nation the first free one once the hour has passed', async () => {
    const t = boot();
    const { founder, code } = await blitz(t);
    const guest = await joinSeat(t, code, 'Bastien');
    await joinSeat(t, code, 'Lise');
    await ready(t, founder, 'france');
    await ready(t, guest, 'uk');

    vi.setSystemTime(RENDEZVOUS + MINUTE);
    await t.mutation(api.players.beatLobby, guest);
    await t.mutation(api.seasons.launch, founder);
    const lobby = await t.query(api.seasons.lobby, founder);
    expect(lobby.players.map((player) => player.nation)).toEqual(['france', 'uk', 'usa']);
  });

  it('draws a theatre that seats the table at the launch', async () => {
    const t = boot();
    const token = await signIn(t, 'Koval');
    const { code, seasonId } = await t.mutation(api.seasons.create, {
      token,
      compensation: 0.5,
      mode: 'blitz',
      theatre: 'draw',
      scheduledAt: null,
    });
    const founder = { token, seasonId };
    const guest = await joinSeat(t, code, 'Bastien');
    await ready(t, founder, 'uk');
    await ready(t, guest, 'ussr');
    await t.mutation(api.seasons.launch, founder);
    expect(['europe', 'mediterranean', 'pacific', 'americas']).toContain(
      (await t.query(api.seasons.lobby, founder)).theatre,
    );

    await t.mutation(internal.blitz.abandon, { seasonId, refusal: 'BLITZ_MAP_UNFAIR' });
    expect((await t.query(api.seasons.lobby, founder)).theatre).toBe('draw');
  });

  it('reminds every seat fifteen minutes before the rendezvous, unless told not to', async () => {
    for (const remind of [true, false]) {
      const t = boot();
      const { founder } = await blitz(t, { remind });
      await t.mutation(api.notifications.subscribe, {
        token: founder.token,
        endpoint: 'https://fcm.googleapis.com/koval',
        p256dh: 'p256dh',
        auth: 'auth',
        userAgent: 'Mozilla/5.0 Chrome/126.0',
      });
      vi.advanceTimersByTime(45 * MINUTE);
      await t.finishInProgressScheduledFunctions();
      const queued = await t.run((ctx) => ctx.db.query('pushQueue').collect());
      expect(queued.map((row) => row.url)).toEqual(remind ? ['/accueil'] : []);
    }
  });

  it('reminds once even when the reminder is unticked and ticked again', async () => {
    const t = boot();
    const { founder } = await blitz(t);
    await t.mutation(api.notifications.subscribe, {
      token: founder.token,
      endpoint: 'https://fcm.googleapis.com/koval',
      p256dh: 'p256dh',
      auth: 'auth',
      userAgent: 'Mozilla/5.0 Chrome/126.0',
    });
    await t.mutation(api.seasons.configure, { ...founder, remind: false });
    await t.mutation(api.seasons.configure, { ...founder, remind: true });
    vi.advanceTimersByTime(45 * MINUTE);
    await t.finishInProgressScheduledFunctions();
    const queued = await t.run((ctx) => ctx.db.query('pushQueue').collect());
    expect(queued).toHaveLength(1);
  });
});
