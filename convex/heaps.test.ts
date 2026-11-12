import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import type { BuildingKey } from '../src/domain/ids';
import {
  EXTRACTION_PER_HOUR,
  HEAP_CAP_HOURS,
  NARVIK_UNLINKED_SHARE,
  OUTPOST_DISABLED_HOURS,
  outpostReachKm,
} from './constants';
import { coalDryAt, economyOf, type Economy } from './resources';
import { recordLinkage } from './holding';
import { reportChange, settleBeforeChange } from './production';
import { handOver } from './strategicPoints';
import { leaveTheWar } from './players';
import { endowIrregular, irregularSeat } from './objectives';
import { regionFacts } from './regions';
import { surveyFoundation } from './surveys';
import schema from './schema';
import { modules } from './test.setup';
import {
  foundSeat,
  holdPoint,
  joinSeat,
  neutralPoint,
  placeHq,
  pointIn,
  seatIn,
  surveyRegion,
} from './seats.fixture';
import type { Seat } from './seats.fixture';

/**
 * **Le tas** (ADR 0041 §1, #545) : la production d'une exploitation s'entasse à son pied, la
 * fondation verse seule le débit d'un niveau 1, et une ligne `heaps` ne s'écrit que quand le débit
 * du tas change. L'heure est fausse : un tas se lit à deux dates.
 */

const boot = () => convexTest({ schema, modules, transactionLimits: true });
type Bench = ReturnType<typeof boot>;

const HOUR = 3_600_000;
const MIDDAY = Date.UTC(2026, 8, 9, 12);
const MOSELLE = 'FRA-5328'; // coal, French soil
const MARNE = 'FRA-5323'; // food, French soil
const PRAHOVA = 'ROU-310'; // oil, under nobody's flag
const PRAHOVA_POINT = regionFacts(PRAHOVA)!.point;
const COAL = EXTRACTION_PER_HOUR.coal;
const NO_REST = { startMinutes: 0, endMinutes: 0 };

async function launched(t: Bench) {
  const { seat, code } = await foundSeat(t, 'Pierre', 0.5);
  const guest = await joinSeat(t, code, 'Léa');
  await t.mutation(api.players.reserveNation, { ...seat, nation: 'france' });
  await t.mutation(api.players.declareReady, { ...seat, ready: true });
  await t.mutation(api.players.reserveNation, { ...guest, nation: 'ussr' });
  await t.mutation(api.players.declareReady, { ...guest, ready: true });
  await t.mutation(api.seasons.launch, seat);
  await placeHq(t, seat);
  await placeHq(t, guest);
  await t.run(async (ctx) => {
    for (const who of [seat, guest])
      await ctx.db.patch((await seatIn(ctx, who))._id, { restWindow: NO_REST });
  });
  return { seat, guest };
}

const playerOf = (t: Bench, seat: Seat) => t.run((ctx) => seatIn(ctx, seat));

async function exploitation(
  t: Bench,
  seat: Seat,
  key: BuildingKey,
  regionId: string,
  { level = 1, mark = false }: { level?: number; mark?: boolean } = {},
): Promise<Id<'buildings'>> {
  const player = await playerOf(t, seat);
  return t.run((ctx) =>
    ctx.db.insert('buildings', {
      seasonId: player.seasonId,
      playerId: player._id,
      key,
      regionId,
      point: pointIn(regionId),
      level,
      outpostId: null,
      ...(mark ? { foundationMark: true as const } : {}),
    }),
  );
}

const heapOf = async (t: Bench, seat: Seat, id: Id<'buildings'>) =>
  (await t.query(api.view.playerView, seat)).me.buildings.find((one) => one.id === id)?.heap;

const rowsOf = (t: Bench) => t.run((ctx) => ctx.db.query('heaps').collect());

const economy = async <T>(
  t: Bench,
  seat: Seat,
  read: (economy: Economy, now: number) => T,
): Promise<T> => {
  const player = await playerOf(t, seat);
  return t.run(async (ctx) => read(await economyOf(ctx, player._id, Date.now()), Date.now()));
};

