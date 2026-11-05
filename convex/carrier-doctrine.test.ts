import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import type { UnitRole } from '../src/domain/ids';
import { distanceKm } from '../src/domain/geo';
import { positionAt } from '../src/domain/interception';
import { kmOf } from '../src/domain/routing';
import { fuelStepsOf } from '../src/domain/supplies';
import { nominalStrength } from './constants';
import { marchingForce } from './movement/detection';
import { regionAtPoint } from './regionGeometry';
import schema from './schema';
import { modules } from './test.setup';
import { foundSeat, joinSeat, placeHq, seatIn, unclocked, type Seat } from './seats.fixture';

/**
 * **La Doctrine du porte-avions** (ADR 0039 §4) : une flotte japonaise en mer change une fois de
 * destination avant la mi-parcours, de sa position, sans rendre son slot.
 */
const boot = () => convexTest({ schema, modules, transactionLimits: true });
type Bench = ReturnType<typeof boot>;

const MIDDAY = new Date(2026, 7, 17, 12, 0, 0);
const OPEN_SEA = { lon: 145, lat: 28 };
const EAST = { lon: 155, lat: 24 };
const OFF_SAIPAN = { lon: 147, lat: 16 };
const TOKYO = { lon: 139.7, lat: 35.7 };

const playerOf = (t: Bench, seat: Seat) => t.run(async (ctx) => (await seatIn(ctx, seat))._id);

/** Le Japon (`japan`) et la France (`france`), QG posés, sans troupe. */
async function launchedSeason(t: Bench) {
  const { seat, code } = await foundSeat(t, 'Pierre', 0.5);
  const guest = await joinSeat(t, code, 'Léa');
  await t.mutation(api.players.reserveNation, { ...seat, nation: 'japan' });
  await t.mutation(api.players.declareReady, { ...seat, ready: true });
  await t.mutation(api.players.reserveNation, { ...guest, nation: 'france' });
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
  return { japan: seat, france: guest };
}

async function postAt(t: Bench, seat: Seat, role: UnitRole, at: { lon: number; lat: number }) {
  const playerId = await playerOf(t, seat);
  return t.run(async (ctx) =>
    ctx.db.insert('troops', {
      seasonId: (await ctx.db.get(playerId))!.seasonId,
      playerId,
      role,
      tier: 1,
      nominalStrength: nominalStrength(role, 1),
      currentStrength: nominalStrength(role, 1),
      stationedAt: at,
    }),
  );
}

/** Une escorte et un cargo partis du large vers l’est. */
async function sailing(t: Bench, seat: Seat) {
  const troopIds = [
    await postAt(t, seat, 'escort', OPEN_SEA),
    await postAt(t, seat, 'cargo', OPEN_SEA),
  ];
  const filed = await t.mutation(api.movements.marchTo, {
    ...seat,
    origin: { kind: 'point', point: OPEN_SEA },
    troopIds,
    point: EAST,
  });
  return { ...filed, troopIds };
}

const turning = (
  t: Bench,
  seat: Seat,
  movementId: Id<'movements'>,
  point: { lon: number; lat: number },
) =>
  t.mutation(api.movements.changeCourse, {
    ...seat,
    movementId,
    type: 'march',
    target: { kind: 'point', point },
  });

const codeOf = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: { data?: { code?: string } }) => error.data?.code,
  );

const HUALIEN = { lon: 121.6, lat: 23.97 };
const OFF_TAIWAN = { lon: 122.3, lat: 23.6 };

/** Un Magasin japonais à Hualien, longé par une flotte qui vire au large, à 40 % de sa route. */
async function turnedPastHualien(t: Bench) {
  const { japan, france } = await launchedSeason(t);
  const japanId = await playerOf(t, japan);
  const region = regionAtPoint([HUALIEN.lon, HUALIEN.lat])!;
  const outpostId = await t.run(async (ctx) =>
    ctx.db.insert('outposts', {
      seasonId: (await ctx.db.get(japanId))!.seasonId,
      playerId: japanId,
      point: HUALIEN,
      hostCountry: region.country,
      regionId: region.id,
      level: 3,
      specialty: 'store',
      foundedAt: MIDDAY.getTime() - 1,
      disabledUntil: null,
      immuneUntil: null,
      depot: { ammunition: 400, oil: 400, coal: 400 },
    }),
  );
  const troopIds = [
    await postAt(t, japan, 'escort', OFF_TAIWAN),
    await postAt(t, japan, 'cargo', OFF_TAIWAN),
  ];
  const filed = await t.mutation(api.movements.marchTo, {
    ...japan,
    origin: { kind: 'point', point: OFF_TAIWAN },
    troopIds,
    point: { lon: 131, lat: 26 },
  });
  vi.setSystemTime(MIDDAY.getTime() + (filed.arrivesAt - MIDDAY.getTime()) * 0.4);
  const turned = await turning(t, japan, filed.movementId, { lon: 130, lat: 20 });
  return { france, japanId, region, outpostId, turned };
}

