import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import {
  BUILDINGS,
  DEPOSITS,
  NATIONS,
  RESOURCES,
  type BuildingKey,
  type DepositKey,
  type Nation,
  type ResourceKey,
} from '../src/domain/ids';
import { ADM0_BY_NATION } from '../src/domain/nations';
import { EXPLOITED_DEPOSITS, PRODUCER_OF, placementRefusal } from '../src/domain/economy';
import {
  BASE_CAP,
  CHAINS,
  EXTRACTION_PER_HOUR,
  HQ_LEVEL_AT_LAUNCH,
  MAX_HQ_LEVEL,
  STARTING_KIT,
  OUTPOST_UPKEEP_PER_HOUR_PER_LEVEL,
  PLACEMENTS_PER_HQ_LEVEL,
  STORAGE_CAP_PER_LEVEL,
  buildCost,
  buildMinutes,
  homeSlots,
  unlockLevel,
} from './constants';
import { capitalRegionOf, foundationOwed, homeDepositsOf, regionFacts } from './regions';
import { clipToStorage, settle } from './resources';
import regionIndex from '../public/region-index.json';
import schema from './schema';
import { modules } from './test.setup';

const boot = () => convexTest(schema, modules);

const KIT = STARTING_KIT;

/** French regions, straight out of `deposits.json` and `region-index.json`. */
const MARNE = 'FRA-5323'; //  food
const MOSELLE = 'FRA-5328'; // coal, inland
const MEURTHE = 'FRA-5325'; // ore
const PAS_DE_CALAIS = 'FRA-5334'; // coal, coastal
const ARDENNES = 'FRA-5268'; // nothing at all
const JURA = 'FRA-5312'; // food
const PARIS = 'FRA-5333'; // the capital, where the headquarters already stands
const RUHR = 'DEU-1572'; // German

async function launchedSeason(
  t: ReturnType<typeof boot>,
  durationHours: 48 | 168 = 48,
  nation = 'france',
) {
  const { code, token } = await t.mutation(api.seasons.create, {
    nickname: 'Pierre',
    durationHours,
    compensation: 0.5,
  });
  const { token: guest } = await t.mutation(api.seasons.join, { code, nickname: 'Léa' });
  await t.mutation(api.players.reserveNation, { token, nation });
  await t.mutation(api.players.declareReady, { token, ready: true });
  // Two seats, two flags: the guest takes anything but the one under test.
  await t.mutation(api.players.reserveNation, {
    token: guest,
    nation: nation === 'ussr' ? 'japan' : 'ussr',
  });
  await t.mutation(api.players.declareReady, { token: guest, ready: true });
  await t.mutation(api.seasons.launch, { token });
  await disbandTheGift(t, token);
  return token;
}

/**
 * **The company the launch hands out, taken back** (`seasons.endow`, 25/08). What this file
 * measures is an economy, and the endowment eats: cleared at the door, so a figure here still
 * says what the ground produces. The gift itself is under test in `off-season.test.ts`.
 */
async function disbandTheGift(t: ReturnType<typeof boot>, token: string) {
  await t.run(async (ctx) => {
    const player = await ctx.db
      .query('players')
      .withIndex('byToken', (q) => q.eq('token', token))
      .unique();
    if (!player) throw new Error('player not found');
    const held = await ctx.db
      .query('troops')
      .withIndex('byPlayer', (q) => q.eq('playerId', player._id))
      .collect();
    for (const troop of held) await ctx.db.delete(troop._id);
  });
}

/**
 * Puts a building up without paying for it or waiting for the construction. What is under test
 * here is what a standing building *does*; what it takes to raise one is tested through the
 * mutation, in the refusals below.
 */
async function raise(
  t: ReturnType<typeof boot>,
  token: string,
  key: BuildingKey,
  regionId: string,
  level = 1,
) {
  await t.run(async (ctx) => {
    const player = await ctx.db
      .query('players')
      .withIndex('byToken', (q) => q.eq('token', token))
      .unique();
    if (!player) throw new Error('player not found');
    await ctx.db.insert('buildings', {
      seasonId: player.seasonId,
      playerId: player._id,
      key,
      regionId,
      level,
    });
  });
}

/** Puts a stock where the test needs it. Reaching a ceiling by waiting is not an option: a
 *  single settlement window clamps the inputs at their own ceiling first, so a foundry left
 *  alone for a week converts less than the same foundry read every hour. */
async function fill(t: ReturnType<typeof boot>, token: string, key: ResourceKey, stock: number) {
  await t.run(async (ctx) => {
    const player = await ctx.db
      .query('players')
      .withIndex('byToken', (q) => q.eq('token', token))
      .unique();
    if (!player) throw new Error('player not found');
    const row = (
      await ctx.db
        .query('resources')
        .withIndex('byPlayer', (q) => q.eq('playerId', player._id))
        .collect()
    ).find((candidate) => candidate.key === key);
    if (!row) throw new Error(`no ${key} row`);
    await ctx.db.patch(row._id, { stock });
  });
}

/** The headquarters is not raised, it is promoted: one already stands on the capital. */
async function promoteHq(t: ReturnType<typeof boot>, token: string, level: number) {
  await t.run(async (ctx) => {
    const player = await ctx.db
      .query('players')
      .withIndex('byToken', (q) => q.eq('token', token))
      .unique();
    if (!player) throw new Error('player not found');
    const hq = (
      await ctx.db
        .query('buildings')
        .withIndex('byPlayer', (q) => q.eq('playerId', player._id))
        .collect()
    ).find((building) => building.key === 'hq');
    if (!hq) throw new Error('no headquarters');
    await ctx.db.patch(hq._id, { level });
  });
}

describe('exploitation', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('feeds the nation from the deposit under the building, and from nothing else', async () => {
    const t = boot();
    const token = await launchedSeason(t);
    await raise(t, token, 'farm', MARNE);
    vi.advanceTimersByTime(2 * 3_600_000);

    const view = await t.query(api.view.playerView, { token });
    expect(view.me.resources.food.ratePerHour).toBe(EXTRACTION_PER_HOUR.food);
    expect(view.me.resources.food.stock).toBe(KIT.food + 2 * EXTRACTION_PER_HOUR.food);
    // The farm sits on food; it produces nothing of what the region does not hold.
    expect(view.me.resources.coal.stock).toBe(KIT.coal);
  });

  it('gives the mine the resource of its region — coal here, ore there', async () => {
    const t = boot();
    const token = await launchedSeason(t);
    await raise(t, token, 'mine', MOSELLE);
    await raise(t, token, 'mine', MEURTHE);
    vi.advanceTimersByTime(3_600_000);

    const view = await t.query(api.view.playerView, { token });
    expect(view.me.resources.coal.ratePerHour).toBe(EXTRACTION_PER_HOUR.coal);
    expect(view.me.resources.ore.ratePerHour).toBe(EXTRACTION_PER_HOUR.ore);
  });
});

describe('transformation', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /**
   * No order, no queue: the foundry converts on its own and stops on the input that runs out
   * first — here the ore of the starting kit, twenty units, two per alloy.
   *
   * The alloy is emptied first, and that is not a convenience: the kit opens above what a
   * nation without a warehouse can store, so a foundry read at the launch reports
   * `overflowing` and casts nothing. What is under test here is the input that runs out.
   */
  it('converts on its own and stops when an input runs out', async () => {
    const t = boot();
    const token = await launchedSeason(t);
    await raise(t, token, 'foundry', MOSELLE);
    await fill(t, token, 'alloy', 0);
    vi.advanceTimersByTime(10 * 3_600_000);

    const view = await t.query(api.view.playerView, { token });
    expect(view.me.resources.ore.stock).toBe(0);
    expect(view.me.resources.alloy.stock).toBe(KIT.ore / 2);
    expect(view.me.resources.coal.stock).toBe(KIT.coal - KIT.ore / 2);
  });

  it('keeps going as long as a mine feeds it', async () => {
    const t = boot();
    const token = await launchedSeason(t);
    // One building per region (ADR 0015): the second mine digs its coal on the shore, since
    // the foundry already holds Moselle.
    await raise(t, token, 'foundry', MOSELLE);
    await raise(t, token, 'mine', MEURTHE);
    await raise(t, token, 'mine', PAS_DE_CALAIS);
    await fill(t, token, 'alloy', 0);
    vi.advanceTimersByTime(10 * 3_600_000);

    const view = await t.query(api.view.playerView, { token });
    expect(view.me.resources.alloy.stock).toBeGreaterThan(KIT.ore / 2);
    expect(view.me.resources.ore.stock).toBeGreaterThan(0);
  });
});

