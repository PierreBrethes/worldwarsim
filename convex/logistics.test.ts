import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import type { BuildingKey, UnitRole } from '../src/domain/ids';
import type { LonLat } from '../src/domain/geo';
import { nominalStrength } from './constants';
import { pointOfRegion } from './regions';
import schema from './schema';
import { modules } from './test.setup';
import {
  attacking,
  foundSeat,
  joinSeat,
  placeHq,
  seatIn,
  unclocked,
  type Seat,
} from './seats.fixture';

/**
 * **La logistique passe par les pièces** (ADR 0028 §4) : le dépôt d'avant-poste, charger,
 * livrer, la tournée, l'interception.
 */
const boot = () => convexTest({ schema, modules, transactionLimits: true });
type Bench = ReturnType<typeof boot>;

const MIDDAY = new Date(2026, 7, 17, 12, 0, 0);
/** Près de Ploiești : personne n'y est chez soi. */
const PRAHOVA = 'ROU-310';
const MARNE = 'FRA-5323';
/** La Ruhr : à moins de quatre crans de route de Paris. */
const RUHR = 'DEU-1572';
const ESSEN: LonLat = [pointOfRegion(RUHR).lon, pointOfRegion(RUHR).lat];
const GERMANY = { hostCountry: 'DEU', regionId: RUHR };
const PLOIESTI: LonLat = [pointOfRegion(PRAHOVA).lon, pointOfRegion(PRAHOVA).lat];

async function launchedSeason(t: Bench) {
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
    const playerId = await playerOf(t, one);
    await t.run(async (ctx) => {
      for (const troop of await ctx.db
        .query('troops')
        .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
        .collect())
        await ctx.db.delete(troop._id);
    });
  }
  return { seat, guest };
}

const playerOf = (t: Bench, seat: Seat) => t.run(async (ctx) => (await seatIn(ctx, seat))._id);

async function form(
  t: Bench,
  seat: Seat,
  role: UnitRole,
  stationedAt: Id<'buildings'> | Id<'outposts'> | null,
) {
  const playerId = await playerOf(t, seat);
  const strength = nominalStrength(role, 1);
  return t.run(async (ctx) =>
    ctx.db.insert('troops', {
      seasonId: (await ctx.db.get(playerId))!.seasonId,
      playerId,
      role,
      tier: 1,
      nominalStrength: strength,
      currentStrength: strength,
      stationedAt,
    }),
  );
}

async function plant(
  t: Bench,
  seat: Seat,
  point: LonLat,
  level = 1,
  where = { hostCountry: 'ROU', regionId: PRAHOVA },
) {
  const playerId = await playerOf(t, seat);
  return t.run(async (ctx) =>
    ctx.db.insert('outposts', {
      seasonId: (await ctx.db.get(playerId))!.seasonId,
      playerId,
      point: { lon: point[0], lat: point[1] },
      ...where,
      level,
      specialization: 'relay',
      foundedAt: Date.now() - 1,
      disabledUntil: null,
      immuneUntil: null,
    }),
  );
}

async function stockOf(t: Bench, seat: Seat, key: string) {
  return (await t.query(api.view.playerView, seat)).me.resources[key as 'ammunition']!.stock;
}

/** Le QG que `placeHq` a posé, debout. */
const hqOf = (t: Bench, seat: Seat) =>
  t.run(async (ctx) => {
    const player = await seatIn(ctx, seat);
    return (await ctx.db
      .query('buildings')
      .withIndex('byPlayer', (q) => q.eq('playerId', player._id))
      .collect())!.find((building) => building.key === 'hq')!._id;
  });

async function raise(t: Bench, seat: Seat, key: BuildingKey, regionId: string) {
  const playerId = await playerOf(t, seat);
  return t.run(async (ctx) =>
    ctx.db.insert('buildings', {
      seasonId: (await ctx.db.get(playerId))!.seasonId,
      playerId,
      key,
      regionId,
      point: pointOfRegion(regionId),
      level: 1,
    }),
  );
}

const get = <T extends Id<'troops'> | Id<'outposts'>>(t: Bench, id: T) =>
  t.run(async (ctx) => ctx.db.get(id as Id<'troops'>));
const depotOf = (t: Bench, id: Id<'outposts'>) =>
  t.run(async (ctx) => (await ctx.db.get(id))!.depot);

