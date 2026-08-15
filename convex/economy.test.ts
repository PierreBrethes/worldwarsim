import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './_generated/api';
import { NATIONS, type BuildingKey, type Nation } from '../src/domain/ids';
import { ADM0_BY_NATION } from '../src/domain/nations';
import {
  BASE_CAP,
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
