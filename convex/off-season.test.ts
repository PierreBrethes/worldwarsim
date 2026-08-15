import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './_generated/api';
import { STARTING_STOCK, buildCost } from './constants';
import schema from './schema';
import { modules } from './test.setup';

const boot = () => convexTest(schema, modules);

/** Moselle: French, inland, and a coal deposit — enough to build anything the tests raise. */
const MOSELLE = 'FRA-5328';
/** Paris: where the headquarters of France stands from the first minute (ADR 0015). */
const PARIS = 'FRA-5333';

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

  it('hands out the starting kit, plants the headquarters, and freezes the region', async () => {
    const t = boot();
    const { creator } = await readyToLaunch(t);
    await t.mutation(api.seasons.launch, { token: creator });
    const view = await t.query(api.view.playerView, { token: creator });
    expect(view.me.nation).toBe('france');
    expect(view.me.resources.alloy.stock).toBe(STARTING_STOCK.alloy);
    // One building and one only: the headquarters on the capital (ADR 0015).
    expect(view.me.buildings).toEqual([
      expect.objectContaining({ key: 'hq', regionId: PARIS, level: 1 }),
    ]);
    expect(view.me.slots).toEqual({ total: 2, used: 0 });
    // The home regions that carry a deposit, and only those.
    expect(view.me.regions.some((region) => region.id === MOSELLE)).toBe(true);
    expect(view.season.playableRegion).toBe('europe');
    expect(view.opponents).toHaveLength(1);
    expect(view.opponents[0]).not.toHaveProperty('doctrine');
  });
});

describe('lazy accrual', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /** Nothing is extracted without an exploitation building: the rate comes from the map, not
   *  from a stored number, and an empty map produces nothing. What a farm changes is in
   *  `economy.test.ts`. */
  it('leaves the stocks alone as long as nothing is built', async () => {
    const t = boot();
    const { creator } = await readyToLaunch(t);
    await t.mutation(api.seasons.launch, { token: creator });
    vi.advanceTimersByTime(2 * 3_600_000);
    const view = await t.query(api.view.playerView, { token: creator });
    expect(view.me.resources.food.stock).toBe(STARTING_STOCK.food);
    expect(view.me.resources.food.ratePerHour).toBe(0);
  });
});

describe('constructions', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('debits the materials, raises the building in time, one construction at a time', async () => {
    const t = boot();
    const { creator } = await readyToLaunch(t);
    await t.mutation(api.seasons.launch, { token: creator });

    const opening = await t.query(api.view.playerView, { token: creator });
    await t.mutation(api.constructions.start, {
      token: creator,
      building: 'mine',
      regionId: MOSELLE,
    });
    await expect(
      t.mutation(api.constructions.start, { token: creator, building: 'hq', regionId: PARIS }),
    ).rejects.toThrow('CONSTRUCTION_IN_PROGRESS');

    const before = await t.query(api.view.playerView, { token: creator });
    expect(before.me.construction?.name).toBe('mine');
    expect(before.me.resources.alloy.stock).toBe(
      opening.me.resources.alloy.stock - (buildCost('mine', 1).alloy ?? 0),
    );

    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const after = await t.query(api.view.playerView, { token: creator });
    expect(after.me.construction).toBeNull();
    expect(after.me.buildings).toContainEqual(
      expect.objectContaining({ key: 'mine', regionId: MOSELLE, level: 1 }),
    );
  });

  /** Nothing rises above the headquarters. The rule used to make the HQ the first building of
   *  a season; now that it stands from the launch, what it governs is the second level. */
  it('refuses to raise a building above the headquarters', async () => {
    const t = boot();
    const { creator } = await readyToLaunch(t);
    await t.mutation(api.seasons.launch, { token: creator });
    await t.mutation(api.constructions.start, {
      token: creator,
      building: 'mine',
      regionId: MOSELLE,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    await expect(
      t.mutation(api.constructions.start, { token: creator, building: 'mine', regionId: MOSELLE }),
    ).rejects.toThrow('CAPPED_BY_HQ');
  });
});

describe('rest window', () => {
  it('is declared in the lobby and rejects an impossible hour', async () => {
    const t = boot();
    const { creator } = await readyToLaunch(t);
    await t.mutation(api.players.setRestWindow, { token: creator, startMinutes: 22 * 60 });
    await expect(
      t.mutation(api.players.setRestWindow, { token: creator, startMinutes: -1 }),
    ).rejects.toThrow('INVALID_REST_WINDOW');
  });

  /**
   * Seven hours, fixed (design sheet 07). The player chooses when he sleeps, never for how
   * long: a self-set duration is a self-set span of invulnerability.
   */
  it('always spans seven hours, midnight wrap included', async () => {
    const t = boot();
    const { creator } = await readyToLaunch(t);

    await t.mutation(api.players.setRestWindow, { token: creator, startMinutes: 9 * 60 });
    await t.mutation(api.seasons.launch, { token: creator });
    expect((await t.query(api.view.playerView, { token: creator })).me.restWindow).toEqual({
      startMinutes: 9 * 60,
      endMinutes: 16 * 60,
    });
  });

  it('wraps past midnight rather than clipping at the end of the day', async () => {
    const t = boot();
    const { creator } = await readyToLaunch(t);
    await t.mutation(api.players.setRestWindow, { token: creator, startMinutes: 23 * 60 });
    await t.mutation(api.seasons.launch, { token: creator });
    expect((await t.query(api.view.playerView, { token: creator })).me.restWindow).toEqual({
      startMinutes: 23 * 60,
      endMinutes: 6 * 60,
    });
  });

  /**
   * The window is public: left editable it becomes a shield one slides over an arrival one
   * has seen coming. It freezes at launch, like the nation and the doctrine.
   */
  it('freezes at launch', async () => {
    const t = boot();
    const { creator } = await readyToLaunch(t);
    await t.mutation(api.seasons.launch, { token: creator });
    await expect(
      t.mutation(api.players.setRestWindow, { token: creator, startMinutes: 3 * 60 }),
    ).rejects.toThrow('REST_WINDOW_FROZEN');
  });
});

describe('scrapping a season', () => {
  it('belongs to the founder and leaves nothing behind', async () => {
    const t = boot();
    const { creator, guest } = await readyToLaunch(t);
    await t.mutation(api.seasons.launch, { token: creator });

    await expect(t.mutation(api.seasons.destroy, { token: guest })).rejects.toThrow('CREATOR_ONLY');
    await t.mutation(api.seasons.destroy, { token: creator });

    // Both tokens answer nothing any more — which is what sends every player home.
    await expect(t.query(api.seasons.lobby, { token: creator })).rejects.toThrow('UNKNOWN_TOKEN');
    await expect(t.query(api.seasons.lobby, { token: guest })).rejects.toThrow('UNKNOWN_TOKEN');
    expect(await t.query(api.seasons.preview, { token: guest })).toBeNull();

    const left = await t.run(async (ctx) => ({
      seasons: (await ctx.db.query('seasons').collect()).length,
      players: (await ctx.db.query('players').collect()).length,
      buildings: (await ctx.db.query('buildings').collect()).length,
      resources: (await ctx.db.query('resources').collect()).length,
    }));
    expect(left).toEqual({ seasons: 0, players: 0, buildings: 0, resources: 0 });
  });
});
