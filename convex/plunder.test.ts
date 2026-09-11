import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import type { BuildingKey, UnitRole } from '../src/domain/ids';
import { RESOURCES, type ResourceKey } from '../src/domain/ids';
import {
  BASE_CAP,
  nominalStrength,
  PLUNDER_DISABLED_HOURS,
  PLUNDER_HOURS_PRESENT,
} from './constants';
import { regionFacts } from './regions';
import schema from './schema';
import { revalidatePlunderTarget, surveyedPlunderTarget } from './movement/orders';
import { surveyFromPoint } from './surveys';
import { modules } from './test.setup';
import { foundSeat, joinSeat, seatIn } from './seats.fixture';
import type { Seat } from './seats.fixture';

const boot = () => convexTest(schema, modules);
const HOUR = 3_600_000;
const MIDDAY = new Date(2026, 8, 9, 12, 0, 0).getTime();
const MARNE = 'FRA-5323';
const PRAHOVA = 'ROU-310';
const RUHR = 'DEU-1572';

async function launchedSeason(t: ReturnType<typeof boot>) {
  const { seat, code } = await foundSeat(t, 'Pierre', 48, 0.5);
  const guest = await joinSeat(t, code, 'Léa');
  await t.mutation(api.players.reserveNation, { ...seat, nation: 'france' });
  await t.mutation(api.players.declareReady, { ...seat, ready: true });
  await t.mutation(api.players.reserveNation, { ...guest, nation: 'ussr' });
  await t.mutation(api.players.declareReady, { ...guest, ready: true });
  await t.mutation(api.seasons.launch, seat);
  return { seat, guest };
}

async function playerOf(t: ReturnType<typeof boot>, seat: Seat) {
  return t.run(async (ctx) => {
    const player = await seatIn(ctx, seat);
    return player;
  });
}

async function building(
  t: ReturnType<typeof boot>,
  seat: Seat,
  key: BuildingKey,
  seasonId?: Id<'seasons'>,
  regionId = PRAHOVA,
) {
  const player = await playerOf(t, seat);
  return t.run((ctx) =>
    ctx.db.insert('buildings', {
      seasonId: seasonId ?? player.seasonId,
      playerId: player._id,
      key,
      regionId,
      level: 1,
    }),
  );
}

