import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './_generated/api';
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
  MAX_HQ_LEVEL,
  SEASON_FORMATS,
  STORAGE_CAP_PER_LEVEL,
  UNLOCKED_AT,
  buildingCap,
  startingStock,
} from './constants';
import { capitalRegionOf, regionFacts } from './regions';
import { clipToStorage, settle } from './resources';
import regionIndex from '../public/region-index.json';
import schema from './schema';
import { modules } from './test.setup';

const boot = () => convexTest(schema, modules);

/** Every test here launches a 48-hour season: the skirmish kit is the one it hands out. */
const KIT = startingStock('skirmish');

/** French regions, straight out of `deposits.json` and `region-index.json`. */
const MARNE = 'FRA-5323'; //  food
const MOSELLE = 'FRA-5328'; // coal, inland
const MEURTHE = 'FRA-5325'; // ore
const PAS_DE_CALAIS = 'FRA-5334'; // coal, coastal
const ARDENNES = 'FRA-5268'; // nothing at all
const MEUSE = 'FRA-5326'; // nothing at all
const JURA = 'FRA-5312'; // food
const PARIS = 'FRA-5333'; // the capital, where the headquarters already stands
const RUHR = 'DEU-1572'; // German

async function launchedSeason(t: ReturnType<typeof boot>) {
  const { code, token } = await t.mutation(api.seasons.create, {
    nickname: 'Pierre',
    durationHours: 48,
    compensation: 0.5,
  });
  const { token: guest } = await t.mutation(api.seasons.join, { code, nickname: 'Léa' });
  await t.mutation(api.players.reserveNation, { token, nation: 'france' });
  await t.mutation(api.players.chooseDoctrine, { token, doctrine: 'hegemony' });
  await t.mutation(api.players.declareReady, { token, ready: true });
  await t.mutation(api.players.reserveNation, { token: guest, nation: 'ussr' });
  await t.mutation(api.players.chooseDoctrine, { token: guest, doctrine: 'domination' });
  await t.mutation(api.players.declareReady, { token: guest, ready: true });
  await t.mutation(api.seasons.launch, { token });
  return token;
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
    await ctx.db.insert('buildings', { playerId: player._id, key, regionId, level });
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
   * The alloy is emptied first, and that is not a convenience: the skirmish kit opens above
   * what a nation without a warehouse can store, so a foundry read at the launch reports
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
    // The skirmish kit opens at 1000 alloy for a nation whose ceiling is 400: the difference is
    // the player's until he spends it.
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
    // A port is projection, so it waits for the third tier of the catalogue (`UNLOCKED_AT`).
    await promoteHq(t, token, UNLOCKED_AT.port);
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
      requiredLevel: UNLOCKED_AT.airfield,
      hqLevel: SEASON_FORMATS.skirmish.hqLevelAtLaunch,
    });

    await promoteHq(t, token, UNLOCKED_AT.airfield);
    const started = await t.mutation(api.constructions.start, {
      token,
      building: 'airfield',
      regionId: ARDENNES,
    });
    expect(started.finishesAt).toBeGreaterThan(Date.now());
  });

  /**
   * The listening post is the second tier and a skirmish launches on it: the same key is a
   * refusal in a campaign's first hour and a placement in a skirmish's.
   */
  it('opens a tier as soon as the headquarters reaches it', async () => {
    const t = boot();
    const token = await launchedSeason(t);
    expect(UNLOCKED_AT.listening).toBe(SEASON_FORMATS.skirmish.hqLevelAtLaunch);
    const started = await t.mutation(api.constructions.start, {
      token,
      building: 'listening',
      regionId: ARDENNES,
    });
    expect(started.finishesAt).toBeGreaterThan(Date.now());
  });

  /**
   * **A format may not owe what it cannot open.** The foundation is placed by the player under
   * every other rule, the tier included, so a key above the launch level would be a debt the
   * season is born unable to pay — silently, since nothing would ever offer it.
   */
  it('never owes a foundation key above the headquarters its format plants', () => {
    for (const spec of Object.values(SEASON_FORMATS)) {
      for (const key of spec.foundation) {
        expect(UNLOCKED_AT[key]).toBeLessThanOrEqual(spec.hqLevelAtLaunch);
      }
    }
  });

  /** The panel prices its lines off the served catalogue; it must lock them off the same one. */
  it('serves the tier of every key beside its price', async () => {
    const t = boot();
    const token = await launchedSeason(t);
    const view = await t.query(api.view.playerView, { token });
    for (const key of BUILDINGS) {
      expect(view.buildCatalog[key].unlockedAtHqLevel).toBe(UNLOCKED_AT[key]);
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
            standing: 0,
            cap: Number.POSITIVE_INFINITY,
            hqLevel: SEASON_FORMATS.skirmish.hqLevelAtLaunch,
          },
          UNLOCKED_AT[key],
        ) === null,
    )?.id ?? null;

  /** Places what the season **still** owes, one key at a time, and hands back what it cost. */
  async function placeFoundation(t: ReturnType<typeof boot>, token: string) {
    const bills: Array<Record<string, number>> = [];
    for (let guard = 0; guard < SEASON_FORMATS.skirmish.foundation.length; guard += 1) {
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
    expect(opening.me.foundation).toEqual(SEASON_FORMATS.skirmish.foundation);

    const bills = await placeFoundation(t, token);

    const view = await t.query(api.view.playerView, { token });
    expect(bills.every((bill) => Object.keys(bill).length === 0)).toBe(true);
    expect(view.me.foundation).toEqual([]);
    expect(view.me.construction).toBeNull();
    expect(view.me.buildings).toHaveLength(SEASON_FORMATS.skirmish.foundation.length + 1);
    for (const key of SEASON_FORMATS.skirmish.foundation) {
      expect(view.me.buildings.map((building) => building.key)).toContain(key);
    }
    // Not one unit spent, the alloy of the kit included — and it survives the ceiling of a
    // nation that has not placed its warehouse yet.
    expect(view.me.resources.alloy.stock).toBe(KIT.alloy);
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
      await promoteHq(t, token, SEASON_FORMATS.skirmish.maxHqLevel);

      const bills = await placeFoundation(t, token);
      expect(bills.every((bill) => Object.keys(bill).length === 0)).toBe(true);
      const view = await t.query(api.view.playerView, { token });
      expect(view.me.foundation).toEqual([]);
    }
  });

  /**
   * The guard rail behind the test above, said as a number: the headquarters of a format has
   * to carry its foundation, itself, **and** at least one building the player chose. Without
   * that margin, a single first move would strand the foundation behind a ceiling.
   */
  it('leaves every format room for its foundation, its headquarters and one free choice', () => {
    for (const spec of Object.values(SEASON_FORMATS)) {
      expect(buildingCap(spec.maxHqLevel)).toBeGreaterThanOrEqual(spec.foundation.length + 2);
    }
  });
});

