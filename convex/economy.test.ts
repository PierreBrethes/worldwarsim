import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, internal } from './_generated/api';
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
  OUTPOST_MAX_LEVEL,
  outpostReachKm,
  PLACEMENTS_PER_HQ_LEVEL,
  STORAGE_CAP_PER_LEVEL,
  buildCost,
  buildMinutes,
  homeSlots,
  nominalStrength,
  unlockLevel,
} from './constants';
import {
  capitalRegionOf,
  foundationOwed,
  homeDepositsOf,
  pointOfBuilding,
  regionFacts,
} from './regions';
import { clipToStorage, settle } from './resources';
import regionIndex from '../public/region-index.json';
import schema from './schema';
import { modules } from './test.setup';
import { foundSeat, joinSeat, placeHq, seatIn } from './seats.fixture';
import type { Seat } from './seats.fixture';

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

/** A shore cell of the Pas-de-Calais, as `isCoastCell` reads the routing grid — land with the
 *  Channel beside it, and French ground (`hostAtPoint`). */
const CALAIS_SHORE = { lon: 2.31, lat: 50.63 };
/** The same, on the other side of the Channel: a legal coast, the wrong country. */
const ENGLISH_SHORE = { lon: -1.95, lat: 50.85 };
const MOSELLE_POINT = regionFacts(MOSELLE)!.point;

/**
 * **Une saison lancée, et rien de posé** — l'état réel d'un joueur à la première minute depuis la
 * décision 1b du 13/09. Tout ce qui mesure une économie passe par `launchedSeason`, qui pose le
 * quartier général aussitôt ; ce qui mesure la **pose elle-même** part d'ici.
 */
async function launchedWithoutHq(
  t: ReturnType<typeof boot>,
  durationHours: 48 | 168 = 48,
  nation = 'france',
) {
  const { seat, code } = await foundSeat(t, 'Pierre', durationHours, 0.5);
  const guest = await joinSeat(t, code, 'Léa');
  await t.mutation(api.players.reserveNation, { ...seat, nation });
  await t.mutation(api.players.declareReady, { ...seat, ready: true });
  // Two seats, two flags: the guest takes anything but the one under test.
  await t.mutation(api.players.reserveNation, {
    ...guest,
    nation: nation === 'ussr' ? 'japan' : 'ussr',
  });
  await t.mutation(api.players.declareReady, { ...guest, ready: true });
  await t.mutation(api.seasons.launch, seat);
  return seat;
}

/**
 * La même, quartier général posé sur la capitale — là où la saison le plantait jusqu'au 13/09.
 * Rien d'autre ne se bâtit avant lui (`HQ_FIRST`), donc toute suite qui mesure autre chose le
 * veut debout, et au même endroit qu'avant pour que ses chiffres disent la même chose.
 */
async function launchedSeason(
  t: ReturnType<typeof boot>,
  durationHours: 48 | 168 = 48,
  nation = 'france',
) {
  const seat = await launchedWithoutHq(t, durationHours, nation);
  await placeHq(t, seat);
  await disbandTheGift(t, seat);
  return seat;
}

/**
 * **The company the launch hands out, taken back** (`seasons.endow`, 25/08). What this file
 * measures is an economy, and the endowment eats: cleared at the door, so a figure here still
 * says what the ground produces. The gift itself is under test in `off-season.test.ts`.
 */