async function troop(
  t: ReturnType<typeof boot>,
  seat: Seat,
  role: UnitRole,
  stationedAt: Id<'buildings'>,
) {
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

async function plunderArrival(
  t: ReturnType<typeof boot>,
  seat: Seat,
  targetBuildingId: Id<'buildings'>,
  troopIds: ReadonlyArray<Id<'troops'>>,
  fromBuildingId: Id<'buildings'>,
) {
  const player = await playerOf(t, seat);
  const from = regionFacts(MARNE)!.point;
  const to = regionFacts(PRAHOVA)!.point;
  const movementId = await t.run((ctx) =>
    ctx.db.insert('movements', {
      seasonId: player.seasonId,
      playerId: player._id,
      type: 'march',
      fromBuildingId,
      target: { kind: 'building', buildingId: targetBuildingId },
      from: { lon: from[0], lat: from[1] },
      to: { lon: to[0], lat: to[1] },
      hostCountry: 'ROU',
      points: [
        { lon: from[0], lat: from[1] },
        { lon: to[0], lat: to[1] },
      ],
      legs: [{ medium: 'land', distanceUnits: 1 }],
      distanceUnits: 1,
      costUnits: 1,
      troopIds: [...troopIds],
      departedAt: MIDDAY - HOUR,
      arrivesAt: MIDDAY,
      plunder: { phase: 'outbound', buildingId: targetBuildingId },
    }),
  );
  await t.mutation(internal.movements.arrive, { movementId });
  return movementId;
}

async function attackArrival(
  t: ReturnType<typeof boot>,
  seat: Seat,
  troopIds: ReadonlyArray<Id<'troops'>>,
) {
  const player = await playerOf(t, seat);
  const to = regionFacts(PRAHOVA)!.point;
  const movementId = await t.run((ctx) =>
    ctx.db.insert('movements', {
      seasonId: player.seasonId,
      playerId: player._id,
      type: 'attack',
      fromBuildingId: null,
      target: { kind: 'point', point: { lon: to[0], lat: to[1] } },
      from: { lon: to[0] - 1, lat: to[1] },
      to: { lon: to[0], lat: to[1] },
      hostCountry: 'ROU',
      points: [
        { lon: to[0] - 1, lat: to[1] },
        { lon: to[0], lat: to[1] },
      ],
      legs: [{ medium: 'land', distanceUnits: 1 }],
      distanceUnits: 1,
      costUnits: 1,
      troopIds: [...troopIds],
      departedAt: MIDDAY,
      arrivesAt: Date.now(),
    }),
  );
  await t.mutation(internal.movements.arrive, { movementId });
}

async function completePresence(t: ReturnType<typeof boot>, movementId: Id<'movements'>) {
  const movement = await t.run((ctx) => ctx.db.get(movementId));
  if (movement?.plunder?.phase !== 'presence') throw new Error('presence not started');
  vi.setSystemTime(movement.plunder.until);
  await t.mutation(internal.movements.completePlunderPresence, {
    movementId,
    expectedAt: movement.plunder.until,
  });
  return movement.plunder.until;
}

async function setStocks(
  t: ReturnType<typeof boot>,
  seat: Seat,
  amounts: Partial<Record<ResourceKey, number>>,
) {
  const player = await playerOf(t, seat);
  await t.run(async (ctx) => {
    const rows = await ctx.db
      .query('resources')
      .withIndex('byPlayer', (q) => q.eq('playerId', player._id))
      .collect();
    for (const row of rows) {
      await ctx.db.patch(row._id, { stock: amounts[row.key] ?? 0, updatedAt: Date.now() });
    }
  });
}

async function stocksOf(t: ReturnType<typeof boot>, seat: Seat) {
  const player = await playerOf(t, seat);
  return t.run(async (ctx) => {
    const rows = await ctx.db
      .query('resources')
      .withIndex('byPlayer', (q) => q.eq('playerId', player._id))
      .collect();
    return Object.fromEntries(rows.map((row) => [row.key, row.stock])) as Record<
      ResourceKey,
      number
    >;
  });
}

async function returnsOf(t: ReturnType<typeof boot>, seat: Seat) {
  const player = await playerOf(t, seat);
  return t.run(async (ctx) => {
    const movements = await ctx.db
      .query('movements')
      .withIndex('byPlayer', (q) => q.eq('playerId', player._id))
      .collect();
    return movements.filter((movement) => movement.type === 'return');
  });
}

async function observe(t: ReturnType<typeof boot>, seat: Seat) {
  const player = await playerOf(t, seat);
  return t.run((ctx) =>
    surveyFromPoint(ctx, player._id, regionFacts(PRAHOVA)!.point, Date.now(), 1),
  );
}

async function resolve(
  t: ReturnType<typeof boot>,
  seat: Seat,
  buildingId: Id<'buildings'>,
  atArrival = false,
) {
  const player = await playerOf(t, seat);
  return t.run((ctx) =>
    atArrival
      ? revalidatePlunderTarget(ctx, player, buildingId)
      : surveyedPlunderTarget(ctx, player, buildingId),
  );
}

describe('surveyed plunder targets', () => {
  it('serves only the minimal warehouse snapshot filed for the observer', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const warehouseId = await building(t, guest, 'warehouse');

    await observe(t, seat);

    const view = await t.query(api.view.playerView, seat);
    expect(view.surveyedInstallations).toEqual([
      { id: warehouseId, key: 'warehouse', regionId: PRAHOVA },
    ]);
    expect(JSON.stringify(view.surveyedInstallations)).not.toContain('stock');
    expect(JSON.stringify(view.surveyedInstallations)).not.toContain('garrison');
    await expect(resolve(t, seat, warehouseId)).resolves.toMatchObject({ _id: warehouseId });
  });

  it('accepts a surveyed legacy depot as the same warehouse target', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const depotId = await building(t, guest, 'depot');
    await observe(t, seat);

    expect((await t.query(api.view.playerView, seat)).surveyedInstallations).toEqual([
      { id: depotId, key: 'warehouse', regionId: PRAHOVA },
    ]);
    await expect(resolve(t, seat, depotId)).resolves.toMatchObject({ _id: depotId });
  });

  it('reveals neither an old row without an inventory nor a building raised after the survey', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    await observe(t, seat);
    const warehouseId = await building(t, guest, 'warehouse');

    expect((await t.query(api.view.playerView, seat)).surveyedInstallations).toEqual([]);
    await expect(resolve(t, seat, warehouseId)).rejects.toThrow('UNKNOWN_BUILDING');
  });

  it('uses one opaque refusal for unknown, friendly, cross-season and non-warehouse targets', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const me = await playerOf(t, seat);
    const friendly = await building(t, seat, 'warehouse');
    const hq = await building(t, guest, 'hq');
    const otherSeason = await t.run((ctx) =>
      ctx.db.insert('seasons', {
        code: 'OTHER',
        status: 'launched',
        durationHours: 48,
        compensation: 0.5,
        seed: 1,
        playableRegion: 'world',
        launchedAt: Date.now(),
      }),
    );
    const crossed = await building(t, guest, 'warehouse', otherSeason);
    await observe(t, seat);

    const missing = 'missing-building' as Id<'buildings'>;
    for (const target of [missing, friendly, hq, crossed]) {
      await expect(resolve(t, seat, target)).rejects.toThrow('UNKNOWN_BUILDING');
    }

    await expect(t.run((ctx) => revalidatePlunderTarget(ctx, me, hq))).rejects.toThrow(
      'UNKNOWN_BUILDING',
    );
  });

  it('revalidates an already authorised target at arrival without requiring fresh intelligence', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const warehouseId = await building(t, guest, 'warehouse');
    await observe(t, seat);

    await expect(resolve(t, seat, warehouseId, false)).resolves.toMatchObject({
      _id: warehouseId,
    });
    const me = await playerOf(t, seat);
    await t.run((ctx) => ctx.db.patch(warehouseId, { playerId: me._id }));
    await expect(resolve(t, seat, warehouseId, false)).rejects.toThrow('UNKNOWN_BUILDING');
  });

  it('refuses an already disabled warehouse through the same opaque target gate', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const warehouseId = await building(t, guest, 'warehouse');
    await observe(t, seat);
    await t.run((ctx) => ctx.db.patch(warehouseId, { disabledUntil: Date.now() + HOUR }));

    await expect(resolve(t, seat, warehouseId)).rejects.toThrow('UNKNOWN_BUILDING');
  });
});

