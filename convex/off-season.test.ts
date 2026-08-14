import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './_generated/api';
import schema from './schema';
import { modules } from './test.setup';

const boot = () => convexTest(schema, modules);

async function seasonWithTwoPlayers(t: ReturnType<typeof boot>) {
  const { code, token } = await t.mutation(api.seasons.create, {
    nickname: 'Pierre',
    durationHours: 48,
    compensation: 0.5,
  });
  const { token: guestToken } = await t.mutation(api.seasons.join, { code, nickname: 'Léa' });
  return { code, creator: token, guest: guestToken };
}

async function readyToLaunch(t: ReturnType<typeof boot>) {
  const { code, creator, guest } = await seasonWithTwoPlayers(t);
  await t.mutation(api.players.reserveNation, { token: creator, nation: 'france' });
  await t.mutation(api.players.chooseDoctrine, { token: creator, doctrine: 'hegemony' });
  await t.mutation(api.players.declareReady, { token: creator, ready: true });
  await t.mutation(api.players.reserveNation, { token: guest, nation: 'ussr' });
  await t.mutation(api.players.chooseDoctrine, { token: guest, doctrine: 'domination' });
  await t.mutation(api.players.declareReady, { token: guest, ready: true });
  return { code, creator, guest };
}

describe('creating and joining', () => {
  it('creates a season and hands out an unambiguous 6-character code', async () => {
    const t = boot();
    const { code, token } = await t.mutation(api.seasons.create, {
      nickname: 'Pierre',
      durationHours: 168,
      compensation: 0,
    });
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    const lobby = await t.query(api.seasons.lobby, { token });
    expect(lobby.me.creator).toBe(true);
    expect(lobby.players).toHaveLength(1);
  });

  it('rejects an unknown code and a launched season', async () => {
    const t = boot();
    await expect(t.mutation(api.seasons.join, { code: 'ZZZZZZ', nickname: 'X' })).rejects.toThrow(
      'UNKNOWN_GAME_CODE',
    );
    const { code, creator } = await readyToLaunch(t);
    await t.mutation(api.seasons.launch, { token: creator });
    await expect(t.mutation(api.seasons.join, { code, nickname: 'Tard' })).rejects.toThrow(
      'SEASON_ALREADY_LAUNCHED',
    );
  });

  it('widens the playable region with the player count', async () => {
    const t = boot();
    const { code, creator } = await seasonWithTwoPlayers(t);
    expect((await t.query(api.seasons.lobby, { token: creator })).playableRegion).toBe('europe');
    await t.mutation(api.seasons.join, { code, nickname: 'Marc' });
    await t.mutation(api.seasons.join, { code, nickname: 'Jo' });
    expect((await t.query(api.seasons.lobby, { token: creator })).playableRegion).toBe(
      'europe-med',
    );
  });
});

describe('nation reservation', () => {
  it('is first come first served, and releases', async () => {
    const t = boot();
    const { creator, guest } = await seasonWithTwoPlayers(t);
    await t.mutation(api.players.reserveNation, { token: creator, nation: 'france' });
    await expect(
      t.mutation(api.players.reserveNation, { token: guest, nation: 'france' }),
    ).rejects.toThrow('NATION_TAKEN');
    await t.mutation(api.players.reserveNation, { token: creator, nation: null });
    await t.mutation(api.players.reserveNation, { token: guest, nation: 'france' });
  });

  it('never reveals the others’ doctrine in the lobby', async () => {
    const t = boot();
    const { creator, guest } = await seasonWithTwoPlayers(t);
    await t.mutation(api.players.chooseDoctrine, { token: guest, doctrine: 'influence' });
    const lobby = await t.query(api.seasons.lobby, { token: creator });
    for (const player of lobby.players) {
      expect(player).not.toHaveProperty('doctrine');
    }
    expect(lobby.me.doctrine).toBeNull();
  });

  it('requires nation and doctrine to be ready', async () => {
    const t = boot();
    const { creator } = await seasonWithTwoPlayers(t);
    await expect(t.mutation(api.players.declareReady, { token: creator, ready: true })).rejects.toThrow(
      'NATION_AND_DOCTRINE_REQUIRED',
    );
  });
});