describe('the outpost depot', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  it('rearms a troop anchored in an outpost reach from its depot, never from the board', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const outpost = await plant(t, seat, PLOIESTI);
    await t.run(async (ctx) =>
      ctx.db.patch(outpost, { depot: { ammunition: 50, oil: 0, coal: 0 } }),
    );
    const rifles = await form(t, seat, 'infantry', outpost);
    await t.run(async (ctx) => ctx.db.patch(rifles, { rounds: 0 }));
    const board = await stockOf(t, seat, 'ammunition');

    await t.mutation(api.movements.marchTo, {
      ...seat,
      origin: { kind: 'outpost', outpostId: outpost },
      troopIds: [rifles],
      point: { lon: PLOIESTI[0] + 0.3, lat: PLOIESTI[1] },
    });

    expect((await get(t, rifles))!.rounds).toBe(3);
    expect(await depotOf(t, outpost)).toEqual({ ammunition: 20, oil: 0, coal: 0 });
    expect(await stockOf(t, seat, 'ammunition')).toBe(board);
  });

  it('rearms from the nearest standing outpost, never from a site still building', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const standing = await plant(t, seat, PLOIESTI);
    await t.run(async (ctx) =>
      ctx.db.patch(standing, { depot: { ammunition: 400, oil: 0, coal: 0 } }),
    );
    const building = await plant(t, seat, [PLOIESTI[0] + 0.25, PLOIESTI[1]]);
    await t.run(async (ctx) => ctx.db.patch(building, { standsAt: Date.now() + 3_600_000 }));
    const at = { lon: PLOIESTI[0] + 0.3, lat: PLOIESTI[1] };
    const rifles = await form(t, seat, 'infantry', null);
    await t.run(async (ctx) => ctx.db.patch(rifles, { stationedAt: at, rounds: 0 }));

    await t.mutation(api.movements.marchTo, {
      ...seat,
      origin: { kind: 'point', point: at },
      troopIds: [rifles],
      point: { lon: at.lon + 0.2, lat: at.lat },
    });

    expect((await get(t, rifles))!.rounds).toBe(3);
    expect((await depotOf(t, standing))?.ammunition).toBe(370);
  });

  it('leaves a troop by an empty depot as it is, whatever the board holds', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const outpost = await plant(t, seat, PLOIESTI);
    const rifles = await form(t, seat, 'infantry', outpost);
    await t.run(async (ctx) => ctx.db.patch(rifles, { rounds: 1 }));

    await t.mutation(api.movements.marchTo, {
      ...seat,
      origin: { kind: 'outpost', outpostId: outpost },
      troopIds: [rifles],
      point: { lon: PLOIESTI[0] + 0.3, lat: PLOIESTI[1] },
    });

    expect((await get(t, rifles))!.rounds).toBe(1);
  });

  it('serves the depot and its capacity on my outpost, and which depot rearms each troop', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const outpost = await plant(t, seat, PLOIESTI, 2);
    const rifles = await form(t, seat, 'infantry', outpost);

    const view = await t.query(api.view.playerView, seat);
    expect(view.me.outposts[0]).toMatchObject({
      depot: { ammunition: 0, oil: 0, coal: 0 },
      depotCapacity: 800,
    });
    expect(view.me.troops.find((troop) => troop.id === rifles)?.depotId).toBe(outpost);
  });
});

describe('loading a transport', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  it('loads a truck at the headquarters from the personal board', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const truck = await form(t, seat, 'landTransport', await hqOf(t, seat));
    const board = await stockOf(t, seat, 'ammunition');

    await t.mutation(api.logistics.load, {
      ...seat,
      troopId: truck,
      resource: 'ammunition',
      amount: 50,
    });

    expect((await get(t, truck))!.load).toEqual({ ammunition: 50, oil: 0, coal: 0 });
    expect(await stockOf(t, seat, 'ammunition')).toBe(board - 50);
  });

  it('refuses a truck at a barracks, food, and past its one capacity', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const barracks = await raise(t, seat, 'barracks', MARNE);
    const away = await form(t, seat, 'landTransport', barracks);
    const truck = await form(t, seat, 'landTransport', await hqOf(t, seat));
    await t.run(async (ctx) => ctx.db.patch(truck, { load: { ammunition: 190, oil: 0, coal: 0 } }));
    const loading = (troopId: Id<'troops'>, resource: 'ammunition' | 'food') =>
      t.mutation(api.logistics.load, { ...seat, troopId, resource, amount: 20 });

    await expect(loading(away, 'ammunition')).rejects.toThrow('LOAD_NOT_HERE');
    await expect(loading(truck, 'food')).rejects.toThrow('LOAD_NOT_A_SUPPLY');
    await expect(loading(truck, 'ammunition')).rejects.toThrow('LOAD_FULL');
  });

  it('loads at an outpost from its depot', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const outpost = await plant(t, seat, PLOIESTI);
    await t.run(async (ctx) =>
      ctx.db.patch(outpost, { depot: { ammunition: 0, oil: 90, coal: 0 } }),
    );
    const truck = await form(t, seat, 'landTransport', outpost);

    await t.mutation(api.logistics.load, { ...seat, troopId: truck, resource: 'oil', amount: 60 });

    expect(await depotOf(t, outpost)).toEqual({ ammunition: 0, oil: 30, coal: 0 });
  });
});