describe('what the industry window reads', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const chainOf = (view: { me: { chains: ReadonlyArray<{ by: string }> } }, key: string) => {
    const chain = view.me.chains.find((candidate) => candidate.by === key);
    if (!chain) throw new Error(`no chain served for ${key}`);
    return chain;
  };

  /** The whole reason for the window: "pourquoi mon alliage ne monte plus" has an answer, and
   *  the answer is a resource name. */
  it('names the coal a foundry runs out of', async () => {
    const t = boot();
    const token = await launchedSeason(t);
    await raise(t, token, 'foundry', MOSELLE);
    await raise(t, token, 'mine', MEURTHE); // ore, and no coal mine anywhere
    await fill(t, token, 'alloy', 0);
    vi.advanceTimersByTime(20 * 3_600_000);

    const view = await t.query(api.view.playerView, { token });
    expect(view.me.resources.coal.stock).toBe(0);
    expect(chainOf(view, 'foundry')).toMatchObject({ state: 'starved', missing: 'coal' });
  });

  it('calls a full output overflowing, not starved', async () => {
    const t = boot();
    const token = await launchedSeason(t);
    await raise(t, token, 'foundry', MOSELLE);
    await raise(t, token, 'mine', MEURTHE);
    await raise(t, token, 'mine', PAS_DE_CALAIS);
    await fill(t, token, 'alloy', BASE_CAP);
    vi.advanceTimersByTime(3_600_000);

    const view = await t.query(api.view.playerView, { token });
    expect(view.me.resources.alloy.stock).toBe(view.me.resources.alloy.cap);
    expect(chainOf(view, 'foundry')).toMatchObject({ state: 'overflowing', missing: null });
  });

  /**
   * **Le débit servi est celui que la chaîne tient, pas celui des mines seules.** Le client
   * extrapole un stock entre deux lectures avec ce nombre : servi l'accroissement nu, l'alliage
   * restait gelé à « 0 / h » pendant que la fonderie coulait, et le minerai qu'elle mange
   * montait à l'écran pendant qu'il se dépensait.
   */
  it('serves the rate the chains hold, not the mines alone', async () => {
    const t = boot();
    const token = await launchedSeason(t);
    await raise(t, token, 'foundry', MOSELLE);
    await raise(t, token, 'mine', MEURTHE); // ore, 9/h
    await raise(t, token, 'mine', PAS_DE_CALAIS); // coal, 10/h
    await fill(t, token, 'alloy', 0);
    vi.advanceTimersByTime(3_600_000);

    const view = await t.query(api.view.playerView, { token });
    const cast = CHAINS.foundry.perHourPerLevel;
    expect(chainOf(view, 'foundry')).toMatchObject({ state: 'running' });
    // Ce que la fonderie coule, et ce qu'elle prélève sur les deux mines qui la nourrissent.
    expect(view.me.resources.alloy.ratePerHour).toBe(cast);
    expect(view.me.resources.ore.ratePerHour).toBe(EXTRACTION_PER_HOUR.ore - 2 * cast);
    expect(view.me.resources.coal.ratePerHour).toBe(EXTRACTION_PER_HOUR.coal - cast);
  });

  /** Une fonderie qui ne peut rien poser ne prélève rien non plus : le débit du minerai
   *  redevient celui de la mine, faute de quoi le joueur lirait une saignée qui n'a pas lieu. */
  it('takes nothing off the mines while the output has nowhere to go', async () => {
    const t = boot();
    const token = await launchedSeason(t);
    await raise(t, token, 'foundry', MOSELLE);
    await raise(t, token, 'mine', MEURTHE);
    await fill(t, token, 'alloy', BASE_CAP);
    vi.advanceTimersByTime(3_600_000);

    const view = await t.query(api.view.playerView, { token });
    expect(chainOf(view, 'foundry')).toMatchObject({ state: 'overflowing' });
    expect(view.me.resources.alloy.ratePerHour).toBe(0);
    expect(view.me.resources.ore.ratePerHour).toBe(EXTRACTION_PER_HOUR.ore);
  });

  /** An absent chain is information; an absent line is a hole. */
  it('serves the three chains even when nothing is built, extinguished', async () => {
    const t = boot();
    const token = await launchedSeason(t);

    const view = await t.query(api.view.playerView, { token });
    expect(view.me.chains.map((chain) => chain.by)).toEqual([
      'foundry',
      'arsenal',
      'quartermaster',
    ]);
    for (const chain of view.me.chains) {
      expect(chain).toMatchObject({ state: 'off', perHour: 0, level: 0 });
    }
  });

  it('reports the site of every exploitation, mute ones included', async () => {
    const t = boot();
    const token = await launchedSeason(t);
    await raise(t, token, 'farm', MARNE);
    await raise(t, token, 'mine', ARDENNES); // no deposit at all under it

    const view = await t.query(api.view.playerView, { token });
    expect(view.me.extraction).toEqual([
      {
        key: 'farm',
        regionId: MARNE,
        level: 1,
        deposit: 'food',
        perHour: EXTRACTION_PER_HOUR.food,
      },
      { key: 'mine', regionId: ARDENNES, level: 1, deposit: null, perHour: 0 },
    ]);
    // And the mute mine adds nothing to the national rate it is listed beside.
    expect(view.me.resources.ore.ratePerHour).toBe(0);
    expect(view.me.resources.coal.ratePerHour).toBe(0);
  });

  /**
   * The verdict is read an hour ahead, never off the window just settled: a player who just
   * paid for something reads zero minutes, where nothing was asked of any chain — and every
   * one of them would report as running.
   */
  it('still names the missing input right after a spend has reset the window', async () => {
    const t = boot();
    const token = await launchedSeason(t);
    await raise(t, token, 'foundry', MOSELLE);
    await raise(t, token, 'mine', MEURTHE);
    await fill(t, token, 'alloy', 100);
    await promoteHq(t, token, unlockLevel('billets'));
    vi.advanceTimersByTime(20 * 3_600_000);
    // The billets, not the farm: the farm belongs to the foundation, and a free placement
    // spends nothing — so it would reset no window.
    await t.mutation(api.constructions.start, { token, building: 'billets', regionId: MARNE });

    const view = await t.query(api.view.playerView, { token });
    expect(chainOf(view, 'foundry')).toMatchObject({ state: 'starved', missing: 'coal' });
  });
});

describe('storage', () => {
  it('raises the ceiling of what it stores, and only that', async () => {
    const t = boot();
    const token = await launchedSeason(t);
    const before = await t.query(api.view.playerView, { token });
    expect(before.me.resources.alloy.cap).toBe(BASE_CAP);

    await raise(t, token, 'warehouse', MOSELLE);

    const after = await t.query(api.view.playerView, { token });
    expect(after.me.resources.alloy.cap).toBe(BASE_CAP + STORAGE_CAP_PER_LEVEL);
    // Oil and ammunition are the depot's half, and the warehouse does nothing for them.
    expect(after.me.resources.oil.cap).toBe(BASE_CAP);
  });

  /**
   * **A ceiling adds up over sites** — the doctrine `totalLevelOf` carries, and the one the
   * troop ceiling reads too. What reads the best instance alone is a *gate*: the headquarters
   * cap and the tier gates.
   */
  it('adds the levels of every store, so two at one are worth one at two', async () => {
    const spread = boot();
    const scattered = await launchedSeason(spread);
    await raise(spread, scattered, 'warehouse', MOSELLE);
    await raise(spread, scattered, 'warehouse', ARDENNES);

    const stacked = boot();
    const tall = await launchedSeason(stacked);
    await raise(stacked, tall, 'warehouse', MOSELLE, 2);

    const twoSites = await spread.query(api.view.playerView, { token: scattered });
    const oneSite = await stacked.query(api.view.playerView, { token: tall });
    expect(twoSites.me.resources.alloy.cap).toBe(oneSite.me.resources.alloy.cap);
    expect(twoSites.me.resources.alloy.cap).toBe(BASE_CAP + 2 * STORAGE_CAP_PER_LEVEL);
  });
});

/**
 * **The two halves of the ceiling, held together** (ADR 0017). A reading never rogne what is
 * held, and losing the store takes the surplus once. Tested side by side on purpose: separated,
 * one of the two eventually gets written to contradict the other.
 */
