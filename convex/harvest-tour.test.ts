import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import type { BuildingKey, UnitRole } from '../src/domain/ids';
import { nominalStrength } from './constants';
import { pointOfRegion } from './regions';
import { economyOf } from './resources';
import schema from './schema';
import { modules } from './test.setup';
import {
  attacking,
  foundSeat,
  joinSeat,
  placeHq,
  pointIn,
  seatIn,
  unclocked,
  type Seat,
} from './seats.fixture';

/**
 * **La tournée ramasse les tas et les rapporte au stock** (ADR 0041 §2, #546) : un arrêt de
 * ramassage prend le tas dans la place à bord, la récolte se verse au stock national au retour,
 * et rien ne se perd.
 */
const boot = () => convexTest({ schema, modules, transactionLimits: true });
type Bench = ReturnType<typeof boot>;

const HOUR = 3_600_000;
const MIDDAY = Date.UTC(2026, 8, 9, 12);
const MOSELLE = 'FRA-5328'; // coal, no quay
const NORD = 'FRA-5334'; // coal, with a quay
const CORSICA = 'FRA-5297'; // an island: no road from Paris
const MARNE = 'FRA-5323';
const PRAHOVA = 'ROU-310';
const NO_REST = { startMinutes: 0, endMinutes: 0 };
const NONE = { food: 0, steel: 0, coal: 0, oil: 0, ammunition: 0 };

async function launched(t: Bench) {
  const { seat, code } = await foundSeat(t, 'Pierre', 0.5);
  const guest = await joinSeat(t, code, 'Léa');
  await t.mutation(api.players.reserveNation, { ...seat, nation: 'france' });
  await t.mutation(api.players.declareReady, { ...seat, ready: true });
  await t.mutation(api.players.reserveNation, { ...guest, nation: 'ussr' });
  await t.mutation(api.players.declareReady, { ...guest, ready: true });
  await t.mutation(api.seasons.launch, seat);
  await unclocked(t);
  await placeHq(t, seat);
  await placeHq(t, guest);
  for (const one of [seat, guest]) {
    const player = await playerOf(t, one);
    await t.run(async (ctx) => {
      await ctx.db.patch(player._id, { restWindow: NO_REST });
      for (const troop of await ctx.db
        .query('troops')
        .withIndex('byPlayer', (q) => q.eq('playerId', player._id))
        .collect())
        await ctx.db.delete(troop._id);
    });
  }
  return { seat, guest };
}

const playerOf = (t: Bench, seat: Seat) => t.run((ctx) => seatIn(ctx, seat));

async function form(t: Bench, seat: Seat, role: UnitRole, stationedAt: Id<'buildings'>) {
  const player = await playerOf(t, seat);
  const strength = nominalStrength(role, 1);
  return t.run((ctx) =>
    ctx.db.insert('troops', {
      seasonId: player.seasonId,
      playerId: player._id,
      role,
      tier: 1,
      nominalStrength: strength,
      currentStrength: strength,
      stationedAt,
    }),
  );
}

/** Une exploitation neuve : un tas vide depuis maintenant, un niveau 1 sans marque. */
async function exploitation(
  t: Bench,
  seat: Seat,
  regionId: string,
  { key = 'mine', point }: { key?: BuildingKey; point?: { lon: number; lat: number } } = {},
) {
  const player = await playerOf(t, seat);
  return t.run((ctx) =>
    ctx.db.insert('buildings', {
      seasonId: player.seasonId,
      playerId: player._id,
      key,
      regionId,
      point: point ?? pointIn(regionId),
      level: 1,
      outpostId: null,
    }),
  );
}

const building = (t: Bench, seat: Seat, key: BuildingKey) =>
  t.run(async (ctx) => {
    const player = await seatIn(ctx, seat);
    return (await ctx.db
      .query('buildings')
      .withIndex('byPlayer', (q) => q.eq('playerId', player._id))
      .collect())!.find((one) => one.key === key)!._id;
  });

const get = (t: Bench, id: Id<'troops'>) => t.run((ctx) => ctx.db.get(id));
const flying = (t: Bench) => t.run((ctx) => ctx.db.query('movements').collect());
const site = (id: Id<'buildings'>) => ({ kind: 'site' as const, id });
const noticesOf = (t: Bench, kind: string) =>
  t.run(async (ctx) =>
    (await ctx.db.query('notices').collect()).filter((notice) => notice.kind === kind),
  );

