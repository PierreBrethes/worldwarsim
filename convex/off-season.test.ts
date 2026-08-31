import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './_generated/api';
import type { Id, TableNames } from './_generated/dataModel';
import { distanceKm, type LonLat } from '../src/domain/geo';
import {
  HQ_LEVEL_AT_LAUNCH,
  NATIONS,
  SCOUT_RADIUS_KM,
  STARTING_AMMUNITION,
  STARTING_KIT,
  STRENGTH_PER_ROUND,
  buildCost,
  nominalStrength,
} from './constants';
import { regionFacts } from './regions';
import { routeBetween } from './routes';
import schema from './schema';
import { modules } from './test.setup';

const boot = () => convexTest(schema, modules);

const KIT = STARTING_KIT;

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
  await t.mutation(api.players.declareReady, { token: creator, ready: true });
  await t.mutation(api.players.reserveNation, { token: guest, nation: 'ussr' });
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

  it('rejects an unknown code', async () => {
    const t = boot();
    await expect(t.mutation(api.seasons.join, { code: 'ZZZZZZ', nickname: 'X' })).rejects.toThrow(
      'UNKNOWN_GAME_CODE',
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

/**
 * **L'entrée en guerre** — one joins a running season at any hour, and the season answers by
 * handing out the launch kit and nothing more (decision of 24/08). What these cases pin down is
 * the part a reader would not guess: the endowment is the very one the launch hands out, the
 * theatre does not move, and the threshold of the test victory recounts on the entry rather than
 * on the join.
 */
describe('joining a running season', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /** A free flag reserved on a season already running — everything the door asks for. */
  async function enlist(t: ReturnType<typeof boot>, code: string, nation: string) {
    const { token } = await t.mutation(api.seasons.join, { code, nickname: 'Tard' });
    await t.mutation(api.players.reserveNation, { token, nation });
    return token;
  }

  it('is accepted on a launched season and refused on a concluded one', async () => {
    const t = boot();
    const { code, creator } = await readyToLaunch(t);
    await t.mutation(api.seasons.launch, { token: creator });
    await t.mutation(api.seasons.join, { code, nickname: 'Tard' });

    await t.run(async (ctx) => {
      const season = (await ctx.db.query('seasons').collect())[0]!;
      await ctx.db.patch(season._id, { status: 'concluded', concludedAt: Date.now() });
    });
    await expect(t.mutation(api.seasons.join, { code, nickname: 'Trop tard' })).rejects.toThrow(
      'SEASON_CONCLUDED',
    );
  });

  /** The kit as it is, the headquarters at the level the season plants, the foundation still
   *  owed: the very endowment of the launch, because it is the very same function. */
  it('endows the latecomer exactly as the launch endowed the others', async () => {
    const t = boot();
    const { code, creator } = await readyToLaunch(t);
    await t.mutation(api.seasons.launch, { token: creator });
    const opening = await t.query(api.view.playerView, { token: creator });

    const late = await enlist(t, code, 'germany');
    await expect(t.query(api.view.playerView, { token: late })).rejects.toThrow('NOT_AT_WAR');
    vi.advanceTimersByTime(90 * 60_000);
    await t.mutation(api.seasons.enterWar, { token: late });

    const view = await t.query(api.view.playerView, { token: late });
    expect(view.me.nation).toBe('germany');
    expect(view.me.resources.alloy.stock).toBe(KIT.alloy);
    expect(view.me.resources.food.stock).toBe(KIT.food);
    expect(view.me.buildings).toEqual([
      expect.objectContaining({ key: 'hq', level: HQ_LEVEL_AT_LAUNCH }),
    ]);
    // Germany holds coal, ore, bread and cloth, and no oil: four extractors, no well.
    expect(view.me.foundation).toEqual(['mine', 'mine', 'farm', 'mill']);
    expect(view.me.foundation).toEqual(opening.me.foundation);
    // The theatre was frozen at launch: a latecomer joins it, he does not redraw it.
    expect(view.season.playableRegion).toBe(opening.season.playableRegion);
  });

  /** The choices seal at his own entry, not at a launch he was not there for. */
  it('seals nation and rest window at the entry into war', async () => {
    const t = boot();
    const { code, creator } = await readyToLaunch(t);
    await t.mutation(api.seasons.launch, { token: creator });
    const late = await enlist(t, code, 'germany');
    await t.mutation(api.players.setRestWindow, { token: late, startMinutes: 120 });
    await t.mutation(api.seasons.enterWar, { token: late });

    await expect(
      t.mutation(api.players.reserveNation, { token: late, nation: 'italy' }),
    ).rejects.toThrow('SEASON_ALREADY_LAUNCHED');
    await expect(
      t.mutation(api.players.setRestWindow, { token: late, startMinutes: 300 }),
    ).rejects.toThrow('REST_WINDOW_FROZEN');
    // Entering twice endows nobody twice: the second call finds a belligerent and returns.
    await t.mutation(api.seasons.enterWar, { token: late });
    expect((await t.query(api.view.playerView, { token: late })).me.buildings).toHaveLength(1);
  });

  it('refuses a seat on a running season with no free nation left', async () => {
    const t = boot();
    const { code, creator, guest } = await seasonWithTwoPlayers(t);
    const seated = [creator, guest];
    for (let seat = 2; seat < NATIONS.length; seat += 1) {
      const joined = await t.mutation(api.seasons.join, { code, nickname: `Joueur ${seat}` });
      seated.push(joined.token);
    }
    for (const [seat, token] of seated.entries()) {
      await t.mutation(api.players.reserveNation, { token, nation: NATIONS[seat]! });
      await t.mutation(api.players.declareReady, { token, ready: true });
    }
    await t.mutation(api.seasons.launch, { token: creator });

    await expect(t.mutation(api.seasons.join, { code, nickname: 'Tard' })).rejects.toThrow(
      'NO_FREE_NATION',
    );
  });

  /** The only channel that says a belligerent has come in: everybody's journal, the newcomer's
   *  included. The client turns the row into a headline (`src/domain/journal.ts`). */
  it('announces the entry in the view of every belligerent', async () => {
    const t = boot();
    const { code, creator, guest } = await readyToLaunch(t);
    await t.mutation(api.seasons.launch, { token: creator });
    const late = await enlist(t, code, 'germany');
    vi.advanceTimersByTime(90 * 60_000);
    await t.mutation(api.seasons.enterWar, { token: late });

    for (const token of [creator, guest, late]) {
      const entries = (await t.query(api.view.playerView, { token })).warEntries;
      expect(entries).toEqual([expect.objectContaining({ nickname: 'Tard', nation: 'germany' })]);
    }
    // The launch cohort opened the war, it did not enter it: no headline for the founders.
    expect(
      (await t.query(api.view.playerView, { token: creator })).warEntries.map((e) => e.nation),
    ).not.toContain('france');
  });

  /** Nobody's opponent until he is in the field: a seat still choosing its flag is neither an
   *  opponent on the board nor a nation the victory has to reduce. */
  it('keeps a seat that has not entered out of the board of the others', async () => {
    const t = boot();
    const { code, creator } = await readyToLaunch(t);
    await t.mutation(api.seasons.launch, { token: creator });
    await enlist(t, code, 'germany');

    const view = await t.query(api.view.playerView, { token: creator });
    expect(view.opponents).toHaveLength(1);
    expect(view.season.players).toBe(2);
    expect(view.season.reduction.standings).toHaveLength(2);
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

  /**
   * **A lobby row says what a seat shows, never what arms it.** The reservation is public — it
   * is the whole point of the flag list — but the token authenticates every mutation, and
   * `doctrine` is a legacy column no reader may serve again (ADR 0020 §9).
   */
  it('shows the seats without handing out what arms them', async () => {
    const t = boot();
    const { creator, guest } = await seasonWithTwoPlayers(t);
    await t.mutation(api.players.reserveNation, { token: guest, nation: 'ussr' });
    const lobby = await t.query(api.seasons.lobby, { token: creator });
    expect(lobby.players).toHaveLength(2);
    for (const player of lobby.players) {
      expect(player).not.toHaveProperty('token');
      expect(player).not.toHaveProperty('doctrine');
    }
    expect(lobby.me).not.toHaveProperty('doctrine');
  });

  it('requires a nation to be ready', async () => {
    const t = boot();
    const { creator } = await seasonWithTwoPlayers(t);
    await expect(
      t.mutation(api.players.declareReady, { token: creator, ready: true }),
    ).rejects.toThrow('NATION_REQUIRED');
  });
});

describe('launching', () => {
  it('belongs to the creator and requires everyone ready', async () => {
    const t = boot();
    const { creator, guest } = await seasonWithTwoPlayers(t);
    await expect(t.mutation(api.seasons.launch, { token: guest })).rejects.toThrow('CREATOR_ONLY');
    await expect(t.mutation(api.seasons.launch, { token: creator })).rejects.toThrow(
      'PLAYERS_NOT_READY',
    );
  });

  it('hands out the starting kit, plants the headquarters, and freezes the region', async () => {
    const t = boot();
    const { creator } = await readyToLaunch(t);
    await t.mutation(api.seasons.launch, { token: creator });
    const view = await t.query(api.view.playerView, { token: creator });
    expect(view.me.nation).toBe('france');
    expect(view.me.resources.alloy.stock).toBe(KIT.alloy);
    // One building and one only: the headquarters on the capital (ADR 0015), at the level the
    // season plants it — the foundation is owed, never raised for the player.
    const hqLevel = HQ_LEVEL_AT_LAUNCH;
    expect(view.me.buildings).toEqual([
      expect.objectContaining({ key: 'hq', regionId: PARIS, level: hqLevel }),
    ]);
    expect(view.me.foundation).toEqual(['mine', 'mine', 'farm', 'mill']);
    expect(view.me.slots).toEqual({ total: 1 + hqLevel, used: 0 });
    // The home regions that carry a deposit, and only those.
    expect(view.me.regions.some((region) => region.id === MOSELLE)).toBe(true);
    expect(view.season.playableRegion).toBe('europe');
    expect(view.opponents).toHaveLength(1);
    expect(view.opponents[0]).not.toHaveProperty('doctrine');
  });

  /**
   * **One infantry, garrisoned at the headquarters** (decision of 25/08). A nation that opens
   * with nothing standing has no answer at all to a column walking in on its first evening.
   *
   * The consequence is accepted and graved here rather than left to be discovered: the company
   * counts in the **nominal** the reduction rule measures against (`domain/victory.ts`), so a
   * player who holds nothing else and loses it falls under half his nominal — reduced, hence
   * scalpable by whoever took it.
   */
  it('gives one infantry, stationed at the headquarters', async () => {
    const t = boot();
    const { creator } = await readyToLaunch(t);
    await t.mutation(api.seasons.launch, { token: creator });

    const view = await t.query(api.view.playerView, { token: creator });
    const hq = view.me.buildings.find((building) => building.key === 'hq')!;
    expect(view.me.troops).toEqual([
      expect.objectContaining({
        role: 'infantry',
        tier: 1,
        strength: nominalStrength('infantry', 1),
      }),
    ]);
    expect(view.me.troops[0]!.stationedAt).toEqual({ kind: 'building', buildingId: hq.id });
  });

  /**
   * **Le kit de munitions** (décision du 25/08). Since question 18 the rounds are billed at the
   * pass and nowhere else, so what this endowment buys is *engagements*, not companies. The
   * figure belongs to the starting line, never to a nation, like the alloy and the oil beside it.
   */
  it('hands out the ammunition of the starting line, not a nation’s own figure', async () => {
    const t = boot();
    const { creator } = await readyToLaunch(t);
    await t.mutation(api.seasons.launch, { token: creator });

    const view = await t.query(api.view.playerView, { token: creator });
    expect(view.me.resources.ammunition.stock).toBe(STARTING_AMMUNITION);
    // Enough for the given company to fight several passes: an endowment that covered one
    // engagement would be a nation disarmed by its first contact.
    const onePass = Math.ceil(nominalStrength('infantry', 1) / STRENGTH_PER_ROUND);
    expect(view.me.resources.ammunition.stock).toBeGreaterThan(onePass * 3);
  });

  /** Same endowment on the other road into a board: a latecomer is not a poorer player. */
  it('gives the same infantry to a nation that enters the war late', async () => {
    const t = boot();
    const { code, creator } = await readyToLaunch(t);
    await t.mutation(api.seasons.launch, { token: creator });
    const { token: late } = await t.mutation(api.seasons.join, { code, nickname: 'Tard' });
    await t.mutation(api.players.reserveNation, { token: late, nation: 'germany' });
    await t.mutation(api.seasons.enterWar, { token: late });

    const view = await t.query(api.view.playerView, { token: late });
    const hq = view.me.buildings.find((building) => building.key === 'hq')!;
    expect(view.me.troops).toHaveLength(1);
    expect(view.me.troops[0]).toMatchObject({ role: 'infantry', tier: 1 });
    expect(view.me.troops[0]!.stationedAt).toEqual({ kind: 'building', buildingId: hq.id });
    // The kit too, ammunition included: one endowment, written once, read by both roads.
    expect(view.me.resources.ammunition.stock).toBe(STARTING_AMMUNITION);
  });
});

describe('lazy accrual', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /**
   * Nothing is extracted without an exploitation building: the rate comes from the map, not
   * from a stored number, and an empty map produces nothing. What a farm changes is in
   * `economy.test.ts`.
   *
   * The bread still moves, and only one thing moves it — the company the launch hands out eats
   * from the first minute (`seasons.endow`, 25/08). So the served rate is the upkeep of that
   * one troop, net and negative, with nothing at all on the other side of the subtraction.
   */
  it('extracts nothing as long as nothing is built, and only the given company moves the bread', async () => {
    const t = boot();
    const { creator } = await readyToLaunch(t);
    await t.mutation(api.seasons.launch, { token: creator });
    vi.advanceTimersByTime(2 * 3_600_000);
    const view = await t.query(api.view.playerView, { token: creator });
    expect(view.me.upkeep.troops).toBe(1);
    expect(view.me.upkeep.foodPerHour).toBeGreaterThan(0);
    expect(view.me.resources.food.ratePerHour).toBe(-view.me.upkeep.foodPerHour);
    expect(view.me.resources.food.stock).toBe(KIT.food - 2 * view.me.upkeep.foodPerHour);
  });
});

describe('constructions', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /** The warehouse, not the mine: the mine belongs to the foundation, and what a foundation
   *  placement costs and waits is nothing at all. */
  it('debits the materials and raises the building in time', async () => {
    const t = boot();
    const { creator } = await readyToLaunch(t);
    await t.mutation(api.seasons.launch, { token: creator });

    const opening = await t.query(api.view.playerView, { token: creator });
    await t.mutation(api.constructions.start, {
      token: creator,
      building: 'warehouse',
      regionId: MOSELLE,
    });

    const before = await t.query(api.view.playerView, { token: creator });
    expect(before.me.construction?.name).toBe('warehouse');
    expect(before.me.resources.alloy.stock).toBe(
      opening.me.resources.alloy.stock - (buildCost('warehouse', 1).alloy ?? 0),
    );

    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const after = await t.query(api.view.playerView, { token: creator });
    expect(after.me.construction).toBeNull();
    expect(after.me.buildings).toContainEqual(
      expect.objectContaining({ key: 'warehouse', regionId: MOSELLE, level: 1 }),
    );
  });

  /** A key the season still owes is placed for nothing and stands at once — no bill, no
   *  construction to wait on, and the region is still the player's to choose. */
  it('places a foundation building for nothing, standing at once', async () => {
    const t = boot();
    const { creator } = await readyToLaunch(t);
    await t.mutation(api.seasons.launch, { token: creator });

    const opening = await t.query(api.view.playerView, { token: creator });
    await t.mutation(api.constructions.start, {
      token: creator,
      building: 'mine',
      regionId: MOSELLE,
    });

    const after = await t.query(api.view.playerView, { token: creator });
    expect(after.me.construction).toBeNull();
    expect(after.me.buildings).toContainEqual(
      expect.objectContaining({ key: 'mine', regionId: MOSELLE, level: 1 }),
    );
    expect(after.me.resources.alloy.stock).toBe(opening.me.resources.alloy.stock);
    // One mine of the two French ground owes is settled; the rest is still owed.
    expect(after.me.foundation).toEqual(['mine', 'farm', 'mill']);
  });

  /** Nothing rises above the headquarters. The rule used to make the HQ the first building of
   *  a season; now that it stands from the launch, what it governs is how high the rest goes —
   *  the level of the headquarters the season plants, and not one more. */
  it('refuses to raise a building above the headquarters', async () => {
    const t = boot();
    const { creator } = await readyToLaunch(t);
    await t.mutation(api.seasons.launch, { token: creator });
    for (let level = 1; level <= HQ_LEVEL_AT_LAUNCH; level += 1) {
      await t.mutation(api.constructions.start, {
        token: creator,
        building: 'mine',
        regionId: MOSELLE,
      });
      await t.finishAllScheduledFunctions(vi.runAllTimers);
    }
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
   * has seen coming. It freezes at launch, like the nation.
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

/**
 * **A concluded season writes nothing more.** Concluding does not empty the scheduler: the jobs
 * already in it wake up all the same. Without a guard, a skirmish won at noon keeps resolving
 * engagements, delivering batches and finishing sites all evening — and every measurement taken
 * after a test is measuring a game nobody was playing.
 *
 * The jobs **return**, they do not fail: Convex never retries a mutation that throws, so a
 * refusal here would sit in the dashboard as an error that is not one. Nothing is cleaned up
 * either — the rows stay exactly as they are, and `destroy` purges them whole.
 */
describe('a concluded season', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 17, 12, 0, 0));
  });
  afterEach(() => vi.useRealTimers());

  /** Romanian oil, far enough east of Moselle that the column is still walking. */
  const PRAHOVA = 'ROU-310';

  it('lets no scheduled job write once it is won', async () => {
    const t = boot();
    const { creator, guest } = await readyToLaunch(t);
    await t.mutation(api.seasons.launch, { token: creator });

    const playerId = await playerIdOf(t, creator);
    const barracks = await t.run(async (ctx) =>
      ctx.db.insert('buildings', {
        seasonId: (await ctx.db.get(playerId))!.seasonId,
        playerId,
        key: 'barracks',
        regionId: MOSELLE,
        level: 1,
      }),
    );
    // Somebody standing at the far end, so an arrival that resolved would leave an account.
    const theirs = await playerIdOf(t, guest);
    await t.run(async (ctx) => {
      const seasonId = (await ctx.db.get(theirs))!.seasonId;
      const holding = await ctx.db.insert('buildings', {
        seasonId,
        playerId: theirs,
        key: 'barracks',
        regionId: PRAHOVA,
        level: 1,
      });
      await ctx.db.insert('troops', {
        seasonId,
        playerId: theirs,
        role: 'infantry',
        tier: 1,
        nominalStrength: nominalStrength('infantry', 1),
        currentStrength: nominalStrength('infantry', 1),
        stationedAt: holding,
      });
    });

    const marching = await t.run(async (ctx) =>
      ctx.db.insert('troops', {
        seasonId: (await ctx.db.get(playerId))!.seasonId,
        playerId,
        role: 'infantry',
        tier: 1,
        nominalStrength: nominalStrength('infantry', 1),
        currentStrength: nominalStrength('infantry', 1),
        stationedAt: barracks,
      }),
    );
    await t.mutation(api.movements.attack, {
      token: creator,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [marching],
      target: { kind: 'region', regionId: PRAHOVA },
    });

    // A batch and a site both dated after the conclusion: the two other jobs that write.
    await t.run(async (ctx) => {
      await ctx.db.insert('recruitments', {
        playerId,
        buildingId: barracks,
        role: 'infantry',
        tier: 1,
        rank: 0,
        finishesAt: Date.now() + 3_600_000,
      });
      await ctx.db.insert('constructions', {
        playerId,
        building: 'billets',
        regionId: MOSELLE,
        level: 1,
        rank: 0,
        finishesAt: Date.now() + 3_600_000,
      });
    });

    const tables = Object.keys(schema.tables) as ReadonlyArray<TableNames>;
    await t.run(async (ctx) => {
      const season = (await ctx.db.query('seasons').first())!;
      await ctx.db.patch(season._id, {
        status: 'concluded',
        winnerId: playerId,
        concludedAt: Date.now(),
      });
    });
    const before = await dumpRows(t, tables);

    await t.finishAllScheduledFunctions(vi.runAllTimers);

    // Not "no engagement" and not "no delivery": **nothing at all**, which is the only shape
    // that still holds for a job added tomorrow.
    expect(await dumpRows(t, tables)).toEqual(before);
    expect(await t.run(async (ctx) => ctx.db.query('engagements').collect())).toEqual([]);
  });

  /** **Et la même chose par l'autre porte.** Une saison close à la main (`seasons.conclude`) est
   *  une saison close : le garde-fou lit le statut, jamais qui l'a mis là. */
  it('lets no scheduled job write once its founder has closed it', async () => {
    const t = boot();
    const { creator } = await readyToLaunch(t);
    await t.mutation(api.seasons.launch, { token: creator });

    const playerId = await playerIdOf(t, creator);
    const barracks = await t.run(async (ctx) =>
      ctx.db.insert('buildings', {
        seasonId: (await ctx.db.get(playerId))!.seasonId,
        playerId,
        key: 'barracks',
        regionId: MOSELLE,
        level: 1,
      }),
    );
    const marching = await t.run(async (ctx) =>
      ctx.db.insert('troops', {
        seasonId: (await ctx.db.get(playerId))!.seasonId,
        playerId,
        role: 'infantry',
        tier: 1,
        nominalStrength: nominalStrength('infantry', 1),
        currentStrength: nominalStrength('infantry', 1),
        stationedAt: barracks,
      }),
    );
    await t.mutation(api.movements.marchTo, {
      token: creator,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [marching],
      point: { lon: regionFacts(PRAHOVA)!.point[0], lat: regionFacts(PRAHOVA)!.point[1] },
    });

    await t.mutation(api.seasons.conclude, { token: creator });
    const tables = Object.keys(schema.tables) as ReadonlyArray<TableNames>;
    const before = await dumpRows(t, tables);

    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(await dumpRows(t, tables)).toEqual(before);
  });

  async function playerIdOf(t: ReturnType<typeof boot>, token: string) {
    return t.run(async (ctx) => {
      const player = await ctx.db
        .query('players')
        .withIndex('byToken', (q) => q.eq('token', token))
        .unique();
      if (!player) throw new Error('player not found');
      return player._id;
    });
  }

  async function dumpRows(t: ReturnType<typeof boot>, tables: ReadonlyArray<TableNames>) {
    const dumped: Record<string, unknown> = {};
    for (const table of tables) {
      dumped[table] = await t.run(async (ctx) => ctx.db.query(table).collect());
    }
    return dumped;
  }
});

/**
 * **L'horloge est optionnelle** (révision du 27/08 de l'ADR 0017), et depuis le 31/08 elle est le
 * seul choix du fondement (ADR 0020 §11). Ce qui se vérifie ici et nulle part ailleurs : qu'une
 * saison peut naître sans horloge, et que la seule fin qu'elle a alors — la main de son
 * fondateur — refuse tout le monde d'autre.
 */
describe('a season without a clock', () => {
  it('is founded with no clock at all', async () => {
    const t = boot();
    const { token } = await t.mutation(api.seasons.create, {
      nickname: 'Pierre',
      durationHours: null,
      compensation: 0.5,
    });
    const lobby = await t.query(api.seasons.lobby, { token });
    expect(lobby.durationHours).toBeNull();
  });

  it('is closed by its founder, by nobody else, and only once it runs', async () => {
    const t = boot();
    const { creator, guest } = await readyToLaunch(t);

    // Un salon n'a rien à clore : il se supprime (`destroy`), il ne se conclut pas.
    await expect(t.mutation(api.seasons.conclude, { token: creator })).rejects.toThrow(
      'SEASON_NOT_LAUNCHED',
    );

    await t.mutation(api.seasons.launch, { token: creator });
    await expect(t.mutation(api.seasons.conclude, { token: guest })).rejects.toThrow(
      'CREATOR_ONLY',
    );

    await t.mutation(api.seasons.conclude, { token: creator });
    const season = await t.run(async (ctx) => (await ctx.db.query('seasons').first())!);
    expect(season.status).toBe('concluded');
    // Personne n'a gagné, et le journal ne doit désigner personne.
    expect(season.winnerId).toBeNull();
    expect(season.concludedAt).not.toBeNull();

    // Une dépêche par belligérant : c'est le seul écran qui annonce la fin.
    const notices = await t.run(async (ctx) => ctx.db.query('notices').collect());
    expect(notices.map((notice) => notice.kind)).toEqual(['seasonClosed', 'seasonClosed']);

    // Elle se relit, elle ne se joue plus.
    await expect(
      t.mutation(api.constructions.start, {
        token: creator,
        building: 'billets',
        regionId: MOSELLE,
      }),
    ).rejects.toThrow('SEASON_CONCLUDED');
    expect(
      (await t.query(api.view.playerView, { token: creator })).season.reduction.concludedAt,
    ).not.toBeNull();
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
    // And the home screen simply lists one game fewer: a scrapped season is not an error.
    expect(await t.query(api.seasons.previews, { tokens: [creator, guest] })).toEqual([]);
  });

  /**
   * **The purge is checked against the schema, never against a list written here.** A table that
   * `erasePlayer` forgets leaves rows nobody can reach — no token names them and no season owns
   * them — and the only reader that notices is one that walks `schema.tables` itself. The season
   * below is the widest one the game can produce today: a march, an outpost, an engagement, a
   * sighting, a queue and a lot.
   *
   * The assertion is that the store is **empty**, not merely free of this season's rows: the run
   * holds one season and nothing else, so the two say the same thing — and emptiness is the one
   * form that still means something for a table added tomorrow.
   */
  describe('a season that used the whole schema', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 7, 17, 12, 0, 0));
    });
    afterEach(() => vi.useRealTimers());

    /** Romanian oil, far enough east of the Marne for the road to be worth watching. */
    const PRAHOVA = 'ROU-310';
    /** Ar Riyad: neutral, and nowhere near the road — an outpost planted for its own sake. */
    const RIYADH = 'SAU-1097';

    const pointOf = (regionId: string): LonLat => regionFacts(regionId)!.point;
    const asPoint = (point: LonLat) => ({ lon: point[0], lat: point[1] });

    async function playerOf(t: ReturnType<typeof boot>, token: string) {
      return t.run(async (ctx) => {
        const player = await ctx.db
          .query('players')
          .withIndex('byToken', (q) => q.eq('token', token))
          .unique();
        if (!player) throw new Error('player not found');
        return player._id;
      });
    }

    async function raise(t: ReturnType<typeof boot>, token: string, regionId: string) {
      const playerId = await playerOf(t, token);
      return t.run(async (ctx) =>
        ctx.db.insert('buildings', {
          seasonId: (await ctx.db.get(playerId))!.seasonId,
          playerId,
          key: 'barracks',
          regionId,
          level: 1,
        }),
      );
    }

    async function form(
      t: ReturnType<typeof boot>,
      token: string,
      stationedAt: Id<'buildings'> | { lon: number; lat: number } | null,
    ) {
      const playerId = await playerOf(t, token);
      const strength = nominalStrength('infantry', 1);
      return t.run(async (ctx) =>
        ctx.db.insert('troops', {
          seasonId: (await ctx.db.get(playerId))!.seasonId,
          playerId,
          role: 'infantry',
          tier: 1,
          nominalStrength: strength,
          currentStrength: strength,
          stationedAt,
        }),
      );
    }

    it('leaves not one row behind, in any table of the schema', async () => {
      const t = boot();
      const { creator, guest } = await readyToLaunch(t);
      await t.mutation(api.seasons.launch, { token: creator });

      // A sentry of the guest's, forty kilometres off the road the column will walk: close
      // enough to file a sighting, far enough not to meet anybody.
      const road = routeBetween(pointOf(MOSELLE), pointOf(PRAHOVA), 'land')!;
      const halfway = road.points[Math.floor(road.points.length / 2)]!;
      const camp: LonLat = [
        halfway[0] + 40 / (111.32 * Math.cos((halfway[1] * Math.PI) / 180)),
        halfway[1],
      ];
      expect(
        road.points.reduce((closest, step) => Math.min(closest, distanceKm(step, camp)), Infinity),
      ).toBeLessThan(SCOUT_RADIUS_KM);
      await form(t, guest, asPoint(camp));

      // Somebody to meet at the far end, so an account gets filed.
      const theirs = await raise(t, guest, PRAHOVA);
      await form(t, guest, theirs);

      const barracks = await raise(t, creator, MOSELLE);
      await t.mutation(api.movements.attack, {
        token: creator,
        origin: { kind: 'building', buildingId: barracks },
        troopIds: [await form(t, creator, barracks)],
        target: { kind: 'region', regionId: PRAHOVA },
      });
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      expect(await t.run(async (ctx) => ctx.db.query('engagements').collect())).toHaveLength(1);

      // An outpost, planted where a column of its own stands.
      const desert = pointOf(RIYADH);
      await t.mutation(api.movements.foundOutpostHere, {
        token: creator,
        point: asPoint(desert),
        specialization: 'relay',
        troopIds: [await form(t, creator, asPoint(desert))],
      });

      // And a second column still on the road when the season is scrapped, watched by the
      // same sentry: a live movement, and the sightings that go with it.
      await t.mutation(api.movements.attack, {
        token: creator,
        origin: { kind: 'building', buildingId: barracks },
        troopIds: [await form(t, creator, barracks)],
        target: { kind: 'region', regionId: PRAHOVA },
      });

      // A queue, a lot, a construction and a notice, put down without paying for them: what is
      // under test is the purge, not the economy that would have fed them.
      const playerId = await playerOf(t, creator);
      await t.run(async (ctx) => {
        await ctx.db.insert('recruitments', {
          playerId,
          buildingId: barracks,
          role: 'infantry',
          tier: 1,
          rank: 0,
          finishesAt: Date.now() + 3_600_000,
        });
        await ctx.db.insert('orders', {
          playerId,
          chain: 'arsenal',
          ordered: 200,
          produced: 0,
          placedAt: Date.now(),
        });
        await ctx.db.insert('constructions', {
          playerId,
          building: 'billets',
          regionId: MOSELLE,
          level: 1,
          rank: 0,
          finishesAt: Date.now() + 3_600_000,
        });
        await ctx.db.insert('notices', {
          playerId,
          at: Date.now(),
          kind: 'constructionCancelled',
          building: 'farm',
          regionId: MOSELLE,
        });
      });

      // And one line of the telegraph: the channel is a table of the season like any other.
      await t.mutation(api.messages.post, { token: creator, text: 'je marche sur Prahova' });

      const tables = Object.keys(schema.tables) as ReadonlyArray<TableNames>;
      const before = await countRows(t, tables);
      // Every table carries something, or the emptiness below proves nothing about it.
      expect(Object.entries(before).filter(([, rows]) => rows === 0)).toEqual([]);

      await t.mutation(api.seasons.destroy, { token: creator });

      const after = await countRows(t, tables);
      expect(after).toEqual(Object.fromEntries(tables.map((table) => [table, 0])));
    });

    async function countRows(
      t: ReturnType<typeof boot>,
      tables: ReadonlyArray<TableNames>,
    ): Promise<Record<string, number>> {
      const counted: Record<string, number> = {};
      for (const table of tables) {
        counted[table] = await t.run(async (ctx) => (await ctx.db.query(table).collect()).length);
      }
      return counted;
    }
  });
});