describe('what a ceiling bounds', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /** Removes the store, then clips — that order is the contract of `clipToStorage`. */
  async function raze(t: ReturnType<typeof boot>, token: string, key: BuildingKey) {
    return t.run(async (ctx) => {
      const player = await ctx.db
        .query('players')
        .withIndex('byToken', (q) => q.eq('token', token))
        .unique();
      if (!player) throw new Error('player not found');
      const store = (
        await ctx.db
          .query('buildings')
          .withIndex('byPlayer', (q) => q.eq('playerId', player._id))
          .collect()
      ).find((building) => building.key === key);
      if (!store) throw new Error(`no ${key}`);
      await ctx.db.delete(store._id);
      return clipToStorage(ctx, player._id, Date.now());
    });
  }

  it('leaves a stock above its ceiling alone, reading after reading', async () => {
    const t = boot();
    const token = await launchedSeason(t);
    // The kit opens above the ceiling of a nation without a warehouse: the difference is the
    // player's until he spends it.
    expect(KIT.alloy).toBeGreaterThan(BASE_CAP);

    vi.advanceTimersByTime(10 * 3_600_000);
    await t.run(async (ctx) => {
      const player = await ctx.db
        .query('players')
        .withIndex('byToken', (q) => q.eq('token', token))
        .unique();
      if (!player) throw new Error('player not found');
      await settle(ctx, player._id, Date.now());
    });

    const view = await t.query(api.view.playerView, { token });
    expect(view.me.resources.alloy.cap).toBe(BASE_CAP);
    expect(view.me.resources.alloy.stock).toBe(KIT.alloy);
  });

  it('takes the surplus the instant the capacity falls, and takes it once', async () => {
    const t = boot();
    const token = await launchedSeason(t);
    await raise(t, token, 'warehouse', MOSELLE);
    const held = BASE_CAP + STORAGE_CAP_PER_LEVEL;
    await fill(t, token, 'alloy', held);

    const lost = await raze(t, token, 'warehouse');
    expect(lost.alloy).toBe(held - BASE_CAP);
    // The depot's half is untouched: what falls is the ceiling of what the warehouse carried.
    expect(lost.ammunition).toBe(0);

    const after = await t.query(api.view.playerView, { token });
    expect(after.me.resources.alloy.cap).toBe(BASE_CAP);
    expect(after.me.resources.alloy.stock).toBe(BASE_CAP);

    // Once, and not by instalments: ten hours later the reading takes nothing more.
    vi.advanceTimersByTime(10 * 3_600_000);
    const later = await t.query(api.view.playerView, { token });
    expect(later.me.resources.alloy.stock).toBe(BASE_CAP);
  });

  it('takes nothing when the capacity that falls was not holding anything', async () => {
    const t = boot();
    const token = await launchedSeason(t);
    await raise(t, token, 'warehouse', MOSELLE);
    await fill(t, token, 'alloy', BASE_CAP - 100);

    const lost = await raze(t, token, 'warehouse');
    expect(RESOURCES.every((key) => lost[key] === 0)).toBe(true);

    const after = await t.query(api.view.playerView, { token });
    expect(after.me.resources.alloy.stock).toBe(BASE_CAP - 100);
  });
});

describe('placement', () => {
  it('refuses a mine where there is no deposit', async () => {
    const t = boot();
    const token = await launchedSeason(t);
    await expect(
      t.mutation(api.constructions.start, { token, building: 'mine', regionId: ARDENNES }),
    ).rejects.toThrow('DEPOSIT_REQUIRED');
  });

  it('refuses a port away from the coast and takes it on the shore', async () => {
    const t = boot();
    const token = await launchedSeason(t);
    await promoteHq(t, token, unlockLevel('port'));
    await expect(
      t.mutation(api.constructions.start, { token, building: 'port', regionId: MOSELLE }),
    ).rejects.toThrow('NOT_COASTAL');
    await t.mutation(api.constructions.start, {
      token,
      building: 'port',
      regionId: PAS_DE_CALAIS,
    });
  });

  /**
   * **One headquarters level, one new question.** The catalogue is the shape of the season's
   * progression, so the refusal has to name the step that opens the line — a locked key that
   * says nothing is a key the player believes is broken.
   */
  it('refuses a key above the headquarters tier, and names the level it wants', async () => {
    const t = boot();
    const token = await launchedSeason(t);
    const refused: Record<string, unknown> = await t
      .mutation(api.constructions.start, { token, building: 'airfield', regionId: ARDENNES })
      .then(() => ({}))
      .catch((error: { data: Record<string, unknown> }) => error.data);

    expect(refused).toMatchObject({
      code: 'BUILDING_LOCKED',
      building: 'airfield',
      requiredLevel: unlockLevel('airfield'),
      hqLevel: HQ_LEVEL_AT_LAUNCH,
    });

    await promoteHq(t, token, unlockLevel('airfield'));
    const started = await t.mutation(api.constructions.start, {
      token,
      building: 'airfield',
      regionId: ARDENNES,
    });
    expect(started.finishesAt).toBeGreaterThan(Date.now());
  });

  /** The refusal above, taken back: the very key the tier locked is placed the minute the
   *  headquarters reaches it, and nothing else changes. */
  it('opens a tier as soon as the headquarters reaches it', async () => {
    const t = boot();
    const token = await launchedSeason(t);
    expect(unlockLevel('listening')).toBeGreaterThan(HQ_LEVEL_AT_LAUNCH);
    await promoteHq(t, token, unlockLevel('listening'));
    const started = await t.mutation(api.constructions.start, {
      token,
      building: 'listening',
      regionId: ARDENNES,
    });
    expect(started.finishesAt).toBeGreaterThan(Date.now());
  });

  /**
   * **A season may not owe what it cannot open, to any nation.** The foundation is placed by the
   * player under every other rule, the tier included, so a key above the launch level would be
   * a debt the season is born unable to pay — silently, since nothing would ever offer it. It
   * is read over the eight grounds, because the debt is national since 25/08.
   */
  it('never owes a foundation key above the headquarters it plants', () => {
    for (const nation of NATIONS) {
      for (const key of foundationOwed(nation, [])) {
        expect(unlockLevel(key)).toBeLessThanOrEqual(HQ_LEVEL_AT_LAUNCH);
      }
    }
  });

  /** The panel prices its lines off the served catalogue; it must lock them off the same one. */
  it('serves the tier of every key beside its price', async () => {
    const t = boot();
    const token = await launchedSeason(t);
    const view = await t.query(api.view.playerView, { token });
    for (const key of BUILDINGS) {
      expect(view.buildCatalog[key].unlockedAtHqLevel).toBe(unlockLevel(key));
    }
  });

  it('refuses a second headquarters', async () => {
    const t = boot();
    const token = await launchedSeason(t);
    await expect(
      t.mutation(api.constructions.start, { token, building: 'hq', regionId: MARNE }),
    ).rejects.toThrow('HQ_ALREADY_BUILT');
  });

  /** Abroad without an outpost, the refusal names the reach rather than falling silent —
   *  `movements.test.ts` holds the other half, the region an outpost does open. */
  it('refuses to build outside the nation with no outpost in reach', async () => {
    const t = boot();
    const token = await launchedSeason(t);
    await promoteHq(t, token, 2);
    await expect(
      t.mutation(api.constructions.start, { token, building: 'mine', regionId: RUHR }),
    ).rejects.toThrow('OUT_OF_OUTPOST_REACH');
  });

  it('refuses an unknown region', async () => {
    const t = boot();
    const token = await launchedSeason(t);
    await promoteHq(t, token, 2);
    await expect(
      t.mutation(api.constructions.start, { token, building: 'farm', regionId: 'XXX-1' }),
    ).rejects.toThrow('UNKNOWN_REGION');
  });
});

/**
 * **The foundation is read off the ground, not off the format** (decision of 25/08). A season
 * owes a player one extractor per resource his own country holds — and a well only where there
 * is oil, which six nations out of eight have none of. What left with the list: the foundry,
 * the warehouse and the arsenal, which are decisions and not ground.
 */
