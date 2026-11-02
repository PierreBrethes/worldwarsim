import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import type { UnitRole } from '../src/domain/ids';
import { nominalStrength } from './constants';
import { push } from '../src/domain/push';
import { heldOver } from './holding';
import { reassessDetection } from './movement/detection';
import { walkHome } from './movement/arrival';
import { allRegions, foundationOwedBy, regionFacts, pointOfRegion } from './regions';
import { distanceKm } from '../src/domain/geo';
import schema from './schema';
import { modules } from './test.setup';
import { foundSeat, holdPoint, joinSeat, placeHq, seatIn, surveyRegion } from './seats.fixture';
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
  const { seat, code } = await foundSeat(t, 'Pierre', 0.5);
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

async function building(
  t: Bench,
  seat: Seat,
  regionId: string,
  level = 2,
  key: Doc<'buildings'>['key'] = 'barracks',
) {
  const player = await playerOf(t, seat);
  return t.run((ctx) =>
    ctx.db.insert('buildings', {
      seasonId: player.seasonId,
      playerId: player._id,
      key,
      regionId,
      point: pointOfRegion(regionId),
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
          : target.kind === 'outpost'
            ? { kind: 'outpost', outpostId: target.outpostId }
            : { kind: 'point', point: to },
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
    expect(await noticesOf(t, guest, 'captureCancelled')).toMatchObject([{ reason: 'left' }]);
  });

  it('is not cancelled once due, even if the infantry leaves before the rendezvous runs', async () => {
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
    const [due] = await capturesOf(t);
    vi.setSystemTime(due!.completesAt + 1000);
    await t.run((ctx) => ctx.db.patch(infantry, { stationedAt: pointOfRegion(PRAHOVA) }));
    await reassess(t, seat.seasonId);
    expect(await capturesOf(t)).toMatchObject([{ completesAt: due!.completesAt }]);
    expect((await capturesOf(t))[0]!.stoppedAt).toBeUndefined();
  });

  it('tells only the capturer when the site goes, and leaves him nothing to relaunch', async () => {
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
    await t.run((ctx) => ctx.db.delete(barracks));
    await reassess(t, seat.seasonId);

    expect(await capturesOf(t)).toEqual([]);
    expect(await noticesOf(t, seat, 'captureCancelled')).toMatchObject([{ reason: 'gone' }]);
    expect(await noticesOf(t, guest, 'captureCancelled')).toEqual([]);
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

    expect(await capturesOf(t)).toMatchObject([{ completesAt: MIDDAY + 2.4 * 60_000 }]);
  });
});