const movements = (t: Bench) => t.run(async (ctx) => ctx.db.query('movements').collect());

describe('the carrier doctrine (ADR 0039 §4)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  it('turns a Japanese fleet at sea from where it stands, once, keeping its slot', async () => {
    const t = boot();
    const { japan } = await launchedSeason(t);
    const { movementId, arrivesAt, troopIds } = await sailing(t, japan);
    const [old] = await movements(t);
    const quarter = MIDDAY.getTime() + (arrivesAt - MIDDAY.getTime()) / 4;
    vi.setSystemTime(quarter);
    const here = positionAt(marchingForce(old!), quarter);
    const slotsBefore = (await t.query(api.view.playerView, japan)).me.slots.used;

    const turned = await turning(t, japan, movementId, OFF_SAIPAN);

    const [now] = await movements(t);
    expect(now!._id).toBe(turned.movementId);
    expect(now).toMatchObject({ type: 'march', departedAt: quarter, troopIds });
    expect(now!.courseChange!.at).toBe(quarter);
    expect(distanceKm([now!.from.lon, now!.from.lat], here)).toBeLessThan(1);
    expect(now!.courseChange!.ran[0]).toEqual(old!.points[0]);
    expect((await t.query(api.view.playerView, japan)).me.slots.used).toBe(slotsBefore);

    /** Le plein : l'ancienne route a payé, ce qu'elle n'a pas couru paie la neuve d'abord. */
    const escort = (await t.run(async (ctx) => ctx.db.get(troopIds[0]!)))!;
    const paid = fuelStepsOf('escort', kmOf(old!.distanceUnits));
    const ran = fuelStepsOf('escort', kmOf(old!.distanceUnits) / 4);
    const needed = fuelStepsOf('escort', kmOf(now!.distanceUnits));
    expect(escort.fuel).toBe(6 - paid - Math.max(0, needed - (paid - ran)));
    expect(escort.fuelAt).toBe(now!.arrivesAt);

    expect(await codeOf(turning(t, japan, turned.movementId, EAST))).toBe('COURSE_ALREADY_CHANGED');
    const journal = await t.run(async (ctx) =>
      ctx.db
        .query('notices')
        .filter((q) => q.eq(q.field('kind'), 'courseChanged'))
        .collect(),
    );
    expect(journal).toHaveLength(1);

    /** Un usage d'atout, au rapport de saison. */
    const page = await t.query(internal.seasonReport.outpostEvents, {
      playerId: await playerOf(t, japan),
      cursor: null,
    });
    expect(page.uses).toBe(1);
  });

  it('refuses past halfway, and to every other nation', async () => {
    const t = boot();
    const { japan, france } = await launchedSeason(t);
    const ours = await sailing(t, japan);
    const theirs = await sailing(t, france);
    expect(await codeOf(turning(t, france, theirs.movementId, OFF_SAIPAN))).toBe(
      'NO_CARRIER_DOCTRINE',
    );
    vi.setSystemTime(MIDDAY.getTime() + (ours.arrivesAt - MIDDAY.getTime()) * 0.6);
    expect(await codeOf(turning(t, japan, ours.movementId, OFF_SAIPAN))).toBe('PAST_HALFWAY');
    expect((await movements(t)).map((one) => one._id).sort()).toEqual(
      [ours.movementId, theirs.movementId].sort(),
    );
  });

  it('refuses a new destination as a new order would, and leaves the course free', async () => {
    const t = boot();
    const { japan } = await launchedSeason(t);
    const { movementId } = await sailing(t, japan);
    vi.setSystemTime(MIDDAY.getTime() + 60_000);

    expect(await codeOf(turning(t, japan, movementId, TOKYO))).not.toBeNull();
    expect(await codeOf(turning(t, japan, movementId, OFF_SAIPAN))).toBeNull();
  });

  it('shows a watcher the fleet leaving its position, as a departure', async () => {
    const t = boot();
    const { japan, france } = await launchedSeason(t);
    const { movementId, arrivesAt } = await sailing(t, japan);
    const [old] = await movements(t);
    const at = MIDDAY.getTime() + (arrivesAt - MIDDAY.getTime()) / 4;
    const here = positionAt(marchingForce(old!), at);
    await postAt(t, france, 'escort', { lon: here[0], lat: here[1] - 0.2 });
    vi.setSystemTime(at);

    const turned = await turning(t, japan, movementId, OFF_SAIPAN);

    const watcher = await playerOf(t, france);
    const seen = await t.run(async (ctx) =>
      ctx.db
        .query('sightings')
        .filter((q) => q.eq(q.field('playerId'), watcher))
        .collect(),
    );
    expect(seen.map((one) => one.movementId)).toContain(turned.movementId);
  });

  it('tells a watcher already following the fleet nothing new: one dispatch, its line frozen', async () => {
    const t = boot();
    const { japan, france } = await launchedSeason(t);
    await postAt(t, france, 'escort', { lon: 146, lat: 27.6 });
    const { movementId, arrivesAt } = await sailing(t, japan);
    const watcher = await playerOf(t, france);
    const told = () =>
      t.run(async (ctx) =>
        (await ctx.db.query('notices').collect()).filter(
          (notice) => notice.playerId === watcher && notice.kind === 'movementSighted',
        ),
      );
    expect(await told()).toHaveLength(1);
    vi.setSystemTime(MIDDAY.getTime() + (arrivesAt - MIDDAY.getTime()) / 10);

    const turned = await turning(t, japan, movementId, OFF_SAIPAN);

    expect(await told()).toHaveLength(1);
    const lines = await t.run(async (ctx) =>
      (await ctx.db.query('sightings').collect()).filter((one) => one.playerId === watcher),
    );
    expect(lines.find((one) => one.movementId === movementId)?.frozen).toBeDefined();
    expect(lines.find((one) => one.movementId === turned.movementId)?.noticeFiled).toBe(true);
  });

  it('tells a watcher who lost the fleet before the turn when the new road brings it back', async () => {
    const t = boot();
    const { japan, france } = await launchedSeason(t);
    await postAt(t, france, 'escort', { lon: 146, lat: 27.6 });
    const { movementId, arrivesAt } = await sailing(t, japan);
    const watcher = await playerOf(t, france);
    const told = () =>
      t.run(async (ctx) =>
        (await ctx.db.query('notices').collect()).filter(
          (notice) => notice.playerId === watcher && notice.kind === 'movementSighted',
        ),
      );
    expect(await told()).toHaveLength(1);
    /** Passé l'horizon de l'escorte française, et avant la mi-parcours. */
    vi.setSystemTime(MIDDAY.getTime() + (arrivesAt - MIDDAY.getTime()) / 4);

    await turning(t, japan, movementId, { lon: 144, lat: 27 });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(await told()).toHaveLength(2);
  });

  it('says a turn short of fuel counts the paid fuel', async () => {
    const t = boot();
    const { japan } = await launchedSeason(t);
    const { movementId, troopIds, arrivesAt } = await sailing(t, japan);
    await t.run(async (ctx) => {
      for (const id of troopIds) await ctx.db.patch(id, { fuel: 0 });
    });
    vi.setSystemTime(MIDDAY.getTime() + (arrivesAt - MIDDAY.getTime()) / 10);

    const refused = await turning(t, japan, movementId, { lon: 165, lat: 10 }).then(
      () => null,
      (error: { data?: { code?: string; course?: boolean } }) => error.data,
    );

    expect(refused).toMatchObject({ code: 'NOT_ENOUGH_FUEL', course: true });
  });

  it('settles the road run before the turn at arrival: the survey and the Magasin passed', async () => {
    const t = boot();
    const { japanId, region, turned } = await turnedPastHualien(t);
    const arrived = turned.arrivesAt + 1;
    vi.setSystemTime(arrived);
    await t.mutation(internal.movements.arrive, { movementId: turned.movementId });

    const facts = await t.run(async (ctx) => ({
      served: (await ctx.db.query('notices').collect()).filter(
        (notice) => notice.playerId === japanId && notice.kind === 'storeResupplied',
      ),
      surveyed: (await ctx.db.query('regionSightings').collect()).filter(
        (survey) => survey.playerId === japanId && survey.regionId === region.id,
      ),
    }));
    expect(facts.served).toHaveLength(1);
    /** Hualien, relevé au départ, ne l'est de nouveau à l'arrivée que par le tronçon d'avant le
     *  coude : la route neuve passe à plus de 400 km. */
    expect(facts.surveyed.map((survey) => survey.seenAt)).toEqual([arrived]);
  });

  it('says a Magasin passed before the turn and captured since gave nothing', async () => {
    const t = boot();
    const { france, japanId, outpostId, turned } = await turnedPastHualien(t);
    const captor = await playerOf(t, france);
    await t.run(async (ctx) => ctx.db.patch(outpostId, { playerId: captor }));
    vi.setSystemTime(turned.arrivesAt + 1);
    await t.mutation(internal.movements.arrive, { movementId: turned.movementId });

    const told = await t.run(async (ctx) =>
      (await ctx.db.query('notices').collect()).filter(
        (notice) => notice.playerId === japanId && notice.kind === 'storeResupplied',
      ),
    );
    expect(told.map((notice) => notice.outcome)).toEqual(['captured']);
  });

  it('turns a fleet while every slot is held, and frees none', async () => {
    const t = boot();
    const { japan } = await launchedSeason(t);
    const first = await sailing(t, japan);
    await sailing(t, japan);
    vi.setSystemTime(MIDDAY.getTime() + 60_000);
    const held = (await t.query(api.view.playerView, japan)).me.slots;
    expect(held.used).toBe(held.total);

    await turning(t, japan, first.movementId, OFF_SAIPAN);

    expect((await t.query(api.view.playerView, japan)).me.slots.used).toBe(held.total);
    const third = await postAt(t, japan, 'escort', OPEN_SEA);
    expect(
      await codeOf(
        t.mutation(api.movements.marchTo, {
          ...japan,
          origin: { kind: 'point', point: OPEN_SEA },
          troopIds: [third],
          point: EAST,
        }),
      ),
    ).toBe('MOVEMENT_IN_FLIGHT');
  });

  it('keeps the course of a delivery at sea', async () => {
    const t = boot();
    const { japan } = await launchedSeason(t);
    const { movementId } = await sailing(t, japan);
    const japanId = await playerOf(t, japan);
    await t.run(async (ctx) => {
      const outpostId = await ctx.db.insert('outposts', {
        seasonId: (await ctx.db.get(japanId))!.seasonId,
        playerId: japanId,
        point: EAST,
        hostCountry: '',
        regionId: 'sea',
        level: 1,
        foundedAt: MIDDAY.getTime() - 1,
        disabledUntil: null,
        immuneUntil: null,
      });
      await ctx.db.patch(movementId, { delivery: { outpostId } });
    });
    vi.setSystemTime(MIDDAY.getTime() + 60_000);

    expect(await codeOf(turning(t, japan, movementId, OFF_SAIPAN))).toBe('COURSE_ON_MISSION');
  });

  it('previews the new course with the fuel the old road paid, and nothing to another nation', async () => {
    const t = boot();
    const { japan, france } = await launchedSeason(t);
    const ours = await sailing(t, japan);
    const theirs = await sailing(t, france);
    vi.setSystemTime(MIDDAY.getTime() + (ours.arrivesAt - MIDDAY.getTime()) / 4);
    const asked = (seat: Seat, movementId: Id<'movements'>) =>
      t.query(api.movements.previewCourse, {
        ...seat,
        movementId,
        type: 'march',
        target: { kind: 'point', point: OFF_SAIPAN },
      });

    const preview = await asked(japan, ours.movementId);

    expect(preview?.fuel.short).toBeNull();
    expect(preview?.fuel.gauge?.paid).toBeGreaterThan(0);
    expect(await asked(france, theirs.movementId)).toBeNull();
  });
});