describe('the foundation a nation is owed', () => {
  it('owes France its two mines, its farm and its mill, and no well', () => {
    expect(foundationOwed('france', [])).toEqual(['mine', 'mine', 'farm', 'mill']);
  });

  /** The one ground that holds all five: the United States is the only nation whose foundation
   *  carries a well, alongside the Soviet Union. */
  it('owes the United States the same, plus the well its oil carries', () => {
    expect(foundationOwed('usa', [])).toEqual(['mine', 'mine', 'farm', 'mill', 'oilWell']);
  });

  /** Kamaishi, added on 25/08: without it Japan held no ore at all and, with looting not coded,
   *  had no road to any — an unplayable nation rather than a shaped one. */
  it('owes Japan four extractors now that its ore exists, and still no well', () => {
    expect(foundationOwed('japan', [])).toEqual(['mine', 'mine', 'farm', 'mill']);
  });

  /**
   * **The criterion, not the case.** Japan was the one nation known short; what has to hold is
   * that no playable ground lacks a dry resource — a nation is never annexed (ADR 0004), so a
   * missing deposit at home is a missing deposit for the whole season.
   */
  it('leaves no playable nation short of iron, coal, cloth or bread', () => {
    for (const nation of NATIONS) {
      const held = homeDepositsOf(nation);
      for (const deposit of DEPOSITS) {
        if (deposit === 'oil') continue; // the one deliberate gap of the map, and the fuse
        expect({ nation, deposit, held: held.has(deposit) }).toEqual({
          nation,
          deposit,
          held: true,
        });
      }
    }
  });

  /** A nation still choosing its flag owes nothing: the lobby reads a player before he has one,
   *  and an empty debt is the honest answer rather than a throw. */
  it('owes nothing to a seat that has not taken a nation', () => {
    expect(foundationOwed(null, [])).toEqual([]);
  });

  /** A key held on several regions consumes one debt each time — two mines are two placements,
   *  and the third is paid for like anything else. */
  it('lets a standing key settle one debt at a time', () => {
    expect(foundationOwed('france', ['mine'])).toEqual(['mine', 'farm', 'mill']);
    expect(foundationOwed('france', ['mine', 'mine', 'farm', 'mill'])).toEqual([]);
    expect(foundationOwed('france', ['barracks', 'foundry'])).toEqual([
      'mine',
      'mine',
      'farm',
      'mill',
    ]);
  });

  /** The foundry, the warehouse and the arsenal are paid for now — they are what a player
   *  decides to do with his ground, never what the ground carries. */
  it('owes no foundry, warehouse or arsenal to anybody', () => {
    for (const nation of NATIONS) {
      const owed = foundationOwed(nation, []);
      for (const key of ['foundry', 'warehouse', 'arsenal'] as const) {
        expect(owed).not.toContain(key);
      }
    }
  });
});

/**
 * **The foundation of a format.** What the season owes the player is placed by him — the region
 * is the one decision of the opening — and what it takes back is the price and the wait on what
 * is not one. The measure this answers: on the fifteen buildings, twelve first moves used to be
 * fatal, because the smallest set that works cost 110 alloy against a kit of 100.
 */
describe('the foundation the season owes', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /** The first free region a key may go up on, read exactly as the panel reads it. */
  const freeRegionFor = (
    view: {
      me: {
        regions: ReadonlyArray<{
          id: string;
          deposit: DepositKey | null;
          coastal: boolean;
          buildings: ReadonlyArray<unknown>;
        }>;
      };
    },
    key: BuildingKey,
  ): string | null =>
    view.me.regions.find(
      (region) =>
        region.buildings.length === 0 &&
        placementRefusal(
          key,
          region,
          {
            onRegion: null,
            taken: 0,
            slots: Number.POSITIVE_INFINITY,
            hqLevel: HQ_LEVEL_AT_LAUNCH,
          },
          unlockLevel(key),
        ) === null,
    )?.id ?? null;

  /** What France is owed: iron, coal, bread and cloth — and no well, since the country has
   *  no oil. Every test of this file plays France, so this is the reading list. */
  const FRENCH_FOUNDATION: ReadonlyArray<BuildingKey> = ['mine', 'mine', 'farm', 'mill'];

  /** Places what the season **still** owes, one key at a time, and hands back what it cost. */
  async function placeFoundation(t: ReturnType<typeof boot>, token: string) {
    const bills: Array<Record<string, number>> = [];
    // The widest ground of the eight is owed five, and the loop is a guard, not a count.
    for (let guard = 0; guard < 8; guard += 1) {
      const view = await t.query(api.view.playerView, { token });
      const key = view.me.foundation[0];
      if (key === undefined) break;
      const regionId = freeRegionFor(view, key);
      if (regionId === null) throw new Error(`nowhere to place ${key}`);
      const { cost } = await t.mutation(api.constructions.start, {
        token,
        building: key,
        regionId,
      });
      bills.push(cost as Record<string, number>);
    }
    return bills;
  }

  it('stands whole once placed, for nothing and with nothing to wait for', async () => {
    const t = boot();
    const token = await launchedSeason(t);
    const opening = await t.query(api.view.playerView, { token });
    expect(opening.me.foundation).toEqual(FRENCH_FOUNDATION);

    const bills = await placeFoundation(t, token);

    const view = await t.query(api.view.playerView, { token });
    expect(bills.every((bill) => Object.keys(bill).length === 0)).toBe(true);
    expect(view.me.foundation).toEqual([]);
    expect(view.me.construction).toBeNull();
    expect(view.me.buildings).toHaveLength(FRENCH_FOUNDATION.length + 1);
    for (const key of FRENCH_FOUNDATION) {
      expect(view.me.buildings.map((building) => building.key)).toContain(key);
    }
    // Not one unit spent, the alloy of the kit included — and it survives the ceiling of a
    // nation that has not placed its warehouse yet.
    expect(view.me.resources.alloy.stock).toBe(KIT.alloy);
  });

  /**
   * **The lock belongs to the construction, not to the placement.** Playtest of 19/08: a paid
   * mill launched before the offered mines, and "one construction at a time" then froze three
   * placements that cost nothing, wait for nothing and open no site of their own. The rule
   * still holds where it means something — the bill below.
   */
  it('places what the season owes while a paid construction runs', async () => {
    const t = boot();
    const token = await launchedSeason(t);
    await promoteHq(t, token, unlockLevel('barracks'));
    const paid = await t.mutation(api.constructions.start, {
      token,
      building: 'barracks',
      regionId: ARDENNES,
    });
    expect(paid.finishesAt).toBeGreaterThan(Date.now());
    const spent = (await t.query(api.view.playerView, { token })).me.resources.alloy.stock;

    const placed = await t.mutation(api.constructions.start, {
      token,
      building: 'farm',
      regionId: JURA,
    });
    expect(placed.cost).toEqual({});
    expect(placed.finishesAt).toBe(Date.now());

    const view = await t.query(api.view.playerView, { token });
    expect(view.me.buildings.map((building) => building.key)).toContain('farm');
    expect(view.me.resources.alloy.stock).toBe(spent);
    // The paid site is untouched: what moved is what the offered placement is allowed to skip.
    expect(view.me.construction?.key).toBe('barracks');
  });

  /**
   * The hole the global lock used to hide. Nothing reserves the ground under a running site —
   * `placementRefusal` reads the buildings standing, never the constructions — so an offered
   * placement aimed there would leave two buildings on one region once the `finish` lands.
   */
  it('refuses an offered placement on the region a construction is rising on', async () => {
    const t = boot();
    const token = await launchedSeason(t);
    await promoteHq(t, token, unlockLevel('barracks'));
    await t.mutation(api.constructions.start, { token, building: 'barracks', regionId: ARDENNES });
    await expect(
      t.mutation(api.constructions.start, { token, building: 'foundry', regionId: ARDENNES }),
    ).rejects.toThrow('REGION_TAKEN');
  });

  /**
   * **A free placement never enters the queue.** It costs nothing, waits for nothing and opens
   * no site, so it has no rank, no bill and no turn — whatever the queue behind it is doing.
   */
  it('keeps an offered placement out of the queue, however long the queue is', async () => {
    const t = boot();
    const token = await launchedSeason(t);
    await promoteHq(t, token, unlockLevel('billets'));
    await t.mutation(api.constructions.start, { token, building: 'billets', regionId: ARDENNES });
    await t.mutation(api.constructions.start, { token, building: 'depot', regionId: JURA });

    const placed = await t.mutation(api.constructions.start, {
      token,
      building: 'farm',
      regionId: MARNE,
    });
    expect(placed).toMatchObject({ cost: {}, rank: null, finishesAt: Date.now() });

    const view = await t.query(api.view.playerView, { token });
    expect(view.me.buildings.map((building) => building.key)).toContain('farm');
    // The queue is exactly what it was: the offered placement passed beside it.
    expect(view.me.construction?.key).toBe('billets');
    expect(view.me.constructionQueue.map((entry) => entry.key)).toEqual(['depot']);
  });

  /**
   * **No fatal first move.** Whatever a player builds first — and he may build anything the
   * ground takes — the foundation is still his to place afterwards. The ceiling is the only
   * refusal that can stand in the way, and it is the one the headquarters answers: hence the
   * guard rail below, which says the format leaves room for both.
   */
  it('stays reachable after any legal first placement', async () => {
    for (const first of BUILDINGS) {
      if (first === 'hq') continue; // a second headquarters is refused, and it is not a first move
      const t = boot();
      const token = await launchedSeason(t);
      const opening = await t.query(api.view.playerView, { token });
      const regionId = freeRegionFor(opening, first);
      if (regionId === null) continue; // nothing in France takes it: not a first move either

      // A bill the kit cannot cover is not a first move: the season refuses it before the
      // player can make it. Anything else the server refuses would be a hole, and fails here.
      const paid = await t
        .mutation(api.constructions.start, { token, building: first, regionId })
        .then(
          () => true,
          (refusal: { data?: { code?: string } }) => {
            if (refusal.data?.code !== 'INSUFFICIENT_RESOURCE') throw refusal;
            return false;
          },
        );
      if (!paid) continue;
      // A paid first move opens a construction, and one construction at a time is the rule —
      // so the placements below wait for it exactly as a player would.
      vi.advanceTimersByTime(24 * 3_600_000);
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      await promoteHq(t, token, MAX_HQ_LEVEL);

      const bills = await placeFoundation(t, token);
      expect(bills.every((bill) => Object.keys(bill).length === 0)).toBe(true);
      const view = await t.query(api.view.playerView, { token });
      expect(view.me.foundation).toEqual([]);
    }
  });

  /**
   * **What the season offers is not paid for in freedom** (ADR 0020 §10). The old global
   * ceiling made the launch open with *zero* free placement, and with fewer the richer the
   * ground was — the exact inversion of the distribution guard rails of ADR 0015. The
   * foundation and the headquarters are outside the count now, so the free placements at the
   * launch are `2 × 1`, whatever the deposits the nation was dealt.
   */
  it('opens on exactly two free placements at home, whatever the ground is worth', async () => {
    for (const nation of NATIONS) {
      const t = boot();
      const token = await launchedSeason(t, 168, nation);
      await placeFoundation(t, token);

      const view = await t.query(api.view.playerView, { token });
      expect(view.me.foundation).toEqual([]);
      const home = view.me.siteSlots.find((budget) => budget.site.outpostId === null)!;
      expect(home.total - home.taken).toBe(homeSlots(HQ_LEVEL_AT_LAUNCH));
      expect(home.taken).toBe(0);
    }
  });

  /**
   * **The guard rail, executable, in its new form.** No game quantity is counted in regions
   * (ADR 0015), and the one-per-region rule is what would break it: let what a nation can put
   * on its own soil reach the region count of the smallest playable nation and Natural Earth's
   * cutting starts balancing the season — Germany capped at 16 Länder where the United Kingdom
   * has 232.
   *
   * The headquarters, the widest foundation (5) and `2 × MAX_HQ_LEVEL` (10) make **exactly**
   * sixteen. It passes at zero margin: a `MAX_HQ_LEVEL` of 6, or a `PLACEMENTS_PER_HQ_LEVEL`
   * of 3, would bring it down — and for Germany alone, which is the whole reason it is written.
   */
  it('keeps a full national ground inside the region count of the smallest nation', () => {
    const countries = Object.values(regionIndex.country);
    const counts = NATIONS.map(
      (nation) => countries.filter((country) => country === ADM0_BY_NATION[nation]).length,
    );
    const smallest = Math.min(...counts);
    expect(smallest).toBe(16); // Germany, counted in Länder

    const widest = Math.max(...NATIONS.map((nation) => foundationOwed(nation, []).length));
    expect(1 + widest + homeSlots(MAX_HQ_LEVEL)).toBeLessThanOrEqual(smallest);
    expect(PLACEMENTS_PER_HQ_LEVEL * MAX_HQ_LEVEL).toBe(10);
  });
});