describe('a capturer who lays down his arms', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  it('still takes the site in the long mode: his troops hold and act as before', async () => {
    const t = boot();
    const { seat, code } = await foundSeat(t, 'Pierre', 0.5);
    const guest = await joinSeat(t, code, 'Léa');
    const third = await joinSeat(t, code, 'Marc');
    for (const [who, nation] of [
      [seat, 'france'],
      [guest, 'ussr'],
      [third, 'germany'],
    ] as const) {
      await t.mutation(api.players.reserveNation, { ...who, nation });
      await t.mutation(api.players.declareReady, { ...who, ready: true });
    }
    await t.mutation(api.seasons.launch, seat);
    for (const who of [seat, guest, third]) await placeHq(t, who);
    await restWindow(t, guest, NO_REST);
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
    await t.mutation(api.players.surrender, seat);
    await finish(t);
    const me = await playerOf(t, seat);
    expect((await t.run((ctx) => ctx.db.get(barracks)))!.playerId).toBe(me._id);
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
        point: pointOfRegion(PRAHOVA),
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

/** **Dakar** (P11) : un dépôt d'avant-poste pris au teneur brûle, et les deux camps l'apprennent. */
describe('capturing an outpost with a depot', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  async function takeDepot(withDakar: boolean) {
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
        foundedAt: MIDDAY - 10 * HOUR,
        disabledUntil: null,
        immuneUntil: null,
        depot: { ammunition: 40, oil: 20, coal: 0 },
      }),
    );
    if (withDakar) await holdPoint(t, seat, 'dakar', guest);
    const infantry = await troop(t, seat, 'infantry', null);
    await captureArrival(t, seat, { kind: 'outpost', outpostId }, point, 'ROU', [infantry]);
    await finish(t);
    return { t, seat, guest, outpostId };
  }

  it('passes to the capturer with the outpost when nobody holds Dakar', async () => {
    const { t, outpostId, guest } = await takeDepot(false);
    expect((await t.run((ctx) => ctx.db.get(outpostId)))!.depot).toEqual({
      ammunition: 40,
      oil: 20,
      coal: 0,
    });
    expect(await noticesOf(t, guest, 'depotBurned')).toEqual([]);
  });

  it('burns while the holder of Dakar loses it, and tells both sides', async () => {
    const { t, seat, guest, outpostId } = await takeDepot(true);
    expect((await t.run((ctx) => ctx.db.get(outpostId)))!.depot).toEqual({
      ammunition: 0,
      oil: 0,
      coal: 0,
    });
    expect(await noticesOf(t, seat, 'depotBurned')).toMatchObject([
      { side: 'capturer', lost: { ammunition: 40, oil: 20, coal: 0 } },
    ]);
    expect(await noticesOf(t, guest, 'depotBurned')).toMatchObject([{ side: 'holder' }]);
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
    expect(surveyed).toEqual([
      { buildingId: barracks, key: 'barracks', point: pointOfRegion(PSKOV) },
    ]);

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

describe('the foundation and a captured building', () => {
  it('settles no debt of its capturer', () => {
    const owed = foundationOwedBy({ nation: 'france' }, []);
    const first = owed[0]!;
    expect(
      foundationOwedBy({ nation: 'france' }, [
        { key: first.key, point: pointOfRegion(MARNE), capturedAt: 1 },
      ]),
    ).toEqual(owed);
  });
});

describe('the defender is warned on his device', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  const pushed = async (t: Bench, seat: Seat) => {
    const player = await playerOf(t, seat);
    return t.run(async (ctx) =>
      (await ctx.db.query('pushQueue').collect())
        .filter((row) => row.accountId === player.accountId)
        .map((row) => row.phrase),
    );
  };

  it('when a capture opens and when the site is lost, in the long mode only', async () => {
    for (const mode of ['mondiale', 'blitz'] as const) {
      const t = boot();
      const { seat, guest } = await launchedSeason(t);
      await t.run((ctx) => ctx.db.patch(seat.seasonId, { mode }));
      await t.mutation(api.notifications.subscribe, {
        token: guest.token,
        endpoint: 'https://fcm.googleapis.com/lea',
        p256dh: 'p256dh',
        auth: 'auth',
        userAgent: 'Mozilla/5.0',
      });
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
      expect(await pushed(t, guest)).toEqual(
        mode === 'mondiale' ? [push.captureThreat, push.siteLost] : [],
      );
    }
  });
});

describe('every capture wears the site down', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  it('costs a level to its taker, and another to the owner who takes it back, never under one', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const barracks = await building(t, guest, PSKOV, 3);
    const levelAfter = async (by: Seat) => {
      const infantry = await troop(t, by, 'infantry', null);
      await captureArrival(
        t,
        by,
        { kind: 'building', buildingId: barracks },
        pointOfRegion(PSKOV),
        'RUS',
        [infantry],
      );
      await finish(t);
      await t.run((ctx) => ctx.db.patch(infantry, { stationedAt: null }));
      return (await t.run((ctx) => ctx.db.get(barracks)))!.level;
    };
    expect(await levelAfter(seat)).toBe(2);
    expect(await levelAfter(guest)).toBe(1);
    expect(await levelAfter(seat)).toBe(1);
  });
});

describe('a disabled outpost', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  it('is captured all the same, even inside its immunity: immunity guards against a raid only', async () => {
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
        foundedAt: MIDDAY - 10 * HOUR,
        disabledUntil: MIDDAY + 4 * HOUR,
        immuneUntil: MIDDAY + 20 * HOUR,
      }),
    );
    const infantry = await troop(t, seat, 'infantry', null);
    await captureArrival(t, seat, { kind: 'outpost', outpostId }, point, 'ROU', [infantry]);

    await finish(t);

    const me = await playerOf(t, seat);
    expect((await t.run((ctx) => ctx.db.get(outpostId)))!.playerId).toBe(me._id);
  });
});