const stockOf = (t: Bench, seat: Seat) => economy(t, seat, (one) => one.stocks.coal);
const coalRateOf = (t: Bench, seat: Seat) => economy(t, seat, (one) => one.ratePerHour.coal);

const at = (hours: number) => vi.setSystemTime(MIDDAY + hours * HOUR);

describe('the heap of an exploitation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  it('piles the whole yield of an unmarked exploitation, and credits the stock with none of it', async () => {
    const t = boot();
    const { seat } = await launched(t);
    const mine = await exploitation(t, seat, 'mine', MOSELLE, { level: 2 });
    const before = await stockOf(t, seat);

    at(5);

    expect(await heapOf(t, seat, mine)).toEqual({
      amount: expect.closeTo(5 * 2 * COAL, 5),
      cap: HEAP_CAP_HOURS * 2 * COAL,
      resource: 'coal',
    });
    expect(await stockOf(t, seat)).toBe(before);
    expect(await coalRateOf(t, seat)).toBe(0);
  });

  it('lets a foundation exploitation deliver a level 1 rate, and heaps the surplus of its levels', async () => {
    const t = boot();
    const { seat } = await launched(t);
    const first = await exploitation(t, seat, 'mine', MOSELLE, { mark: true });
    expect(await coalRateOf(t, seat)).toBe(COAL);

    at(4);
    expect(await heapOf(t, seat, first)).toEqual({ amount: 0, cap: 0, resource: 'coal' });

    const raised = await t.run(async (ctx) => {
      await ctx.db.patch(first, { level: 3 });
      return (await ctx.db.get(first))!;
    });
    expect(raised.level).toBe(3);
    expect(await coalRateOf(t, seat)).toBe(COAL);
    expect(await economy(t, seat, (one) => one.extraction[0])).toMatchObject({
      nationalPerHour: COAL,
      heapPerHour: 2 * COAL,
    });
  });

  it('stops a full heap at a day of its levels, and never cuts the national rate of a foundation', async () => {
    const t = boot();
    const { seat } = await launched(t);
    const founded = await exploitation(t, seat, 'mine', MOSELLE, { level: 2, mark: true });
    await t.run(async (ctx) => {
      const player = await seatIn(ctx, seat);
      const coal = (await ctx.db
        .query('resources')
        .withIndex('byPlayer', (q) => q.eq('playerId', player._id))
        .collect())!.find((row) => row.key === 'coal')!;
      await ctx.db.patch(coal._id, { stock: 0, updatedAt: Date.now() });
    });

    at(30);

    expect(await heapOf(t, seat, founded)).toMatchObject({
      amount: HEAP_CAP_HOURS * COAL,
      cap: HEAP_CAP_HOURS * COAL,
    });
    expect(await coalRateOf(t, seat)).toBe(COAL);
    expect(await stockOf(t, seat)).toBeCloseTo(30 * COAL, 5);
  });

  it('keeps the coal clock of a listening post on the national rate alone', async () => {
    const t = boot();
    const { seat } = await launched(t);
    await exploitation(t, seat, 'mine', MOSELLE, { level: 3 });
    await exploitation(t, seat, 'listening', MARNE);
    const dry = await economy(t, seat, (one, now) => ({
      burn: one.upkeep.listeningCoalPerHour,
      rate: one.ratePerHour.coal,
      dryAt: coalDryAt(one, one.stocks.coal, now),
    }));

    expect(dry.burn).toBeGreaterThan(0);
    expect(dry.rate).toBe(-dry.burn);
    expect(dry.dryAt).not.toBeNull();
  });

  it('raises nothing in Blitz: the whole yield is national, and no heap is served', async () => {
    const t = boot();
    const { seat } = await launched(t);
    const mine = await exploitation(t, seat, 'mine', MOSELLE, { level: 2 });
    const player = await playerOf(t, seat);
    await t.run((ctx) => ctx.db.patch(player.seasonId, { mode: 'blitz' }));

    expect(await economy(t, seat, (one) => one.extraction[0]?.heapPerHour)).toBe(0);
    expect(await economy(t, seat, (one) => Object.keys(one.heaps).length)).toBe(0);
    expect(mine).toBeDefined();
  });

  it('serves a heap of 0, present, to an exploitation that yields nothing', async () => {
    const t = boot();
    const { seat } = await launched(t);
    const mine = await exploitation(t, seat, 'mine', MARNE);
    at(6);
    expect(await heapOf(t, seat, mine)).toMatchObject({ amount: 0, cap: 0 });
  });
});