describe('the headquarters at launch', () => {
  it('stands on the capital at the level the season plants it, and nothing else stands', async () => {
    const t = boot();
    const token = await launchedSeason(t);
    const level = HQ_LEVEL_AT_LAUNCH;

    const view = await t.query(api.view.playerView, { token });
    expect(view.me.buildings).toEqual([
      expect.objectContaining({ key: 'hq', regionId: PARIS, level }),
    ]);
    expect(view.me.hqLevel).toBe(level);
  });

  /** The point of the whole rule: the first construction of a season is a choice again. */
  it('lets a fresh player raise his first farm without building it first', async () => {
    const t = boot();
    const token = await launchedSeason(t);
    await t.mutation(api.constructions.start, { token, building: 'farm', regionId: MARNE });
  });

  it('gives every playable nation a capital that exists, at home', () => {
    for (const nation of NATIONS) {
      const facts = regionFacts(capitalRegionOf(nation));
      expect(facts?.country).toBe(ADM0_BY_NATION[nation]);
    }
  });

  /** A capital pointing nowhere would leave a player without headquarters, hence without
   *  slots and without a buildable anything — a symptom hours away from its cause. */
  it('fails loudly on a capital code that matches no region', () => {
    const broken = Object.fromEntries(NATIONS.map((nation) => [nation, 'FRA-9999'])) as Record<
      Nation,
      string
    >;
    expect(() => capitalRegionOf('france', broken)).toThrow('UNKNOWN_CAPITAL_REGION');
  });
});

/**
 * **La file de chantier prépayée** (décision du 25/08). "One construction at a time" still holds
 * *in execution* — one head advances — but what is behind it is a queue without a ceiling, and
 * every entry of it has already settled its bill. The objection the single site answered was a
 * queue that *promised* a stacking the server refuses; a prepaid entry promises nothing.
 *
 * It is the very patron of `recruitments` (`troops.ts`), deliberately: one model of queue in the
 * game, not two. The symmetry is asserted below rather than described.
 */