describe('launching', () => {
  it('belongs to the creator and requires everyone ready', async () => {
    const t = boot();
    const { creator, guest } = await seasonWithTwoPlayers(t);
    await expect(t.mutation(api.seasons.launch, { token: guest })).rejects.toThrow('CREATOR_ONLY');
    await expect(t.mutation(api.seasons.launch, { token: creator })).rejects.toThrow('PLAYERS_NOT_READY');
  });

  it('initializes resources and buildings, and freezes the region', async () => {
    const t = boot();
    const { creator } = await readyToLaunch(t);
    await t.mutation(api.seasons.launch, { token: creator });
    const view = await t.query(api.view.playerView, { token: creator });
    expect(view.me.nation).toBe('france');
    expect(view.me.supply.stock).toBe(500);
    expect(view.me.buildings).toHaveLength(5);
    expect(view.me.slots).toEqual({ total: 2, used: 0 });
    expect(view.season.playableRegion).toBe('europe');
    expect(view.opponents).toHaveLength(1);
    expect(view.opponents[0]).not.toHaveProperty('doctrine');
  });
});

describe('lazy accrual', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('credits resources over time with no tick', async () => {
    const t = boot();
    const { creator } = await readyToLaunch(t);
    await t.mutation(api.seasons.launch, { token: creator });
    vi.advanceTimersByTime(2 * 3_600_000);
    const view = await t.query(api.view.playerView, { token: creator });
    expect(view.me.supply.stock).toBe(500 + 240);
  });

  it('caps manpower', async () => {
    const t = boot();
    const { creator } = await readyToLaunch(t);
    await t.mutation(api.seasons.launch, { token: creator });
    vi.advanceTimersByTime(100 * 3_600_000);
    const view = await t.query(api.view.playerView, { token: creator });
    expect(view.me.manpower.stock).toBe(120);
  });
});

describe('constructions', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('debits supply, raises the level in time, one at a time', async () => {
    const t = boot();
    const { creator } = await readyToLaunch(t);
    await t.mutation(api.seasons.launch, { token: creator });
    vi.advanceTimersByTime(3_600_000);

    await t.mutation(api.constructions.start, { token: creator, building: 'hq' });
    await expect(
      t.mutation(api.constructions.start, { token: creator, building: 'logistics' }),
    ).rejects.toThrow('CONSTRUCTION_IN_PROGRESS');

    const before = await t.query(api.view.playerView, { token: creator });
    expect(before.me.construction?.name).toBe('hq');

    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const after = await t.query(api.view.playerView, { token: creator });
    expect(after.me.construction).toBeNull();
    expect(after.me.buildings.find((building) => building.key === 'hq')?.level).toBe(2);
  });

  it('refuses to exceed the HQ level', async () => {
    const t = boot();
    const { creator } = await readyToLaunch(t);
    await t.mutation(api.seasons.launch, { token: creator });
    vi.advanceTimersByTime(10 * 3_600_000);
    await expect(
      t.mutation(api.constructions.start, { token: creator, building: 'logistics' }),
    ).rejects.toThrow('CAPPED_BY_HQ');
  });
});

describe('rest window', () => {
  it('can be set any time, lobby or launched season', async () => {
    const t = boot();
    const { creator } = await readyToLaunch(t);
    await t.mutation(api.players.setRestWindow, { token: creator, startMinutes: 22 * 60, endMinutes: 6 * 60 });
    await t.mutation(api.seasons.launch, { token: creator });
    await t.mutation(api.players.setRestWindow, { token: creator, startMinutes: 0, endMinutes: 8 * 60 });
    const view = await t.query(api.view.playerView, { token: creator });
    expect(view.me.restWindow).toEqual({ startMinutes: 0, endMinutes: 8 * 60 });
    await expect(
      t.mutation(api.players.setRestWindow, { token: creator, startMinutes: -1, endMinutes: 0 }),
    ).rejects.toThrow('INVALID_REST_WINDOW');
  });
});