describe('delivering to an outpost', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  async function loadedTruck(t: Bench, seat: Seat, ammunition: number) {
    const hq = await hqOf(t, seat);
    const truck = await form(t, seat, 'landTransport', hq);
    await t.run(async (ctx) => ctx.db.patch(truck, { load: { ammunition, oil: 0, coal: 0 } }));
    return { hq, truck };
  }

  it('unloads what the depot has room for, keeps the rest aboard and drives home alone', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const { hq, truck } = await loadedTruck(t, seat, 150);
    const rifles = await form(t, seat, 'infantry', hq);
    await t.run(async (ctx) => ctx.db.patch(rifles, { carriedBy: truck }));
    const outpost = await plant(t, seat, ESSEN, 1, GERMANY);
    await t.run(async (ctx) =>
      ctx.db.patch(outpost, { depot: { ammunition: 300, oil: 0, coal: 0 } }),
    );

    await t.mutation(api.logistics.deliver, {
      ...seat,
      origin: { kind: 'building', buildingId: hq },
      troopIds: [truck],
      outpostId: outpost,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(await depotOf(t, outpost)).toEqual({ ammunition: 400, oil: 0, coal: 0 });
    const back = (await get(t, truck))!;
    expect(back.load).toEqual({ ammunition: 50, oil: 0, coal: 0 });
    expect(back.stationedAt).toBe(hq);
    expect((await get(t, rifles))!.stationedAt).toBe(outpost);
    const notices = await t.run(async (ctx) =>
      ctx.db
        .query('notices')
        .filter((q) => q.eq(q.field('kind'), 'supplyDelivered'))
        .collect(),
    );
    expect(notices).toMatchObject([{ delivered: { ammunition: 100 }, kept: { ammunition: 50 } }]);
  });

  /** **Un avant-poste côtier est une côte** : un cargo s'y charge à son dépôt et en repart. */
  it('loads a cargo at a coastal outpost and sails it to another', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const coast = { hostCountry: 'FRA', regionId: MARNE };
    const marseille = await plant(t, seat, [5.37, 43.3], 1, coast);
    await t.run(async (ctx) =>
      ctx.db.patch(marseille, { depot: { ammunition: 0, oil: 0, coal: 300 } }),
    );
    const agde = await plant(t, seat, [3, 43.3], 1, coast);
    const cargo = await form(t, seat, 'cargo', marseille);

    await t.mutation(api.logistics.load, {
      ...seat,
      troopId: cargo,
      resource: 'coal',
      amount: 120,
    });
    const { arrivesAt } = await t.mutation(api.logistics.deliver, {
      ...seat,
      origin: { kind: 'outpost', outpostId: marseille },
      troopIds: [cargo],
      outpostId: agde,
    });
    vi.setSystemTime(arrivesAt + 1);
    const movement = (await t.run(async (ctx) => ctx.db.query('movements').collect()))[0]!;
    await t.mutation(internal.movements.arrive, { movementId: movement._id });

    expect((await depotOf(t, agde))?.coal).toBe(120);
  });

  it('takes a slot on the way out and none on the way home', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const { hq, truck } = await loadedTruck(t, seat, 50);
    const outpost = await plant(t, seat, ESSEN, 1, GERMANY);

    const { arrivesAt } = await t.mutation(api.logistics.deliver, {
      ...seat,
      origin: { kind: 'building', buildingId: hq },
      troopIds: [truck],
      outpostId: outpost,
    });
    expect((await t.query(api.view.playerView, seat)).me.slots.used).toBe(1);
    vi.setSystemTime(arrivesAt + 1);
    await t.mutation(internal.movements.arrive, {
      movementId: (await t.run(async (ctx) => ctx.db.query('movements').first()))!._id,
    });
    expect((await t.query(api.view.playerView, seat)).me.slots.used).toBe(0);
  });

  it('refuses a full depot and an empty truck', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const { hq, truck } = await loadedTruck(t, seat, 50);
    const empty = await form(t, seat, 'landTransport', hq);
    const outpost = await plant(t, seat, ESSEN, 1, GERMANY);
    await t.run(async (ctx) =>
      ctx.db.patch(outpost, { depot: { ammunition: 400, oil: 0, coal: 0 } }),
    );
    const delivering = (troopId: Id<'troops'>) =>
      t.mutation(api.logistics.deliver, {
        ...seat,
        origin: { kind: 'building', buildingId: hq },
        troopIds: [troopId],
        outpostId: outpost,
      });

    await expect(delivering(truck)).rejects.toThrow('DEPOT_FULL');
    await expect(delivering(empty)).rejects.toThrow('NOTHING_TO_DELIVER');
  });
});