describe('the construction queue', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /** Paid keys with no deposit and no coast to ask for: three sites the ground never refuses.
   *  Two of them open one level above the launch, so every test here promotes first. */
  const SITES = [
    { building: 'billets' as const, regionId: ARDENNES },
    { building: 'depot' as const, regionId: JURA },
    { building: 'barracks' as const, regionId: MEURTHE },
  ];

  const alloyOf = async (t: ReturnType<typeof boot>, token: string) =>
    (await t.query(api.view.playerView, { token })).me.resources.alloy.stock;

  it('bills every entry at the enqueue and runs them one at a time, in order', async () => {
    const t = boot();
    const token = await launchedSeason(t);
    await promoteHq(t, token, 2);
    const opening = await alloyOf(t, token);

    for (const site of SITES) await t.mutation(api.constructions.start, { token, ...site });

    // Not one stone laid, and the three bills are already settled.
    const spent = SITES.reduce(
      (total, site) => total + (buildCost(site.building, 1).alloy ?? 0),
      0,
    );
    expect(await alloyOf(t, token)).toBe(opening - spent);

    const queued = await t.query(api.view.playerView, { token });
    expect(queued.me.construction?.key).toBe('billets');
    expect(queued.me.constructionQueue.map((entry) => entry.key)).toEqual(['depot', 'barracks']);

    // Only the head is dated: the followers are dated nowhere until their turn comes.
    const dated = await t.run(async (ctx) =>
      (await ctx.db.query('constructions').collect()).filter((row) => row.finishesAt !== null),
    );
    expect(dated).toHaveLength(1);

    vi.advanceTimersByTime(buildMinutes('billets', 1) * 60_000);
    await t.finishInProgressScheduledFunctions();

    const midway = await t.query(api.view.playerView, { token });
    expect(midway.me.buildings.map((building) => building.key)).toContain('billets');
    expect(midway.me.construction?.key).toBe('depot');
    expect(midway.me.constructionQueue.map((entry) => entry.key)).toEqual(['barracks']);

    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const done = await t.query(api.view.playerView, { token });
    expect(done.me.construction).toBeNull();
    expect(done.me.constructionQueue).toEqual([]);
    for (const site of SITES) {
      expect(done.me.buildings).toContainEqual(
        expect.objectContaining({ key: site.building, regionId: site.regionId, level: 1 }),
      );
    }
  });

  /** One entry per region, standing or queued: two entries aiming at one region would leave two
   *  buildings on it, and the door that refuses it is the enqueue — never the start. */
  it('refuses a second entry on a region the queue already aims at', async () => {
    const t = boot();
    const token = await launchedSeason(t);
    await promoteHq(t, token, 2);
    await t.mutation(api.constructions.start, { token, building: 'billets', regionId: ARDENNES });
    await t.mutation(api.constructions.start, { token, building: 'depot', regionId: JURA });

    // Against the head, and against a follower alike.
    await expect(
      t.mutation(api.constructions.start, { token, building: 'barracks', regionId: ARDENNES }),
    ).rejects.toThrow('REGION_TAKEN');
    await expect(
      t.mutation(api.constructions.start, { token, building: 'barracks', regionId: JURA }),
    ).rejects.toThrow('REGION_TAKEN');
  });

  /** The queue counts against the placements of the site it aims at, or it is where a nation
   *  keeps the buildings it is not allowed to hold. */
  it('counts what is queued against the placements of the site', async () => {
    const t = boot();
    const token = await launchedSeason(t);
    await promoteHq(t, token, 2);
    await fill(t, token, 'alloy', 100_000);
    await fill(t, token, 'food', 100_000);
    const slots = homeSlots(2);

    const view = await t.query(api.view.playerView, { token });
    const free = view.me.regions.filter((region) => region.buildings.length === 0);
    // The headquarters eats no placement, so the queue may take them all and not one more.
    for (const region of free.slice(0, slots)) {
      await t.mutation(api.constructions.start, {
        token,
        building: 'billets',
        regionId: region.id,
      });
    }
    await expect(
      t.mutation(api.constructions.start, {
        token,
        building: 'billets',
        regionId: free[slots]!.id,
      }),
    ).rejects.toThrow('SITE_SLOTS_FULL');
  });

  /**
   * **The second door.** An entry is accepted against the world as it stood at the enqueue; by
   * the time its turn comes the world may have taken the right back. Nothing starts on a right
   * that no longer exists — the entry is cancelled, refunded whole, and said in the journal.
   *
   * Alloy is the reserve read here on purpose: a fresh nation stands no foundry, so nothing
   * produces any, and every unit of it that moves is a bill or a refund.
   */
  it('cancels a head whose right has gone, refunds it whole and files a notice', async () => {
    const t = boot();
    const token = await launchedSeason(t);
    await promoteHq(t, token, 2);
    const opening = await alloyOf(t, token);
    await t.mutation(api.constructions.start, { token, building: 'billets', regionId: ARDENNES });
    await t.mutation(api.constructions.start, { token, building: 'depot', regionId: JURA });

    // The placements go under the queue: the buildings below are put up without paying, and
    // what is under test is what the *start* of the follower does about it.
    const view = await t.query(api.view.playerView, { token });
    const spare = view.me.regions.filter(
      (region) => region.buildings.length === 0 && region.id !== ARDENNES && region.id !== JURA,
    );
    for (const region of spare.slice(0, homeSlots(2) - 1))
      await raise(t, token, 'depot', region.id);

    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const after = await t.query(api.view.playerView, { token });
    expect(after.me.buildings.map((building) => building.key)).toContain('billets');
    // The follower never rose, and its matter came back whole — only the head's bill stands.
    expect(after.me.constructionQueue).toEqual([]);
    expect(after.me.construction).toBeNull();
    expect(after.me.buildings.some((building) => building.regionId === JURA)).toBe(false);
    expect(await alloyOf(t, token)).toBe(opening - (buildCost('billets', 1).alloy ?? 0));

    // The head that did rise files its own line: the journal owes a player the site he built
    // as much as the one the world took back.
    expect(
      after.notices.map((notice) => [notice.kind, 'building' in notice ? notice.building : null]),
    ).toEqual(
      expect.arrayContaining([
        ['constructionFinished', 'billets'],
        ['constructionCancelled', 'depot'],
      ]),
    );
  });

  /** The head has started and has consumed the queue's time; the follower has not, and its
   *  matter is handed back untouched — the very rule `troops.cancel` writes for a batch. */
  it('refunds a follower in full and refuses to cancel the head', async () => {
    const t = boot();
    const token = await launchedSeason(t);
    await promoteHq(t, token, 2);
    await t.mutation(api.constructions.start, { token, building: 'billets', regionId: ARDENNES });
    await t.mutation(api.constructions.start, { token, building: 'depot', regionId: JURA });

    const before = await t.query(api.view.playerView, { token });
    const head = before.me.construction!;
    const follower = before.me.constructionQueue[0]!;

    await expect(
      t.mutation(api.constructions.cancel, { token, constructionId: head.id }),
    ).rejects.toThrow('CONSTRUCTION_ALREADY_STARTED');

    const { refunded } = await t.mutation(api.constructions.cancel, {
      token,
      constructionId: follower.id,
    });
    expect(refunded).toEqual(buildCost('depot', 1));

    const after = await t.query(api.view.playerView, { token });
    expect(after.me.constructionQueue).toEqual([]);
    expect(after.me.construction?.key).toBe('billets');
    for (const [resource, amount] of Object.entries(refunded) as ReadonlyArray<
      [ResourceKey, number]
    >) {
      expect(after.me.resources[resource].stock).toBe(before.me.resources[resource].stock + amount);
    }
  });

  /**
   * **One model of queue, not two.** Recruitment and construction have to debit at the enqueue
   * and refund a batch that has not started, or the day one of them drifts a player will have
   * learned a rule that only holds on one screen. The two are checked against each other here
   * rather than each against a paragraph.
   */
  it('debits and refunds exactly as the recruitment queue does', async () => {
    const t = boot();
    const token = await launchedSeason(t);
    await promoteHq(t, token, 2);
    await fill(t, token, 'alloy', 100_000);
    await fill(t, token, 'ammunition', 100_000);
    await fill(t, token, 'food', 100_000);
    await raise(t, token, 'barracks', MARNE);
    const barracks = await t.run(
      async (ctx) =>
        (await ctx.db.query('buildings').collect()).find((row) => row.key === 'barracks')!._id,
    );

    /** What one enqueue takes and what its cancellation gives back, whichever queue it was. */
    const measure = async (enqueue: () => Promise<unknown>, withdraw: () => Promise<unknown>) => {
      const before = await t.query(api.view.playerView, { token });
      await enqueue();
      const paid = await t.query(api.view.playerView, { token });
      await withdraw();
      const back = await t.query(api.view.playerView, { token });
      return {
        debited: RESOURCES.map(
          (key) => before.me.resources[key].stock - paid.me.resources[key].stock,
        ),
        restored: RESOURCES.map(
          (key) => back.me.resources[key].stock - paid.me.resources[key].stock,
        ),
      };
    };

    // Both queues get a head first, so what is measured is a *follower* on either side.
    await t.mutation(api.troops.recruit, {
      token,
      buildingId: barracks,
      role: 'infantry',
      tier: 1,
    });
    await t.mutation(api.constructions.start, { token, building: 'billets', regionId: ARDENNES });

    const troops = await measure(
      () =>
        t.mutation(api.troops.recruit, { token, buildingId: barracks, role: 'infantry', tier: 1 }),
      async () => {
        const waiting = await t.run(async (ctx) =>
          (await ctx.db.query('recruitments').collect()).find((row) => row.finishesAt === null),
        );
        await t.mutation(api.troops.cancel, { token, recruitmentId: waiting!._id });
      },
    );
    const sites = await measure(
      () => t.mutation(api.constructions.start, { token, building: 'depot', regionId: JURA }),
      async () => {
        const waiting = (await t.query(api.view.playerView, { token })).me.constructionQueue[0]!;
        await t.mutation(api.constructions.cancel, {
          token,
          constructionId: waiting.id as Id<'constructions'>,
        });
      },
    );

    // Same shape on both sides: something goes out at the enqueue, and all of it comes back.
    for (const queue of [troops, sites]) {
      expect(queue.debited.some((moved) => moved > 0)).toBe(true);
      expect(queue.restored).toEqual(queue.debited);
    }
  });
});