async function disbandTheGift(t: ReturnType<typeof boot>, seat: Seat) {
  await t.run(async (ctx) => {
    const player = await seatIn(ctx, seat);
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
  seat: Seat,
  key: BuildingKey,
  regionId: string,
  level = 1,
) {
  await t.run(async (ctx) => {
    const player = await seatIn(ctx, seat);
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
async function fill(t: ReturnType<typeof boot>, seat: Seat, key: ResourceKey, stock: number) {
  await t.run(async (ctx) => {
    const player = await seatIn(ctx, seat);
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
async function promoteHq(t: ReturnType<typeof boot>, seat: Seat, level: number) {
  await t.run(async (ctx) => {
    const player = await seatIn(ctx, seat);
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
    const seat = await launchedSeason(t);
    await raise(t, seat, 'farm', MARNE);
    vi.advanceTimersByTime(2 * 3_600_000);

    const view = await t.query(api.view.playerView, seat);
    expect(view.me.resources.food.ratePerHour).toBe(EXTRACTION_PER_HOUR.food);
    expect(view.me.resources.food.stock).toBe(KIT.food + 2 * EXTRACTION_PER_HOUR.food);
    // The farm sits on food; it produces nothing of what the region does not hold.
    expect(view.me.resources.coal.stock).toBe(KIT.coal);
  });

  it('gives the mine the resource of its region — coal here, ore there', async () => {
    const t = boot();
    const seat = await launchedSeason(t);
    await raise(t, seat, 'mine', MOSELLE);
    await raise(t, seat, 'mine', MEURTHE);
    vi.advanceTimersByTime(3_600_000);

    const view = await t.query(api.view.playerView, seat);
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
    const seat = await launchedSeason(t);
    await raise(t, seat, 'foundry', MOSELLE);
    await fill(t, seat, 'alloy', 0);
    vi.advanceTimersByTime(10 * 3_600_000);

    const view = await t.query(api.view.playerView, seat);
    expect(view.me.resources.ore.stock).toBe(0);
    expect(view.me.resources.alloy.stock).toBe(KIT.ore / 2);
    expect(view.me.resources.coal.stock).toBe(KIT.coal - KIT.ore / 2);
  });

  it('keeps going as long as a mine feeds it', async () => {
    const t = boot();
    const seat = await launchedSeason(t);
    // One building per region (ADR 0015): the second mine digs its coal on the shore, since
    // the foundry already holds Moselle.
    await raise(t, seat, 'foundry', MOSELLE);
    await raise(t, seat, 'mine', MEURTHE);
    await raise(t, seat, 'mine', PAS_DE_CALAIS);
    await fill(t, seat, 'alloy', 0);
    vi.advanceTimersByTime(10 * 3_600_000);

    const view = await t.query(api.view.playerView, seat);
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
    const seat = await launchedSeason(t);
    await raise(t, seat, 'foundry', MOSELLE);
    await raise(t, seat, 'mine', MEURTHE); // ore, and no coal mine anywhere
    await fill(t, seat, 'alloy', 0);
    vi.advanceTimersByTime(20 * 3_600_000);

    const view = await t.query(api.view.playerView, seat);
    expect(view.me.resources.coal.stock).toBe(0);
    expect(chainOf(view, 'foundry')).toMatchObject({ state: 'starved', missing: 'coal' });
  });

  it('calls a full output overflowing, not starved', async () => {
    const t = boot();
    const seat = await launchedSeason(t);
    await raise(t, seat, 'foundry', MOSELLE);
    await raise(t, seat, 'mine', MEURTHE);
    await raise(t, seat, 'mine', PAS_DE_CALAIS);
    await fill(t, seat, 'alloy', BASE_CAP);
    vi.advanceTimersByTime(3_600_000);

    const view = await t.query(api.view.playerView, seat);
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
    const seat = await launchedSeason(t);
    await raise(t, seat, 'foundry', MOSELLE);
    await raise(t, seat, 'mine', MEURTHE); // ore, 9/h
    await raise(t, seat, 'mine', PAS_DE_CALAIS); // coal, 10/h
    await fill(t, seat, 'alloy', 0);
    vi.advanceTimersByTime(3_600_000);

    const view = await t.query(api.view.playerView, seat);
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
    const seat = await launchedSeason(t);
    await raise(t, seat, 'foundry', MOSELLE);
    await raise(t, seat, 'mine', MEURTHE);
    await fill(t, seat, 'alloy', BASE_CAP);
    vi.advanceTimersByTime(3_600_000);

    const view = await t.query(api.view.playerView, seat);
    expect(chainOf(view, 'foundry')).toMatchObject({ state: 'overflowing' });
    expect(view.me.resources.alloy.ratePerHour).toBe(0);
    expect(view.me.resources.ore.ratePerHour).toBe(EXTRACTION_PER_HOUR.ore);
  });

  /** An absent chain is information; an absent line is a hole. */
  it('serves the three chains even when nothing is built, extinguished', async () => {
    const t = boot();
    const seat = await launchedSeason(t);

    const view = await t.query(api.view.playerView, seat);
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
    const seat = await launchedSeason(t);
    await raise(t, seat, 'farm', MARNE);
    await raise(t, seat, 'mine', ARDENNES); // no deposit at all under it

    const view = await t.query(api.view.playerView, seat);
    expect(view.me.extraction).toEqual([
      {
        key: 'farm',
        regionId: MARNE,
        level: 1,
        deposit: 'food',
        perHour: EXTRACTION_PER_HOUR.food,
        linked: true,
      },
      // Le sol national est toujours relié (ADR 0020 §6) : ce zéro-là est celui du gisement
      // absent, et le site le dit à côté — muet n'est pas coupé.
      { key: 'mine', regionId: ARDENNES, level: 1, deposit: null, perHour: 0, linked: true },
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
    const seat = await launchedSeason(t);
    await raise(t, seat, 'foundry', MOSELLE);
    await raise(t, seat, 'mine', MEURTHE);
    await fill(t, seat, 'alloy', 100);
    await promoteHq(t, seat, unlockLevel('billets'));
    vi.advanceTimersByTime(20 * 3_600_000);
    // The billets, not the farm: the farm belongs to the foundation, and a free placement
    // spends nothing — so it would reset no window.
    await t.mutation(api.constructions.start, { ...seat, building: 'billets', regionId: MARNE });

    const view = await t.query(api.view.playerView, seat);
    expect(chainOf(view, 'foundry')).toMatchObject({ state: 'starved', missing: 'coal' });
  });
});

describe('storage', () => {
  it('raises all eight resource ceilings', async () => {
    const t = boot();
    const seat = await launchedSeason(t);
    const before = await t.query(api.view.playerView, seat);
    expect(before.me.resources.alloy.cap).toBe(BASE_CAP);

    await raise(t, seat, 'warehouse', MOSELLE);

    const after = await t.query(api.view.playerView, seat);
    expect(after.me.resources.alloy.cap).toBe(BASE_CAP + STORAGE_CAP_PER_LEVEL);
    for (const key of RESOURCES) {
      expect(after.me.resources[key].cap).toBe(BASE_CAP + STORAGE_CAP_PER_LEVEL);
    }
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

    const twoSites = await spread.query(api.view.playerView, scattered);
    const oneSite = await stacked.query(api.view.playerView, tall);
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
  async function raze(t: ReturnType<typeof boot>, seat: Seat, key: BuildingKey) {
    return t.run(async (ctx) => {
      const player = await seatIn(ctx, seat);
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
    const seat = await launchedSeason(t);
    /**
     * A stock can sit above the ceiling of a nation without a warehouse — a kit that opens
     * higher, a warehouse razed, a delivery that lands. What matters is that the difference stays
     * the player's until he spends it. Posé ici plutôt que lu sur la dotation : celle-ci est
     * descendue à `BASE_CAP` le 14/09 (`STARTING_ALLOY`), et une règle ne doit pas cesser d'être
     * couverte parce qu'un chiffre voisin a bougé.
     */
    const above = BASE_CAP + 120;
    await fill(t, seat, 'alloy', above);

    vi.advanceTimersByTime(10 * 3_600_000);
    await t.run(async (ctx) => {
      const player = await seatIn(ctx, seat);
      await settle(ctx, player._id, Date.now());
    });

    const view = await t.query(api.view.playerView, seat);
    expect(view.me.resources.alloy.cap).toBe(BASE_CAP);
    expect(view.me.resources.alloy.stock).toBe(above);
  });

  it('takes the surplus the instant the capacity falls, and takes it once', async () => {
    const t = boot();
    const seat = await launchedSeason(t);
    await raise(t, seat, 'warehouse', MOSELLE);
    const held = BASE_CAP + STORAGE_CAP_PER_LEVEL;
    for (const key of RESOURCES) await fill(t, seat, key, held);

    const lost = await raze(t, seat, 'warehouse');
    expect(lost.alloy).toBe(held - BASE_CAP);
    for (const key of RESOURCES) expect(lost[key]).toBe(STORAGE_CAP_PER_LEVEL);

    const after = await t.query(api.view.playerView, seat);
    expect(after.me.resources.alloy.cap).toBe(BASE_CAP);
    expect(after.me.resources.alloy.stock).toBe(BASE_CAP);

    // Once, and not by instalments: ten hours later the reading takes nothing more.
    vi.advanceTimersByTime(10 * 3_600_000);
    const later = await t.query(api.view.playerView, seat);
    expect(later.me.resources.alloy.stock).toBe(BASE_CAP);
  });

  it('takes nothing when the capacity that falls was not holding anything', async () => {
    const t = boot();
    const seat = await launchedSeason(t);
    await raise(t, seat, 'warehouse', MOSELLE);
    await fill(t, seat, 'alloy', BASE_CAP - 100);

    const lost = await raze(t, seat, 'warehouse');
    expect(RESOURCES.every((key) => lost[key] === 0)).toBe(true);

    const after = await t.query(api.view.playerView, seat);
    expect(after.me.resources.alloy.stock).toBe(BASE_CAP - 100);
  });
});

describe('placement', () => {
  it('refuses a mine where there is no deposit', async () => {
    const t = boot();
    const seat = await launchedSeason(t);
    await expect(
      t.mutation(api.constructions.start, { ...seat, building: 'mine', regionId: ARDENNES }),
    ).rejects.toThrow('DEPOSIT_REQUIRED');
  });

  it('refuses a port away from the coast and takes it on the shore', async () => {
    const t = boot();
    const seat = await launchedSeason(t);
    await promoteHq(t, seat, unlockLevel('port'));
    await expect(
      t.mutation(api.constructions.start, {
        ...seat,
        building: 'port',
        regionId: MOSELLE,
        point: CALAIS_SHORE,
      }),
    ).rejects.toThrow('NOT_COASTAL');
    await t.mutation(api.constructions.start, {
      ...seat,
      building: 'port',
      regionId: PAS_DE_CALAIS,
      point: CALAIS_SHORE,
    });
  });

  /**
   * **Le port se pose à un point, et lui seul** (ADR 0013, révision du 04/09). Two of the three
   * refusals answer a client that made up its own gesture; the third is the one a legitimate
   * ghost can meet, when the ground it snapped onto is not the region's.
   */
  describe('the coast point of a port', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('is refused on anything that is not a port', async () => {
      const t = boot();
      const seat = await launchedSeason(t);
      await expect(
        t.mutation(api.constructions.start, {
          ...seat,
          building: 'mine',
          regionId: MOSELLE,
          point: CALAIS_SHORE,
        }),
      ).rejects.toThrow('POINT_FOR_PORT_ONLY');
    });

    it('is required of a port', async () => {
      const t = boot();
      const seat = await launchedSeason(t);
      await promoteHq(t, seat, unlockLevel('port'));
      await expect(
        t.mutation(api.constructions.start, {
          ...seat,
          building: 'port',
          regionId: PAS_DE_CALAIS,
        }),
      ).rejects.toThrow('PORT_NEEDS_A_COAST_POINT');
    });

    it('is refused inland, where no ship could reach it', async () => {
      const t = boot();
      const seat = await launchedSeason(t);
      await promoteHq(t, seat, unlockLevel('port'));
      await expect(
        t.mutation(api.constructions.start, {
          ...seat,
          building: 'port',
          regionId: PAS_DE_CALAIS,
          point: { lon: MOSELLE_POINT[0], lat: MOSELLE_POINT[1] },
        }),
      ).rejects.toThrow('PORT_NEEDS_A_COAST_POINT');
    });

    it('is refused on the shore of another country', async () => {
      const t = boot();
      const seat = await launchedSeason(t);
      await promoteHq(t, seat, unlockLevel('port'));
      await expect(
        t.mutation(api.constructions.start, {
          ...seat,
          building: 'port',
          regionId: PAS_DE_CALAIS,
          point: ENGLISH_SHORE,
        }),
      ).rejects.toThrow('POINT_OUTSIDE_REGION');
    });

    /** The queue carries it, the finished building keeps it, and the view serves it: the mast
     *  stands on the quay from the order to the end of the season. */
    it('travels from the queue to the standing building and out to the board', async () => {
      const t = boot();
      const seat = await launchedSeason(t);
      await promoteHq(t, seat, unlockLevel('port'));
      for (const key of RESOURCES) await fill(t, seat, key, BASE_CAP);
      await t.mutation(api.constructions.start, {
        ...seat,
        building: 'port',
        regionId: PAS_DE_CALAIS,
        point: CALAIS_SHORE,
      });

      const queued = await t.query(api.view.playerView, seat);
      expect(queued.me.construction?.point).toEqual([CALAIS_SHORE.lon, CALAIS_SHORE.lat]);

      await vi.advanceTimersByTimeAsync(buildMinutes('port', 1) * 60_000 + 1000);
      const view = await t.query(api.view.playerView, seat);
      const port = view.me.buildings.find((building) => building.key === 'port');
      expect(port?.point).toEqual([CALAIS_SHORE.lon, CALAIS_SHORE.lat]);
    });

    /** A raise does not move a quay, so it does not ask for one either — nor does it take one. */
    it('is neither asked for nor accepted when the port is only being raised', async () => {
      const t = boot();
      const seat = await launchedSeason(t);
      await promoteHq(t, seat, MAX_HQ_LEVEL);
      await raise(t, seat, 'port', PAS_DE_CALAIS);
      for (const key of RESOURCES) await fill(t, seat, key, BASE_CAP);
      await expect(
        t.mutation(api.constructions.start, {
          ...seat,
          building: 'port',
          regionId: PAS_DE_CALAIS,
          point: CALAIS_SHORE,
        }),
      ).rejects.toThrow('POINT_FOR_PORT_ONLY');
      await t.mutation(api.constructions.start, {
        ...seat,
        building: 'port',
        regionId: PAS_DE_CALAIS,
      });
    });

    /** A port from before the field existed reads where it always read — its region's point,
     *  and no backfill anywhere (`pointOfBuilding`). */
    it('leaves a port written before the field standing at its centroid', async () => {
      const t = boot();
      const seat = await launchedSeason(t);
      await raise(t, seat, 'port', PAS_DE_CALAIS);
      const view = await t.query(api.view.playerView, seat);
      expect(view.me.buildings.find((building) => building.key === 'port')?.point).toBeNull();
      expect(pointOfBuilding({ regionId: PAS_DE_CALAIS })).toEqual(
        regionFacts(PAS_DE_CALAIS)!.point,
      );
    });
  });

  /**
   * **One headquarters level, one new question.** The catalogue is the shape of the season's
   * progression, so the refusal has to name the step that opens the line — a locked key that
   * says nothing is a key the player believes is broken.
   */
  it('refuses a key above the headquarters tier, and names the level it wants', async () => {
    const t = boot();
    const seat = await launchedSeason(t);
    const refused: Record<string, unknown> = await t
      .mutation(api.constructions.start, { ...seat, building: 'airfield', regionId: ARDENNES })
      .then(() => ({}))
      .catch((error: { data: Record<string, unknown> }) => error.data);

    expect(refused).toMatchObject({
      code: 'BUILDING_LOCKED',
      building: 'airfield',
      requiredLevel: unlockLevel('airfield'),
      hqLevel: HQ_LEVEL_AT_LAUNCH,
    });

    await promoteHq(t, seat, unlockLevel('airfield'));
    const started = await t.mutation(api.constructions.start, {
      ...seat,
      building: 'airfield',
      regionId: ARDENNES,
    });
    expect(started.finishesAt).toBeGreaterThan(Date.now());
  });

  /** The refusal above, taken back: the very key the tier locked is placed the minute the
   *  headquarters reaches it, and nothing else changes. */
  it('opens a tier as soon as the headquarters reaches it', async () => {
    const t = boot();
    const seat = await launchedSeason(t);
    expect(unlockLevel('listening')).toBeGreaterThan(HQ_LEVEL_AT_LAUNCH);
    await promoteHq(t, seat, unlockLevel('listening'));
    const started = await t.mutation(api.constructions.start, {
      ...seat,
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
      for (const { key } of foundationOwed(nation, [])) {
        expect(unlockLevel(key)).toBeLessThanOrEqual(HQ_LEVEL_AT_LAUNCH);
      }
    }
  });

  /** The panel prices its lines off the served catalogue; it must lock them off the same one. */
  it('serves the tier of every key beside its price', async () => {
    const t = boot();
    const seat = await launchedSeason(t);
    const view = await t.query(api.view.playerView, seat);
    for (const key of BUILDINGS) {
      expect(view.buildCatalog[key].unlockedAtHqLevel).toBe(unlockLevel(key));
    }
  });

  it('refuses a second headquarters', async () => {
    const t = boot();
    const seat = await launchedSeason(t);
    await expect(
      t.mutation(api.constructions.start, { ...seat, building: 'hq', regionId: MARNE }),
    ).rejects.toThrow('HQ_ALREADY_BUILT');
  });

  /** Abroad without an outpost, the refusal names the reach rather than falling silent —
   *  `movements.test.ts` holds the other half, the region an outpost does open. */
  it('refuses to build outside the nation with no outpost in reach', async () => {
    const t = boot();
    const seat = await launchedSeason(t);
    await promoteHq(t, seat, 2);
    await expect(
      t.mutation(api.constructions.start, { ...seat, building: 'mine', regionId: RUHR }),
    ).rejects.toThrow('OUT_OF_OUTPOST_REACH');
  });

  it('refuses an unknown region', async () => {
    const t = boot();
    const seat = await launchedSeason(t);
    await promoteHq(t, seat, 2);
    await expect(
      t.mutation(api.constructions.start, { ...seat, building: 'farm', regionId: 'XXX-1' }),
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
  it('owes France its headquarters, its two mines, its farm and its mill, and no well', () => {
    expect(foundationOwed('france', [])).toEqual([
      { key: 'hq', deposit: null },
      { key: 'mine', deposit: 'ore' },
      { key: 'mine', deposit: 'coal' },
      { key: 'farm', deposit: 'food' },
      { key: 'mill', deposit: 'textile' },
    ]);
  });

  /** The one ground that holds all five: the United States is the only nation whose foundation
   *  carries a well, alongside the Soviet Union. */
  it('owes the United States the same, plus the well its oil carries', () => {
    expect(foundationOwed('usa', [])).toEqual([
      { key: 'hq', deposit: null },
      { key: 'mine', deposit: 'ore' },
      { key: 'mine', deposit: 'coal' },
      { key: 'farm', deposit: 'food' },
      { key: 'mill', deposit: 'textile' },
      { key: 'oilWell', deposit: 'oil' },
    ]);
  });

  /** Kamaishi, added on 25/08: without it Japan held no ore at all and, with looting not coded,
   *  had no road to any — an unplayable nation rather than a shaped one. */
  it('owes Japan four extractors now that its ore exists, and still no well', () => {
    expect(foundationOwed('japan', []).map((due) => due.key)).toEqual([
      'hq',
      'mine',
      'mine',
      'farm',
      'mill',
    ]);
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
    expect(foundationOwed('france', [{ key: 'mine', deposit: 'ore' }])).toEqual([
      { key: 'hq', deposit: null },
      { key: 'mine', deposit: 'coal' },
      { key: 'farm', deposit: 'food' },
      { key: 'mill', deposit: 'textile' },
    ]);
    expect(
      foundationOwed('france', [
        { key: 'hq', deposit: null },
        { key: 'mine', deposit: 'ore' },
        { key: 'mine', deposit: 'coal' },
        { key: 'farm', deposit: 'food' },
        { key: 'mill', deposit: 'textile' },
      ]),
    ).toEqual([]);
    expect(
      foundationOwed('france', [
        { key: 'barracks', deposit: null },
        { key: 'foundry', deposit: null },
      ]),
    ).toEqual(foundationOwed('france', []));
  });

  /**
   * **Une dette est un couple, pas une clé** : deux mines posées sur du charbon ne soldent que
   * la dette du charbon. Comptée par clé, la mine de fer se payait ensuite 500 d'alliage, et le
   * joueur restait sans la ressource qui fait tout le reste.
   */
  it('settles a debt on its deposit and on no other', () => {
    expect(
      foundationOwed('france', [
        { key: 'mine', deposit: 'coal' },
        { key: 'mine', deposit: 'coal' },
      ]),
    ).toEqual([
      { key: 'hq', deposit: null },
      { key: 'mine', deposit: 'ore' },
      { key: 'farm', deposit: 'food' },
      { key: 'mill', deposit: 'textile' },
    ]);
    expect(
      foundationOwed('france', [
        { key: 'mine', deposit: 'coal' },
        { key: 'mine', deposit: 'ore' },
      ]),
    ).toEqual([
      { key: 'hq', deposit: null },
      { key: 'farm', deposit: 'food' },
      { key: 'mill', deposit: 'textile' },
    ]);
  });

  /** Un extracteur posé là où il n'y a rien à extraire n'existe pas — et s'il existait, il ne
   *  solderait rien : la dette nomme un gisement. */
  it('settles nothing on ground that carries no deposit', () => {
    expect(foundationOwed('france', [{ key: 'mine', deposit: null }])).toEqual(
      foundationOwed('france', []),
    );
  });

  /** The foundry, the warehouse and the arsenal are paid for now — they are what a player
   *  decides to do with his ground, never what the ground carries. */
  it('owes no foundry, warehouse or arsenal to anybody', () => {
    for (const nation of NATIONS) {
      const owed = foundationOwed(nation, []).map((due) => due.key);
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
    /** La dette nomme son gisement : la mine du fer ne se pose pas sur du charbon (`owedFreely`).
     *  `null` est la dette que le sol ne nomme pas — le quartier général, que n'importe quelle
     *  région libre acquitte. */
    deposit?: DepositKey | null,
  ): string | null =>
    view.me.regions.find(
      (region) =>
        region.buildings.length === 0 &&
        (deposit === undefined || deposit === null || region.deposit === deposit) &&
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
  const FRENCH_FOUNDATION = [
    { key: 'mine', deposit: 'ore' },
    { key: 'mine', deposit: 'coal' },
    { key: 'farm', deposit: 'food' },
    { key: 'mill', deposit: 'textile' },
  ] as const;

  /** Places what the season **still** owes, one key at a time, and hands back what it cost. */
  async function placeFoundation(t: ReturnType<typeof boot>, seat: Seat) {
    const bills: Array<Record<string, number>> = [];
    // The widest ground of the eight is owed five, and the loop is a guard, not a count.
    for (let guard = 0; guard < 8; guard += 1) {
      const view = await t.query(api.view.playerView, seat);
      const due = view.me.foundation[0];
      if (due === undefined) break;
      const regionId = freeRegionFor(view, due.key, due.deposit);
      if (regionId === null) throw new Error(`nowhere to place ${due.key}`);
      const { cost } = await t.mutation(api.constructions.start, {
        ...seat,
        building: due.key,
        regionId,
      });
      bills.push(cost as Record<string, number>);
    }
    return bills;
  }

  it('stands whole once placed, for nothing and with nothing to wait for', async () => {
    const t = boot();
    const seat = await launchedSeason(t);
    const opening = await t.query(api.view.playerView, seat);
    expect(opening.me.foundation).toEqual(FRENCH_FOUNDATION);

    const bills = await placeFoundation(t, seat);

    const view = await t.query(api.view.playerView, seat);
    expect(bills.every((bill) => Object.keys(bill).length === 0)).toBe(true);
    expect(view.me.foundation).toEqual([]);
    expect(view.me.construction).toBeNull();
    expect(view.me.buildings).toHaveLength(FRENCH_FOUNDATION.length + 1);
    for (const { key } of FRENCH_FOUNDATION) {
      expect(view.me.buildings.map((building) => building.key)).toContain(key);
    }
    // Not one unit spent, the alloy of the kit included — and it survives the ceiling of a
    // nation that has not placed its warehouse yet.
    expect(view.me.resources.alloy.stock).toBe(KIT.alloy);
  });

  /**
   * **Une dette de socle est un couple, et la pose lit le gisement de la région visée.** La
   * France doit deux mines, l'une au fer et l'autre au charbon : comptée par clé, deux mines
   * posées sur du charbon soldaient les deux, et le fer se payait ensuite 500 d'alliage — le
   * joueur restait coincé sur la ressource qui fait tout le reste.
   */
  it('offers one mine per deposit and bills the second on the same ground', async () => {
    const t = boot();
    const seat = await launchedSeason(t);

    const offered = await t.mutation(api.constructions.start, {
      ...seat,
      building: 'mine',
      regionId: MOSELLE,
    });
    expect(offered.cost).toEqual({});
    expect(offered.finishesAt).toBe(Date.now());

    const billed = await t.mutation(api.constructions.start, {
      ...seat,
      building: 'mine',
      regionId: PAS_DE_CALAIS,
    });
    expect(billed.cost).toEqual(buildCost('mine', 1));
    expect(billed.finishesAt).toBeGreaterThan(Date.now());

    // The debt of the iron is untouched by two placements on coal, and it is still offered.
    const view = await t.query(api.view.playerView, seat);
    expect(view.me.foundation).toContainEqual({ key: 'mine', deposit: 'ore' });
    const iron = await t.mutation(api.constructions.start, {
      ...seat,
      building: 'mine',
      regionId: MEURTHE,
    });
    expect(iron.cost).toEqual({});
  });

  /**
   * **L'exemption d'emplacement suit la dette, couple par couple** (ADR 0020 §10). Comptée par
   * clé, la seconde mine de charbon était hors du compte comme la première : le sol national
   * portait un placement gratuit de plus qu'il n'en devait.
   */
  it('leaves one mine per deposit out of the placement count, and no more', async () => {
    const t = boot();
    const seat = await launchedSeason(t);
    const homeTaken = async () =>
      (await t.query(api.view.playerView, seat)).me.siteSlots.find(
        (held) => held.site.outpostId === null,
      )!.taken;

    await raise(t, seat, 'mine', MOSELLE);
    expect(await homeTaken()).toBe(0);

    await raise(t, seat, 'mine', PAS_DE_CALAIS);
    expect(await homeTaken()).toBe(1);

    // The one owed for iron is exempt in its turn, wherever the coal mines stand.
    await raise(t, seat, 'mine', MEURTHE);
    expect(await homeTaken()).toBe(1);
  });

  /**
   * **The lock belongs to the construction, not to the placement.** Playtest of 19/08: a paid
   * mill launched before the offered mines, and "one construction at a time" then froze three
   * placements that cost nothing, wait for nothing and open no site of their own. The rule
   * still holds where it means something — the bill below.
   */
  it('places what the season owes while a paid construction runs', async () => {
    const t = boot();
    const seat = await launchedSeason(t);
    await promoteHq(t, seat, unlockLevel('barracks'));
    const paid = await t.mutation(api.constructions.start, {
      ...seat,
      building: 'barracks',
      regionId: ARDENNES,
    });
    expect(paid.finishesAt).toBeGreaterThan(Date.now());
    const spent = (await t.query(api.view.playerView, seat)).me.resources.alloy.stock;

    const placed = await t.mutation(api.constructions.start, {
      ...seat,
      building: 'farm',
      regionId: JURA,
    });
    expect(placed.cost).toEqual({});
    expect(placed.finishesAt).toBe(Date.now());

    const view = await t.query(api.view.playerView, seat);
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
    const seat = await launchedSeason(t);
    await promoteHq(t, seat, unlockLevel('barracks'));
    await t.mutation(api.constructions.start, {
      ...seat,
      building: 'barracks',
      regionId: ARDENNES,
    });
    await expect(
      t.mutation(api.constructions.start, { ...seat, building: 'foundry', regionId: ARDENNES }),
    ).rejects.toThrow('REGION_TAKEN');
  });

  /**
   * **A free placement never enters the queue.** It costs nothing, waits for nothing and opens
   * no site, so it has no rank, no bill and no turn — whatever the queue behind it is doing.
   */
  it('keeps an offered placement out of the queue, however long the queue is', async () => {
    const t = boot();
    const seat = await launchedSeason(t);
    await promoteHq(t, seat, unlockLevel('billets'));
    await t.mutation(api.constructions.start, { ...seat, building: 'billets', regionId: ARDENNES });
    await t.mutation(api.constructions.start, { ...seat, building: 'warehouse', regionId: JURA });

    const placed = await t.mutation(api.constructions.start, {
      ...seat,
      building: 'farm',
      regionId: MARNE,
    });
    expect(placed).toMatchObject({ cost: {}, rank: null, finishesAt: Date.now() });

    const view = await t.query(api.view.playerView, seat);
    expect(view.me.buildings.map((building) => building.key)).toContain('farm');
    // The queue is exactly what it was: the offered placement passed beside it.
    expect(view.me.construction?.key).toBe('billets');
    expect(view.me.constructionQueue.map((entry) => entry.key)).toEqual(['warehouse']);
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
      const seat = await launchedSeason(t);
      const opening = await t.query(api.view.playerView, seat);
      const regionId = freeRegionFor(opening, first);
      if (regionId === null) continue; // nothing in France takes it: not a first move either

      // A bill the kit cannot cover is not a first move: the season refuses it before the
      // player can make it. Anything else the server refuses would be a hole, and fails here.
      const paid = await t
        .mutation(api.constructions.start, { ...seat, building: first, regionId })
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
      await promoteHq(t, seat, MAX_HQ_LEVEL);

      const bills = await placeFoundation(t, seat);
      expect(bills.every((bill) => Object.keys(bill).length === 0)).toBe(true);
      const view = await t.query(api.view.playerView, seat);
      expect(view.me.foundation).toEqual([]);
    }
    /** Quatorze saisons lancées bout à bout, et chacune pose désormais ses objectifs
     *  neutres (17/09) : le budget par défaut est celui d'un cas, pas d'une quinzaine. */
  }, 60_000);

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
      const seat = await launchedSeason(t, 168, nation);
      await placeFoundation(t, seat);

      const view = await t.query(api.view.playerView, seat);
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
   * La plus large fondation (6, quartier général compris depuis la décision 1b du 13/09) et
   * `2 × MAX_HQ_LEVEL` (10) font **exactement** seize. It passes at zero margin: a `MAX_HQ_LEVEL`
   * of 6, or a `PLACEMENTS_PER_HQ_LEVEL` of 3, would bring it down — and for Germany alone,
   * which is the whole reason it is written.
   */
  it('keeps a full national ground inside the region count of the smallest nation', () => {
    const countries = Object.values(regionIndex.country);
    const counts = NATIONS.map(
      (nation) => countries.filter((country) => country === ADM0_BY_NATION[nation]).length,
    );
    const smallest = Math.min(...counts);
    expect(smallest).toBe(16); // Germany, counted in Länder

    const widest = Math.max(...NATIONS.map((nation) => foundationOwed(nation, []).length));
    expect(widest + homeSlots(MAX_HQ_LEVEL)).toBeLessThanOrEqual(smallest);
    expect(PLACEMENTS_PER_HQ_LEVEL * MAX_HQ_LEVEL).toBe(10);
  });
});

/**
 * **Le quartier général se pose, il n'est plus planté** (décision 1b du 13/09, révision des ADR
 * 0015 et 0017 §2). Ce qui a rouvert la question : une bâtisse par région, donc un gisement sous
 * le QG est un gisement perdu — c'est au joueur de choisir ce qu'il sacrifie.
 */
describe('the headquarters the player puts up', () => {
  it('opens the foundation, and nothing else goes up before it', async () => {
    const t = boot();
    const seat = await launchedWithoutHq(t);

    const view = await t.query(api.view.playerView, seat);
    expect(view.me.buildings).toEqual([]);
    expect(view.me.hqLevel).toBe(0);
    expect(view.me.foundation[0]).toEqual({ key: 'hq', deposit: null });
    // La mine est offerte elle aussi, et elle attend quand même : le QG d'abord.
    await expect(
      t.mutation(api.constructions.start, { ...seat, building: 'mine', regionId: MOSELLE }),
    ).rejects.toThrow('HQ_FIRST');
  });

  /** Gratuit, immédiat, au niveau du lancement — et il amène sa compagnie, que la dotation
   *  donnait jusqu'au 13/09. */
  it('goes down for nothing, standing at once, with the company the launch used to give', async () => {
    const t = boot();
    const seat = await launchedWithoutHq(t);
    const opening = await t.query(api.view.playerView, seat);

    await t.mutation(api.constructions.start, { ...seat, building: 'hq', regionId: MARNE });

    const view = await t.query(api.view.playerView, seat);
    expect(view.me.construction).toBeNull();
    expect(view.me.buildings).toEqual([
      expect.objectContaining({ key: 'hq', regionId: MARNE, level: HQ_LEVEL_AT_LAUNCH }),
    ]);
    expect(view.me.resources.alloy.stock).toBe(opening.me.resources.alloy.stock);
    expect(view.me.foundation.some((due) => due.key === 'hq')).toBe(false);
    const hq = view.me.buildings[0]!;
    expect(view.me.troops).toEqual([
      expect.objectContaining({
        role: 'infantry',
        tier: 1,
        strength: nominalStrength('infantry', 1),
      }),
    ]);
    expect(view.me.troops[0]!.stationedAt).toEqual({ kind: 'building', buildingId: hq.id });
  });

  it('is refused a second time, wherever it is aimed', async () => {
    const t = boot();
    const seat = await launchedWithoutHq(t);
    await t.mutation(api.constructions.start, { ...seat, building: 'hq', regionId: MARNE });

    await expect(
      t.mutation(api.constructions.start, { ...seat, building: 'hq', regionId: ARDENNES }),
    ).rejects.toThrow('HQ_ALREADY_BUILT');
  });

  /**
   * **Le sacrifice, exécutable.** Le QG prend la région où il se pose, gisement compris — et la
   * mine que le socle y devait n'a plus de sol. C'est l'enjeu qui a rouvert la décision, et la
   * dette du charbon reste due ailleurs plutôt que de disparaître avec la région.
   */
  it('takes a deposit region if that is where the player wants it, and the mine loses it', async () => {
    const t = boot();
    const seat = await launchedWithoutHq(t);
    await t.mutation(api.constructions.start, { ...seat, building: 'hq', regionId: MOSELLE });

    const view = await t.query(api.view.playerView, seat);
    expect(view.me.buildings).toEqual([
      expect.objectContaining({ key: 'hq', regionId: MOSELLE, level: HQ_LEVEL_AT_LAUNCH }),
    ]);
    expect(view.me.foundation).toContainEqual({ key: 'mine', deposit: 'coal' });
    await expect(
      t.mutation(api.constructions.start, { ...seat, building: 'mine', regionId: MOSELLE }),
    ).rejects.toThrow('REGION_TAKEN');
    // Et le charbon se prend ailleurs : la dette suit le gisement, pas la région perdue.
    await t.mutation(api.constructions.start, {
      ...seat,
      building: 'mine',
      regionId: PAS_DE_CALAIS,
    });
    expect((await t.query(api.view.playerView, seat)).me.foundation).not.toContainEqual({
      key: 'mine',
      deposit: 'coal',
    });
  });

  /** The point of the whole rule: the first construction of a season is a choice again. */
  it('lets a fresh player raise his first farm without building it first', async () => {
    const t = boot();
    const seat = await launchedSeason(t);
    await t.mutation(api.constructions.start, { ...seat, building: 'farm', regionId: MARNE });
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
    { building: 'warehouse' as const, regionId: JURA },
    { building: 'barracks' as const, regionId: MEURTHE },
  ];

  const alloyOf = async (t: ReturnType<typeof boot>, seat: Seat) =>
    (await t.query(api.view.playerView, seat)).me.resources.alloy.stock;

  /**
   * **A finished building changes the rates, and the hours before it were not worked at them.**
   * `finish` wrote the new level without settling first, so the next reading integrated the
   * *new* rate from the last settlement — the whole build time paid at the level it was still
   * short of.
   */
  it('settles the stocks before a finished level changes the rate', async () => {
    const t = boot();
    const seat = await launchedSeason(t);
    await promoteHq(t, seat, 3);
    await raise(t, seat, 'farm', MARNE);
    await fill(t, seat, 'food', 0);

    await t.mutation(api.constructions.start, { ...seat, building: 'farm', regionId: MARNE });
    const minutes = buildMinutes('farm', 2);
    vi.advanceTimersByTime(minutes * 60_000 + 1);
    await t.finishInProgressScheduledFunctions();

    const view = await t.query(api.view.playerView, seat);
    const hours = (minutes * 60_000 + 1) / 3_600_000;
    // The hours were worked by a level-1 farm; the level 2 only earns from here on.
    expect(view.me.resources.food.stock).toBeCloseTo(hours * EXTRACTION_PER_HOUR.food, 0);
  });

  it('bills every entry at the enqueue and runs them one at a time, in order', async () => {
    const t = boot();
    const seat = await launchedSeason(t);
    await promoteHq(t, seat, 2);
    const opening = await alloyOf(t, seat);

    for (const site of SITES) await t.mutation(api.constructions.start, { ...seat, ...site });

    // Not one stone laid, and the three bills are already settled.
    const spent = SITES.reduce(
      (total, site) => total + (buildCost(site.building, 1).alloy ?? 0),
      0,
    );
    expect(await alloyOf(t, seat)).toBe(opening - spent);

    const queued = await t.query(api.view.playerView, seat);
    expect(queued.me.construction?.key).toBe('billets');
    expect(queued.me.constructionQueue.map((entry) => entry.key)).toEqual([
      'warehouse',
      'barracks',
    ]);

    // Only the head is dated: the followers are dated nowhere until their turn comes.
    const dated = await t.run(async (ctx) =>
      (await ctx.db.query('constructions').collect()).filter((row) => row.finishesAt !== null),
    );
    expect(dated).toHaveLength(1);

    vi.advanceTimersByTime(buildMinutes('billets', 1) * 60_000);
    await t.finishInProgressScheduledFunctions();

    const midway = await t.query(api.view.playerView, seat);
    expect(midway.me.buildings.map((building) => building.key)).toContain('billets');
    expect(midway.me.construction?.key).toBe('warehouse');
    expect(midway.me.constructionQueue.map((entry) => entry.key)).toEqual(['barracks']);

    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const done = await t.query(api.view.playerView, seat);
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
    const seat = await launchedSeason(t);
    await promoteHq(t, seat, 2);
    await t.mutation(api.constructions.start, { ...seat, building: 'billets', regionId: ARDENNES });
    await t.mutation(api.constructions.start, { ...seat, building: 'warehouse', regionId: JURA });

    // Against the head, and against a follower alike.
    await expect(
      t.mutation(api.constructions.start, { ...seat, building: 'barracks', regionId: ARDENNES }),
    ).rejects.toThrow('REGION_TAKEN');
    await expect(
      t.mutation(api.constructions.start, { ...seat, building: 'barracks', regionId: JURA }),
    ).rejects.toThrow('REGION_TAKEN');
  });

  /** The queue counts against the placements of the site it aims at, or it is where a nation
   *  keeps the buildings it is not allowed to hold. */
  it('counts what is queued against the placements of the site', async () => {
    const t = boot();
    const seat = await launchedSeason(t);
    await promoteHq(t, seat, 2);
    await fill(t, seat, 'alloy', 100_000);
    await fill(t, seat, 'food', 100_000);
    const slots = homeSlots(2);

    const view = await t.query(api.view.playerView, seat);
    const free = view.me.regions.filter((region) => region.buildings.length === 0);
    // The headquarters eats no placement, so the queue may take them all and not one more.
    for (const region of free.slice(0, slots)) {
      await t.mutation(api.constructions.start, {
        ...seat,
        building: 'billets',
        regionId: region.id,
      });
    }
    await expect(
      t.mutation(api.constructions.start, {
        ...seat,
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
    const seat = await launchedSeason(t);
    await promoteHq(t, seat, 2);
    const opening = await alloyOf(t, seat);
    await t.mutation(api.constructions.start, { ...seat, building: 'billets', regionId: ARDENNES });
    await t.mutation(api.constructions.start, { ...seat, building: 'warehouse', regionId: JURA });

    // The placements go under the queue: the buildings below are put up without paying, and
    // what is under test is what the *start* of the follower does about it.
    const view = await t.query(api.view.playerView, seat);
    const spare = view.me.regions.filter(
      (region) => region.buildings.length === 0 && region.id !== ARDENNES && region.id !== JURA,
    );
    for (const region of spare.slice(0, homeSlots(2) - 1))
      await raise(t, seat, 'warehouse', region.id);

    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const after = await t.query(api.view.playerView, seat);
    expect(after.me.buildings.map((building) => building.key)).toContain('billets');
    // The follower never rose, and its matter came back whole — only the head's bill stands.
    expect(after.me.constructionQueue).toEqual([]);
    expect(after.me.construction).toBeNull();
    expect(after.me.buildings.some((building) => building.regionId === JURA)).toBe(false);
    expect(await alloyOf(t, seat)).toBe(opening - (buildCost('billets', 1).alloy ?? 0));

    // The head that did rise files its own line: the journal owes a player the site he built
    // as much as the one the world took back.
    expect(
      after.notices.map((notice) => [notice.kind, 'building' in notice ? notice.building : null]),
    ).toEqual(
      expect.arrayContaining([
        ['constructionFinished', 'billets'],
        ['constructionCancelled', 'warehouse'],
      ]),
    );
  });

  /** The head has started and has consumed the queue's time; the follower has not, and its
   *  matter is handed back untouched — the very rule `troops.cancel` writes for a batch. */
  it('refunds a follower in full and refuses to cancel the head', async () => {
    const t = boot();
    const seat = await launchedSeason(t);
    await promoteHq(t, seat, 2);
    await t.mutation(api.constructions.start, { ...seat, building: 'billets', regionId: ARDENNES });
    await t.mutation(api.constructions.start, { ...seat, building: 'warehouse', regionId: JURA });

    const before = await t.query(api.view.playerView, seat);
    const head = before.me.construction!;
    const follower = before.me.constructionQueue[0]!;

    await expect(
      t.mutation(api.constructions.cancel, { ...seat, constructionId: head.id }),
    ).rejects.toThrow('CONSTRUCTION_ALREADY_STARTED');

    const { refunded } = await t.mutation(api.constructions.cancel, {
      ...seat,
      constructionId: follower.id,
    });
    expect(refunded).toEqual(buildCost('warehouse', 1));

    const after = await t.query(api.view.playerView, seat);
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
    const seat = await launchedSeason(t);
    await promoteHq(t, seat, 2);
    await fill(t, seat, 'alloy', 100_000);
    await fill(t, seat, 'ammunition', 100_000);
    await fill(t, seat, 'food', 100_000);
    await raise(t, seat, 'barracks', MARNE);
    const barracks = await t.run(
      async (ctx) =>
        (await ctx.db.query('buildings').collect()).find((row) => row.key === 'barracks')!._id,
    );

    /** What one enqueue takes and what its cancellation gives back, whichever queue it was. */
    const measure = async (enqueue: () => Promise<unknown>, withdraw: () => Promise<unknown>) => {
      const before = await t.query(api.view.playerView, seat);
      await enqueue();
      const paid = await t.query(api.view.playerView, seat);
      await withdraw();
      const back = await t.query(api.view.playerView, seat);
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
      ...seat,
      buildingId: barracks,
      role: 'infantry',
      tier: 1,
    });
    await t.mutation(api.constructions.start, { ...seat, building: 'billets', regionId: ARDENNES });

    const troops = await measure(
      () =>
        t.mutation(api.troops.recruit, {
          ...seat,
          buildingId: barracks,
          role: 'infantry',
          tier: 1,
        }),
      async () => {
        const waiting = await t.run(async (ctx) =>
          (await ctx.db.query('recruitments').collect()).find((row) => row.finishesAt === null),
        );
        await t.mutation(api.troops.cancel, { ...seat, recruitmentId: waiting!._id });
      },
    );
    const sites = await measure(
      () => t.mutation(api.constructions.start, { ...seat, building: 'warehouse', regionId: JURA }),
      async () => {
        const waiting = (await t.query(api.view.playerView, seat)).me.constructionQueue[0]!;
        await t.mutation(api.constructions.cancel, {
          ...seat,
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
    const seat = await launchedSeason(t);
    await raise(t, seat, 'warehouse', MARNE);
    await expect(
      t.mutation(api.constructions.start, { ...seat, building: 'farm', regionId: MARNE }),
    ).rejects.toThrow('REGION_TAKEN');
    // Including the capital: the headquarters holds its region like any other building.
    await expect(
      t.mutation(api.constructions.start, { ...seat, building: 'billets', regionId: PARIS }),
    ).rejects.toThrow('REGION_TAKEN');
  });

  /** Raising a level moves neither the number of buildings nor the number of regions held, so
   *  neither rule has anything to say about it. */
  it('lets a building already there rise a level', async () => {
    const t = boot();
    const seat = await launchedSeason(t);
    await promoteHq(t, seat, 2);
    await raise(t, seat, 'mine', MOSELLE);
    await t.mutation(api.constructions.start, { ...seat, building: 'mine', regionId: MOSELLE });
  });

  /**
   * A full national ground refuses a **paid** placement, and it names the level that would
   * widen it — the billets below, which nothing owes to anybody.
   */
  it('refuses a paid placement on a full national ground, and says what would lift it', async () => {
    const t = boot();
    const seat = await launchedSeason(t);
    const hqLevel = unlockLevel('billets');
    await promoteHq(t, seat, hqLevel);
    const slots = homeSlots(hqLevel);
    expect(slots).toBe(4);

    // The headquarters eats none of them: the placements below are the whole of the budget.
    const view = await t.query(api.view.playerView, seat);
    const free = view.me.regions
      .filter((region) => region.buildings.length === 0 && region.id !== JURA)
      .slice(0, slots);
    expect(free.length).toBe(slots);
    for (const region of free) await raise(t, seat, 'warehouse', region.id);

    const refused: Record<string, unknown> = await t
      .mutation(api.constructions.start, { ...seat, building: 'billets', regionId: JURA })
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
    await promoteHq(t, seat, MAX_HQ_LEVEL);
    await t.mutation(api.constructions.start, { ...seat, building: 'billets', regionId: JURA });
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
    const seat = await launchedSeason(t, 168, 'usa');

    const slots = homeSlots(HQ_LEVEL_AT_LAUNCH);

    // Filled on bare American regions: a deposit region would starve the debt of ground, and
    // what has to be full here is the *count*, never the map.
    const opening = await t.query(api.view.playerView, seat);
    /** Ce que la saison doit **encore** : le quartier général ouvre le socle, mais il est déjà
     *  posé — rien d'autre n'aurait pu l'être avant lui (`HQ_FIRST`). */
    const owed = opening.me.foundation;
    expect(owed.map((due) => due.key)).toEqual(['mine', 'mine', 'farm', 'mill', 'oilWell']);
    const bare = opening.me.regions
      .filter((region) => region.deposit === null && region.buildings.length === 0)
      .slice(0, slots);
    expect(bare.length).toBe(slots);
    for (const region of bare) await raise(t, seat, 'warehouse', region.id);

    const full = await t.query(api.view.playerView, seat);
    const budget = (view: typeof full) =>
      view.me.siteSlots.find((held) => held.site.outpostId === null)!;
    expect(budget(full).taken).toBe(slots);

    for (let placed = 0; placed < owed.length; placed += 1) {
      const view = await t.query(api.view.playerView, seat);
      const { key, deposit } = view.me.foundation[0]!;
      const regionId = view.me.regions.find(
        (region) =>
          region.buildings.length === 0 &&
          region.deposit === deposit &&
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
        ...seat,
        building: key,
        regionId,
      });
      expect(cost).toEqual({});
    }

    const done = await t.query(api.view.playerView, seat);
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
  async function plantOutpost(
    t: ReturnType<typeof boot>,
    seat: Seat,
    point: { lon: number; lat: number },
    level = 1,
  ): Promise<Id<'outposts'>> {
    return t.run(async (ctx) => {
      const player = await seatIn(ctx, seat);
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

  /** El Tarf, on the Algerian coast: quatre régions algériennes dans la portée d'un point de
   *  **niveau un** — 120 km depuis la révision du 31/08, contre 400 avant elle — et pas un pouce
   *  de sol français alentour, donc ce que le point porte est à lui et le budget national ne lui
   *  prête rien. Ghardaïa, dans le Sahara, n'avait plus qu'elle-même à moins de cent vingt
   *  kilomètres. */
  const EL_TARF = { lon: 8.15, lat: 36.72 };
  const NEAR_EL_TARF = 'DZA-2164'; // El Tarf itself
  const ALSO_NEAR = 'DZA-2163'; // Annaba, 57 km away
  const SOUK_AHRAS = 'DZA-2222'; // 66 km away
  const GUELMA = 'DZA-2218'; // 76 km away
  /** Jijel, 158 km de la première de ses cellules : la voisine que le disque d'un point neuf
   *  n'atteint pas (révision du 17/09 — Skikda, son ancienne doublure, est à 72 km du point et
   *  n'était hors d'atteinte que par son pôle). */
  const OUT_OF_REACH = 'DZA-2165';

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
    const seat = await launchedSeason(t);
    const one = await plantOutpost(t, seat, EL_TARF, 1);
    const three = await plantOutpost(t, seat, { lon: 45, lat: 25 }, 3);

    const view = await t.query(api.view.playerView, seat);
    expect(budgetOf(view, null)?.total).toBe(homeSlots(HQ_LEVEL_AT_LAUNCH));
    expect(budgetOf(view, one)?.total).toBe(1);
    expect(budgetOf(view, three)?.total).toBe(3);
  });

  /**
   * **La vue sert le cercle entier d'un point, pas la seule région de son pied** (ADR 0020 §1 :
   * là où je tiens est là où je peux bâtir). `heldOver` colorait le cercle depuis toujours,
   * quand `me.regions` n'offrait que le sol du point : le joueur voyait tenu ce sur quoi la
   * carte ne lui donnait aucune icône de construction, et le serveur, lui, acceptait déjà.
   */
  it('serves every region inside the reach of an outpost, and none beyond it', async () => {
    const t = boot();
    const seat = await launchedSeason(t);
    const outpostId = await plantOutpost(t, seat, EL_TARF, 1);

    const view = await t.query(api.view.playerView, seat);
    const served = new Map(view.me.regions.map((region) => [region.id, region]));
    for (const regionId of [NEAR_EL_TARF, ALSO_NEAR, SOUK_AHRAS, GUELMA]) {
      expect(served.get(regionId)?.site).toEqual({ outpostId });
    }
    expect(served.has(OUT_OF_REACH)).toBe(false);
  });

  /** **Un point hors service ancre encore** (ADR 0020 §10) : il ne colore plus, et c'est une
   *  autre question — ce qu'il porte reste à lui, et la vue continue de l'offrir. */
  it('serves the reach of an outpost out of service', async () => {
    const t = boot();
    const seat = await launchedSeason(t);
    const outpostId = await plantOutpost(t, seat, EL_TARF, 1);
    await t.run(async (ctx) =>
      ctx.db.patch(outpostId, { disabledUntil: Date.now() + 6 * 60 * 60 * 1000 }),
    );

    const view = await t.query(api.view.playerView, seat);
    const served = view.me.regions.find((region) => region.id === ALSO_NEAR);
    expect(served?.site).toEqual({ outpostId });
    expect(served?.linked).toBe(false);
  });

  /** The whole point of a local budget: a nation whose home ground is full is not a nation
   *  that has stopped building — it is a nation that has to go out. */
  it('refuses on the site that is full and accepts on the next one', async () => {
    const t = boot();
    const seat = await launchedSeason(t);
    const outpostId = await plantOutpost(t, seat, EL_TARF, 1);
    await fill(t, seat, 'alloy', 100_000);
    await fill(t, seat, 'food', 100_000);

    const opening = await t.query(api.view.playerView, seat);
    const home = opening.me.regions
      .filter((region) => region.buildings.length === 0)
      .slice(0, homeSlots(HQ_LEVEL_AT_LAUNCH));
    for (const region of home) await raise(t, seat, 'warehouse', region.id);

    const filled = await t.query(api.view.playerView, seat);
    const spare = filled.me.regions.find((region) => region.buildings.length === 0)!;
    await expect(
      t.mutation(api.constructions.start, { ...seat, building: 'warehouse', regionId: spare.id }),
    ).rejects.toThrow('SITE_SLOTS_FULL');

    // The Algerian point carries one placement of its own, and the full home ground is no part
    // of that reading.
    await t.mutation(api.constructions.start, {
      ...seat,
      building: 'warehouse',
      regionId: NEAR_EL_TARF,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const after = await t.query(api.view.playerView, seat);
    expect(budgetOf(after, outpostId)?.taken).toBe(1);
    // And that point is full in its turn: one level, one placement.
    await expect(
      t.mutation(api.constructions.start, { ...seat, building: 'warehouse', regionId: ALSO_NEAR }),
    ).rejects.toThrow('SITE_SLOTS_FULL');
  });

  /**
   * **An outpost destroyed leaves its buildings standing and its anchor dead** (ADR 0020 §10).
   * Nothing is re-hung anywhere — that would move an old placement into a budget its owner
   * never spent — and nothing more goes up on the ground it used to cover.
   */
  it('accepts no placement once the outpost that carried the ground is gone', async () => {
    const t = boot();
    const seat = await launchedSeason(t);
    const outpostId = await plantOutpost(t, seat, EL_TARF, 3);
    await fill(t, seat, 'alloy', 100_000);
    await fill(t, seat, 'food', 100_000);
    await t.mutation(api.constructions.start, {
      ...seat,
      building: 'warehouse',
      regionId: NEAR_EL_TARF,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    await t.run(async (ctx) => ctx.db.delete(outpostId));

    const after = await t.query(api.view.playerView, seat);
    expect(after.me.buildings.some((building) => building.regionId === NEAR_EL_TARF)).toBe(true);
    expect(after.me.siteSlots.map((held) => held.site.outpostId)).toEqual([null]);
    await expect(
      t.mutation(api.constructions.start, { ...seat, building: 'warehouse', regionId: ALSO_NEAR }),
    ).rejects.toThrow('OUT_OF_OUTPOST_REACH');
  });

  /**
   * **Le frein de l'expansion est le prix, plus l'entretien** (révision du 15/09 de l'ADR 0020
   * §10). Un avant-poste debout, fût-il de niveau 3, ne touche aucun des huit taux : il est payé
   * à la fondation puis à chaque élévation, et il ne coûte plus rien à tenir.
   */
  it('leaves every rate untouched by an outpost held, whatever its level', async () => {
    const t = boot();
    const seat = await launchedSeason(t);
    const before = await t.query(api.view.playerView, seat);
    expect(before.me.upkeep.outposts).toBe(0);

    await plantOutpost(t, seat, EL_TARF, 3);
    const after = await t.query(api.view.playerView, seat);
    expect(after.me.upkeep.outposts).toBe(1);
    for (const key of RESOURCES) {
      expect(after.me.resources[key].ratePerHour).toBe(before.me.resources[key].ratePerHour);
    }
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
    const seat = await launchedSeason(t);
    await raise(t, seat, 'arsenal', MOSELLE);
    vi.advanceTimersByTime(20 * 3_600_000);

    const view = await t.query(api.view.playerView, seat);
    expect(view.me.resources.alloy.stock).toBe(KIT.alloy);
    expect(view.me.resources.ammunition.stock).toBe(KIT.ammunition);
    expect(chainOf(view, 'arsenal')).toMatchObject({ state: 'idle', commanded: true, order: null });
  });

  /** The foundry keeps running on its own: its inputs are spent nowhere else. */
  it('leaves the uncommanded chains alone', async () => {
    const t = boot();
    const seat = await launchedSeason(t);
    await raise(t, seat, 'foundry', MOSELLE);
    await fill(t, seat, 'alloy', 0);
    vi.advanceTimersByTime(10 * 3_600_000);

    const view = await t.query(api.view.playerView, seat);
    expect(chainOf(view, 'foundry')).toMatchObject({ commanded: false });
    expect(view.me.resources.alloy.stock).toBeGreaterThan(0);
  });

  it('converts exactly the lot, once, and then falls silent again', async () => {
    const t = boot();
    const seat = await launchedSeason(t);
    await raise(t, seat, 'arsenal', MOSELLE);
    await t.mutation(api.industry.order, { ...seat, chain: 'arsenal', quantity: 12 });

    // Four hours at three an hour would make twelve; twenty hours make twelve all the same.
    vi.advanceTimersByTime(20 * 3_600_000);
    const view = await t.query(api.view.playerView, seat);
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
    const seat = await launchedSeason(t);
    await raise(t, seat, 'arsenal', MOSELLE);

    const idle = chainOf(await t.query(api.view.playerView, seat), 'arsenal');
    expect(idle).toMatchObject({ perHour: 0, nominalPerHour: 3 });

    await t.mutation(api.industry.order, { ...seat, chain: 'arsenal', quantity: 60 });
    const running = chainOf(await t.query(api.view.playerView, seat), 'arsenal');
    expect(running).toMatchObject({ perHour: 3, nominalPerHour: 3, state: 'running' });
  });

  /** Nothing is taken in advance, so dropping a lot returns nothing — and owes nothing. */
  it('leaves the unconverted matter where it was when a lot is dropped', async () => {
    const t = boot();
    const seat = await launchedSeason(t);
    await raise(t, seat, 'arsenal', MOSELLE);
    await t.mutation(api.industry.order, { ...seat, chain: 'arsenal', quantity: 90 });
    vi.advanceTimersByTime(2 * 3_600_000);
    await t.mutation(api.industry.cancelOrder, { ...seat, chain: 'arsenal' });
    vi.advanceTimersByTime(20 * 3_600_000);

    const view = await t.query(api.view.playerView, seat);
    // Six made in two hours, and not one more after the drop.
    expect(view.me.resources.ammunition.stock).toBe(KIT.ammunition + 6);
    expect(view.me.resources.alloy.stock).toBe(KIT.alloy - 6);
    expect(chainOf(view, 'arsenal')).toMatchObject({ state: 'idle', order: null });
  });

  it('refuses a lot the input reserve cannot cover, and names the ceiling', async () => {
    const t = boot();
    const seat = await launchedSeason(t);
    await raise(t, seat, 'arsenal', MOSELLE);

    await expect(
      t.mutation(api.industry.order, { ...seat, chain: 'arsenal', quantity: KIT.alloy + 1 }),
    ).rejects.toThrow(/ORDER_ABOVE_RESERVE/);

    const view = await t.query(api.view.playerView, seat);
    expect(chainOf(view, 'arsenal').maxOrder).toBe(KIT.alloy);
  });

  it('refuses to command a chain that runs on its own', async () => {
    const t = boot();
    const seat = await launchedSeason(t);
    await raise(t, seat, 'foundry', MOSELLE);

    await expect(
      t.mutation(api.industry.order, { ...seat, chain: 'foundry', quantity: 10 }),
    ).rejects.toThrow(/CHAIN_NOT_COMMANDED/);
  });

  /**
   * `v.number()` admits NaN, and NaN is false against every comparison: `wanted <= 0` and
   * `wanted > maximum` both let it through, the lot was filed, and every stock became NaN — after
   * which no price could ever be refused again.
   */
  it('refuses a lot that is not a number, and leaves every stock as it was', async () => {
    const t = boot();
    const seat = await launchedSeason(t);
    await raise(t, seat, 'arsenal', MOSELLE);

    await expect(
      t.mutation(api.industry.order, { ...seat, chain: 'arsenal', quantity: Number.NaN }),
    ).rejects.toThrow(/EMPTY_ORDER/);

    vi.advanceTimersByTime(5 * 3_600_000);
    const view = await t.query(api.view.playerView, seat);
    expect(chainOf(view, 'arsenal')).toMatchObject({ order: null });
    expect(view.me.resources.alloy.stock).toBe(KIT.alloy);
    expect(view.me.resources.ammunition.stock).toBe(KIT.ammunition);
  });
});

/**
 * The one door every price goes through fails closed: a stock that is not a number is not a
 * stock that covers a cost. Whatever way it got there, it must never buy.
 */
describe('a stock that is not a number buys nothing', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('refuses a construction that a NaN alloy stock would have let through', async () => {
    const t = boot();
    const seat = await launchedSeason(t);
    await promoteHq(t, seat, unlockLevel('billets'));
    await fill(t, seat, 'alloy', Number.NaN);

    await expect(
      t.mutation(api.constructions.start, { ...seat, building: 'billets', regionId: MARNE }),
    ).rejects.toThrow(/INSUFFICIENT_RESOURCE/);
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

describe('legacy depot compatibility', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  async function legacy(
    t: ReturnType<typeof boot>,
    seat: Seat,
    level = 1,
    finishesAt: number | null = null,
  ) {
    return t.run(async (ctx) => {
      const player = await seatIn(ctx, seat);
      const id = await ctx.db.insert('constructions', {
        playerId: player._id,
        building: 'depot',
        regionId: JURA,
        level,
        rank: 1,
        finishesAt,
      });
      return { id, playerId: player._id };
    });
  }

  it('rejects direct new depot placement without spending or queueing', async () => {
    const t = boot();
    const seat = await launchedSeason(t);
    const before = await t.query(api.view.playerView, seat);
    await expect(
      t.mutation(api.constructions.start, {
        ...seat,
        building: 'depot',
        regionId: JURA,
      }),
    ).rejects.toThrow('UNKNOWN_BUILDING');
    const after = await t.query(api.view.playerView, seat);
    expect(after.me.resources).toEqual(before.me.resources);
    expect(after.me.construction).toBeNull();
  });

  it('adds legacy and current levels for all eight caps without clipping existing stocks', async () => {
    const t = boot();
    const seat = await launchedSeason(t);
    await raise(t, seat, 'warehouse', MOSELLE, 2);
    await raise(t, seat, 'depot', JURA, 3);
    for (const key of RESOURCES) await fill(t, seat, key, 5000);
    const view = await t.query(api.view.playerView, seat);
    for (const key of RESOURCES) {
      expect(view.me.resources[key]).toMatchObject({ cap: 3400, stock: 5000 });
    }
    expect(view.me.buildings.find((b) => b.regionId === JURA)).toMatchObject({
      key: 'warehouse',
      level: 3,
    });
    expect(view.me.regions.find((r) => r.id === JURA)?.buildings).toEqual([
      { key: 'warehouse', level: 3 },
    ]);
  });

  it('raises a standing depot through warehouse while preserving identity, anchor and tariff', async () => {
    const t = boot();
    const seat = await launchedSeason(t);
    await promoteHq(t, seat, 3);
    await fill(t, seat, 'coal', 100);
    await raise(t, seat, 'depot', JURA);
    const before = await t.run(async (ctx) => {
      const b = (await ctx.db.query('buildings').collect()).find((b) => b.key === 'depot')!;
      await ctx.db.patch(b._id, { outpostId: null });
      return (await ctx.db.get(b._id))!;
    });
    const view = await t.query(api.view.playerView, seat);
    expect(view.me.buildings.find((b) => b.id === before._id)).toMatchObject({
      key: 'warehouse',
      nextLevelCost: { alloy: 72, coal: 27 },
      nextLevelMinutes: 54,
    });
    const started = await t.mutation(api.constructions.start, {
      ...seat,
      building: 'warehouse',
      regionId: JURA,
    });
    expect(started).toMatchObject({ level: 2, cost: { alloy: 72, coal: 27 } });
    vi.advanceTimersByTime(54 * 60_000);
    await t.finishInProgressScheduledFunctions();
    const after = await t.run((ctx) => ctx.db.get(before._id));
    expect(after).toEqual({ ...before, level: 2 });
  });

  it('starts and finishes a queued depot using its paid duration and preserves its industry value', async () => {
    const t = boot();
    const seat = await launchedSeason(t);
    await t.mutation(api.constructions.start, {
      ...seat,
      building: 'warehouse',
      regionId: MOSELLE,
    });
    const { id, playerId } = await legacy(t, seat);
    const queued = await t.query(api.view.playerView, seat);
    expect(queued.me.constructionQueue[0]).toMatchObject({ key: 'warehouse' });
    vi.advanceTimersByTime(25 * 60_000);
    await t.finishInProgressScheduledFunctions();
    const running = await t.run((ctx) => ctx.db.get(id));
    expect(running?.finishesAt).toBe(Date.now() + 30 * 60_000);
    vi.advanceTimersByTime(30 * 60_000);
    await t.finishInProgressScheduledFunctions();
    const view = await t.query(api.view.playerView, seat);
    const building = view.me.buildings.find((b) => b.regionId === JURA)!;
    expect(building).toMatchObject({
      key: 'warehouse',
      level: 1,
      nextLevelCost: { alloy: 72, coal: 27 },
      nextLevelMinutes: 54,
    });
    expect(await t.run((ctx) => ctx.db.get(building.id as Id<'buildings'>))).toMatchObject({
      key: 'warehouse',
      regionId: JURA,
      level: 1,
      outpostId: null,
    });
    /** L'édition n'est plus écrite par `publish` mais par le travail qu'il lance (13/09) : le
     *  rendez-vous et l'édition sont deux mutations, pour qu'une édition qui déborde n'emporte
     *  plus la chaîne avec elle. */
    await t.mutation(internal.press.publish, { playerId });
    await vi.advanceTimersByTimeAsync(1);
    await t.finishInProgressScheduledFunctions();
    const edition = await t.run(async (ctx) =>
      (await ctx.db.query('editions').collect()).find((e) => e.playerId === playerId),
    );
    // Headquarters (60), warehouse (30), legacy depot (40).
    expect(edition?.industry).toBe(130);
    await promoteHq(t, seat, 2);
    await fill(t, seat, 'coal', 100);
    const raised = await t.mutation(api.constructions.start, {
      ...seat,
      building: 'warehouse',
      regionId: JURA,
    });
    expect(raised).toMatchObject({ level: 2, cost: { alloy: 72, coal: 27 } });
    vi.advanceTimersByTime(54 * 60_000);
    await t.finishInProgressScheduledFunctions();
    expect(await t.run((ctx) => ctx.db.get(building.id as Id<'buildings'>))).toMatchObject({
      key: 'warehouse',
      regionId: JURA,
      level: 2,
      outpostId: null,
    });
  });

  it('finishes an already running legacy raise without duplicating or moving the building', async () => {
    const t = boot();
    const seat = await launchedSeason(t);
    await raise(t, seat, 'depot', JURA);
    const before = await t.run(async (ctx) =>
      (await ctx.db.query('buildings').collect()).find((b) => b.key === 'depot')!,
    );
    const { id } = await legacy(t, seat, 2, Date.now());
    await t.mutation(internal.constructions.finish, { constructionId: id });
    await t.mutation(internal.constructions.finish, { constructionId: id });
    expect(await t.run((ctx) => ctx.db.get(before._id))).toEqual({ ...before, level: 2 });
    const view = await t.query(api.view.playerView, seat);
    expect(view.me.buildings.filter((b) => b.regionId === JURA)).toHaveLength(1);
  });

  it('refunds a legacy entry at its own price when its ground is lost before it starts', async () => {
    const t = boot();
    const seat = await launchedSeason(t);
    await t.mutation(api.constructions.start, {
      ...seat,
      building: 'warehouse',
      regionId: MOSELLE,
    });
    const { id } = await legacy(t, seat);
    await raise(t, seat, 'farm', JURA);
    await fill(t, seat, 'alloy', 2000);
    await fill(t, seat, 'coal', 2000);
    vi.advanceTimersByTime(25 * 60_000);
    await t.finishInProgressScheduledFunctions();
    expect(await t.run((ctx) => ctx.db.get(id))).toBeNull();
    const view = await t.query(api.view.playerView, seat);
    expect(view.me.resources.alloy.stock).toBe(2040);
    expect(view.me.resources.coal.stock).toBe(2015);
    expect(view.me.buildings.filter((b) => b.regionId === JURA).map((b) => b.key)).toEqual([
      'farm',
    ]);
  });

  it('refunds the exact legacy bill above capacity and refuses cancelling a running entry', async () => {
    const t = boot();
    const seat = await launchedSeason(t);
    await fill(t, seat, 'alloy', 2000);
    await fill(t, seat, 'coal', 2000);
    const { id } = await legacy(t, seat, 2);
    expect(await t.mutation(api.constructions.cancel, { ...seat, constructionId: id })).toEqual({
      refunded: { alloy: 72, coal: 27 },
    });
    const view = await t.query(api.view.playerView, seat);
    expect(view.me.resources.alloy.stock).toBe(2072);
    expect(view.me.resources.coal.stock).toBe(2027);
    const running = await legacy(t, seat, 1, Date.now() + 60_000);
    await expect(
      t.mutation(api.constructions.cancel, { ...seat, constructionId: running.id }),
    ).rejects.toThrow('CONSTRUCTION_ALREADY_STARTED');
  });
});

/**
 * **Un avant-poste se monte, comme un bâtiment** (précision du 15/09 de l'ADR 0020 §10). Le
 * niveau existait au schéma depuis toujours et rien ne l'écrivait : la fiche d'un point plein
 * disait « améliorez-le » sans qu'aucun geste ne le permette.
 *
 * Ce qui est sous test ici est la **file** — le débit, le tour, le refus, le remboursement. Ce
 * que le niveau change une fois acquis (la couleur, la portée, le relevé) est mesuré là où ces
 * choses vivent (`production.test.ts`).
 */
describe('raising an outpost', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 8, 15, 12));
  });
  afterEach(() => vi.useRealTimers());

  const PRAHOVA = 'ROU-310';
  const PRAHOVA_POINT = regionFacts(PRAHOVA)!.point;

  /** Planté à la main : ce qui est sous test est l'élévation, jamais la marche qui fonde. */
  const plant = async (t: ReturnType<typeof boot>, seat: Seat, level = 1) =>
    t.run(async (ctx) => {
      const player = await seatIn(ctx, seat);
      return ctx.db.insert('outposts', {
        seasonId: player.seasonId,
        playerId: player._id,
        point: { lon: PRAHOVA_POINT[0], lat: PRAHOVA_POINT[1] },
        hostCountry: 'ROU',
        regionId: PRAHOVA,
        level,
        specialization: 'relay',
        foundedAt: Date.now(),
        disabledUntil: null,
        immuneUntil: null,
      });
    });

  const levelOf = async (t: ReturnType<typeof boot>, outpostId: Id<'outposts'>) =>
    (await t.run(async (ctx) => ctx.db.get(outpostId)))!.level;

  const alloyOf = async (t: ReturnType<typeof boot>, seat: Seat) =>
    (await t.query(api.view.playerView, seat)).me.resources.alloy.stock;

  /** Cas 1 et 2 : l'ordre entre dans la file, il est débité, et à son terme le point porte un
   *  niveau, un emplacement et le rayon de plus. */
  it('bills the raise at the enqueue and hands the level, the placement and the reach', async () => {
    const t = boot();
    const seat = await launchedSeason(t);
    await fill(t, seat, 'alloy', 1000);
    await fill(t, seat, 'coal', 1000);
    const outpostId = await plant(t, seat);
    const opening = await alloyOf(t, seat);

    await t.mutation(api.constructions.raiseOutpost, { ...seat, outpostId });
    expect(await alloyOf(t, seat)).toBe(opening - (buildCost('outpost', 2).alloy ?? 0));

    const queued = await t.query(api.view.playerView, seat);
    expect(queued.me.construction).toMatchObject({ key: 'outpost', outpostId });
    expect(await levelOf(t, outpostId)).toBe(1);

    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const done = await t.query(api.view.playerView, seat);
    expect(await levelOf(t, outpostId)).toBe(2);
    expect(done.me.construction).toBeNull();
    expect(done.me.outposts[0]).toMatchObject({ id: outpostId, level: 2 });
    /** L'emplacement de plus, lu là où toute la pose le lit : le budget du site. */
    expect(done.me.siteSlots.find((budget) => budget.site.outpostId === outpostId)?.total).toBe(2);
  });

  /** **Une élévation n'est pas un bâtiment** : elle ne prend pas la région de son point, donc
   *  elle n'y interdit rien — ni un chantier, ni un emplacement. */
  it('claims no ground: a construction on the point’s own region still goes through', async () => {
    const t = boot();
    const seat = await launchedSeason(t);
    await fill(t, seat, 'alloy', 1000);
    await fill(t, seat, 'coal', 1000);
    const outpostId = await plant(t, seat);

    await t.mutation(api.constructions.raiseOutpost, { ...seat, outpostId });
    await expect(
      t.mutation(api.constructions.start, { ...seat, building: 'oilWell', regionId: PRAHOVA }),
    ).resolves.toBeDefined();
  });

  /** Cas 3 : au dernier niveau il n'y a plus rien à offrir, et le refus nomme son plafond. */
  it('refuses the raise at the last level', async () => {
    const t = boot();
    const seat = await launchedSeason(t);
    await fill(t, seat, 'alloy', 1000);
    await fill(t, seat, 'coal', 1000);
    const outpostId = await plant(t, seat, OUTPOST_MAX_LEVEL);

    await expect(
      t.mutation(api.constructions.raiseOutpost, { ...seat, outpostId }),
    ).rejects.toThrow('MAX_LEVEL_REACHED');
  });

  /** Cas 4 : **on ne rénove pas sous le feu**, et une file déjà lancée **attend** — elle n'est
   *  ni annulée ni remboursée : le point revient, et le chantier est payé. */
  it('refuses a raise on a disabled point, and makes a queued one wait for it', async () => {
    const t = boot();
    const seat = await launchedSeason(t);
    await fill(t, seat, 'alloy', 1000);
    await fill(t, seat, 'coal', 1000);
    const outpostId = await plant(t, seat);
    const disabledUntil = Date.now() + 4 * 3_600_000;

    await t.run(async (ctx) => ctx.db.patch(outpostId, { disabledUntil }));
    await expect(
      t.mutation(api.constructions.raiseOutpost, { ...seat, outpostId }),
    ).rejects.toThrow('OUTPOST_DISABLED');

    // Remise en service, mise en file, puis désactivation d'un point dont le chantier est en
    // tête et pas encore parti : ce que la file fait alors est attendre.
    await t.run(async (ctx) => ctx.db.patch(outpostId, { disabledUntil: null }));
    await t.mutation(api.constructions.raiseOutpost, { ...seat, outpostId });
    await t.run(async (ctx) => {
      const head = (await ctx.db.query('constructions').collect())[0]!;
      await ctx.db.patch(head._id, { finishesAt: null });
      await ctx.db.patch(outpostId, { disabledUntil });
    });
    await t.mutation(api.constructions.raiseOutpost, { ...seat, outpostId }).catch(() => null);
    await t.run(async (ctx) => {
      const player = await seatIn(ctx, seat);
      await ctx.runMutation(internal.constructions.resume, { playerId: player._id });
    });

    const waiting = await t.run(async (ctx) => ctx.db.query('constructions').collect());
    expect(waiting).toHaveLength(1);
    expect(waiting[0]!.finishesAt).toBeNull();
    expect(await levelOf(t, outpostId)).toBe(1);
  });

  /** Cas 5 : rien n'a commencé, donc tout se rend — et le niveau n'a pas bougé. */
  it('refunds a cancelled raise whole and leaves the level alone', async () => {
    const t = boot();
    const seat = await launchedSeason(t);
    await fill(t, seat, 'alloy', 1000);
    await fill(t, seat, 'coal', 1000);
    const outpostId = await plant(t, seat);
    // Un chantier de bâtiment prend la tête : derrière lui, l'élévation n'a pas commencé.
    await t.mutation(api.constructions.start, { ...seat, building: 'warehouse', regionId: JURA });
    const opening = await alloyOf(t, seat);
    await t.mutation(api.constructions.raiseOutpost, { ...seat, outpostId });

    const queued = await t.query(api.view.playerView, seat);
    const entry = queued.me.constructionQueue[0]!;
    expect(entry).toMatchObject({ key: 'outpost', outpostId });

    await t.mutation(api.constructions.cancel, { ...seat, constructionId: entry.id });
    expect(await alloyOf(t, seat)).toBe(opening);
    expect(await levelOf(t, outpostId)).toBe(1);
  });

  /** Cas 6 : une seconde élévation attendrait un niveau que la première n'a pas atteint, donc
   *  tarifé faux — une seule à la fois, par point. */
  it('refuses a second raise of the same point while the first is queued', async () => {
    const t = boot();
    const seat = await launchedSeason(t);
    await fill(t, seat, 'alloy', 1000);
    await fill(t, seat, 'coal', 1000);
    const outpostId = await plant(t, seat);

    await t.mutation(api.constructions.raiseOutpost, { ...seat, outpostId });
    await expect(
      t.mutation(api.constructions.raiseOutpost, { ...seat, outpostId }),
    ).rejects.toThrow('OUTPOST_RAISE_QUEUED');
  });

  /** La dépêche du propriétaire, et de lui seul : un point qui grandit se relève, il ne
   *  s'annonce pas (ADR 0005). */
  it('files the dispatch with the region and the level, and nothing at the neighbour', async () => {
    const t = boot();
    const seat = await launchedSeason(t);
    await fill(t, seat, 'alloy', 1000);
    await fill(t, seat, 'coal', 1000);
    const outpostId = await plant(t, seat);

    await t.mutation(api.constructions.raiseOutpost, { ...seat, outpostId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const filed = await t.run(async (ctx) => ctx.db.query('notices').collect());
    const raised = filed.filter((notice) => notice.kind === 'outpostRaised');
    expect(raised).toHaveLength(1);
    expect(raised[0]).toMatchObject({ regionId: PRAHOVA, level: 2, hostCountry: 'ROU' });
  });

  /** Le rayon suit le niveau : c'est la table qui le dit, et rien ici ne la recopie. */
  it('opens the next radius, straight out of the level table', async () => {
    expect(outpostReachKm(2)).toBeGreaterThan(outpostReachKm(1));
  });
});