describe('dismantling an outpost', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  it('gives its depot back to the board within the warehouse, and loses the rest', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const outpost = await plant(t, seat, PLOIESTI);
    await t.run(async (ctx) =>
      ctx.db.patch(outpost, { depot: { ammunition: 0, oil: 0, coal: 300 } }),
    );
    const before = await stockOf(t, seat, 'coal');
    const view = await t.query(api.view.playerView, seat);
    const room = view.me.resources.coal.cap - before;

    await t.mutation(api.outposts.dismantle, { ...seat, outpostId: outpost });

    expect(await stockOf(t, seat, 'coal')).toBe(before + Math.min(300, room));
  });
});

describe('the supply tour', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  const HANOVER: LonLat = [9.73, 52.37];

  async function setStock(t: Bench, seat: Seat, key: string, stock: number) {
    const playerId = await playerOf(t, seat);
    await t.run(async (ctx) => {
      const row = (
        await ctx.db
          .query('resources')
          .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
          .collect()
      ).find((one) => one.key === key)!;
      await ctx.db.patch(row._id, { stock, updatedAt: Date.now() });
    });
  }

  /** Le seul mouvement en vol, mené à son arrivée. */
  async function arriveNext(t: Bench) {
    const movement = (await t.run(async (ctx) => ctx.db.query('movements').collect()))[0]!;
    vi.setSystemTime(movement.arrivesAt + 1);
    await t.mutation(internal.movements.arrive, { movementId: movement._id });
    return movement;
  }
  const flying = (t: Bench) => t.run(async (ctx) => ctx.db.query('movements').collect());

  async function touring(t: Bench, seat: Seat) {
    const hq = await hqOf(t, seat);
    const truck = await form(t, seat, 'landTransport', hq);
    await t.run(async (ctx) => ctx.db.patch(truck, { load: { ammunition: 60, oil: 0, coal: 0 } }));
    const full = await plant(t, seat, ESSEN, 1, GERMANY);
    await t.run(async (ctx) => ctx.db.patch(full, { depot: { ammunition: 400, oil: 0, coal: 0 } }));
    const hungry = await plant(t, seat, HANOVER, 1, GERMANY);
    await t.mutation(api.tours.start, { ...seat, troopId: truck, stops: [full, hungry] });
    return { hq, truck, full, hungry };
  }

  it('skips a full depot, delivers the next, comes back and reloads its standing order', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    await setStock(t, seat, 'ammunition', 500);
    const { hq, truck, hungry } = await touring(t, seat);

    expect(await flying(t)).toMatchObject([{ tourLeg: 'stop', delivery: { outpostId: hungry } }]);
    const view = await t.query(api.view.playerView, seat);
    expect(view.me.slots.used).toBe(1);
    expect(view.me.troops.find((troop) => troop.id === truck)?.tour).toMatchObject({
      skipped: 1,
      waiting: null,
    });

    await arriveNext(t);
    expect(await depotOf(t, hungry)).toEqual({ ammunition: 60, oil: 0, coal: 0 });
    expect(await flying(t)).toMatchObject([{ tourLeg: 'base' }]);

    await arriveNext(t);
    expect((await get(t, truck))!.stationedAt).toBe(hq);
    expect((await get(t, truck))!.load).toEqual({ ammunition: 60, oil: 0, coal: 0 });
    expect(await stockOf(t, seat, 'ammunition')).toBeLessThanOrEqual(440);
    expect(await flying(t)).toMatchObject([{ tourLeg: 'stop', delivery: { outpostId: hungry } }]);
  });

  it('waits at its loading point while the board lacks, keeping its slot, and says so once', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const { truck } = await touring(t, seat);
    await arriveNext(t);
    await setStock(t, seat, 'ammunition', 0);
    await arriveNext(t);

    expect(await flying(t)).toEqual([]);
    const view = await t.query(api.view.playerView, seat);
    expect(view.me.slots.used).toBe(1);
    expect(view.me.troops.find((troop) => troop.id === truck)?.tour?.waiting).toEqual({
      why: 'stock',
      resource: 'ammunition',
    });
    const waiting = await t.run(async (ctx) =>
      ctx.db
        .query('notices')
        .filter((q) => q.eq(q.field('kind'), 'tourWaiting'))
        .collect(),
    );
    expect(waiting).toMatchObject([{ why: 'stock', resource: 'ammunition' }]);

    await t.mutation(api.tours.recall, { ...seat, troopId: truck });
    expect((await get(t, truck))!.tour).toBeUndefined();
    expect((await t.query(api.view.playerView, seat)).me.slots.used).toBe(0);
  });

  it('refuses any other order to a transport on tour, until it is recalled', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const { hq, truck, hungry } = await touring(t, seat);
    await arriveNext(t);
    await setStock(t, seat, 'ammunition', 0);
    await arriveNext(t);
    await t.run(async (ctx) => ctx.db.patch(truck, { load: { ammunition: 60, oil: 0, coal: 0 } }));

    await expect(
      t.mutation(api.logistics.deliver, {
        ...seat,
        origin: { kind: 'building', buildingId: hq },
        troopIds: [truck],
        outpostId: hungry,
      }),
    ).rejects.toThrow('TRANSPORT_ON_TOUR');
  });

  it('finishes the leg it is on when recalled, and stops at its loading point', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    await setStock(t, seat, 'ammunition', 500);
    const { hq, truck } = await touring(t, seat);
    await t.mutation(api.tours.recall, { ...seat, troopId: truck });

    await arriveNext(t);
    expect(await flying(t)).toMatchObject([{ tourLeg: 'base' }]);
    await arriveNext(t);
    expect(await flying(t)).toEqual([]);
    expect((await get(t, truck))!).toMatchObject({ stationedAt: hq });
    expect((await get(t, truck))!.tour).toBeUndefined();
  });

  it('refuses a tour away from a loading point, or past four stops', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const barracks = await raise(t, seat, 'barracks', MARNE);
    const truck = await form(t, seat, 'landTransport', barracks);
    await t.run(async (ctx) => ctx.db.patch(truck, { load: { ammunition: 60, oil: 0, coal: 0 } }));
    const stop = await plant(t, seat, ESSEN, 1, GERMANY);

    await expect(
      t.mutation(api.tours.start, { ...seat, troopId: truck, stops: [stop] }),
    ).rejects.toThrow('TOUR_NOT_AT_LOADING_POINT');
  });
});