describe('one building per region, and a global ceiling', () => {
  it('refuses a second building on a region that already carries one', async () => {
    const t = boot();
    const token = await launchedSeason(t);
    await raise(t, token, 'warehouse', MARNE);
    await expect(
      t.mutation(api.constructions.start, { token, building: 'farm', regionId: MARNE }),
    ).rejects.toThrow('REGION_TAKEN');
    // Including the capital: the headquarters holds its region like any other building.
    await expect(
      t.mutation(api.constructions.start, { token, building: 'billets', regionId: PARIS }),
    ).rejects.toThrow('REGION_TAKEN');
  });

  /** Raising a level moves neither the number of buildings nor the number of regions held, so
   *  neither rule has anything to say about it. */
  it('lets a building already there rise a level', async () => {
    const t = boot();
    const token = await launchedSeason(t);
    await promoteHq(t, token, 2);
    await raise(t, token, 'mine', MOSELLE);
    await t.mutation(api.constructions.start, { token, building: 'mine', regionId: MOSELLE });
  });

  /**
   * A full national ground refuses a **paid** placement, and it names the level that would
   * widen it — the billets below, which nothing owes to anybody.
   */
  it('refuses a paid placement on a full national ground, and says what would lift it', async () => {
    const t = boot();
    const token = await launchedSeason(t);
    const hqLevel = unlockLevel('billets');
    await promoteHq(t, token, hqLevel);
    const slots = homeSlots(hqLevel);
    expect(slots).toBe(4);

    // The headquarters eats none of them: the placements below are the whole of the budget.
    const view = await t.query(api.view.playerView, { token });
    const free = view.me.regions
      .filter((region) => region.buildings.length === 0 && region.id !== JURA)
      .slice(0, slots);
    expect(free.length).toBe(slots);
    for (const region of free) await raise(t, token, 'depot', region.id);

    const refused: Record<string, unknown> = await t
      .mutation(api.constructions.start, { token, building: 'billets', regionId: JURA })
      .then(() => ({}))
      .catch((error: { data: Record<string, unknown> }) => error.data);
    const next = hqLevel + 1;
    expect(refused).toMatchObject({
      code: 'SITE_SLOTS_FULL',
      // The site that is full, named: the remedy of a home ground is not the remedy of a point.
      site: 'home',
      taken: slots,
      slots,
      hqLevel,
      // The remedy, in figures the screen never recomputes — both out of `homeSlots`.
      nextHqLevel: next,
      nextSlots: homeSlots(next),
    });

    // The same order goes through once the headquarters carries a wider ground.
    await promoteHq(t, token, MAX_HQ_LEVEL);
    await t.mutation(api.constructions.start, { token, building: 'billets', regionId: JURA });
  });

  /**
   * **A key the season owes is never refused by a full site** (decision of 25/08). The measured
   * case: a headquarters at 1 carried five buildings and the American ground is owed five
   * extractors, so the fifth was refused on an empty map — a debt of the season made unpayable
   * by a rule of the season. The foundation is out of the count altogether since ADR 0020 §10,
   * so the ground is filled here on purpose: the rule is what is under test, not the arithmetic
   * that once exposed it.
   */
  it('places every owed key on a national ground already full', async () => {
    const t = boot();
    const token = await launchedSeason(t, 168, 'usa');

    const owed = foundationOwed('usa', []);
    expect(owed).toEqual(['mine', 'mine', 'farm', 'mill', 'oilWell']);
    const slots = homeSlots(HQ_LEVEL_AT_LAUNCH);

    // Filled on bare American regions: a deposit region would starve the debt of ground, and
    // what has to be full here is the *count*, never the map.
    const opening = await t.query(api.view.playerView, { token });
    const bare = opening.me.regions
      .filter((region) => region.deposit === null && region.buildings.length === 0)
      .slice(0, slots);
    expect(bare.length).toBe(slots);
    for (const region of bare) await raise(t, token, 'depot', region.id);

    const full = await t.query(api.view.playerView, { token });
    const budget = (view: typeof full) =>
      view.me.siteSlots.find((held) => held.site.outpostId === null)!;
    expect(budget(full).taken).toBe(slots);

    for (let placed = 0; placed < owed.length; placed += 1) {
      const view = await t.query(api.view.playerView, { token });
      const key = view.me.foundation[0]!;
      const regionId = view.me.regions.find(
        (region) =>
          region.buildings.length === 0 &&
          placementRefusal(
            key,
            region,
            {
              onRegion: null,
              taken: 0,
              slots: Number.POSITIVE_INFINITY,
              hqLevel: view.me.hqLevel,
            },
            unlockLevel(key),
          ) === null,
      )?.id;
      if (regionId === undefined) throw new Error(`nowhere to place ${key}`);
      const { cost } = await t.mutation(api.constructions.start, {
        token,
        building: key,
        regionId,
      });
      expect(cost).toEqual({});
    }

    const done = await t.query(api.view.playerView, { token });
    expect(done.me.foundation).toEqual([]);
    /**
     * **The foundation costs nothing in freedom either.** It stands, and the budget has not
     * moved: what the season offers is outside the count, for good — the whole correction of
     * ADR 0020 §10.
     */
    expect(done.me.buildings).toHaveLength(1 + slots + owed.length);
    expect(budget(done).taken).toBe(slots);
    expect(budget(done).total).toBe(slots);
  });
});

/**
 * **Un site, ce n'est plus la nation** (ADR 0020 §10) : le sol national porte deux emplacements
 * par niveau de QG, un avant-poste porte le sien, et remplir l'un ne ferme pas l'autre.
 */