describe('the headquarters at launch', () => {
  it('stands on the capital at the level its format plants it, and nothing else stands', async () => {
    const t = boot();
    const token = await launchedSeason(t);
    const level = SEASON_FORMATS.skirmish.hqLevelAtLaunch;

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
   * The ceiling is the one refusal the foundation does not lift: a free placement buys the
   * price and the wait, never a place on the map. Hence the farm below — owed by the skirmish
   * foundation, and refused all the same.
   */
  it('refuses past the ceiling the headquarters carries, and says so differently', async () => {
    const t = boot();
    const token = await launchedSeason(t);
    // The headquarters makes one; six more fill the ceiling of a headquarters at 2.
    await raise(t, token, 'warehouse', MARNE);
    await raise(t, token, 'depot', MEURTHE);
    await raise(t, token, 'listening', ARDENNES);
    await raise(t, token, 'billets', MEUSE);
    await raise(t, token, 'mill', MOSELLE);
    await raise(t, token, 'quartermaster', PAS_DE_CALAIS);
    expect(buildingCap(SEASON_FORMATS.skirmish.hqLevelAtLaunch)).toBe(7);

    await expect(
      t.mutation(api.constructions.start, { token, building: 'farm', regionId: JURA }),
    ).rejects.toThrow('BUILDING_CAP_REACHED');

    // The same order goes through once the headquarters carries a wider one.
    await promoteHq(t, token, 3);
    await t.mutation(api.constructions.start, { token, building: 'farm', regionId: JURA });
  });

  /**
   * **The guard rail, executable.** No game quantity is counted in regions (ADR 0015), and the
   * ceiling is what makes that true: let it reach the region count of the smallest playable
   * nation and Natural Earth's cutting starts balancing the season — Germany capped at 16
   * where the United Kingdom is capped at 232.
   */
  it('stays strictly under the region count of the smallest playable nation', () => {
    const countries = Object.values(regionIndex.country);
    const counts = NATIONS.map(
      (nation) => countries.filter((country) => country === ADM0_BY_NATION[nation]).length,
    );
    const smallest = Math.min(...counts);
    expect(smallest).toBe(16); // Germany, counted in Länder
    expect(buildingCap(MAX_HQ_LEVEL)).toBeLessThan(smallest);
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