describe('public plunder order', () => {
  it('files the surveyed enemy installation through the common movement corridor', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const barracks = await building(t, seat, 'barracks', undefined, MARNE);
    const infantry = await troop(t, seat, 'infantry', barracks);
    const warehouseId = await building(t, guest, 'warehouse');
    await observe(t, seat);

    const filed = await t.mutation(api.movements.plunder, {
      ...seat,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [infantry],
      buildingId: warehouseId,
    });

    expect(await t.run((ctx) => ctx.db.get(filed.movementId))).toMatchObject({
      playerId: (await playerOf(t, seat))._id,
      type: 'march',
      target: { kind: 'building', buildingId: warehouseId },
      plunder: { phase: 'outbound', buildingId: warehouseId },
      troopIds: [infantry],
    });
  });

  it('rolls back the departure when the selected column has no infantry', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const barracks = await building(t, seat, 'barracks', undefined, MARNE);
    const armor = await troop(t, seat, 'armor', barracks);
    const warehouseId = await building(t, guest, 'warehouse');
    await observe(t, seat);

    await expect(
      t.mutation(api.movements.plunder, {
        ...seat,
        origin: { kind: 'building', buildingId: barracks },
        troopIds: [armor],
        buildingId: warehouseId,
      }),
    ).rejects.toThrow('INFANTRY_REQUIRED');
    expect(await t.run((ctx) => ctx.db.query('movements').collect())).toEqual([]);
  });
});