describe('the placements a site carries', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /** Puts an outpost of the player on the map, at a point, at the level asked. */
  async function found(
    t: ReturnType<typeof boot>,
    token: string,
    point: { lon: number; lat: number },
    level = 1,
  ): Promise<Id<'outposts'>> {
    return t.run(async (ctx) => {
      const player = await ctx.db
        .query('players')
        .withIndex('byToken', (q) => q.eq('token', token))
        .unique();
      if (!player) throw new Error('player not found');
      return ctx.db.insert('outposts', {
        seasonId: player.seasonId,
        playerId: player._id,
        point,
        hostCountry: 'DZA',
        level,
        specialization: 'relay',
        foundedAt: Date.now(),
        disabledUntil: null,
        immuneUntil: null,
      });
    });
  }

  /** Ghardaïa, in the Algerian Sahara: five regions inside `OUTPOST_REACH_KM` and no French
   *  ground anywhere near, so what the point carries is its own and the home budget never
   *  lends it a placement. */
  const GHARDAIA = { lon: 3.08, lat: 31.49 };
  const NEAR_GHARDAIA = 'DZA-2192'; // Ghardaïa itself
  const ALSO_NEAR = 'DZA-2190'; // El Bayadh, 205 km away

  const budgetOf = (
    view: {
      me: {
        siteSlots: ReadonlyArray<{
          site: { outpostId: string | null };
          taken: number;
          total: number;
        }>;
      };
    },
    outpostId: string | null,
  ) => view.me.siteSlots.find((held) => held.site.outpostId === outpostId);

  it('carries its own level at an outpost, and two per headquarters level at home', async () => {
    const t = boot();
    const token = await launchedSeason(t);
    const one = await found(t, token, GHARDAIA, 1);
    const three = await found(t, token, { lon: 45, lat: 25 }, 3);

    const view = await t.query(api.view.playerView, { token });
    expect(budgetOf(view, null)?.total).toBe(homeSlots(HQ_LEVEL_AT_LAUNCH));
    expect(budgetOf(view, one)?.total).toBe(1);
    expect(budgetOf(view, three)?.total).toBe(3);
  });

  /** The whole point of a local budget: a nation whose home ground is full is not a nation
   *  that has stopped building — it is a nation that has to go out. */
  it('refuses on the site that is full and accepts on the next one', async () => {
    const t = boot();
    const token = await launchedSeason(t);
    const outpostId = await found(t, token, GHARDAIA, 1);
    await fill(t, token, 'alloy', 100_000);
    await fill(t, token, 'food', 100_000);

    const opening = await t.query(api.view.playerView, { token });
    const home = opening.me.regions
      .filter((region) => region.buildings.length === 0)
      .slice(0, homeSlots(HQ_LEVEL_AT_LAUNCH));
    for (const region of home) await raise(t, token, 'depot', region.id);

    const filled = await t.query(api.view.playerView, { token });
    const spare = filled.me.regions.find((region) => region.buildings.length === 0)!;
    await expect(
      t.mutation(api.constructions.start, { token, building: 'depot', regionId: spare.id }),
    ).rejects.toThrow('SITE_SLOTS_FULL');

    // The Saharan point carries one placement of its own, and the full home ground is no part
    // of that reading.
    await t.mutation(api.constructions.start, {
      token,
      building: 'depot',
      regionId: NEAR_GHARDAIA,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const after = await t.query(api.view.playerView, { token });
    expect(budgetOf(after, outpostId)?.taken).toBe(1);
    // And that point is full in its turn: one level, one placement.
    await expect(
      t.mutation(api.constructions.start, { token, building: 'depot', regionId: ALSO_NEAR }),
    ).rejects.toThrow('SITE_SLOTS_FULL');
  });

  /**
   * **An outpost destroyed leaves its buildings standing and its anchor dead** (ADR 0020 §10).
   * Nothing is re-hung anywhere — that would move an old placement into a budget its owner
   * never spent — and nothing more goes up on the ground it used to cover.
   */
  it('accepts no placement once the outpost that carried the ground is gone', async () => {
    const t = boot();
    const token = await launchedSeason(t);
    const outpostId = await found(t, token, GHARDAIA, 3);
    await fill(t, token, 'alloy', 100_000);
    await fill(t, token, 'food', 100_000);
    await t.mutation(api.constructions.start, {
      token,
      building: 'depot',
      regionId: NEAR_GHARDAIA,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    await t.run(async (ctx) => ctx.db.delete(outpostId));

    const after = await t.query(api.view.playerView, { token });
    expect(after.me.buildings.some((building) => building.regionId === NEAR_GHARDAIA)).toBe(true);
    expect(after.me.siteSlots.map((held) => held.site.outpostId)).toEqual([null]);
    await expect(
      t.mutation(api.constructions.start, { token, building: 'depot', regionId: ALSO_NEAR }),
    ).rejects.toThrow('OUT_OF_OUTPOST_REACH');
  });

  /**
   * **Le frein de l'expansion est l'entretien, pas un plafond** (ADR 0020 §10) : chaque point
   * débite au fil de l'heure, à proportion de son niveau, et un joueur qui perd des points voit
   * sa facture baisser.
   */
  it('debits the national stock by the level of every outpost held', async () => {
    const t = boot();
    const token = await launchedSeason(t);
    const before = await t.query(api.view.playerView, { token });
    expect(before.me.upkeep.outposts).toBe(0);

    await found(t, token, GHARDAIA, 3);
    const after = await t.query(api.view.playerView, { token });
    expect(after.me.upkeep.outposts).toBe(1);
    expect(after.me.upkeep.outpostFoodPerHour).toBe(
      3 * (OUTPOST_UPKEEP_PER_HOUR_PER_LEVEL.food ?? 0),
    );
    expect(after.me.upkeep.outpostCoalPerHour).toBe(
      3 * (OUTPOST_UPKEEP_PER_HOUR_PER_LEVEL.coal ?? 0),
    );

    // The bill lands in the rate the stocks are settled with, and nowhere else: it is a
    // negative term of the accrual, exactly like the army's (`economyOf`).
    expect(after.me.resources.coal.ratePerHour).toBe(
      before.me.resources.coal.ratePerHour - (after.me.upkeep.outpostCoalPerHour ?? 0),
    );
  });
});

describe('the arsenal is commanded', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const chainOf = <T extends { by: string }>(
    view: { me: { chains: ReadonlyArray<T> } },
    key: string,
  ): T => {
    const chain = view.me.chains.find((candidate) => candidate.by === key);
    if (!chain) throw new Error(`no chain served for ${key}`);
    return chain;
  };

  /**
   * The defect the rule exists to correct, and nobody could see it: an arsenal at level 3 took
   * 216 alloy a day from a player saving 430 for a carrier, with no way to stop it.
   */
  it('takes nothing until it is told to, and says so rather than reading as broken', async () => {
    const t = boot();
    const token = await launchedSeason(t);
    await raise(t, token, 'arsenal', MOSELLE);
    vi.advanceTimersByTime(20 * 3_600_000);

    const view = await t.query(api.view.playerView, { token });
    expect(view.me.resources.alloy.stock).toBe(KIT.alloy);
    expect(view.me.resources.ammunition.stock).toBe(KIT.ammunition);
    expect(chainOf(view, 'arsenal')).toMatchObject({ state: 'idle', commanded: true, order: null });
  });

  /** The foundry keeps running on its own: its inputs are spent nowhere else. */
  it('leaves the uncommanded chains alone', async () => {
    const t = boot();
    const token = await launchedSeason(t);
    await raise(t, token, 'foundry', MOSELLE);
    await fill(t, token, 'alloy', 0);
    vi.advanceTimersByTime(10 * 3_600_000);

    const view = await t.query(api.view.playerView, { token });
    expect(chainOf(view, 'foundry')).toMatchObject({ commanded: false });
    expect(view.me.resources.alloy.stock).toBeGreaterThan(0);
  });

  it('converts exactly the lot, once, and then falls silent again', async () => {
    const t = boot();
    const token = await launchedSeason(t);
    await raise(t, token, 'arsenal', MOSELLE);
    await t.mutation(api.industry.order, { token, chain: 'arsenal', quantity: 12 });

    // Four hours at three an hour would make twelve; twenty hours make twelve all the same.
    vi.advanceTimersByTime(20 * 3_600_000);
    const view = await t.query(api.view.playerView, { token });
    expect(view.me.resources.ammunition.stock).toBe(KIT.ammunition + 12);
    expect(view.me.resources.alloy.stock).toBe(KIT.alloy - 12);
    expect(chainOf(view, 'arsenal')).toMatchObject({
      state: 'idle',
      order: { ordered: 12, produced: 12 },
    });
  });

  /**
   * The figure the brief calls false: "3 / h" printed beside "à sec" is the interface telling
   * a player he is producing when he is not.
   */
  it('serves the real rate, with the nominal beside it', async () => {
    const t = boot();
    const token = await launchedSeason(t);
    await raise(t, token, 'arsenal', MOSELLE);

    const idle = chainOf(await t.query(api.view.playerView, { token }), 'arsenal');
    expect(idle).toMatchObject({ perHour: 0, nominalPerHour: 3 });

    await t.mutation(api.industry.order, { token, chain: 'arsenal', quantity: 60 });
    const running = chainOf(await t.query(api.view.playerView, { token }), 'arsenal');
    expect(running).toMatchObject({ perHour: 3, nominalPerHour: 3, state: 'running' });
  });

  /** Nothing is taken in advance, so dropping a lot returns nothing — and owes nothing. */
  it('leaves the unconverted matter where it was when a lot is dropped', async () => {
    const t = boot();
    const token = await launchedSeason(t);
    await raise(t, token, 'arsenal', MOSELLE);
    await t.mutation(api.industry.order, { token, chain: 'arsenal', quantity: 90 });
    vi.advanceTimersByTime(2 * 3_600_000);
    await t.mutation(api.industry.cancelOrder, { token, chain: 'arsenal' });
    vi.advanceTimersByTime(20 * 3_600_000);

    const view = await t.query(api.view.playerView, { token });
    // Six made in two hours, and not one more after the drop.
    expect(view.me.resources.ammunition.stock).toBe(KIT.ammunition + 6);
    expect(view.me.resources.alloy.stock).toBe(KIT.alloy - 6);
    expect(chainOf(view, 'arsenal')).toMatchObject({ state: 'idle', order: null });
  });

  it('refuses a lot the input reserve cannot cover, and names the ceiling', async () => {
    const t = boot();
    const token = await launchedSeason(t);
    await raise(t, token, 'arsenal', MOSELLE);

    await expect(
      t.mutation(api.industry.order, { token, chain: 'arsenal', quantity: KIT.alloy + 1 }),
    ).rejects.toThrow(/ORDER_ABOVE_RESERVE/);

    const view = await t.query(api.view.playerView, { token });
    expect(chainOf(view, 'arsenal').maxOrder).toBe(KIT.alloy);
  });

  it('refuses to command a chain that runs on its own', async () => {
    const t = boot();
    const token = await launchedSeason(t);
    await raise(t, token, 'foundry', MOSELLE);

    await expect(
      t.mutation(api.industry.order, { token, chain: 'foundry', quantity: 10 }),
    ).rejects.toThrow(/CHAIN_NOT_COMMANDED/);
  });
});

/**
 * The map that turns a shortfall into a sentence — "jamais : aucune mine de charbon". It has
 * to name the building the two production tables actually give, or the advice sends the player
 * to raise something that yields nothing.
 */
describe('what produces what', () => {
  it('names, for each resource, the building the tables say makes it', () => {
    for (const [resource, building] of Object.entries(PRODUCER_OF) as ReadonlyArray<
      [ResourceKey, BuildingKey]
    >) {
      const deposit = DEPOSITS.find((key) => key === resource);
      if (deposit !== undefined) {
        expect(EXPLOITED_DEPOSITS[building]).toContain(deposit);
      } else {
        expect(CHAINS[building as keyof typeof CHAINS].output).toBe(resource);
      }
    }
  });
});