async function arriveNext(t: Bench) {
  const movement = (await flying(t))[0]!;
  vi.setSystemTime(movement.arrivesAt + 1);
  await t.mutation(internal.movements.arrive, { movementId: movement._id });
  return movement;
}

const coalOf = async (t: Bench, seat: Seat) => {
  const player = await playerOf(t, seat);
  return t.run(async (ctx) => {
    const economy = await economyOf(ctx, player._id, Date.now());
    return { stock: economy.stocks.coal, cap: economy.cap.coal };
  });
};

async function setStock(t: Bench, seat: Seat, key: string, stock: number) {
  const player = await playerOf(t, seat);
  await t.run(async (ctx) => {
    const row = (
      await ctx.db
        .query('resources')
        .withIndex('byPlayer', (q) => q.eq('playerId', player._id))
        .collect()
    ).find((one) => one.key === key)!;
    await ctx.db.patch(row._id, { stock, updatedAt: Date.now() });
  });
}

const heapRow = (t: Bench, id: Id<'buildings'>) =>
  t.run((ctx) =>
    ctx.db
      .query('heaps')
      .withIndex('byBuilding', (q) => q.eq('buildingId', id))
      .unique(),
  );

describe('the pickup tour', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  /** A mine a day old: its heap is at the ceiling, 288, more than a truck carries. */
  async function heaped(t: Bench, seat: Seat, regionId = MOSELLE) {
    const mine = await exploitation(t, seat, regionId);
    vi.setSystemTime(MIDDAY + 24 * HOUR);
    return mine;
  }

  it('takes what the truck holds off the heap, and credits the stock on return, with nothing to reload', async () => {
    const t = boot();
    const { seat } = await launched(t);
    const hq = await building(t, seat, 'hq');
    const truck = await form(t, seat, 'landTransport', hq);
    const mine = await heaped(t, seat);
    const before = await coalOf(t, seat);

    await t.mutation(api.tours.start, { ...seat, troopId: truck, stops: [site(mine)] });
    expect(await flying(t)).toMatchObject([{ tourLeg: 'stop', pickup: { buildingId: mine } }]);
    expect((await get(t, truck))!.tour).toMatchObject({ stops: [site(mine)] });

    await arriveNext(t);
    expect((await get(t, truck))!.harvest).toMatchObject({ coal: 200 });
    expect((await heapRow(t, mine))!.amount).toBeCloseTo(88, 0);
    expect(await flying(t)).toMatchObject([{ tourLeg: 'base' }]);

    await arriveNext(t);
    expect((await get(t, truck))!.harvest).toBeUndefined();
    expect((await coalOf(t, seat)).stock).toBeGreaterThanOrEqual(before.stock + 200);
    expect(await noticesOf(t, 'harvestReturned')).toMatchObject([
      { delivered: { coal: 200 }, kept: NONE, skipped: 0 },
    ]);
    // A pickup-only tour has no standing order, so it never waits for supplies: it leaves again.
    expect(await flying(t)).toMatchObject([{ tourLeg: 'stop', pickup: { buildingId: mine } }]);
    expect(await noticesOf(t, 'tourWaiting')).toEqual([]);
  });

  it('delivers a depot and picks up in the order drawn, and the depot gets no harvest', async () => {
    const t = boot();
    const { seat } = await launched(t);
    await setStock(t, seat, 'ammunition', 500);
    const hq = await building(t, seat, 'hq');
    const truck = await form(t, seat, 'landTransport', hq);
    await t.run((ctx) => ctx.db.patch(truck, { load: { ammunition: 60, oil: 0, coal: 0 } }));
    const player = await playerOf(t, seat);
    const depot = await t.run((ctx) =>
      ctx.db.insert('outposts', {
        seasonId: player.seasonId,
        playerId: player._id,
        point: { lon: 9.73, lat: 52.37 },
        hostCountry: 'DEU',
        regionId: 'DEU-1572',
        level: 1,
        foundedAt: Date.now() - 1,
        disabledUntil: null,
        immuneUntil: null,
      }),
    );
    const mine = await heaped(t, seat);
    await t.mutation(api.tours.start, {
      ...seat,
      troopId: truck,
      stops: [depot, site(mine)],
    });

    expect(await flying(t)).toMatchObject([{ tourLeg: 'stop', delivery: { outpostId: depot } }]);
    await arriveNext(t);
    expect((await t.run((ctx) => ctx.db.get(depot)))!.depot).toEqual({
      ammunition: 60,
      oil: 0,
      coal: 0,
    });
    expect(await flying(t)).toMatchObject([{ tourLeg: 'stop', pickup: { buildingId: mine } }]);
    await arriveNext(t);
    expect((await get(t, truck))!.harvest).toMatchObject({ coal: 200 });
    expect((await t.run((ctx) => ctx.db.get(depot)))!.depot).toEqual({
      ammunition: 60,
      oil: 0,
      coal: 0,
    });
    await arriveNext(t);
    // The harvest is banked before the standing order is reloaded.
    expect((await get(t, truck))!.harvest).toBeUndefined();
    expect((await get(t, truck))!.load).toEqual({ ammunition: 60, oil: 0, coal: 0 });
  });

  it('keeps aboard what a full warehouse refuses, says so, and goes on', async () => {
    const t = boot();
    const { seat } = await launched(t);
    const hq = await building(t, seat, 'hq');
    const truck = await form(t, seat, 'landTransport', hq);
    const mine = await heaped(t, seat);
    const { cap } = await coalOf(t, seat);
    await setStock(t, seat, 'coal', cap - 50);

    await t.mutation(api.tours.start, { ...seat, troopId: truck, stops: [site(mine)] });
    await arriveNext(t);
    await arriveNext(t);

    expect((await get(t, truck))!.harvest).toMatchObject({ coal: 150 });
    expect(await noticesOf(t, 'harvestReturned')).toMatchObject([
      { delivered: { coal: 50 }, kept: { coal: 150 } },
    ]);
    // The 150 left aboard take their room: the next pickup takes 50 more, no more.
    expect(await flying(t)).toMatchObject([{ tourLeg: 'stop', pickup: { buildingId: mine } }]);
    await arriveNext(t);
    expect((await get(t, truck))!.harvest).toMatchObject({ coal: 200 });
  });

  it('banks the harvest of a recalled tour when it reaches its loading point', async () => {
    const t = boot();
    const { seat } = await launched(t);
    const hq = await building(t, seat, 'hq');
    const truck = await form(t, seat, 'landTransport', hq);
    const mine = await heaped(t, seat);
    await t.mutation(api.tours.start, { ...seat, troopId: truck, stops: [site(mine)] });
    await arriveNext(t);
    await t.mutation(api.tours.recall, { ...seat, troopId: truck });
    const before = (await coalOf(t, seat)).stock;

    await arriveNext(t);
    expect((await get(t, truck))!.tour).toBeUndefined();
    expect((await get(t, truck))!.harvest).toBeUndefined();
    expect((await coalOf(t, seat)).stock).toBeGreaterThanOrEqual(before + 200);
    expect(await noticesOf(t, 'harvestReturned')).toMatchObject([{ delivered: { coal: 200 } }]);
  });

  it('a tour cut with harvest aboard walks home and banks it on arrival', async () => {
    const t = boot();
    const { seat, guest } = await launched(t);
    const hq = await building(t, seat, 'hq');
    const truck = await form(t, seat, 'landTransport', hq);
    const first = await exploitation(t, seat, MOSELLE);
    const second = await exploitation(t, seat, NORD);
    vi.setSystemTime(MIDDAY + 10 * HOUR);
    await t.mutation(api.tours.start, {
      ...seat,
      troopId: truck,
      stops: [site(first), site(second)],
    });
    await arriveNext(t);
    const aboard = (await get(t, truck))!.harvest!.coal;
    expect(aboard).toBeGreaterThan(100);
    expect(aboard).toBeLessThan(200);
    const them = (await playerOf(t, guest))._id;
    for (const lost of [first, second])
      await t.run((ctx) => ctx.db.patch(lost, { playerId: them }));
    const before = (await coalOf(t, seat)).stock;

    await arriveNext(t);
    expect((await get(t, truck))!.tour).toBeUndefined();
    expect(await flying(t)).toMatchObject([{ type: 'return' }]);
    expect((await get(t, truck))!.harvest).toMatchObject({ coal: aboard });

    await arriveNext(t);
    expect((await get(t, truck))!.harvest).toBeUndefined();
    expect((await coalOf(t, seat)).stock).toBeGreaterThanOrEqual(before + aboard);
  });

  it('skips a site captured on the way, takes the next, and counts it in the dispatch', async () => {
    const t = boot();
    const { seat, guest } = await launched(t);
    const hq = await building(t, seat, 'hq');
    const truck = await form(t, seat, 'landTransport', hq);
    const lost = await exploitation(t, seat, MOSELLE);
    const good = await exploitation(t, seat, NORD);
    vi.setSystemTime(MIDDAY + 48 * HOUR);
    await t.mutation(api.tours.start, {
      ...seat,
      troopId: truck,
      stops: [site(lost), site(good)],
    });
    const them = (await playerOf(t, guest))._id;
    await t.run((ctx) => ctx.db.patch(lost, { playerId: them }));

    await arriveNext(t);
    expect(await flying(t)).toMatchObject([{ tourLeg: 'stop', pickup: { buildingId: good } }]);
    await arriveNext(t);
    expect((await get(t, truck))!.harvest).toMatchObject({ coal: 200 });
    await arriveNext(t);
    expect(await noticesOf(t, 'harvestReturned')).toMatchObject([
      { delivered: { coal: 200 }, skipped: 1 },
    ]);
  });

  it('flies an aircraft to an exploitation with no field and no quay, and it lands there', async () => {
    const t = boot();
    const { seat } = await launched(t);
    const field = await t.run(async (ctx) => {
      const player = await seatIn(ctx, seat);
      return ctx.db.insert('buildings', {
        seasonId: player.seasonId,
        playerId: player._id,
        key: 'airfield',
        regionId: MARNE,
        point: pointOfRegion(MARNE),
        level: 1,
      });
    });
    const plane = await form(t, seat, 'airTransport', field);
    const mine = await heaped(t, seat);
    await t.mutation(api.tours.start, { ...seat, troopId: plane, stops: [site(mine)] });

    await arriveNext(t);
    expect((await get(t, plane))!.harvest).toMatchObject({ coal: 120 });
    expect(await flying(t)).toMatchObject([{ tourLeg: 'base' }]);
  });

  it('sends a cargo to the quay of the region, and refuses a region without one', async () => {
    const t = boot();
    const { seat } = await launched(t);
    const port = await t.run(async (ctx) => {
      const player = await seatIn(ctx, seat);
      return ctx.db.insert('buildings', {
        seasonId: player.seasonId,
        playerId: player._id,
        key: 'port',
        regionId: 'FRA-5322',
        point: pointOfRegion('FRA-5322'),
        level: 1,
      });
    });
    const cargo = await form(t, seat, 'cargo', port);
    const coastal = await exploitation(t, seat, NORD);
    const inland = await heaped(t, seat, MOSELLE);

    await expect(
      t.mutation(api.tours.start, { ...seat, troopId: cargo, stops: [site(inland)] }),
    ).rejects.toThrow('TOUR_PICKUP_NO_QUAY');
    await t.mutation(api.tours.start, { ...seat, troopId: cargo, stops: [site(coastal)] });
    expect(await flying(t)).toMatchObject([{ tourLeg: 'stop', pickup: { buildingId: coastal } }]);

    // It takes the heap from the water, then sails home from where it stands, with no port there.
    await arriveNext(t);
    const aboard = (await get(t, cargo))!.harvest!.coal;
    expect(aboard).toBeGreaterThan(0);
    expect(await flying(t)).toMatchObject([{ tourLeg: 'base' }]);
    await arriveNext(t);
    const [told] = await noticesOf(t, 'harvestReturned');
    expect(told).toMatchObject({ delivered: { coal: expect.any(Number) } });
    if (told?.kind === 'harvestReturned') expect(told.delivered.coal + told.kept.coal).toBe(aboard);
  });

  it('refuses a truck a site with no road from its loading point, at the tracing', async () => {
    const t = boot();
    const { seat } = await launched(t);
    const hq = await building(t, seat, 'hq');
    const truck = await form(t, seat, 'landTransport', hq);
    const island = await exploitation(t, seat, CORSICA, { point: pointOfRegion(CORSICA) });

    await expect(
      t.mutation(api.tours.start, { ...seat, troopId: truck, stops: [site(island)] }),
    ).rejects.toThrow('NO_LAND_ROUTE');
    expect((await get(t, truck))!.tour).toBeUndefined();
  });

  it("refuses a site that is not one's own, and a building that is no exploitation", async () => {
    const t = boot();
    const { seat, guest } = await launched(t);
    const hq = await building(t, seat, 'hq');
    const truck = await form(t, seat, 'landTransport', hq);
    const theirs = await exploitation(t, guest, PRAHOVA, { key: 'oilWell' });

    await expect(
      t.mutation(api.tours.start, { ...seat, troopId: truck, stops: [site(theirs)] }),
    ).rejects.toThrow('TOUR_PICKUP_NOT_OURS');
    await expect(
      t.mutation(api.tours.start, { ...seat, troopId: truck, stops: [site(hq)] }),
    ).rejects.toThrow('TOUR_PICKUP_NOT_A_SITE');
  });

  it('reloads the standing order only into the room the harvest left aboard', async () => {
    const t = boot();
    const { seat } = await launched(t);
    await setStock(t, seat, 'ammunition', 500);
    const hq = await building(t, seat, 'hq');
    const truck = await form(t, seat, 'landTransport', hq);
    const mine = await heaped(t, seat);
    const { cap } = await coalOf(t, seat);
    await setStock(t, seat, 'coal', cap);
    await t.run((ctx) =>
      ctx.db.patch(truck, {
        harvest: { food: 0, steel: 0, coal: 150, oil: 0, ammunition: 0 },
        tour: {
          base: hq,
          stops: [site(mine)],
          consigne: { ammunition: 100, oil: 0, coal: 0 },
          next: 0,
          waiting: { since: Date.now(), why: 'full' },
        },
      }),
    );

    await t.mutation(internal.tours.retry, { troopId: truck });
    // The warehouse is full: the 150 stay aboard, so only 50 of the 100 fit, and it does not wait for the rest.
    expect((await get(t, truck))!.load).toEqual({ ammunition: 50, oil: 0, coal: 0 });
    expect((await get(t, truck))!.tour?.waiting).toMatchObject({ why: 'full' });
  });

  it('leaves a disabled exploitation alone: its heap stays where it is', async () => {
    const t = boot();
    const { seat } = await launched(t);
    const hq = await building(t, seat, 'hq');
    const truck = await form(t, seat, 'landTransport', hq);
    const idle = await exploitation(t, seat, MOSELLE);
    const good = await exploitation(t, seat, NORD);
    vi.setSystemTime(MIDDAY + 24 * HOUR);
    await t.mutation(api.tours.start, {
      ...seat,
      troopId: truck,
      stops: [site(idle), site(good)],
    });
    const player = await playerOf(t, seat);
    await t.run(async (ctx) => {
      await ctx.db.patch(idle, { disabledUntil: MIDDAY + 400 * HOUR });
      await ctx.db.insert('heaps', {
        buildingId: idle,
        seasonId: player.seasonId,
        playerId: player._id,
        amount: 250,
        settledAt: Date.now(),
      });
    });

    await arriveNext(t);
    expect(await heapRow(t, idle)).toMatchObject({ amount: 250 });
    expect((await get(t, truck))!.harvest).toBeUndefined();
    expect(await flying(t)).toMatchObject([{ tourLeg: 'stop', pickup: { buildingId: good } }]);
  });

  it('counts the harvest in the loading room: a full harvest refuses a supply load', async () => {
    const t = boot();
    const { seat } = await launched(t);
    await setStock(t, seat, 'ammunition', 500);
    const hq = await building(t, seat, 'hq');
    const truck = await form(t, seat, 'landTransport', hq);
    await t.run((ctx) =>
      ctx.db.patch(truck, { harvest: { food: 0, steel: 0, coal: 200, oil: 0, ammunition: 0 } }),
    );

    await expect(
      t.mutation(api.logistics.load, {
        ...seat,
        troopId: truck,
        resource: 'ammunition',
        amount: 10,
      }),
    ).rejects.toThrow('LOAD_FULL');
  });

  it('serves the harvest aboard to its owner, and never to the other side', async () => {
    const t = boot();
    const { seat, guest } = await launched(t);
    const hq = await building(t, seat, 'hq');
    const truck = await form(t, seat, 'landTransport', hq);
    await t.run((ctx) =>
      ctx.db.patch(truck, { harvest: { food: 0, steel: 0, coal: 77, oil: 0, ammunition: 0 } }),
    );
    const mine = await t.query(api.view.playerView, seat);
    expect(mine.me.troops.find((troop) => troop.id === truck)).toMatchObject({
      harvest: { coal: 77 },
    });
    expect(JSON.stringify(await t.query(api.view.playerView, guest))).not.toContain('"harvest"');
  });
});