describe('ordering a capture', () => {
  it('is refused to a column without infantry, and offered on a headquarters', async () => {
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
    await t.mutation(api.movements.capture, {
      ...seat,
      origin,
      troopIds: [infantry],
      target: { kind: 'building', buildingId: hq._id },
    });
  });
});

/**
 * **Le QG d'une Mondiale se capture, et sa chute élimine** (M2a, M15, M16). Le capteur prend le
 * QG, un niveau plus bas, et le stock du vaincu au-dessus du seuil scellé ; le reste — bâtiments,
 * avant-postes, troupes — passe au siège irrégulier, capturable et pillable par tous.
 */
describe('a Mondiale headquarters', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  async function threeAtTable(t: Bench) {
    const { seat, code } = await foundSeat(t, 'Pierre', 0.5);
    const guest = await joinSeat(t, code, 'Léa');
    const third = await joinSeat(t, code, 'Marc');
    for (const [who, nation] of [
      [seat, 'france'],
      [guest, 'ussr'],
      [third, 'germany'],
    ] as const) {
      await t.mutation(api.players.reserveNation, { ...who, nation });
      await t.mutation(api.players.declareReady, { ...who, ready: true });
    }
    await t.mutation(api.seasons.launch, seat);
    for (const who of [seat, guest, third]) await placeHq(t, who);
    await restWindow(t, guest, NO_REST);
    return { seat, guest, third };
  }

  /** Le QG du vaincu, et sa garnison de départ sortie dans un camp : elle doit passer au siège
   *  irrégulier, pas disparaître. */
  async function headquartersOf(t: Bench, seat: Seat) {
    const owner = await playerOf(t, seat);
    return t.run(async (ctx) => {
      const hq = (
        await ctx.db
          .query('buildings')
          .withIndex('byPlayer', (q) => q.eq('playerId', owner._id))
          .collect()
      ).find((held) => held.key === 'hq')!;
      for (const troop of await ctx.db
        .query('troops')
        .withIndex('byPlayer', (q) => q.eq('playerId', owner._id))
        .collect()) {
        await ctx.db.patch(troop._id, { stationedAt: { lon: 40, lat: 56 } });
      }
      return hq;
    });
  }

  const take = async (t: Bench, seat: Seat, hq: Doc<'buildings'>) =>
    captureArrival(
      t,
      seat,
      { kind: 'building', buildingId: hq._id },
      pointOfRegion(hq.regionId),
      'RUS',
      [await troop(t, seat, 'infantry', null)],
    );

  it('takes the twelve hours the lobby set by default, or twenty-four', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    await take(t, seat, await headquartersOf(t, guest));
    expect((await capturesOf(t))[0]!.completesAt).toBe(MIDDAY + 12 * HOUR);

    const other = boot();
    const pair = await launchedSeason(other);
    const season = (await playerOf(other, pair.seat)).seasonId;
    await other.run((ctx) => ctx.db.patch(season, { hqCaptureHours: 24 }));
    await take(other, pair.seat, await headquartersOf(other, pair.guest));
    expect((await capturesOf(other))[0]!.completesAt).toBe(MIDDAY + 24 * HOUR);
  });

  it('eliminates its player: the HQ and the stock above the seal to the capturer, the rest to the irregulars', async () => {
    const t = boot();
    const { seat, guest } = await threeAtTable(t);
    const hq = await headquartersOf(t, guest);
    const barracks = await building(t, guest, PSKOV);
    const loser = await playerOf(t, guest);
    const winner = await playerOf(t, seat);
    await t.run(async (ctx) => {
      for (const row of await ctx.db
        .query('resources')
        .withIndex('byPlayer', (q) => q.eq('playerId', loser._id))
        .collect()) {
        await ctx.db.patch(row._id, { stock: 1000, updatedAt: MIDDAY });
      }
      for (const row of await ctx.db
        .query('resources')
        .withIndex('byPlayer', (q) => q.eq('playerId', winner._id))
        .collect()) {
        await ctx.db.patch(row._id, { stock: 0, updatedAt: MIDDAY });
      }
    });

    await take(t, seat, hq);
    await finish(t);

    const after = await t.run(async (ctx) => ({
      hq: (await ctx.db.get(hq._id))!,
      barracks: (await ctx.db.get(barracks))!,
      loser: (await ctx.db.get(loser._id))!,
      irregular: (await ctx.db.query('players').collect()).find((p) => p.irregular === true),
      troops: await ctx.db.query('troops').collect(),
      stocks: await ctx.db.query('resources').collect(),
      season: (await ctx.db.get(loser.seasonId))!,
    }));
    expect(after.hq.playerId).toBe(winner._id);
    expect(after.hq.level).toBe(Math.max(1, hq.level - 1));
    expect(after.loser.defeated).toBe(true);
    expect(after.loser.eliminatedAt).toBe(MIDDAY + 12 * HOUR);
    expect(after.irregular).toBeDefined();
    expect(after.barracks.playerId).toBe(after.irregular!._id);
    expect(after.barracks.capturedAt).toBe(MIDDAY + 12 * HOUR);
    expect(after.troops.filter((troop) => troop.playerId === loser._id)).toEqual([]);
    expect(after.troops.some((troop) => troop.playerId === after.irregular!._id)).toBe(true);
    const food = (playerId: Id<'players'>) =>
      after.stocks.find((row) => row.playerId === playerId && row.key === 'food')!.stock;
    expect(food(loser._id)).toBeLessThanOrEqual(400);
    expect(food(winner._id)).toBeGreaterThan(0);
    // A third belligerent stands: the season goes on.
    expect(after.season.status).toBe('launched');
  });

  /** **Une colonne à Malte est à terre** (#224) : elle s'arrête où elle est, au siège irrégulier,
   *  au lieu de sombrer comme au large — la grille de 25 km n'y voit que la mer. */
  it('keeps the column of the fallen that stands on Malta, and hands it over', async () => {
    const t = boot();
    const { seat, guest } = await threeAtTable(t);
    const hq = await headquartersOf(t, guest);
    const loser = await playerOf(t, guest);
    const mosta = { lon: 14.421, lat: 35.906 };
    const attard = { lon: 14.423, lat: 35.888 };
    const column = await troop(t, guest, 'infantry', null);
    await t.run((ctx) =>
      ctx.db.insert('movements', {
        seasonId: loser.seasonId,
        playerId: loser._id,
        type: 'march',
        fromBuildingId: null,
        target: { kind: 'point', point: attard },
        from: mosta,
        to: attard,
        hostCountry: 'MLT',
        points: [mosta, attard],
        legs: [{ medium: 'land', distanceUnits: 0.02 }],
        distanceUnits: 0.02,
        costUnits: 0.02,
        troopIds: [column],
        departedAt: MIDDAY,
        arrivesAt: MIDDAY + 1000 * HOUR,
      }),
    );

    await take(t, seat, hq);
    await finish(t);

    const kept = await t.run((ctx) => ctx.db.get(column));
    expect(kept).not.toBeNull();
    expect(kept!.playerId).not.toBe(loser._id);
  });

  /** **Chacun peut piller ce que le siège irrégulier hérite** (M16), objectifs neutres posés ou
   *  non : le siège né à la chute a son plateau, que le pillage lit. */
  it('lets a third side plunder a warehouse the irregulars inherited', async () => {
    const t = boot();
    const { seat, guest, third } = await threeAtTable(t);
    const hq = await headquartersOf(t, guest);
    const warehouse = await building(t, guest, PSKOV, 1, 'warehouse');
    await take(t, seat, hq);
    await finish(t);

    const raider = await playerOf(t, third);
    const home = await t.run(
      async (ctx) =>
        (
          await ctx.db
            .query('buildings')
            .withIndex('byPlayer', (q) => q.eq('playerId', raider._id))
            .collect()
        ).find((held) => held.key === 'hq')!._id,
    );
    const infantry = await troop(t, third, 'infantry', home);
    const to = pointOfRegion(PSKOV);
    const movementId = await t.run((ctx) =>
      ctx.db.insert('movements', {
        seasonId: raider.seasonId,
        playerId: raider._id,
        type: 'march',
        fromBuildingId: home,
        target: { kind: 'building', buildingId: warehouse },
        from: { lon: to.lon - 1, lat: to.lat },
        to,
        hostCountry: 'RUS',
        points: [{ lon: to.lon - 1, lat: to.lat }, to],
        legs: [{ medium: 'land', distanceUnits: 1 }],
        distanceUnits: 1,
        costUnits: 1,
        troopIds: [infantry],
        departedAt: Date.now() - HOUR,
        arrivesAt: Date.now(),
        plunder: { phase: 'outbound', buildingId: warehouse },
      }),
    );
    await t.mutation(internal.movements.arrive, { movementId });
    const present = (await t.run((ctx) => ctx.db.get(movementId)))!.plunder;
    if (present?.phase !== 'presence') throw new Error('presence not started');
    vi.setSystemTime(present.until);
    await t.mutation(internal.movements.completePlunderPresence, {
      movementId,
      expectedAt: present.until,
    });

    expect((await t.run((ctx) => ctx.db.get(warehouse)))!.disabledUntil).toBeGreaterThan(
      present.until,
    );
  });

  /** Le siège irrégulier n'a pas de stock : la station d'écoute qu'il hérite reste muette. */
  it('hands his listening station to the irregulars, who hear nothing without coal', async () => {
    const t = boot();
    const { seat, guest } = await threeAtTable(t);
    const hq = await headquartersOf(t, guest);
    const station = await building(t, guest, PSKOV, 1, 'listening');
    await take(t, seat, hq);
    await finish(t);

    const after = await t.run(async (ctx) => ({
      station: (await ctx.db.get(station))!,
      irregular: (await ctx.db.query('players').collect()).find((p) => p.irregular === true)!,
      heard: (await ctx.db.query('sightings').collect()).filter(
        (row) => row.detector === 'station',
      ),
    }));
    expect(after.station.playerId).toBe(after.irregular._id);
    expect(after.heard).toEqual([]);
  });

  /** **Hong Kong lit la chute d'un QG** que son teneur ne voit pas : qui, quoi, où. */
  it("tells Hong Kong's holder of a capture it is not part of", async () => {
    const t = boot();
    const { seat, guest, third } = await threeAtTable(t);
    await holdPoint(t, third, 'hongKong');
    const hq = await headquartersOf(t, guest);
    await take(t, seat, hq);
    await finish(t);
    const told = await t.run(async (ctx) => {
      const player = await seatIn(ctx, third);
      return (
        await ctx.db
          .query('notices')
          .withIndex('byPlayer', (q) => q.eq('playerId', player._id))
          .collect()
      ).filter((notice) => notice.kind === 'captureDispatch');
    });
    expect(told).toMatchObject([
      { nation: 'france', from: 'ussr', site: { kind: 'building', building: 'hq' } },
    ]);
  });

  /** **La carte de recherche attend son Centre** (#123) : sa prise l'arrête sans rien perdre, et
   *  un Centre rebâti la relance là où elle en était. */
  it('stops his research card when his research centre is taken, and lets a new one run it on', async () => {
    const t = boot();
    const { seat, guest } = await threeAtTable(t);
    const centerId = await building(t, guest, PSKOV, 1, 'researchCenter');
    const center = (await t.run((ctx) => ctx.db.get(centerId)))!;
    const loser = await playerOf(t, guest);
    await t.run((ctx) =>
      ctx.db.patch(loser._id, {
        research: { card: 'carrier', totalMs: 36 * HOUR, remainingMs: 36 * HOUR, since: MIDDAY },
      }),
    );

    await take(t, seat, center);
    await finish(t);
    const left = 36 * HOUR - (Date.now() - MIDDAY);
    const paused = (await t.run((ctx) => ctx.db.get(loser._id)))!.research;
    expect(paused).toMatchObject({ card: 'carrier', remainingMs: left, since: null });

    const constructionId = await t.run((ctx) =>
      ctx.db.insert('constructions', {
        playerId: loser._id,
        building: 'researchCenter',
        regionId: 'RUS-2371',
        point: pointOfRegion('RUS-2371'),
        level: 1,
        rank: 0,
        finishesAt: Date.now(),
      }),
    );
    await t.mutation(internal.constructions.finish, { constructionId });
    const resumed = (await t.run((ctx) => ctx.db.get(loser._id)))!.research;
    expect(resumed).toMatchObject({ card: 'carrier', remainingMs: left, since: Date.now() });

    vi.advanceTimersByTime(left);
    await t.finishInProgressScheduledFunctions();
    expect((await t.run((ctx) => ctx.db.get(loser._id)))!.researched).toEqual(['carrier']);
  });

  /** Rien de lui ne lui survit : son chantier tombe, son sol perd sa couleur, et le siège
   *  qu'un tiers menait contre lui ne dort plus à ses heures. */
  it('leaves him no site under way, no ground, and no sleep to the sieges that outlive him', async () => {
    const t = boot();
    const { seat, guest, third } = await threeAtTable(t);
    const hq = await headquartersOf(t, guest);
    const loser = await playerOf(t, guest);
    const barracks = await building(t, guest, PSKOV);
    await t.run((ctx) =>
      ctx.db.insert('constructions', {
        playerId: loser._id,
        building: 'farm',
        regionId: 'RUS-2371',
        level: 1,
        rank: 0,
        finishesAt: MIDDAY + 99 * HOUR,
      }),
    );
    // Marc besieges the barracks while Léa sleeps every night.
    await restWindow(t, guest, { startMinutes: 22 * 60, endMinutes: 5 * 60 });
    await captureArrival(
      t,
      third,
      { kind: 'building', buildingId: barracks },
      pointOfRegion(PSKOV),
      'RUS',
      [await troop(t, third, 'infantry', null)],
    );
    await take(t, seat, hq);
    const fall = (await capturesOf(t)).find(
      (capture) => capture.target.kind === 'building' && capture.target.buildingId === hq._id,
    )!;
    vi.setSystemTime(fall.completesAt);
    await t.mutation(internal.captures.complete, {
      captureId: fall._id,
      expectedAt: fall.completesAt,
    });

    expect(await t.run((ctx) => ctx.db.query('constructions').collect())).toEqual([]);
    const left = await capturesOf(t);
    expect(left.every((capture) => capture.rest === null)).toBe(true);
    const ground = await t.run(
      async (ctx) =>
        (await heldOver(ctx, loser.seasonId, [regionFacts('RUS-2371')!], Date.now())).get(
          'RUS-2371',
        ) ?? null,
    );
    expect(ground).toBeNull();
  });

  it('lets the eliminated read and write the telegraph, and refuses him every order', async () => {
    const t = boot();
    const { seat, guest } = await threeAtTable(t);
    await take(t, seat, await headquartersOf(t, guest));
    await finish(t);

    await t.mutation(api.messages.post, { ...guest, text: 'je vous avais prévenus' });
    expect((await t.query(api.view.playerView, guest)).me.eliminatedAt).not.toBeNull();
    await expect(
      t.mutation(api.constructions.start, {
        ...guest,
        building: 'barracks',
        regionId: MARNE,
        point: pointOfRegion(MARNE),
      }),
    ).rejects.toThrow('PLAYER_DEFEATED');
  });

  it('crushes the season when the last headquarters falls', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    await take(t, seat, await headquartersOf(t, guest));
    await finish(t);

    const season = await t.run(async (ctx) => ctx.db.get((await seatIn(ctx, seat)).seasonId));
    expect(season!.status).toBe('concluded');
    expect(season!.winnerId).toBe((await playerOf(t, seat))._id);
    expect(season!.verdict?.reason).toBe('hqTaken');
  });

  it('does not eliminate a capturer who loses a headquarters he had taken', async () => {
    const t = boot();
    const { seat, guest, third } = await threeAtTable(t);
    const hq = await headquartersOf(t, guest);
    await take(t, seat, hq);
    await finish(t);
    await restWindow(t, seat, NO_REST);
    // Its capturer's infantry gone home, the taken HQ stands empty.
    const capturer = await playerOf(t, seat);
    await t.run(async (ctx) => {
      for (const troop of await ctx.db
        .query('troops')
        .withIndex('byPlayer', (q) => q.eq('playerId', capturer._id))
        .collect()) {
        await ctx.db.patch(troop._id, { stationedAt: null });
      }
    });
    await captureArrival(
      t,
      third,
      { kind: 'building', buildingId: hq._id },
      pointOfRegion(hq.regionId),
      'RUS',
      [await troop(t, third, 'infantry', null)],
    );
    await finish(t);

    expect((await t.run((ctx) => ctx.db.get(hq._id)))!.playerId).toBe(
      (await playerOf(t, third))._id,
    );
    expect((await playerOf(t, seat)).defeated).not.toBe(true);
  });
});

