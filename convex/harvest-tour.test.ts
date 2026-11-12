import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import type { BuildingKey, UnitRole } from '../src/domain/ids';
import { resolveContact } from './combat';
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

const heapReading = (t: Bench, seat: Seat, id: Id<'buildings'>) =>
  t.run(async (ctx) => {
    const player = await seatIn(ctx, seat);
    return (await economyOf(ctx, player._id, Date.now())).heaps[id]!;
  });

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

  it('banks nothing on a base captured on the way home: the harvest stays aboard', async () => {
    const t = boot();
    const { seat, guest } = await launched(t);
    const hq = await building(t, seat, 'hq');
    const truck = await form(t, seat, 'landTransport', hq);
    const mine = await heaped(t, seat);
    await t.mutation(api.tours.start, { ...seat, troopId: truck, stops: [site(mine)] });
    await arriveNext(t);
    const them = (await playerOf(t, guest))._id;
    await t.run((ctx) => ctx.db.patch(hq, { playerId: them }));

    await arriveNext(t);
    expect((await get(t, truck))!.tour).toBeUndefined();
    expect((await get(t, truck))!.harvest).toMatchObject({ coal: 200 });
    expect(await noticesOf(t, 'harvestReturned')).toEqual([]);
  });

  it('banks nothing at a retry either, once the base is no longer its own', async () => {
    const t = boot();
    const { seat, guest } = await launched(t);
    const hq = await building(t, seat, 'hq');
    const truck = await form(t, seat, 'landTransport', hq);
    const mine = await heaped(t, seat);
    await t.run((ctx) =>
      ctx.db.patch(truck, {
        harvest: { ...NONE, coal: 50 },
        tour: {
          base: hq,
          stops: [site(mine)],
          consigne: { ammunition: 0, oil: 0, coal: 0 },
          next: 0,
          waiting: { since: Date.now(), why: 'stock', resource: 'ammunition' },
        },
      }),
    );
    const them = (await playerOf(t, guest))._id;
    await t.run((ctx) => ctx.db.patch(hq, { playerId: them }));

    await t.mutation(internal.tours.retry, { troopId: truck });
    expect((await get(t, truck))!.tour).toBeUndefined();
    expect((await get(t, truck))!.harvest).toMatchObject({ coal: 50 });
    expect(await noticesOf(t, 'harvestReturned')).toEqual([]);
  });

  it('banks the harvest of a truck based at an outpost, when a cut tour brings it home', async () => {
    const t = boot();
    const { seat, guest } = await launched(t);
    const player = await playerOf(t, seat);
    const outpost = await t.run((ctx) =>
      ctx.db.insert('outposts', {
        seasonId: player.seasonId,
        playerId: player._id,
        point: { lon: 2.35, lat: 48.85 },
        hostCountry: 'FRA',
        regionId: 'FRA-5323',
        level: 1,
        foundedAt: Date.now() - 1,
        disabledUntil: null,
        immuneUntil: null,
      }),
    );
    const truck = await form(t, seat, 'landTransport', outpost as unknown as Id<'buildings'>);
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
    const them = (await playerOf(t, guest))._id;
    for (const lost of [first, second])
      await t.run((ctx) => ctx.db.patch(lost, { playerId: them }));

    await arriveNext(t);
    expect(await flying(t)).toMatchObject([{ type: 'return' }]);
    await arriveNext(t);
    expect((await get(t, truck))!.harvest).toBeUndefined();
    expect(await noticesOf(t, 'harvestReturned')).toMatchObject([{ delivered: { coal: aboard } }]);
  });

  it('counts only the sites it skipped, not one it picked and that went down since', async () => {
    const t = boot();
    const { seat } = await launched(t);
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
    await t.run((ctx) => ctx.db.patch(first, { disabledUntil: Date.now() + 100 * HOUR }));
    await arriveNext(t);
    await arriveNext(t);
    expect(await noticesOf(t, 'harvestReturned')).toMatchObject([{ skipped: 0 }]);
  });

  it('counts a site that went down ahead of the truck once per lap, however often it looks', async () => {
    const t = boot();
    const { seat } = await launched(t);
    const hq = await building(t, seat, 'hq');
    const truck = await form(t, seat, 'landTransport', hq);
    const first = await exploitation(t, seat, MOSELLE);
    const second = await exploitation(t, seat, NORD);
    const third = await exploitation(t, seat, MARNE);
    vi.setSystemTime(MIDDAY + 10 * HOUR);
    await t.mutation(api.tours.start, {
      ...seat,
      troopId: truck,
      stops: [site(first), site(second), site(third)],
    });
    await t.run((ctx) => ctx.db.patch(third, { disabledUntil: Date.now() + 100 * HOUR }));
    await arriveNext(t);
    await arriveNext(t);
    await arriveNext(t);
    expect(await noticesOf(t, 'harvestReturned')).toMatchObject([{ skipped: 1 }]);
  });

  it('refuses at the tracing a site the transport has no route to, with a word of its own', async () => {
    const t = boot();
    const { seat } = await launched(t);
    const hq = await building(t, seat, 'hq');
    const truck = await form(t, seat, 'landTransport', hq);
    const island = await exploitation(t, seat, CORSICA, { point: pointOfRegion(CORSICA) });
    await expect(
      t.mutation(api.tours.start, { ...seat, troopId: truck, stops: [site(island)] }),
    ).rejects.toThrow('TOUR_PICKUP_NO_ROUTE');
  });

  it('two transports on one heap share it, and the heap never goes below nothing', async () => {
    const t = boot();
    const { seat } = await launched(t);
    const hq = await building(t, seat, 'hq');
    const first = await form(t, seat, 'landTransport', hq);
    const second = await form(t, seat, 'landTransport', hq);
    const mine = await exploitation(t, seat, MOSELLE);
    vi.setSystemTime(MIDDAY + 24 * HOUR);
    const stock = (await heapReading(t, seat, mine)).amount;
    await t.mutation(api.tours.start, { ...seat, troopId: first, stops: [site(mine)] });
    await t.mutation(api.tours.start, { ...seat, troopId: second, stops: [site(mine)] });

    for (const troopId of [first, second]) {
      const movement = (await flying(t)).find((one) => one.troopIds.includes(troopId))!;
      vi.setSystemTime(Math.max(Date.now(), movement.arrivesAt + 1));
      await t.mutation(internal.movements.arrive, { movementId: movement._id });
    }
    const taken =
      ((await get(t, first))!.harvest?.coal ?? 0) + ((await get(t, second))!.harvest?.coal ?? 0);
    expect(taken).toBeGreaterThan(200);
    expect(taken).toBeLessThanOrEqual(stock + 5);
    expect((await heapRow(t, mine))!.amount).toBeGreaterThanOrEqual(0);
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
    ).rejects.toThrow('TOUR_PICKUP_NO_ROUTE');
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

  describe('what the sheet reads (#551)', () => {
    it('serves, for a truck, the own exploitations a road joins, and the ones none does', async () => {
      const t = boot();
      const { seat, guest } = await launched(t);
      const hq = await building(t, seat, 'hq');
      const truck = await form(t, seat, 'landTransport', hq);
      const inland = await exploitation(t, seat, MOSELLE);
      const island = await exploitation(t, seat, CORSICA, { point: pointOfRegion(CORSICA) });
      const theirs = await exploitation(t, guest, PRAHOVA, { key: 'oilWell' });

      const read = await t.query(api.tours.pickups, { ...seat, troopId: truck });
      expect(read.find((one) => one.buildingId === inland)).toMatchObject({
        routed: true,
        hasQuay: false,
      });
      expect(read.find((one) => one.buildingId === island)).toMatchObject({ routed: false });
      expect(read.map((one) => one.buildingId)).not.toContain(theirs);
      expect(read.map((one) => one.buildingId)).not.toContain(hq);
    });

    it('serves the quay of the region as the point a cargo goes to, and no quay inland', async () => {
      const t = boot();
      const { seat } = await launched(t);
      const hq = await building(t, seat, 'hq');
      const cargo = await form(t, seat, 'cargo', hq);
      const coastal = await exploitation(t, seat, NORD);
      const inland = await exploitation(t, seat, MOSELLE);

      const read = await t.query(api.tours.pickups, { ...seat, troopId: cargo });
      expect(read.find((one) => one.buildingId === coastal)).toMatchObject({ hasQuay: true });
      expect(read.find((one) => one.buildingId === inland)).toMatchObject({
        hasQuay: false,
        stopPoint: null,
      });
    });

    it("serves nothing of another player's transport", async () => {
      const t = boot();
      const { seat, guest } = await launched(t);
      const hq = await building(t, guest, 'hq');
      const theirTruck = await form(t, guest, 'landTransport', hq);
      await exploitation(t, seat, MOSELLE);
      expect(await t.query(api.tours.pickups, { ...seat, troopId: theirTruck })).toEqual([]);
    });
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

  it('serves its owner one ordered list of typed stops, depots and sites as they were drawn', async () => {
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
    await t.mutation(api.tours.start, { ...seat, troopId: truck, stops: [site(mine), depot] });

    const view = await t.query(api.view.playerView, seat);
    expect(view.me.troops.find((one) => one.id === truck)?.tour?.stops).toEqual([
      { kind: 'site', id: mine },
      { kind: 'depot', id: depot },
    ]);
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

  it('loses its harvest with the hull at sea: no crate, nothing to find', async () => {
    const t = boot();
    const { seat, guest } = await launched(t);
    const hq = await building(t, guest, 'hq');
    const plane = await form(t, guest, 'airTransport', hq);
    await t.run((ctx) =>
      ctx.db.patch(plane, { currentStrength: 1, harvest: { ...NONE, coal: 90 } }),
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
    const fighters = [
      await form(t, seat, 'fighter', barracks),
      await form(t, seat, 'fighter', barracks),
    ];
    const owner = await playerOf(t, guest);
    const finder = await playerOf(t, seat);
    await t.run(async (ctx) => {
      const troops = async (ids: Array<Id<'troops'>>) =>
        (await Promise.all(ids.map((id) => ctx.db.get(id)))).filter((one) => one !== null);
      await resolveContact(ctx, {
        seasonId: owner.seasonId,
        attacker: { playerId: finder._id, troops: await troops(fighters) },
        defender: { playerId: owner._id, troops: await troops([plane]) },
        cause: 'interception',
        point: { lon: -30, lat: 40 },
        hostCountry: '',
        outpostId: null,
        disabledUntil: null,
        at: Date.now(),
      });
    });
    expect(await get(t, plane)).toBeNull();
    expect(await t.run((ctx) => ctx.db.query('lootCrates').collect())).toEqual([]);
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

  /** The commissioning, run for each belligerent as the sweep schedules it. */
  async function commission(t: Bench) {
    await t.mutation(internal.dev.commissionHarvest, {});
    const players = await t.run((ctx) => ctx.db.query('players').collect());
    for (const player of players.filter((one) => one.enteredWarAt != null))
      await t.mutation(internal.dev.commissionHarvestFor, { playerId: player._id });
  }

  it('hands each belligerent to its own mutation, scheduled, so no one pays for the others', async () => {
    const t = boot();
    await launched(t);
    await t.mutation(internal.dev.commissionHarvest, {});
    const scheduled = await t.run((ctx) => ctx.db.system.query('_scheduled_functions').collect());
    expect(scheduled.filter((job) => job.name.includes('commissionHarvestFor'))).toHaveLength(2);
    expect(await noticesOf(t, 'harvestCommissioned')).toEqual([]);
  });

  it('marks the oldest exploitation that settles each foundation debt, once', async () => {
    const t = boot();
    const { seat } = await launched(t);
    const { first, second } = await oldBase(t, seat);

    await commission(t);
    const marks = await t.run(async (ctx) => ({
      first: (await ctx.db.get(first))!.foundationMark,
      second: (await ctx.db.get(second))!.foundationMark,
    }));
    expect(marks).toEqual({ first: true, second: undefined });

    vi.setSystemTime(MIDDAY + 5 * HOUR);
    await commission(t);
    expect((await t.run((ctx) => ctx.db.get(second)))!.foundationMark).toBeUndefined();
  });

  it('starts every standing exploitation with an empty heap, settled now', async () => {
    const t = boot();
    const { seat } = await launched(t);
    const { first, second } = await oldBase(t, seat);
    vi.setSystemTime(MIDDAY + 30 * HOUR);

    await commission(t);
    for (const id of [first, second])
      expect(await heapRow(t, id)).toMatchObject({ amount: 0, settledAt: MIDDAY + 30 * HOUR });
    const view = await t.query(api.view.playerView, seat);
    expect(view.me.buildings.find((one) => one.id === second)?.heap).toMatchObject({ amount: 0 });
  });

  it('files one dispatch per belligerent, and nothing the second time', async () => {
    const t = boot();
    const { seat } = await launched(t);
    await oldBase(t, seat);

    await commission(t);
    const players = await t.run((ctx) => ctx.db.query('players').collect());
    const warring = players.filter((player) => player.enteredWarAt != null).length;
    expect(warring).toBe(2);
    expect(await noticesOf(t, 'harvestCommissioned')).toHaveLength(warring);
    const rows = await t.run((ctx) => ctx.db.query('heaps').collect());

    vi.setSystemTime(MIDDAY + 9 * HOUR);
    await commission(t);
    expect(await noticesOf(t, 'harvestCommissioned')).toHaveLength(warring);
    expect(await t.run((ctx) => ctx.db.query('heaps').collect())).toEqual(rows);
  });

  it('marks no rebuilt mine whose debt a razed one already settled', async () => {
    const t = boot();
    const { seat } = await launched(t);
    const mine = await exploitation(t, seat, MOSELLE);
    const player = await playerOf(t, seat);
    await t.run((ctx) =>
      ctx.db.patch(player._id, { settledFoundation: [{ key: 'mine', deposit: 'coal' }] }),
    );
    await commission(t);
    expect((await t.run((ctx) => ctx.db.get(mine)))!.foundationMark).toBeUndefined();
  });

  it('keeps the mark where it already stands, whichever of the mines is older', async () => {
    const t = boot();
    const { seat } = await launched(t);
    const { first, second } = await oldBase(t, seat);
    await t.run((ctx) => ctx.db.patch(second, { foundationMark: true }));
    await commission(t);
    const marks = await t.run(async (ctx) => ({
      first: (await ctx.db.get(first))!.foundationMark,
      second: (await ctx.db.get(second))!.foundationMark,
    }));
    expect(marks).toEqual({ first: undefined, second: true });
  });
});

describe('a dry tour crawls (ADR 0041 §4)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  const minutesOf = (movement: { departedAt: number; arrivesAt: number }) =>
    movement.arrivesAt - movement.departedAt;

  /** A truck at its HQ with a day-old mine ahead; `dry` empties its tank and the oil stock. */
  async function truckOnTour(dry: boolean) {
    vi.setSystemTime(MIDDAY);
    const t = boot();
    const { seat } = await launched(t);
    const hq = await building(t, seat, 'hq');
    const truck = await form(t, seat, 'landTransport', hq);
    const mine = await exploitation(t, seat, MOSELLE);
    vi.setSystemTime(MIDDAY + 24 * HOUR);
    if (dry) {
      await setStock(t, seat, 'oil', 0);
      await t.run((ctx) => ctx.db.patch(truck, { fuel: 0 }));
    }
    await t.mutation(api.tours.start, { ...seat, troopId: truck, stops: [site(mine)] });
    return { t, seat, truck, mine };
  }

  it('sets out at half pace on the fuel refusal, pays nothing, and says so once', async () => {
    const normal = await truckOnTour(false);
    const dry = await truckOnTour(true);
    const [easy] = await flying(normal.t);
    const [slow] = await flying(dry.t);

    expect(minutesOf(slow!)).toBe(2 * minutesOf(easy!));
    expect((await get(dry.t, dry.truck))!.fuel).toBe(0);
    expect((await get(dry.t, dry.truck))!.tour?.waiting).toBeUndefined();
    expect(await noticesOf(dry.t, 'tourCrawling')).toMatchObject([{ role: 'landTransport' }]);
    expect(await noticesOf(normal.t, 'tourCrawling')).toEqual([]);

    // The way back crawls too, and the dispatch is not written a second time.
    await arriveNext(dry.t);
    expect(await flying(dry.t)).toMatchObject([{ tourLeg: 'base' }]);
    expect(await noticesOf(dry.t, 'tourCrawling')).toHaveLength(1);
  });

  it('is back at its own pace at the first leg where the tank is there', async () => {
    const normal = await truckOnTour(false);
    await arriveNext(normal.t);
    const [homeward] = await flying(normal.t);
    const dry = await truckOnTour(true);
    await t_refill(dry.t, dry.truck);

    await arriveNext(dry.t);
    const [back] = await flying(dry.t);
    expect(minutesOf(back!)).toBe(minutesOf(homeward!));
    expect((await get(dry.t, dry.truck))!.fuel).toBeLessThan(4);
  });

  it('keeps a plane with no fuel on the ground, waiting, as before', async () => {
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
    const mine = await exploitation(t, seat, MOSELLE);
    vi.setSystemTime(MIDDAY + 24 * HOUR);
    await setStock(t, seat, 'oil', 0);
    await t.run((ctx) => ctx.db.patch(plane, { fuel: 0 }));

    await t.mutation(api.tours.start, { ...seat, troopId: plane, stops: [site(mine)] });

    expect(await flying(t)).toEqual([]);
    expect((await get(t, plane))!.tour?.waiting).toMatchObject({ why: 'road' });
    expect(await noticesOf(t, 'tourCrawling')).toEqual([]);
  });

  async function t_refill(t: Bench, truck: Id<'troops'>) {
    await t.run((ctx) => ctx.db.patch(truck, { fuel: 4 }));
  }

  it('fills a cargo at a coal heap, in whole steps, before it takes the harvest', async () => {
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
    vi.setSystemTime(MIDDAY + 24 * HOUR);
    await setStock(t, seat, 'coal', 0);
    await t.run((ctx) => ctx.db.patch(cargo, { fuel: 0 }));
    await t.mutation(api.tours.start, { ...seat, troopId: cargo, stops: [site(coastal)] });
    expect((await get(t, cargo))!.fuel).toBe(0);

    await arriveNext(t);

    // Six steps of ten coal go to the tank (it sails home on them: one step paid), and the
    // harvest is what is left of the 288 once they are off the heap.
    expect((await get(t, cargo))!.fuel).toBeGreaterThan(0);
    const aboard = (await get(t, cargo))!.harvest!.coal;
    expect(aboard).toBeGreaterThanOrEqual(227);
    expect(aboard).toBeLessThanOrEqual(228);
    expect((await heapRow(t, coastal))!.amount).toBeLessThan(1);
  });

  it('leaves a truck dry at a coal heap: the tank burns oil, not coal', async () => {
    const t = boot();
    const { seat } = await launched(t);
    const hq = await building(t, seat, 'hq');
    const truck = await form(t, seat, 'landTransport', hq);
    const mine = await exploitation(t, seat, MOSELLE);
    vi.setSystemTime(MIDDAY + 24 * HOUR);
    await setStock(t, seat, 'oil', 0);
    await t.run((ctx) => ctx.db.patch(truck, { fuel: 0 }));
    await t.mutation(api.tours.start, { ...seat, troopId: truck, stops: [site(mine)] });

    await arriveNext(t);

    expect((await get(t, truck))!.fuel).toBe(0);
    expect((await get(t, truck))!.harvest).toMatchObject({ coal: 200 });
  });

  it('fills a truck at an oil heap before it loads: the oil aboard rises, the heap drops by as much, the harvest fits the room left', async () => {
    const t = boot();
    const { seat } = await launched(t);
    const hq = await building(t, seat, 'hq');
    const truck = await form(t, seat, 'landTransport', hq);
    const well = await exploitation(t, seat, MOSELLE, { key: 'oilWell' });
    vi.setSystemTime(MIDDAY + 24 * HOUR);
    await setStock(t, seat, 'oil', 0);
    await t.run(async (ctx) => {
      const row = await ctx.db
        .query('heaps')
        .withIndex('byBuilding', (q) => q.eq('buildingId', well))
        .unique();
      const settled = { amount: 260, settledAt: Date.now() };
      if (row) await ctx.db.patch(row._id, settled);
      else {
        const player = await seatIn(ctx, seat);
        await ctx.db.insert('heaps', {
          buildingId: well,
          seasonId: player.seasonId,
          playerId: player._id,
          ...settled,
        });
      }
      await ctx.db.patch(truck, { fuel: 0 });
    });
    await t.mutation(api.tours.start, { ...seat, troopId: truck, stops: [site(well)] });

    await arriveNext(t);

    const aboard = (await get(t, truck))!.harvest!.oil;
    expect((await get(t, truck))!.fuel).toBeGreaterThan(0);
    // Four steps of ten (it sails home on them: one step is paid) come off the 260 first; the
    // 220 left overfill the truck, so it carries its 200 and the heap keeps the 20.
    expect(aboard).toBe(200);
    expect((await heapRow(t, well))!.amount).toBeCloseTo(20, 0);
  });
});
