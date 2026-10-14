import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import type { UnitRole } from '../src/domain/ids';
import { nominalStrength } from './constants';
import { heldOver } from './holding';
import { reassessDetection } from './movement/detection';
import { walkHome } from './movement/arrival';
import { regionFacts } from './regions';
import schema from './schema';
import { modules } from './test.setup';
import { foundSeat, joinSeat, placeHq, seatIn, surveyRegion } from './seats.fixture';
import type { Seat } from './seats.fixture';

const boot = () => convexTest({ schema, modules, transactionLimits: true });
type Bench = ReturnType<typeof boot>;
const HOUR = 3_600_000;
const MIDDAY = Date.UTC(2026, 8, 9, 12);
const MARNE = 'FRA-5323';
const PSKOV = 'RUS-2335';
const PRAHOVA = 'ROU-310';
const NO_REST = { startMinutes: 0, endMinutes: 0 };

async function launchedSeason(t: Bench) {
  const { seat, code } = await foundSeat(t, 'Pierre', 48, 0.5);
  const guest = await joinSeat(t, code, 'Léa');
  await t.mutation(api.players.reserveNation, { ...seat, nation: 'france' });
  await t.mutation(api.players.declareReady, { ...seat, ready: true });
  await t.mutation(api.players.reserveNation, { ...guest, nation: 'ussr' });
  await t.mutation(api.players.declareReady, { ...guest, ready: true });
  await t.mutation(api.seasons.launch, seat);
  await placeHq(t, seat);
  await placeHq(t, guest);
  await restWindow(t, guest, NO_REST);
  return { seat, guest };
}

const playerOf = (t: Bench, seat: Seat) => t.run((ctx) => seatIn(ctx, seat));

async function restWindow(t: Bench, seat: Seat, window: Doc<'players'>['restWindow']) {
  const player = await playerOf(t, seat);
  await t.run((ctx) => ctx.db.patch(player._id, { restWindow: window }));
}

async function building(t: Bench, seat: Seat, regionId: string, level = 2) {
  const player = await playerOf(t, seat);
  return t.run((ctx) =>
    ctx.db.insert('buildings', {
      seasonId: player.seasonId,
      playerId: player._id,
      key: 'barracks',
      regionId,
      level,
      outpostId: null,
    }),
  );
}