/**
 * **La chute d'un QG ne relit que les sièges qu'elle touche** (#171) : le capteur, l'éliminé et le
 * siège irrégulier. Une table pleine, des colonnes en vol de tous les côtés, Rangoun et deux
 * autres points au vaincu, une station du capteur muette faute de charbon que la saisie rallume :
 * après la chute, une réévaluation entière n'a plus rien à changer.
 */
describe('a headquarters falling at a full table', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  let seed = 11;
  const near = (spread: number) => {
    const shift = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
    return { lon: 8 + shift() * spread, lat: 50 + shift() * spread };
  };

  /** Ce que le brouillard tient, et ce qu'il a dit : relevés, camps et dépêches. */
  const fog = (t: Bench) =>
    t.run(async (ctx) => ({
      sightings: (await ctx.db.query('sightings').collect())
        .map((row) =>
          JSON.stringify([
            row.movementId,
            row.playerId,
            row.from,
            row.to,
            row.detector,
            row.detectorId,
            row.detectorRegion,
            row.frozen?.closedAt ?? null,
          ]),
        )
        .sort(),
      camps: (await ctx.db.query('campSightings').collect())
        .map((row) =>
          JSON.stringify([
            row.playerId,
            row.stationKey,
            row.ownerId,
            row.point,
            row.until,
            row.detector,
            row.detectorId,
          ]),
        )
        .sort(),
      notices: (await ctx.db.query('notices').collect()).length,
    }));

  /** Trois tables : une Mondiale ; la même, son vaincu en tournée quand il tient Rangoun ; une
   *  Blitz, où le capteur prend tout et où les troupes du vaincu disparaissent. */
  it.each([
    ['in a Mondiale', 'mondiale', false],
    ['in a Mondiale, its loser on tour while he holds Rangoon', 'mondiale', true],
    ['in a Blitz', 'blitz', false],
  ] as const)(
    'reads again the seats it touches only, and leaves nothing for a full pass to change, %s',
    async (_, mode, touring) => {
      const t = boot();
      const { seat, code } = await foundSeat(t, 'Pierre', 0.5);
      const seats = [seat];
      for (const name of ['Léa', 'Marc', 'Inès']) seats.push(await joinSeat(t, code, name));
      const nations = ['france', 'uk', 'germany', 'italy'] as const;
      for (const [k, one] of seats.entries()) {
        await t.mutation(api.players.reserveNation, { ...one, nation: nations[k]! });
        await t.mutation(api.players.declareReady, { ...one, ready: true });
      }
      if (mode === 'blitz') {
        await t.run((ctx) => ctx.db.patch(seat.seasonId, { mode: 'blitz', theatre: 'europe' }));
      }
      await t.mutation(api.seasons.launch, seat);
      if (mode === 'blitz') await t.action(internal.blitz.place, { seasonId: seat.seasonId });
      else for (const one of seats) await placeHq(t, one);
      const players = await Promise.all(seats.map(async (one) => (await playerOf(t, one))._id));
      const [capturerId, loserId] = [players[0]!, players[1]!];

      const scenes = [];
      for (const [k, playerId] of players.entries()) {
        scenes.push(
          await t.mutation(internal.dev.benchScene, {
            playerId,
            squads: Array.from({ length: 4 }, () => near(0.8)),
            reserve: { at: near(0.8), count: 4 },
            outposts: k === 1 && mode === 'mondiale' ? [near(0.6), near(0.6)] : [],
          }),
        );
      }
      if (mode === 'mondiale') {
        /** La station du capteur au cœur du carré, à sec : la saisie du stock la rallume. Le
         *  vaincu écoute aussi, d'une station et d'un avant-poste, qui passent au siège irrégulier. */
        const central = allRegions()
          .filter((region) => region.country === 'DEU')
          .sort((a, b) => distanceKm(a.point, [8, 50]) - distanceKm(b.point, [8, 50]));
        await t.run(async (ctx) => {
          for (const [playerId, regionId] of [
            [capturerId, central[0]!.id],
            [loserId, central[1]!.id],
          ] as const) {
            await ctx.db.insert('buildings', {
              seasonId: seat.seasonId,
              playerId,
              key: 'listening',
              regionId,
              point: pointOfRegion(regionId),
              level: 1,
            });
          }
          await ctx.db.insert('outposts', {
            seasonId: seat.seasonId,
            playerId: loserId,
            point: near(0.5),
            hostCountry: 'DEU',
            level: 1,
            foundedAt: Date.now() - 1,
            disabledUntil: null,
            immuneUntil: null,
          });
          for (const [playerId, stock] of [
            [capturerId, 0],
            [loserId, 5000],
          ] as const) {
            for (const row of await ctx.db
              .query('resources')
              .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
              .collect()) {
              await ctx.db.patch(row._id, { stock, updatedAt: Date.now() });
            }
          }
        });
        /** Les stocks sont écrits à la main : le réveil que le jeu aurait pris à sec relit le
         *  capteur et inscrit son silence sur sa ligne (`players.listeningSilent`). */
        await t.mutation(internal.listening.reassess, { playerId: capturerId });
        await holdPoint(t, seats[1]!, 'rangoon');
      }
      await reassess(t, seat.seasonId);
      if (touring) {
        await t.mutation(api.tours.start, {
          ...seats[1]!,
          troopId: scenes[1]!.truckId!,
          stops: scenes[1]!.outpostIds.slice(1),
        });
      }
      for (let squad = 0; squad < 3; squad += 1) {
        for (const [k, playerId] of players.entries()) {
          const { ids, at } = scenes[k]!.squads[squad]!;
          const { filed } = await t.mutation(internal.dev.benchFlights, {
            playerId,
            /** Une Blitz ne marche qu'une unité à la fois. */
            flights: [{ ids: mode === 'blitz' ? ids.slice(0, 1) : ids, from: at, to: near(2.5) }],
          });
          expect(filed).toBe(1);
        }
      }
      const before = await t.run(async (ctx) => ({
        heard: (await ctx.db.query('sightings').collect()).filter(
          (row) => row.playerId === capturerId && row.detector === 'station',
        ),
        /** Ce que les détecteurs du vaincu relèvent encore : la chute doit le refermer. */
        seenByLoser: (await ctx.db.query('sightings').collect()).filter(
          (row) => row.playerId === loserId && row.detector !== 'territory' && row.to > Date.now(),
        ),
        legs: (await ctx.db.query('movements').collect()).filter(
          (movement) => movement.playerId === loserId && movement.tourLeg !== undefined,
        ),
      }));
      expect(before.heard).toEqual([]);
      expect(before.seenByLoser.length).toBeGreaterThan(0);
      expect(before.legs).toHaveLength(touring ? 1 : 0);

      const fall = await t.mutation(internal.dev.benchFall, {
        capturerId,
        loserId,
        points: mode === 'mondiale' ? 2 : 0,
      });
      await t.mutation(internal.captures.complete, fall);

      const after = await t.run(async (ctx) => ({
        loser: (await ctx.db.get(loserId))!,
        points: await ctx.db.query('strategicPoints').collect(),
        irregular: (await ctx.db.query('players').collect()).find((p) => p.irregular === true),
        troops: await ctx.db.query('troops').collect(),
        buildings: await ctx.db
          .query('buildings')
          .withIndex('byPlayer', (q) => q.eq('playerId', loserId))
          .collect(),
        heard: (await ctx.db.query('sightings').collect()).filter(
          (row) => row.playerId === capturerId && row.detector === 'station',
        ),
      }));
      expect(after.loser.defeated).toBe(true);
      expect(after.points.filter((point) => point.holderId === loserId)).toEqual([]);
      expect(after.troops.filter((troop) => troop.playerId === loserId)).toEqual([]);
      expect(after.buildings).toEqual([]);
      if (mode === 'mondiale') {
        expect(after.troops.some((troop) => troop.playerId === after.irregular?._id)).toBe(true);
        /** La station rallumée relève déjà : le capteur fait partie des sièges relus. */
        expect(after.heard.length).toBeGreaterThan(0);
      }

      const fallen = await fog(t);
      await reassess(t, seat.seasonId);
      expect(await fog(t)).toEqual(fallen);
    },
  );
});
