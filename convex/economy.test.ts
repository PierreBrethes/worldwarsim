import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './_generated/api';
import { DEPOSITS, NATIONS, type BuildingKey, type Nation, type ResourceKey } from '../src/domain/ids';
import { ADM0_BY_NATION } from '../src/domain/nations';
import { EXPLOITED_DEPOSITS, PRODUCER_OF } from '../src/domain/economy';
import {
  BASE_CAP,
  CHAINS,
  EXTRACTION_PER_HOUR,
  MAX_HQ_LEVEL,
  STARTING_STOCK,
  STORAGE_CAP_PER_LEVEL,
  buildingCap,
} from './constants';
import { capitalRegionOf, regionFacts } from './regions';
import regionIndex from '../public/region-index.json';
import schema from './schema';
import { modules } from './test.setup';

const boot = () => convexTest(schema, modules);

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
async function fill(
  t: ReturnType<typeof boot>,
  token: string,
  key: ResourceKey,
  stock: number,
) {
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
    expect(view.me.resources.food.stock).toBe(STARTING_STOCK.food + 2 * EXTRACTION_PER_HOUR.food);
    // The farm sits on food; it produces nothing of what the region does not hold.
    expect(view.me.resources.coal.stock).toBe(STARTING_STOCK.coal);
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
   */
  it('converts on its own and stops when an input runs out', async () => {
    const t = boot();
    const token = await launchedSeason(t);
    await raise(t, token, 'foundry', MOSELLE);
    vi.advanceTimersByTime(10 * 3_600_000);

    const view = await t.query(api.view.playerView, { token });
    expect(view.me.resources.ore.stock).toBe(0);
    expect(view.me.resources.alloy.stock).toBe(STARTING_STOCK.alloy + STARTING_STOCK.ore / 2);
    expect(view.me.resources.coal.stock).toBe(STARTING_STOCK.coal - STARTING_STOCK.ore / 2);
  });

  it('keeps going as long as a mine feeds it', async () => {
    const t = boot();
    const token = await launchedSeason(t);
    // One building per region (ADR 0015): the second mine digs its coal on the shore, since
    // the foundry already holds Moselle.
    await raise(t, token, 'foundry', MOSELLE);
    await raise(t, token, 'mine', MEURTHE);
    await raise(t, token, 'mine', PAS_DE_CALAIS);
    vi.advanceTimersByTime(10 * 3_600_000);

    const view = await t.query(api.view.playerView, { token });
    expect(view.me.resources.alloy.stock).toBeGreaterThan(
      STARTING_STOCK.alloy + STARTING_STOCK.ore / 2,
    );
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
    expect(view.me.chains.map((chain) => chain.by)).toEqual(['foundry', 'arsenal', 'quartermaster']);
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
      { key: 'farm', regionId: MARNE, level: 1, deposit: 'food', perHour: EXTRACTION_PER_HOUR.food },
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
    vi.advanceTimersByTime(20 * 3_600_000);
    await t.mutation(api.constructions.start, { token, building: 'farm', regionId: MARNE });

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
    await promoteHq(t, token, 2);
    await expect(
      t.mutation(api.constructions.start, { token, building: 'port', regionId: MOSELLE }),
    ).rejects.toThrow('NOT_COASTAL');
    await t.mutation(api.constructions.start, {
      token,
      building: 'port',
      regionId: PAS_DE_CALAIS,
    });
  });

  it('refuses a second headquarters', async () => {
    const t = boot();
    const token = await launchedSeason(t);
    await expect(
      t.mutation(api.constructions.start, { token, building: 'hq', regionId: MARNE }),
    ).rejects.toThrow('HQ_ALREADY_BUILT');
  });

  /** Outposts carry no region yet, so nothing can be built abroad at all — the rule is closed,
   *  not approximated. */
  it('refuses to build outside the nation', async () => {
    const t = boot();
    const token = await launchedSeason(t);
    await promoteHq(t, token, 2);
    await expect(
      t.mutation(api.constructions.start, { token, building: 'mine', regionId: RUHR }),
    ).rejects.toThrow('REGION_NOT_HOME');
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

describe('the headquarters at launch', () => {
  it('stands at level 1 on the capital, and nothing else stands at all', async () => {
    const t = boot();
    const token = await launchedSeason(t);

    const view = await t.query(api.view.playerView, { token });
    expect(view.me.buildings).toEqual([
      expect.objectContaining({ key: 'hq', regionId: PARIS, level: 1 }),
    ]);
    expect(view.me.hqLevel).toBe(1);
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
    const broken = Object.fromEntries(
      NATIONS.map((nation) => [nation, 'FRA-9999']),
    ) as Record<Nation, string>;
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

  it('refuses past the ceiling the headquarters carries, and says so differently', async () => {
    const t = boot();
    const token = await launchedSeason(t);
    // The headquarters makes one; four more fill a level-1 ceiling of five.
    await raise(t, token, 'warehouse', MARNE);
    await raise(t, token, 'depot', MEURTHE);
    await raise(t, token, 'listening', ARDENNES);
    await raise(t, token, 'billets', MEUSE);
    expect(buildingCap(1)).toBe(5);

    await expect(
      t.mutation(api.constructions.start, { token, building: 'farm', regionId: JURA }),
    ).rejects.toThrow('BUILDING_CAP_REACHED');

    // The same order goes through once the headquarters carries a wider one.
    await promoteHq(t, token, 2);
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
    expect(view.me.resources.alloy.stock).toBe(STARTING_STOCK.alloy);
    expect(view.me.resources.ammunition.stock).toBe(STARTING_STOCK.ammunition);
    expect(chainOf(view, 'arsenal')).toMatchObject({ state: 'idle', commanded: true, order: null });
  });

  /** The foundry keeps running on its own: its inputs are spent nowhere else. */
  it('leaves the uncommanded chains alone', async () => {
    const t = boot();
    const token = await launchedSeason(t);
    await raise(t, token, 'foundry', MOSELLE);
    vi.advanceTimersByTime(10 * 3_600_000);

    const view = await t.query(api.view.playerView, { token });
    expect(chainOf(view, 'foundry')).toMatchObject({ commanded: false });
    expect(view.me.resources.alloy.stock).toBeGreaterThan(STARTING_STOCK.alloy);
  });

  it('converts exactly the lot, once, and then falls silent again', async () => {
    const t = boot();
    const token = await launchedSeason(t);
    await raise(t, token, 'arsenal', MOSELLE);
    await t.mutation(api.industry.order, { token, chain: 'arsenal', quantity: 12 });

    // Four hours at three an hour would make twelve; twenty hours make twelve all the same.
    vi.advanceTimersByTime(20 * 3_600_000);
    const view = await t.query(api.view.playerView, { token });
    expect(view.me.resources.ammunition.stock).toBe(STARTING_STOCK.ammunition + 12);
    expect(view.me.resources.alloy.stock).toBe(STARTING_STOCK.alloy - 12);
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
    expect(view.me.resources.ammunition.stock).toBe(STARTING_STOCK.ammunition + 6);
    expect(view.me.resources.alloy.stock).toBe(STARTING_STOCK.alloy - 6);
    expect(chainOf(view, 'arsenal')).toMatchObject({ state: 'idle', order: null });
  });

  it('refuses a lot the input reserve cannot cover, and names the ceiling', async () => {
    const t = boot();
    const token = await launchedSeason(t);
    await raise(t, token, 'arsenal', MOSELLE);

    await expect(
      t.mutation(api.industry.order, { token, chain: 'arsenal', quantity: STARTING_STOCK.alloy + 1 }),
    ).rejects.toThrow(/ORDER_ABOVE_RESERVE/);

    const view = await t.query(api.view.playerView, { token });
    expect(chainOf(view, 'arsenal').maxOrder).toBe(STARTING_STOCK.alloy);
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