describe('a transport destroyed ashore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  it('leaves its harvest in the crate with its load, and tells its owner in five keys', async () => {
    const t = boot();
    const { seat, guest } = await launched(t);
    const theirs = await t.run(async (ctx) => {
      const player = await seatIn(ctx, guest);
      return ctx.db.insert('buildings', {
        seasonId: player.seasonId,
        playerId: player._id,
        key: 'barracks',
        regionId: PRAHOVA,
        point: pointOfRegion(PRAHOVA),
        level: 1,
      });
    });
    const truck = await form(t, guest, 'landTransport', theirs);
    await t.run((ctx) =>
      ctx.db.patch(truck, {
        currentStrength: 1,
        load: { ammunition: 80, oil: 0, coal: 0 },
        harvest: { food: 0, steel: 30, coal: 90, oil: 0, ammunition: 0 },
      }),
    );
    const barracks = await t.run(async (ctx) => {
      const player = await seatIn(ctx, seat);
      return ctx.db.insert('buildings', {
        seasonId: player.seasonId,
        playerId: player._id,
        key: 'barracks',
        regionId: MARNE,
        point: pointOfRegion(MARNE),
        level: 1,
      });
    });
    const rifles = [
      await form(t, seat, 'infantry', barracks),
      await form(t, seat, 'infantry', barracks),
    ];
    await attacking(t, {
      ...seat,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: rifles,
      target: { kind: 'region', regionId: PRAHOVA },
    });
    await arriveNext(t);

    expect(await get(t, truck)).toBeNull();
    const [crate] = await t.run((ctx) => ctx.db.query('lootCrates').collect());
    expect(crate?.loot).toMatchObject({ ammunition: 80, steel: 30, coal: 90 });
    expect(await noticesOf(t, 'lootLost')).toMatchObject([
      { loot: { ammunition: 80, steel: 30, coal: 90 } },
    ]);
  });
});

