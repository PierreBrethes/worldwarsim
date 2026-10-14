import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import type { UnitRole } from '../src/domain/ids';
import { distanceKm } from '../src/domain/geo';
import { nominalStrength } from './constants';
import schema from './schema';
import { modules } from './test.setup';
import { reassessDetection } from './movement/detection';
import { foundSeat, joinSeat, placeHq, seatIn, surveyCamp, type Seat } from './seats.fixture';

const boot = () => convexTest({ schema, modules, transactionLimits: true });
type Bench = ReturnType<typeof boot>;
const MIDDAY = Date.UTC(2026, 9, 14, 12);
const PARIS = { lon: 2.35, lat: 48.85 };
const LYON = { lon: 4.85, lat: 45.75 };
const BERLIN = { lon: 13.4, lat: 52.5 };

async function blitz(t: Bench) {
  const { seat, code } = await foundSeat(t, 'Pierre', 0.5);
  const guest = await joinSeat(t, code, 'Léa');
  await t.mutation(api.players.reserveNation, { ...seat, nation: 'france' });
  await t.mutation(api.players.declareReady, { ...seat, ready: true });
  await t.mutation(api.players.reserveNation, { ...guest, nation: 'ussr' });
  await t.mutation(api.players.declareReady, { ...guest, ready: true });
  await t.mutation(api.seasons.launch, seat);
  await placeHq(t, seat);
  await placeHq(t, guest);
  await t.run((ctx) => ctx.db.patch(seat.seasonId, { mode: 'blitz', theatre: 'europe' }));
  return { seat, guest };
}