async function troop(
  t: Bench,
  seat: Seat,
  role: UnitRole,
  stationedAt: Doc<'troops'>['stationedAt'],
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

const pointOfRegion = (regionId: string) => {
  const [lon, lat] = regionFacts(regionId)!.point;
  return { lon, lat };
};

async function captureArrival(
  t: Bench,
  seat: Seat,
  target: NonNullable<Doc<'movements'>['capture']>,
  to: { lon: number; lat: number },
  hostCountry: string,
  troopIds: ReadonlyArray<Id<'troops'>>,
) {
  const player = await playerOf(t, seat);
  const movementId = await t.run((ctx) =>
    ctx.db.insert('movements', {
      seasonId: player.seasonId,
      playerId: player._id,
      type: 'attack',
      fromBuildingId: null,
      target:
        target.kind === 'building'
          ? { kind: 'building', buildingId: target.buildingId }
          : { kind: 'outpost', outpostId: target.outpostId },
      from: { lon: to.lon - 1, lat: to.lat },
      to,
      hostCountry,
      points: [{ lon: to.lon - 1, lat: to.lat }, to],
      legs: [{ medium: 'land', distanceUnits: 1 }],
      distanceUnits: 1,
      costUnits: 1,
      troopIds: [...troopIds],
      departedAt: MIDDAY - HOUR,
      arrivesAt: MIDDAY,
      capture: target,
    }),
  );
  await t.mutation(internal.movements.arrive, { movementId });
}

const capturesOf = (t: Bench) => t.run((ctx) => ctx.db.query('captures').collect());

async function noticesOf(t: Bench, seat: Seat, kind: Doc<'notices'>['kind']) {
  const player = await playerOf(t, seat);
  return t.run(async (ctx) =>
    (
      await ctx.db
        .query('notices')
        .withIndex('byPlayer', (q) => q.eq('playerId', player._id))
        .collect()
    ).filter((notice) => notice.kind === kind),
  );
}

async function finish(t: Bench) {
  const [capture] = await capturesOf(t);
  vi.setSystemTime(capture!.completesAt);
  await t.mutation(internal.captures.complete, {
    captureId: capture!._id,
    expectedAt: capture!.completesAt,
  });
}

const reassess = (t: Bench, seasonId: Id<'seasons'>) =>
  t.run((ctx) => reassessDetection(ctx, seasonId));

describe('capturing a building', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  it('starts when infantry reaches an unguarded site, and warns the defender', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const barracks = await building(t, guest, PSKOV);
    const infantry = await troop(t, seat, 'infantry', null);

    await captureArrival(
      t,
      seat,
      { kind: 'building', buildingId: barracks },
      pointOfRegion(PSKOV),
      'RUS',
      [infantry],
    );

    expect(await capturesOf(t)).toMatchObject([{ completesAt: MIDDAY + 6 * HOUR, rate: 1 }]);
    expect(await noticesOf(t, guest, 'captureStarted')).toMatchObject([
      { side: 'defender', completesAt: MIDDAY + 6 * HOUR },
    ]);
    expect((await t.run((ctx) => ctx.db.get(infantry)))!.stationedAt).toEqual(pointOfRegion(PSKOV));
  });

  it('hands the building over a level down, and colours national ground for its capturer', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const barracks = await building(t, guest, PSKOV);
    const infantry = await troop(t, seat, 'infantry', null);
    await captureArrival(
      t,
      seat,
      { kind: 'building', buildingId: barracks },
      pointOfRegion(PSKOV),
      'RUS',
      [infantry],
    );

    await finish(t);

    const me = await playerOf(t, seat);
    expect(await t.run((ctx) => ctx.db.get(barracks))).toMatchObject({
      playerId: me._id,
      level: 1,
      capturedAt: MIDDAY + 6 * HOUR,
    });
    const holder = await t.run(async (ctx) =>
      (await heldOver(ctx, me.seasonId, [regionFacts(PSKOV)!], MIDDAY + 6 * HOUR)).get(PSKOV),
    );
    expect(holder).toBe(me._id);
    expect(await noticesOf(t, seat, 'captureSucceeded')).toHaveLength(1);
    expect(await noticesOf(t, guest, 'captureSucceeded')).toMatchObject([{ side: 'defender' }]);
  });

  it('is cancelled when the infantry leaves, and the old rendezvous does nothing', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const barracks = await building(t, guest, PSKOV);
    const infantry = await troop(t, seat, 'infantry', null);
    await captureArrival(
      t,
      seat,
      { kind: 'building', buildingId: barracks },
      pointOfRegion(PSKOV),
      'RUS',
      [infantry],
    );
    await t.run((ctx) => ctx.db.patch(infantry, { stationedAt: pointOfRegion(PRAHOVA) }));
    await reassess(t, seat.seasonId);

    await finish(t);

    const guestPlayer = await playerOf(t, guest);
    expect((await t.run((ctx) => ctx.db.get(barracks)))!.playerId).toBe(guestPlayer._id);
    expect(await noticesOf(t, guest, 'captureCancelled')).toHaveLength(1);
  });

  it('slows the rest when the infantry loses strength, without starting over', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const barracks = await building(t, guest, PSKOV);
    const infantry = await troop(t, seat, 'infantry', null);
    await captureArrival(
      t,
      seat,
      { kind: 'building', buildingId: barracks },
      pointOfRegion(PSKOV),
      'RUS',
      [infantry],
    );

    vi.setSystemTime(MIDDAY + 3 * HOUR);
    await t.run(async (ctx) => {
      const troop = (await ctx.db.get(infantry))!;
      await ctx.db.patch(infantry, { currentStrength: troop.nominalStrength / 2 });
    });
    await reassess(t, seat.seasonId);

    expect(await capturesOf(t)).toMatchObject([{ progress: 0.5, completesAt: MIDDAY + 9 * HOUR }]);
  });

  it('stands still through the defender’s rest window', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    await restWindow(t, guest, { startMinutes: 14 * 60, endMinutes: 16 * 60 });
    const barracks = await building(t, guest, PSKOV);
    const infantry = await troop(t, seat, 'infantry', null);

    await captureArrival(
      t,
      seat,
      { kind: 'building', buildingId: barracks },
      pointOfRegion(PSKOV),
      'RUS',
      [infantry],
    );

    expect(await capturesOf(t)).toMatchObject([{ completesAt: MIDDAY + 8 * HOUR }]);
  });

  it('runs in minutes in a blitz', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    await t.run((ctx) => ctx.db.patch(seat.seasonId, { mode: 'blitz' }));
    const barracks = await building(t, guest, PSKOV);
    const infantry = await troop(t, seat, 'infantry', null);

    await captureArrival(
      t,
      seat,
      { kind: 'building', buildingId: barracks },
      pointOfRegion(PSKOV),
      'RUS',
      [infantry],
    );

    expect(await capturesOf(t)).toMatchObject([{ completesAt: MIDDAY + 3 * 60_000 }]);
  });
});