describe('the commissioning of the harvest (ADR 0041)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  /** A base from before the rule: the free mine carries no mark, a paid one stands beside it. */
  async function oldBase(t: Bench, seat: Seat) {
    const first = await exploitation(t, seat, MOSELLE);
    vi.setSystemTime(MIDDAY + HOUR);
    const second = await exploitation(t, seat, NORD);
    return { first, second };
  }

  it('marks the oldest exploitation that settles each foundation debt, once', async () => {
    const t = boot();
    const { seat } = await launched(t);
    const { first, second } = await oldBase(t, seat);

    await t.mutation(internal.dev.commissionHarvest, {});
    const marks = await t.run(async (ctx) => ({
      first: (await ctx.db.get(first))!.foundationMark,
      second: (await ctx.db.get(second))!.foundationMark,
    }));
    expect(marks).toEqual({ first: true, second: undefined });

    vi.setSystemTime(MIDDAY + 5 * HOUR);
    await t.mutation(internal.dev.commissionHarvest, {});
    expect((await t.run((ctx) => ctx.db.get(second)))!.foundationMark).toBeUndefined();
  });

  it('starts every standing exploitation with an empty heap, settled now', async () => {
    const t = boot();
    const { seat } = await launched(t);
    const { first, second } = await oldBase(t, seat);
    vi.setSystemTime(MIDDAY + 30 * HOUR);

    await t.mutation(internal.dev.commissionHarvest, {});
    for (const id of [first, second])
      expect(await heapRow(t, id)).toMatchObject({ amount: 0, settledAt: MIDDAY + 30 * HOUR });
    const view = await t.query(api.view.playerView, seat);
    expect(view.me.buildings.find((one) => one.id === second)?.heap).toMatchObject({ amount: 0 });
  });

  it('files one dispatch per belligerent, and nothing the second time', async () => {
    const t = boot();
    const { seat } = await launched(t);
    await oldBase(t, seat);

    await t.mutation(internal.dev.commissionHarvest, {});
    const players = await t.run((ctx) => ctx.db.query('players').collect());
    const warring = players.filter((player) => player.enteredWarAt != null).length;
    expect(warring).toBe(2);
    expect(await noticesOf(t, 'harvestCommissioned')).toHaveLength(warring);
    const rows = await t.run((ctx) => ctx.db.query('heaps').collect());

    vi.setSystemTime(MIDDAY + 9 * HOUR);
    await t.mutation(internal.dev.commissionHarvest, {});
    expect(await noticesOf(t, 'harvestCommissioned')).toHaveLength(warring);
    expect(await t.run((ctx) => ctx.db.query('heaps').collect())).toEqual(rows);
  });
});