describe('plunder presence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  it('holds an infantry column on an undefended warehouse until the presence deadline', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const barracks = await building(t, seat, 'barracks', undefined, MARNE);
    const infantry = await troop(t, seat, 'infantry', barracks);
    const warehouseId = await building(t, guest, 'warehouse');

    const movementId = await plunderArrival(t, seat, warehouseId, [infantry], barracks);

    const movement = await t.run((ctx) => ctx.db.get(movementId));
    expect(movement?.plunder).toMatchObject({
      phase: 'presence',
      buildingId: warehouseId,
      until: MIDDAY + PLUNDER_HOURS_PRESENT * HOUR,
      engagementId: null,
      returnRegionId: 'FRA-5302',
      returnPlan: {
        kind: 'route',
        regionId: 'FRA-5302',
        hostCountry: 'FRA',
      },
    });
    if (movement?.plunder?.phase !== 'presence' || movement.plunder.returnPlan?.kind !== 'route') {
      throw new Error('return route not planned');
    }
    expect(movement.plunder.returnPlan.points.at(-1)).toEqual(movement.plunder.returnPlan.point);
    expect(movement?.from).toEqual(movement?.to);
    expect(await t.run((ctx) => ctx.db.query('engagements').collect())).toEqual([]);
    expect((await t.run((ctx) => ctx.db.get(warehouseId)))?.disabledUntil).toBeUndefined();
  });

  it('keeps the present column unavailable to a second public order', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const barracks = await building(t, seat, 'barracks', undefined, MARNE);
    const infantry = await troop(t, seat, 'infantry', barracks);
    const warehouseId = await building(t, guest, 'warehouse');
    await plunderArrival(t, seat, warehouseId, [infantry], barracks);

    await expect(
      t.mutation(api.movements.attack, {
        ...seat,
        origin: { kind: 'building', buildingId: barracks },
        troopIds: [infantry],
        target: { kind: 'region', regionId: RUHR },
      }),
    ).rejects.toThrow('TROOP_NOT_AT_ORIGIN');
  });

  it('resolves the real defence before a winning column starts its presence', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const barracks = await building(t, seat, 'barracks', undefined, MARNE);
    const attackers = await Promise.all([
      troop(t, seat, 'infantry', barracks),
      troop(t, seat, 'infantry', barracks),
    ]);
    const warehouseId = await building(t, guest, 'warehouse');
    await troop(t, guest, 'infantry', warehouseId);

    const movementId = await plunderArrival(t, seat, warehouseId, attackers, barracks);

    const [engagement] = await t.run((ctx) => ctx.db.query('engagements').collect());
    expect(engagement).toBeDefined();
    expect((await t.run((ctx) => ctx.db.get(movementId)))?.plunder?.phase).toBe('presence');
    await completePresence(t, movementId);
    const [report] = await t.run((ctx) => ctx.db.query('plunderReports').collect());
    expect(report?.engagementId).toBe(engagement?._id);
  });

  it('returns empty when the warehouse is already disabled at arrival', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const barracks = await building(t, seat, 'barracks', undefined, MARNE);
    const infantry = await troop(t, seat, 'infantry', barracks);
    const warehouseId = await building(t, guest, 'warehouse');
    await t.run((ctx) => ctx.db.patch(warehouseId, { disabledUntil: MIDDAY + HOUR }));

    await plunderArrival(t, seat, warehouseId, [infantry], barracks);

    const [back] = await returnsOf(t, seat);
    expect(back?.loot).toBeUndefined();
    expect(await t.run((ctx) => ctx.db.query('plunderReports').collect())).toEqual([]);
  });

  it('returns the surviving escort empty when the infantry is lost during presence', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const barracks = await building(t, seat, 'barracks', undefined, MARNE);
    const infantry = await troop(t, seat, 'infantry', barracks);
    const transport = await troop(t, seat, 'landTransport', barracks);
    const warehouseId = await building(t, guest, 'warehouse');
    const movementId = await plunderArrival(t, seat, warehouseId, [infantry, transport], barracks);
    await t.run((ctx) => ctx.db.delete(infantry));

    await completePresence(t, movementId);

    expect(await returnsOf(t, seat)).toHaveLength(1);
    expect((await returnsOf(t, seat))[0]?.loot).toBeUndefined();
    expect((await t.run((ctx) => ctx.db.get(warehouseId)))?.disabledUntil).toBeUndefined();
  });

  it('keeps a present expedition passive but lets it riposte when attacked on the site', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const barracks = await building(t, seat, 'barracks', undefined, MARNE);
    const defenders = await Promise.all([
      troop(t, seat, 'infantry', barracks),
      troop(t, seat, 'infantry', barracks),
    ]);
    const warehouseId = await building(t, guest, 'warehouse');
    await plunderArrival(t, seat, warehouseId, defenders, barracks);
    const guestBarracks = await building(t, guest, 'barracks');
    const attacker = await troop(t, guest, 'infantry', guestBarracks);

    await attackArrival(t, guest, [attacker]);

    const [engagement] = await t.run((ctx) => ctx.db.query('engagements').collect());
    expect(engagement).toMatchObject({
      attackerId: (await playerOf(t, guest))._id,
      defenderId: (await playerOf(t, seat))._id,
    });
  });

  it('takes available surplus before disabling and clipping the warehouse', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const barracks = await building(t, seat, 'barracks', undefined, MARNE);
    const infantry = await troop(t, seat, 'infantry', barracks);
    const transport = await troop(t, seat, 'landTransport', barracks);
    const warehouseId = await building(t, guest, 'warehouse');
    await setStocks(t, guest, { food: 702, alloy: 500 });
    const movementId = await plunderArrival(t, seat, warehouseId, [infantry, transport], barracks);

    const takenAt = await completePresence(t, movementId);

    const target = await t.run((ctx) => ctx.db.get(warehouseId));
    expect(target?.disabledUntil).toBe(takenAt + PLUNDER_DISABLED_HOURS * HOUR);
    const stocks = await stocksOf(t, guest);
    expect(stocks.food).toBe(BASE_CAP);
    expect(stocks.alloy).toBe(BASE_CAP);
    const [report] = await t.run((ctx) => ctx.db.query('plunderReports').collect());
    expect(report?.taken).toMatchObject({ food: 120, alloy: 40 });
    expect(report?.storageLost).toMatchObject({ food: 180, alloy: 60 });
    expect(RESOURCES.reduce((sum, key) => sum + report!.taken[key], 0)).toBe(160);
    const [back] = await returnsOf(t, seat);
    expect(back?.loot).toEqual(report?.taken);
    expect(back?.plunderReportId).toBe(report?._id);
  });

  it('records a successful take with nothing available and still disables the warehouse', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const barracks = await building(t, seat, 'barracks', undefined, MARNE);
    const infantry = await troop(t, seat, 'infantry', barracks);
    const warehouseId = await building(t, guest, 'warehouse');
    await setStocks(t, guest, {});
    const movementId = await plunderArrival(t, seat, warehouseId, [infantry], barracks);

    await completePresence(t, movementId);

    const [report] = await t.run((ctx) => ctx.db.query('plunderReports').collect());
    expect(report?.taken).toEqual(Object.fromEntries(RESOURCES.map((key) => [key, 0])));
    expect((await t.run((ctx) => ctx.db.get(warehouseId)))?.disabledUntil).toBeDefined();
  });

  it('takes only available stocks and leaves queued recruitment refunds protected', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const barracks = await building(t, seat, 'barracks', undefined, MARNE);
    const infantry = await troop(t, seat, 'infantry', barracks);
    const victimBarracks = await building(t, guest, 'barracks', undefined, PRAHOVA);
    const warehouseId = await building(t, guest, 'warehouse');
    await setStocks(t, guest, { food: 700, alloy: 500 });
    await t.mutation(api.troops.recruit, {
      ...guest,
      buildingId: victimBarracks,
      role: 'infantry',
      tier: 1,
    });
    const queued = await t.mutation(api.troops.recruit, {
      ...guest,
      buildingId: victimBarracks,
      role: 'infantry',
      tier: 1,
    });
    const movementId = await plunderArrival(t, seat, warehouseId, [infantry], barracks);

    await completePresence(t, movementId);
    const [report] = await t.run((ctx) => ctx.db.query('plunderReports').collect());
    expect(report?.taken.alloy).toBeGreaterThan(0);
    await t.mutation(api.troops.cancel, { ...guest, recruitmentId: queued.recruitmentId });
    expect((await stocksOf(t, guest)).alloy).toBe(BASE_CAP + queued.cost.alloy);
  });

  it('lets only the first concurrent presence take and disable the target', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const barracks = await building(t, seat, 'barracks', undefined, MARNE);
    const first = await troop(t, seat, 'infantry', barracks);
    const second = await troop(t, seat, 'infantry', barracks);
    const warehouseId = await building(t, guest, 'warehouse');
    await setStocks(t, guest, { food: 500 });
    const firstMovement = await plunderArrival(t, seat, warehouseId, [first], barracks);
    const secondMovement = await plunderArrival(t, seat, warehouseId, [second], barracks);

    await completePresence(t, firstMovement);
    await completePresence(t, secondMovement);

    expect(await t.run((ctx) => ctx.db.query('plunderReports').collect())).toHaveLength(1);
    const returns = await returnsOf(t, seat);
    expect(returns.filter((movement) => movement.loot !== undefined)).toHaveLength(1);
    expect(returns.filter((movement) => movement.loot === undefined)).toHaveLength(1);
  });

  it('returns empty when ownership changes before the take', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const attacker = await playerOf(t, seat);
    const barracks = await building(t, seat, 'barracks', undefined, MARNE);
    const infantry = await troop(t, seat, 'infantry', barracks);
    const warehouseId = await building(t, guest, 'warehouse');
    const movementId = await plunderArrival(t, seat, warehouseId, [infantry], barracks);
    await t.run((ctx) => ctx.db.patch(warehouseId, { playerId: attacker._id }));

    await completePresence(t, movementId);

    expect(await t.run((ctx) => ctx.db.query('plunderReports').collect())).toEqual([]);
    expect((await returnsOf(t, seat))[0]?.loot).toBeUndefined();
  });

  it('disables and records a legacy depot through the warehouse rule', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const barracks = await building(t, seat, 'barracks', undefined, MARNE);
    const infantry = await troop(t, seat, 'infantry', barracks);
    const depotId = await building(t, guest, 'depot');
    await setStocks(t, guest, { food: 500 });
    const movementId = await plunderArrival(t, seat, depotId, [infantry], barracks);

    await completePresence(t, movementId);

    expect((await t.run((ctx) => ctx.db.get(depotId)))?.disabledUntil).toBeDefined();
    const [report] = await t.run((ctx) => ctx.db.query('plunderReports').collect());
    expect(report).toMatchObject({ buildingId: depotId, building: 'depot' });
  });

  it('ignores duplicate and stale presence deadlines', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const barracks = await building(t, seat, 'barracks', undefined, MARNE);
    const infantry = await troop(t, seat, 'infantry', barracks);
    const warehouseId = await building(t, guest, 'warehouse');
    await setStocks(t, guest, { food: 500 });
    const movementId = await plunderArrival(t, seat, warehouseId, [infantry], barracks);
    const movement = await t.run((ctx) => ctx.db.get(movementId));
    const due = movement!.plunder!.phase === 'presence' ? movement!.plunder!.until : 0;

    await t.mutation(internal.movements.completePlunderPresence, {
      movementId,
      expectedAt: due - 1,
    });
    expect(await t.run((ctx) => ctx.db.query('plunderReports').collect())).toEqual([]);
    vi.setSystemTime(due);
    await t.mutation(internal.movements.completePlunderPresence, { movementId, expectedAt: due });
    await t.mutation(internal.movements.completePlunderPresence, { movementId, expectedAt: due });
    expect(await t.run((ctx) => ctx.db.query('plunderReports').collect())).toHaveLength(1);
  });

  it('has no effect after the season closes', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const barracks = await building(t, seat, 'barracks', undefined, MARNE);
    const infantry = await troop(t, seat, 'infantry', barracks);
    const warehouseId = await building(t, guest, 'warehouse');
    const movementId = await plunderArrival(t, seat, warehouseId, [infantry], barracks);
    const movement = await t.run((ctx) => ctx.db.get(movementId));
    const due = movement!.plunder!.phase === 'presence' ? movement!.plunder!.until : 0;
    const player = await playerOf(t, seat);
    await t.run(async (ctx) => {
      await ctx.db.patch(player.seasonId, { status: 'concluded', concludedAt: MIDDAY });
    });

    vi.setSystemTime(due);
    await t.mutation(internal.movements.completePlunderPresence, { movementId, expectedAt: due });

    expect(await t.run((ctx) => ctx.db.query('plunderReports').collect())).toEqual([]);
    expect((await t.run((ctx) => ctx.db.get(warehouseId)))?.disabledUntil).toBeUndefined();
  });

  it('keeps resolving an expedition ordered before capitulation', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const barracks = await building(t, seat, 'barracks', undefined, MARNE);
    const infantry = await troop(t, seat, 'infantry', barracks);
    const warehouseId = await building(t, guest, 'warehouse');
    const movementId = await plunderArrival(t, seat, warehouseId, [infantry], barracks);
    const player = await playerOf(t, seat);
    const code = await t.run(async (ctx) => (await ctx.db.get(player.seasonId))!.code);
    const third = await joinSeat(t, code, 'Marc');
    await t.mutation(api.players.reserveNation, { ...third, nation: 'germany' });
    await t.mutation(api.seasons.enterWar, third);
    await t.mutation(api.players.surrender, seat);

    await completePresence(t, movementId);

    expect(await t.run((ctx) => ctx.db.query('plunderReports').collect())).toHaveLength(1);
    expect((await t.run((ctx) => ctx.db.get(warehouseId)))?.disabledUntil).toBeDefined();
  });
});