describe('the heap writes itself when its rate changes', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  async function raise(t: Bench, seat: Seat, regionId: string) {
    await t.run(async (ctx) => {
      const player = await seatIn(ctx, seat);
      for (const row of await ctx.db
        .query('resources')
        .withIndex('byPlayer', (q) => q.eq('playerId', player._id))
        .collect())
        await ctx.db.patch(row._id, { stock: 10_000, updatedAt: Date.now() });
      const hq = (await ctx.db
        .query('buildings')
        .withIndex('byPlayer', (q) => q.eq('playerId', player._id))
        .collect())!.find((b) => b.key === 'hq')!;
      await ctx.db.patch(hq._id, { level: 5 });
    });
    await t.mutation(api.constructions.start, {
      ...seat,
      building: 'mine',
      regionId,
      point: pointIn(regionId),
    });
    const work = (await t.run((ctx) => ctx.db.query('constructions').collect()))[0]!;
    await t.run((ctx) => ctx.db.patch(work._id, { finishesAt: Date.now() }));
    await t.mutation(internal.constructions.finish, { constructionId: work._id });
  }

  it('settles the heap at the old level when an elevation lands, and at that moment only', async () => {
    const t = boot();
    const { seat } = await launched(t);
    const mine = await exploitation(t, seat, 'mine', MOSELLE);
    const other = await exploitation(t, seat, 'farm', MARNE);

    at(10);
    expect(await rowsOf(t)).toEqual([]);
    await raise(t, seat, MOSELLE);

    expect(await rowsOf(t)).toMatchObject([
      { buildingId: mine, amount: expect.closeTo(10 * COAL, 5) },
    ]);
    expect(await rowsOf(t)).toHaveLength(1);
    at(12);
    expect((await heapOf(t, seat, mine))!.amount).toBeCloseTo(10 * COAL + 2 * 2 * COAL, 5);
    expect((await heapOf(t, seat, other))!.amount).toBeGreaterThan(0);
  });

  async function outpostUnder(t: Bench, seat: Seat) {
    const player = await playerOf(t, seat);
    return t.run(async (ctx) => {
      const id = await ctx.db.insert('outposts', {
        seasonId: player.seasonId,
        playerId: player._id,
        point: { lon: PRAHOVA_POINT[0], lat: PRAHOVA_POINT[1] },
        hostCountry: 'ROU',
        regionId: PRAHOVA,
        level: 1,
        foundedAt: Date.now(),
        disabledUntil: null,
        immuneUntil: null,
      });
      await surveyFoundation(ctx, player.seasonId, PRAHOVA_POINT, outpostReachKm(1), Date.now());
      return id;
    });
  }

  const colourChange = (
    t: Bench,
    seasonId: Id<'seasons'>,
    when: number,
    write: (ctx: Parameters<Parameters<Bench['run']>[0]>[0]) => Promise<void>,
  ) =>
    t.run(async (ctx) => {
      const before = await settleBeforeChange(ctx, seasonId, when);
      await write(ctx);
      await reportChange(ctx, seasonId, before, Date.now());
    });

  it('settles the heaps a colour change cuts, writes no other row, and gives the hours back only from the end of the cut', async () => {
    const t = boot();
    const { seat } = await launched(t);
    const outpost = await outpostUnder(t, seat);
    const well = await exploitation(t, seat, 'oilWell', PRAHOVA);
    const home = await exploitation(t, seat, 'farm', MARNE);
    const player = await playerOf(t, seat);
    const OIL = EXTRACTION_PER_HOUR.oil;

    at(3);
    await colourChange(t, player.seasonId, MIDDAY + 3 * HOUR, async (ctx) => {
      await ctx.db.patch(outpost, { disabledUntil: MIDDAY + (3 + OUTPOST_DISABLED_HOURS) * HOUR });
    });
    expect(await rowsOf(t)).toMatchObject([
      { buildingId: well, amount: expect.closeTo(3 * OIL, 5) },
    ]);
    expect(await rowsOf(t)).toHaveLength(1);

    at(8);
    expect((await heapOf(t, seat, well))!.amount).toBeCloseTo(3 * OIL, 5);
    expect((await heapOf(t, seat, home))!.amount).toBeGreaterThan(0);

    const back = MIDDAY + (3 + OUTPOST_DISABLED_HOURS) * HOUR;
    vi.setSystemTime(back + 2 * HOUR);
    await t.mutation(internal.production.restoreAfterDisabling, {
      seasonId: player.seasonId,
      at: back,
    });
    expect(await rowsOf(t)).toHaveLength(1);
    expect((await heapOf(t, seat, well))!.amount).toBeCloseTo(3 * OIL + 2 * OIL, 5);
  });

  it('writes no row when a settlement of every belligerent changes no rate', async () => {
    const t = boot();
    const { seat, guest } = await launched(t);
    await exploitation(t, seat, 'mine', MOSELLE);
    await exploitation(t, guest, 'farm', MARNE);
    const player = await playerOf(t, seat);

    at(5);
    await colourChange(t, player.seasonId, Date.now(), async () => {});

    expect(await rowsOf(t)).toEqual([]);
  });

  it('settles at the old share when Narvik changes hands, for the cut exploitations of both holders', async () => {
    const t = boot();
    const { seat } = await launched(t);
    const outpost = await outpostUnder(t, seat);
    const well = await exploitation(t, seat, 'oilWell', PRAHOVA);
    const player = await playerOf(t, seat);
    const OIL = EXTRACTION_PER_HOUR.oil;
    await colourChange(t, player.seasonId, MIDDAY, async (ctx) => {
      await ctx.db.patch(outpost, { disabledUntil: MIDDAY + 100 * HOUR });
    });
    const narvik = await holdPoint(t, seat, 'narvik');
    at(4);
    expect((await heapOf(t, seat, well))!.amount).toBeCloseTo(4 * OIL * NARVIK_UNLINKED_SHARE, 5);

    await t.run(async (ctx) => {
      await handOver(ctx, (await ctx.db.get(narvik))!, null, Date.now());
      await recordLinkage(ctx, player.seasonId);
    });
    at(10);
    expect(await rowsOf(t)).toHaveLength(1);
    expect((await heapOf(t, seat, well))!.amount).toBeCloseTo(4 * OIL * NARVIK_UNLINKED_SHARE, 5);
  });

  it.each(['surrender', 'fall'] as const)(
    'settles at the old colour when a leaving player gives his points back (%s)',
    async (how) => {
      const t = boot();
      const { seat, guest } = await launched(t);
      await outpostUnder(t, seat);
      const well = await exploitation(t, seat, 'oilWell', PRAHOVA);
      const player = await playerOf(t, seat);
      const leaver = await playerOf(t, guest);
      const OIL = EXTRACTION_PER_HOUR.oil;
      const point = await t.run(async (ctx) => {
        const row = await neutralPoint(ctx, player.seasonId, 'tangier');
        await ctx.db.patch(row._id, { regionId: PRAHOVA });
        return row._id;
      });

      at(3);
      await colourChange(t, player.seasonId, Date.now(), async (ctx) => {
        await handOver(ctx, (await ctx.db.get(point))!, leaver._id, Date.now());
        await recordLinkage(ctx, player.seasonId);
      });

      at(12);
      expect((await heapOf(t, seat, well))!.amount).toBeCloseTo(3 * OIL, 5);
      if (how === 'surrender') await t.mutation(api.players.surrender, guest);
      else
        await t.run(async (ctx) => {
          const season = (await ctx.db.get(player.seasonId))!;
          await leaveTheWar(ctx, season, (await ctx.db.get(leaver._id))!, Date.now(), {
            kind: 'playerEliminated',
            by: 'france',
            capturerId: player._id,
            irregulars: false,
          });
        });

      at(14);
      expect((await heapOf(t, seat, well))!.amount).toBeCloseTo(3 * OIL + 2 * OIL, 5);
    },
  );

  it('razes the heap with the exploitation', async () => {
    const t = boot();
    const { seat } = await launched(t);
    const mine = await exploitation(t, seat, 'mine', MOSELLE);
    await t.run(async (ctx) => {
      const player = await seatIn(ctx, seat);
      await ctx.db.insert('heaps', {
        buildingId: mine,
        playerId: player._id,
        seasonId: player.seasonId,
        amount: 7,
        settledAt: Date.now(),
      });
    });

    await t.mutation(api.buildings.demolish, { ...seat, buildingId: mine });

    expect(await rowsOf(t)).toEqual([]);
  });
});