async function troop(
  t: Bench,
  seat: Seat,
  stationedAt: { lon: number; lat: number },
  role: UnitRole = 'infantry',
) {
  const player = await t.run((ctx) => seatIn(ctx, seat));
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

const movementOf = (t: Bench, troopId: Id<'troops'>) =>
  t.run(async (ctx) =>
    (await ctx.db.query('movements').collect()).find((one) => one.troopIds.includes(troopId)),
  );

/** Each look of every pursuit, in date order, until none is left. */
async function runPursuits(t: Bench) {
  for (let step = 0; step < 60; step += 1) {
    const pending = (await t.run((ctx) => ctx.db.query('movements').collect()))
      .flatMap((one) => (one.pursuit === undefined ? [] : [one]))
      .sort((a, b) => a.pursuit!.checkAt - b.pursuit!.checkAt);
    const next = pending[0];
    if (next === undefined) return;
    vi.setSystemTime(next.pursuit!.checkAt);
    await t.mutation(internal.movements.pursue, {
      movementId: next._id,
      expectedAt: next.pursuit!.checkAt,
    });
  }
  throw new Error('a pursuit that never ends');
}

const troopRow = (t: Bench, id: Id<'troops'>) => t.run((ctx) => ctx.db.get(id));
const point = (troop: Doc<'troops'> | null) => {
  const at = troop?.stationedAt;
  if (at === null || at === undefined || typeof at === 'string') throw new Error('not posted');
  return [at.lon, at.lat] as const;
};

describe('a Blitz unit and its orders (lot 5)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  it('sends one troop, inside its theatre, with no slot to wait for', async () => {
    const t = boot();
    const { seat } = await blitz(t);
    const one = await troop(t, seat, PARIS);
    const two = await troop(t, seat, PARIS);
    await expect(
      t.mutation(api.movements.marchTo, {
        ...seat,
        origin: { kind: 'point', point: PARIS },
        troopIds: [one, two],
        point: BERLIN,
      }),
    ).rejects.toThrow(/ONE_UNIT_ONLY/);
    await expect(
      t.mutation(api.movements.marchTo, {
        ...seat,
        origin: { kind: 'point', point: PARIS },
        troopIds: [one],
        point: { lon: -74, lat: 40.7 },
      }),
    ).rejects.toThrow(/OUTSIDE_THEATRE/);

    const third = await troop(t, seat, PARIS);
    for (const troopId of [one, two, third]) {
      await t.mutation(api.movements.marchTo, {
        ...seat,
        origin: { kind: 'point', point: PARIS },
        troopIds: [troopId],
        point: BERLIN,
      });
    }
    const filed = await movementOf(t, one);
    const minutes = (filed!.arrivesAt - filed!.departedAt) / 60_000;
    expect(minutes).toBeGreaterThan(2);
    expect(minutes).toBeLessThan(8);
  });

  it('keeps one unit per building', async () => {
    const t = boot();
    const { seat } = await blitz(t);
    const hq = await t.run(async (ctx) => {
      const player = await seatIn(ctx, seat);
      return (await ctx.db
        .query('buildings')
        .withIndex('byPlayer', (q) => q.eq('playerId', player._id))
        .first())!;
    });
    const walker = await troop(t, seat, PARIS);
    await expect(
      t.mutation(api.movements.enterGarrison, {
        ...seat,
        origin: { kind: 'point', point: PARIS },
        troopIds: [walker],
        buildingId: hq._id,
      }),
    ).rejects.toThrow(/BUILDING_OCCUPIED/);
  });

  it('chases a camp in sight and strikes it at contact, then reloads', async () => {
    const t = boot();
    const { seat, guest } = await blitz(t);
    const hunter = await troop(t, seat, PARIS);
    const quarry = await troop(t, guest, LYON);
    const campId = await surveyCamp(t, seat, LYON);

    await t.mutation(api.movements.attack, {
      ...seat,
      origin: { kind: 'point', point: PARIS },
      troopIds: [hunter],
      target: { kind: 'camp', campId },
    });
    expect((await movementOf(t, hunter))?.pursuit?.troopId).toBe(quarry);
    await runPursuits(t);

    const engagements = await t.run((ctx) => ctx.db.query('engagements').collect());
    expect(engagements).toHaveLength(1);
    expect(engagements[0]!.shock).toBeUndefined();
    const after = await troopRow(t, hunter);
    expect(distanceKm(point(after), [LYON.lon, LYON.lat])).toBeLessThanOrEqual(26);
    expect(after!.reloadUntil).toBeGreaterThan(Date.now());
    expect(await movementOf(t, hunter)).toBeFalsy();

    const again = await surveyCamp(t, seat, LYON);
    await expect(
      t.mutation(api.movements.attack, {
        ...seat,
        origin: { kind: 'point', point: { lon: point(after)[0], lat: point(after)[1] } },
        troopIds: [hunter],
        target: { kind: 'camp', campId: again },
      }),
    ).rejects.toThrow(/RELOADING/);
  });

  it('takes the road again when its route stops short of the target', async () => {
    const t = boot();
    const { seat, guest } = await blitz(t);
    const hunter = await troop(t, seat, PARIS);
    const quarry = await troop(t, guest, LYON);
    const short = { lon: 4.85, lat: 46.15 };
    await t.run(async (ctx) => {
      const player = await seatIn(ctx, seat);
      await ctx.db.insert('movements', {
        seasonId: player.seasonId,
        playerId: player._id,
        type: 'attack',
        fromBuildingId: null,
        target: { kind: 'point', point: LYON },
        from: PARIS,
        to: LYON,
        hostCountry: 'FRA',
        points: [PARIS, short],
        legs: [{ medium: 'land', distanceUnits: 1 }],
        distanceUnits: 1,
        costUnits: 1,
        troopIds: [hunter],
        departedAt: MIDDAY - 60_000,
        arrivesAt: MIDDAY,
        pursuit: { troopId: quarry, checkAt: MIDDAY },
      });
    });
    await surveyCamp(t, seat, LYON);
    await runPursuits(t);
    expect(await t.run((ctx) => ctx.db.query('engagements').collect())).toHaveLength(1);
  });

  it('gives up on a target out of sight and stops at its last known position', async () => {
    const t = boot();
    const { seat, guest } = await blitz(t);
    const hunter = await troop(t, seat, PARIS);
    await troop(t, guest, BERLIN);
    const campId = await surveyCamp(t, seat, BERLIN);

    await t.mutation(api.movements.attack, {
      ...seat,
      origin: { kind: 'point', point: PARIS },
      troopIds: [hunter],
      target: { kind: 'camp', campId },
    });
    await runPursuits(t);
    const lost = await movementOf(t, hunter);
    expect(lost).toMatchObject({ type: 'march' });
    expect(lost!.pursuit).toBeUndefined();
    vi.setSystemTime(lost!.arrivesAt);
    await t.mutation(internal.movements.arrive, { movementId: lost!._id });
    expect(point(await troopRow(t, hunter))).toEqual([BERLIN.lon, BERLIN.lat]);
    const player = await t.run((ctx) => seatIn(ctx, seat));
    const notices = await t.run((ctx) =>
      ctx.db
        .query('notices')
        .withIndex('byPlayer', (q) => q.eq('playerId', player._id))
        .collect(),
    );
    expect(notices.some((notice) => notice.kind === 'pursuitLost')).toBe(true);
  });

  it('resolves a charge against a charge as a shock', async () => {
    const t = boot();
    const { seat, guest } = await blitz(t);
    const hunter = await troop(t, seat, PARIS);
    const quarry = await troop(t, guest, LYON);
    const campId = await surveyCamp(t, seat, LYON);
    await t.mutation(api.movements.attack, {
      ...seat,
      origin: { kind: 'point', point: PARIS },
      troopIds: [hunter],
      target: { kind: 'camp', campId },
    });
    const theirs = await t.run(async (ctx) => {
      const player = await seatIn(ctx, guest);
      return ctx.db.insert('movements', {
        seasonId: player.seasonId,
        playerId: player._id,
        type: 'attack',
        fromBuildingId: null,
        target: { kind: 'point', point: PARIS },
        from: LYON,
        to: PARIS,
        hostCountry: 'FRA',
        points: [LYON, PARIS],
        legs: [{ medium: 'land', distanceUnits: 1 }],
        distanceUnits: 1,
        costUnits: 1,
        troopIds: [quarry],
        departedAt: MIDDAY,
        arrivesAt: MIDDAY + 20 * 60_000,
        pursuit: { troopId: hunter, checkAt: MIDDAY + 3_600_000 },
      });
    });
    await t.run((ctx) => reassessDetection(ctx, seat.seasonId, MIDDAY));
    await runPursuits(t);

    const [engagement] = await t.run((ctx) => ctx.db.query('engagements').collect());
    expect(engagement!.shock).toBe(true);
    expect(await t.run((ctx) => ctx.db.get(theirs))).toBeNull();
    for (const id of [hunter, quarry]) {
      const row = await troopRow(t, id);
      if (row !== null) expect(row.reloadUntil).toBeGreaterThan(Date.now());
    }
  });
});