describe('capturing an outpost', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  it('takes the point, its level and the buildings it anchors', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const owner = await playerOf(t, guest);
    const point = pointOfRegion(PRAHOVA);
    const outpostId = await t.run((ctx) =>
      ctx.db.insert('outposts', {
        seasonId: owner.seasonId,
        playerId: owner._id,
        point,
        hostCountry: 'ROU',
        regionId: PRAHOVA,
        level: 2,
        specialization: 'relay',
        foundedAt: MIDDAY - 10 * HOUR,
        disabledUntil: null,
        immuneUntil: null,
      }),
    );
    const anchored = await t.run((ctx) =>
      ctx.db.insert('buildings', {
        seasonId: owner.seasonId,
        playerId: owner._id,
        key: 'mine',
        regionId: PRAHOVA,
        level: 1,
        outpostId,
      }),
    );
    const infantry = await troop(t, seat, 'infantry', null);
    await captureArrival(t, seat, { kind: 'outpost', outpostId }, point, 'ROU', [infantry]);

    await finish(t);

    const me = await playerOf(t, seat);
    expect(await t.run((ctx) => ctx.db.get(outpostId))).toMatchObject({
      playerId: me._id,
      level: 2,
    });
    expect((await t.run((ctx) => ctx.db.get(anchored)))!.playerId).toBe(me._id);
    expect((await t.run((ctx) => ctx.db.get(infantry)))!.stationedAt).toBe(outpostId);
  });
});

describe('taking a site back', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  it('lets the loser see and order the capture of a building lost on its own ground', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const barracks = await building(t, guest, PSKOV);
    const infantry = await troop(t, seat, 'infantry', null);
    await captureArrival(
      t,
      seat,
      { kind: 'building', buildingId: barracks },
      pointOfRegion(PSKOV),
      'RUS',
      [infantry],
    );
    await finish(t);

    const loser = await playerOf(t, guest);
    const surveyed = await t.run(
      async (ctx) =>
        (
          await ctx.db
            .query('regionSightings')
            .withIndex('byPlayerRegion', (q) => q.eq('playerId', loser._id).eq('regionId', PSKOV))
            .unique()
        )?.installations,
    );
    expect(surveyed).toEqual([{ buildingId: barracks, key: 'barracks' }]);

    const home = await building(t, guest, 'RUS-2336', 1);
    const mine = await troop(t, guest, 'infantry', home);
    await expect(
      t.mutation(api.movements.capture, {
        ...guest,
        origin: { kind: 'building', buildingId: home },
        troopIds: [mine],
        target: { kind: 'building', buildingId: barracks },
      }),
    ).resolves.toMatchObject({ movementId: expect.any(String) });
  });
});