describe('a heap and its raid, its capture, its fog', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  async function takeOver(t: Bench, taker: Seat, site: Doc<'buildings'> | Doc<'outposts'>) {
    const target =
      'key' in site
        ? ({ kind: 'building', buildingId: site._id } as const)
        : ({ kind: 'outpost', outpostId: site._id } as const);
    const player = await playerOf(t, taker);
    const troop = await t.run((ctx) =>
      ctx.db.insert('troops', {
        seasonId: player.seasonId,
        playerId: player._id,
        role: 'infantry',
        tier: 1,
        nominalStrength: 10,
        currentStrength: 10,
        stationedAt: null,
      }),
    );
    const to = { lon: site.point.lon, lat: site.point.lat };
    const movementId = await t.run((ctx) =>
      ctx.db.insert('movements', {
        seasonId: player.seasonId,
        playerId: player._id,
        type: 'attack',
        fromBuildingId: null,
        target,
        from: { lon: to.lon - 1, lat: to.lat },
        to,
        hostCountry: 'FRA',
        points: [{ lon: to.lon - 1, lat: to.lat }, to],
        legs: [{ medium: 'land', distanceUnits: 1 }],
        distanceUnits: 1,
        costUnits: 1,
        troopIds: [troop],
        departedAt: Date.now() - HOUR,
        arrivesAt: Date.now(),
        capture: target,
      }),
    );
    await t.mutation(internal.movements.arrive, { movementId });
    const [capture] = await t.run((ctx) => ctx.db.query('captures').collect());
    vi.setSystemTime(capture!.completesAt);
    await t.mutation(internal.captures.complete, {
      captureId: capture!._id,
      expectedAt: capture!.completesAt,
    });
    return capture!.completesAt;
  }

  it('passes the heap to the captor, settled at the instant of the capture, and its row changes hands', async () => {
    const t = boot();
    const { seat, guest } = await launched(t);
    const mine = await exploitation(t, seat, 'mine', MOSELLE, { level: 3 });
    const loser = await playerOf(t, seat);
    const captor = await playerOf(t, guest);
    at(6);

    const takenAt = await takeOver(t, guest, (await t.run((ctx) => ctx.db.get(mine)))!);

    const held = (await t.run((ctx) => ctx.db.get(mine)))!;
    expect(held.playerId).toBe(captor._id);
    const [row] = await rowsOf(t);
    expect(row).toMatchObject({ buildingId: mine, playerId: captor._id, settledAt: takenAt });
    expect(row!.playerId).not.toBe(loser._id);
    // The heap was 6 h of three levels when the capture began; it grew on until the capture ended.
    expect(row!.amount).toBeGreaterThanOrEqual(6 * 3 * COAL);
    expect(row!.amount).toBeCloseTo(((takenAt - MIDDAY) / HOUR) * 3 * COAL, 4);
    expect((await heapOf(t, guest, mine))!.amount).toBeGreaterThanOrEqual(row!.amount);
    expect(await heapOf(t, seat, mine)).toBeUndefined();
  });

  it('hands the captor an empty heap, not a full one, from an exploitation of the irregulars', async () => {
    const t = boot();
    const { seat, guest } = await launched(t);
    const captor = await playerOf(t, guest);
    const mine = await t.run(async (ctx) => {
      const irregular = await irregularSeat(ctx, captor.seasonId);
      await endowIrregular(ctx, irregular, Date.now());
      return ctx.db.insert('buildings', {
        seasonId: captor.seasonId,
        playerId: irregular,
        key: 'mine',
        regionId: MOSELLE,
        point: pointIn(MOSELLE),
        level: 3,
        outpostId: null,
      });
    });
    expect(seat).toBeDefined();
    at(6);

    const takenAt = await takeOver(t, guest, (await t.run((ctx) => ctx.db.get(mine)))!);

    expect(await rowsOf(t)).toMatchObject([
      { buildingId: mine, playerId: captor._id, amount: 0, settledAt: takenAt },
    ]);
    expect((await heapOf(t, guest, mine))!.amount).toBe(0);
  });

  it('passes the heaps of the buildings anchored to a captured outpost', async () => {
    const t = boot();
    const { seat, guest } = await launched(t);
    const outpost = await t.run(async (ctx) => {
      const player = await seatIn(ctx, seat);
      return ctx.db.insert('outposts', {
        seasonId: player.seasonId,
        playerId: player._id,
        point: { lon: PRAHOVA_POINT[0], lat: PRAHOVA_POINT[1] },
        hostCountry: 'ROU',
        regionId: PRAHOVA,
        level: 1,
        foundedAt: Date.now(),
        disabledUntil: null,
        immuneUntil: null,
      });
    });
    const well = await exploitation(t, seat, 'oilWell', PRAHOVA);
    await t.run((ctx) => ctx.db.patch(well, { outpostId: outpost }));
    const captor = await playerOf(t, guest);
    at(6);

    const takenAt = await takeOver(t, guest, (await t.run((ctx) => ctx.db.get(outpost)))!);

    expect(await rowsOf(t)).toMatchObject([
      { buildingId: well, playerId: captor._id, settledAt: takenAt },
    ]);
  });

  it('serves the moment a heap became full to its owner alone (#550)', async () => {
    const t = boot();
    const { seat, guest } = await launched(t);
    const mine = await exploitation(t, seat, 'mine', MOSELLE, { level: 2 });
    await surveyRegion(t, guest, MOSELLE);

    at(HEAP_CAP_HOURS / 2);
    expect((await heapOf(t, seat, mine))?.fullSince).toBeUndefined();

    at(HEAP_CAP_HOURS + 5);
    const full = (await heapOf(t, seat, mine))?.fullSince;
    expect(full).toBeGreaterThan(0);
    expect(full).toBeLessThan(MIDDAY + (HEAP_CAP_HOURS + 5) * HOUR);
    expect(JSON.stringify(await t.query(api.view.playerView, guest))).not.toContain('fullSince');
  });

  it('never serves a heap through a survey or an enemy building', async () => {
    const t = boot();
    const { seat, guest } = await launched(t);
    const mine = await exploitation(t, seat, 'mine', MOSELLE, { level: 2 });
    await surveyRegion(t, guest, MOSELLE);
    at(5);

    const mineView = await t.query(api.view.playerView, seat);
    expect(mineView.me.buildings.find((one) => one.id === mine)?.heap?.amount).toBeGreaterThan(0);

    const seen = await t.query(api.view.playerView, guest);
    const surveyed = JSON.stringify(seen.surveyedInstallations);
    expect(surveyed).toContain(mine);
    expect(JSON.stringify(seen)).not.toContain('"heap"');
  });
});