describe('intercepting a supply', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  it('leaves the charge of a destroyed transport in a crate, and tells its owner', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const theirs = await raise(t, guest, 'barracks', PRAHOVA);
    const truck = await form(t, guest, 'landTransport', theirs);
    await t.run(async (ctx) =>
      ctx.db.patch(truck, { currentStrength: 1, load: { ammunition: 80, oil: 40, coal: 0 } }),
    );
    const barracks = await raise(t, seat, 'barracks', MARNE);
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
    const movement = (await t.run(async (ctx) => ctx.db.query('movements').collect()))[0]!;
    vi.setSystemTime(movement.arrivesAt + 1);
    await t.mutation(internal.movements.arrive, { movementId: movement._id });

    expect(await get(t, truck)).toBeNull();
    const crates = await t.run(async (ctx) => ctx.db.query('lootRecoveries').collect());
    expect(crates).toMatchObject([
      {
        dispossessedPlayerId: await playerOf(t, guest),
        recoveringPlayerId: await playerOf(t, seat),
      },
    ]);
    const lost = await t.run(async (ctx) =>
      ctx.db
        .query('notices')
        .filter((q) => q.eq(q.field('kind'), 'lootLost'))
        .collect(),
    );
    expect(lost).toMatchObject([{ loot: { ammunition: 80, oil: 40 } }]);
    const [crate] = await t.run(async (ctx) => ctx.db.query('lootCrates').collect());
    expect(crate?.loot).toMatchObject({ ammunition: 80, oil: 40, food: 0 });
  });
});