describe('a site that changed hands while its column was away', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  it('does not take its old garrison back in, on the road home or at the door', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const barracks = await building(t, guest, PSKOV);
    const away = await troop(t, guest, 'infantry', barracks);
    const homing = await troop(t, guest, 'infantry', barracks);
    const capturer = await playerOf(t, seat);
    await t.run((ctx) => ctx.db.patch(barracks, { playerId: capturer._id, capturedAt: MIDDAY }));

    const there = pointOfRegion(PRAHOVA);
    await t.run(async (ctx) => {
      const troop = (await ctx.db.get(away))!;
      await walkHome(ctx, { winners: [troop], beaten: [] }, [there.lon, there.lat], MIDDAY);
    });
    expect((await t.run((ctx) => ctx.db.get(away)))!.stationedAt).toEqual(there);

    const owner = await playerOf(t, guest);
    const to = pointOfRegion(PSKOV);
    const movementId = await t.run((ctx) =>
      ctx.db.insert('movements', {
        seasonId: owner.seasonId,
        playerId: owner._id,
        type: 'return',
        fromBuildingId: barracks,
        target: { kind: 'home' },
        from: there,
        to,
        hostCountry: 'RUS',
        points: [there, to],
        legs: [{ medium: 'land', distanceUnits: 1 }],
        distanceUnits: 1,
        costUnits: 1,
        troopIds: [homing],
        departedAt: MIDDAY - HOUR,
        arrivesAt: MIDDAY,
      }),
    );
    await t.mutation(internal.movements.arrive, { movementId });
    expect((await t.run((ctx) => ctx.db.get(homing)))!.stationedAt).toEqual(to);
  });
});

describe('capturing a foundation still under way', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  it('lets it fall with the garrison that held it, and captures nothing', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const owner = await playerOf(t, guest);
    const point = pointOfRegion(PRAHOVA);
    const outpostId = await t.run((ctx) =>
      ctx.db.insert('outposts', {
        seasonId: owner.seasonId,
        playerId: owner._id,
        point,
        hostCountry: 'ROU',
        regionId: PRAHOVA,
        level: 1,
        specialization: 'relay',
        foundedAt: MIDDAY - HOUR,
        standsAt: MIDDAY + 5 * HOUR,
        disabledUntil: null,
        immuneUntil: null,
      }),
    );
    const guard = await troop(t, guest, 'infantry', outpostId);
    await t.run((ctx) => ctx.db.patch(guard, { currentStrength: 1 }));
    const attackers = [
      await troop(t, seat, 'infantry', null),
      await troop(t, seat, 'infantry', null),
      await troop(t, seat, 'armor', null),
    ];

    await captureArrival(t, seat, { kind: 'outpost', outpostId }, point, 'ROU', attackers);

    expect(await t.run((ctx) => ctx.db.get(outpostId))).toBeNull();
    expect(await capturesOf(t)).toEqual([]);
    expect(await noticesOf(t, guest, 'foundationLost')).toHaveLength(1);
  });
});

describe('ordering a capture', () => {
  it('is refused to a column without infantry, and on a headquarters', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const barracks = await building(t, seat, MARNE);
    const armor = await troop(t, seat, 'armor', barracks);
    const target = await building(t, guest, PSKOV);
    await surveyRegion(t, seat, PSKOV);
    const origin = { kind: 'building', buildingId: barracks } as const;

    await expect(
      t.mutation(api.movements.capture, {
        ...seat,
        origin,
        troopIds: [armor],
        target: { kind: 'building', buildingId: target },
      }),
    ).rejects.toThrow('CAPTURE_NEEDS_INFANTRY');

    const hq = await t.run(async (ctx) => {
      const owner = await seatIn(ctx, guest);
      return (
        await ctx.db
          .query('buildings')
          .withIndex('byPlayer', (q) => q.eq('playerId', owner._id))
          .collect()
      ).find((held) => held.key === 'hq')!;
    });
    await surveyRegion(t, seat, hq.regionId);
    const infantry = await troop(t, seat, 'infantry', barracks);
    await expect(
      t.mutation(api.movements.capture, {
        ...seat,
        origin,
        troopIds: [infantry],
        target: { kind: 'building', buildingId: hq._id },
      }),
    ).rejects.toThrow('HQ_NOT_CAPTURABLE');
  });
});
