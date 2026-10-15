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
import { resolveContact } from './combat';
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

  it('sends a transport with what it carries, never two combat troops', async () => {
    const t = boot();
    const { seat } = await blitz(t);
    const dogger = { lon: 2.5, lat: 54.5 };
    const heligoland = { lon: 6.5, lat: 54.6 };
    const cargo = await troop(t, seat, dogger, 'cargo');
    const infantry = await troop(t, seat, dogger, 'infantry');
    const escort = await troop(t, seat, dogger, 'escort');
    const origin = { kind: 'point' as const, point: dogger };
    await expect(
      t.mutation(api.movements.marchTo, {
        ...seat,
        origin,
        troopIds: [cargo, escort],
        point: heligoland,
      }),
    ).rejects.toThrow(/ONE_UNIT_ONLY/);
    await t.mutation(api.movements.marchTo, {
      ...seat,
      origin,
      troopIds: [cargo, infantry],
      point: heligoland,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(point(await troopRow(t, cargo))).toEqual(point(await troopRow(t, infantry)));
    expect(point(await troopRow(t, cargo))).toEqual([heligoland.lon, heligoland.lat]);
  });

  it('keeps a plane in the air: it flies again from where it stopped', async () => {
    const t = boot();
    const { seat } = await blitz(t);
    const bomber = await troop(t, seat, PARIS, 'bomber');
    await t.mutation(api.movements.marchTo, {
      ...seat,
      origin: { kind: 'point', point: PARIS },
      troopIds: [bomber],
      point: LYON,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(point(await troopRow(t, bomber))).toEqual([LYON.lon, LYON.lat]);
    await t.mutation(api.movements.marchTo, {
      ...seat,
      origin: { kind: 'point', point: LYON },
      troopIds: [bomber],
      point: PARIS,
    });
    expect(await movementOf(t, bomber)).toBeDefined();
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

  it('lets the second of two marches to the same empty building stand at its door', async () => {
    const t = boot();
    const { seat } = await blitz(t);
    const barracks = await t.run(async (ctx) => {
      const player = await seatIn(ctx, seat);
      return ctx.db.insert('buildings', {
        seasonId: player.seasonId,
        playerId: player._id,
        key: 'barracks',
        regionId: 'FRA-5323',
        level: 1,
        outpostId: null,
      });
    });
    const sent = [];
    for (const point of [PARIS, LYON]) {
      const walker = await troop(t, seat, point);
      const { movementId } = await t.mutation(api.movements.enterGarrison, {
        ...seat,
        origin: { kind: 'point', point },
        troopIds: [walker],
        buildingId: barracks,
      });
      sent.push({ walker, movementId });
    }
    for (const { movementId } of sent) {
      const movement = (await t.run((ctx) => ctx.db.get(movementId)))!;
      vi.setSystemTime(Math.max(Date.now(), movement.arrivesAt));
      await t.mutation(internal.movements.arrive, { movementId });
    }
    const addresses = await Promise.all(sent.map(({ walker }) => troopRow(t, walker)));
    expect(addresses.filter((row) => row?.stationedAt === barracks)).toHaveLength(1);
  });

  it('enters no building of its own outside the theatre', async () => {
    const t = boot();
    const { seat } = await blitz(t);
    const walker = await troop(t, seat, PARIS);
    const abroad = await t.run(async (ctx) => {
      const player = await seatIn(ctx, seat);
      return ctx.db.insert('buildings', {
        seasonId: player.seasonId,
        playerId: player._id,
        key: 'barracks',
        regionId: 'MAR-3457',
        level: 1,
        outpostId: null,
      });
    });
    await expect(
      t.mutation(api.movements.enterGarrison, {
        ...seat,
        origin: { kind: 'point', point: PARIS },
        troopIds: [walker],
        buildingId: abroad,
      }),
    ).rejects.toThrow(/OUTSIDE_THEATRE/);
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

  it('chases a column it sees on the board, and two chases that cross meet in a shock', async () => {
    const t = boot();
    const { seat, guest } = await blitz(t);
    const west = { lon: 4.0, lat: 50.0 };
    const east = { lon: 4.7, lat: 50.0 };
    const ours = await troop(t, seat, west);
    const theirs = await troop(t, guest, east);
    const campId = await surveyCamp(t, seat, east);
    await t.mutation(api.movements.attack, {
      ...seat,
      origin: { kind: 'point', point: west },
      troopIds: [ours],
      target: { kind: 'camp', campId },
    });
    const board = await t.query(api.view.playerView, guest);
    const arc = board.detected?.find((seen) => seen.seenTo >= Date.now());
    expect(arc).toBeDefined();
    await t.mutation(api.movements.attack, {
      ...guest,
      origin: { kind: 'point', point: east },
      troopIds: [theirs],
      target: { kind: 'track', movementId: arc!.id as Id<'movements'> },
    });
    await runPursuits(t);
    const [engagement] = await t.run((ctx) => ctx.db.query('engagements').collect());
    expect(engagement?.shock).toBe(true);
  });

  it('does not see through the sea: a land column loses a target that has embarked', async () => {
    const t = boot();
    const { seat, guest } = await blitz(t);
    const hunter = await troop(t, seat, { lon: 2.2, lat: 50.9 });
    const quarry = await troop(t, guest, { lon: 1.7, lat: 51.0 }, 'cargo');
    const insert = (who: Seat, doc: Record<string, unknown>) =>
      t.run(async (ctx) => {
        const player = await seatIn(ctx, who);
        return ctx.db.insert('movements', {
          seasonId: player.seasonId,
          playerId: player._id,
          fromBuildingId: null,
          hostCountry: '',
          legs: [{ medium: 'sea', distanceUnits: 1 }],
          distanceUnits: 1,
          costUnits: 1,
          ...doc,
        } as never);
      });
    const sea = [
      { lon: 1.7, lat: 51.0 },
      { lon: 1.2, lat: 51.3 },
    ];
    await insert(guest, {
      type: 'march',
      target: { kind: 'point', point: sea[1] },
      from: sea[0],
      to: sea[1],
      points: sea,
      troopIds: [quarry],
      departedAt: MIDDAY,
      arrivesAt: MIDDAY + 3_600_000,
    });
    const chase = await insert(seat, {
      type: 'attack',
      target: { kind: 'point', point: sea[0] },
      from: { lon: 2.2, lat: 50.9 },
      to: { lon: 2.0, lat: 50.95 },
      hostCountry: 'FRA',
      points: [
        { lon: 2.2, lat: 50.9 },
        { lon: 2.0, lat: 50.95 },
      ],
      legs: [{ medium: 'land', distanceUnits: 1 }],
      troopIds: [hunter],
      departedAt: MIDDAY,
      arrivesAt: MIDDAY + 3_600_000,
      pursuit: { troopId: quarry, checkAt: MIDDAY + 1_000 },
    });
    vi.setSystemTime(MIDDAY + 1_000);
    await t.mutation(internal.movements.pursue, { movementId: chase, expectedAt: MIDDAY + 1_000 });
    expect(await t.run((ctx) => ctx.db.get(chase))).toMatchObject({ type: 'march' });
  });

  it('does not call a road it cannot take a target lost from sight', async () => {
    const t = boot();
    const { seat, guest } = await blitz(t);
    const shore = { lon: 2.0, lat: 50.95 };
    const ship = { lon: 1.6, lat: 51.05 };
    const hunter = await troop(t, seat, shore);
    const quarry = await troop(t, guest, ship, 'cargo');
    const chase = await t.run(async (ctx) => {
      const player = await seatIn(ctx, seat);
      return ctx.db.insert('movements', {
        seasonId: player.seasonId,
        playerId: player._id,
        type: 'attack',
        fromBuildingId: null,
        target: { kind: 'point', point: shore },
        from: { lon: 2.2, lat: 50.9 },
        to: shore,
        hostCountry: 'FRA',
        points: [{ lon: 2.2, lat: 50.9 }, shore],
        legs: [{ medium: 'land', distanceUnits: 1 }],
        distanceUnits: 1,
        costUnits: 1,
        troopIds: [hunter],
        departedAt: MIDDAY - 60_000,
        arrivesAt: MIDDAY,
        pursuit: { troopId: quarry, checkAt: MIDDAY + 1_000 },
      });
    });
    vi.setSystemTime(MIDDAY + 1_000);
    await t.mutation(internal.movements.pursue, { movementId: chase, expectedAt: MIDDAY + 1_000 });
    expect(await t.run((ctx) => ctx.db.get(chase))).toMatchObject({ type: 'march' });
    const player = await t.run((ctx) => seatIn(ctx, seat));
    const notices = await t.run((ctx) =>
      ctx.db
        .query('notices')
        .withIndex('byPlayer', (q) => q.eq('playerId', player._id))
        .collect(),
    );
    expect(notices.map((notice) => notice.kind)).not.toContain('pursuitLost');
  });

  it('routs nobody in a Blitz, whatever order brought the pass', async () => {
    const t = boot();
    const { seat, guest } = await blitz(t);
    const strong = await troop(t, seat, PARIS);
    const weak = await troop(t, guest, PARIS);
    await t.run((ctx) => ctx.db.patch(weak, { currentStrength: 30 }));
    const states = await t.run(async (ctx) => {
      const [attacker, defender] = [(await ctx.db.get(strong))!, (await ctx.db.get(weak))!];
      const { engagement } = await resolveContact(ctx, {
        seasonId: seat.seasonId,
        attacker: { playerId: attacker.playerId, troops: [attacker] },
        defender: { playerId: defender.playerId, troops: [defender] },
        cause: 'arrival',
        point: PARIS,
        hostCountry: 'FRA',
        outpostId: null,
        disabledUntil: null,
        at: Date.now(),
      });
      return engagement.outcomes.map((outcome) => outcome.state);
    });
    expect(states).not.toContain('routed');
  });

  it('gives up on a target out of sight and stops at its last known position', async () => {
    const t = boot();
    const { seat, guest } = await blitz(t);
    const hunter = await troop(t, seat, PARIS);
    await troop(t, guest, BERLIN);
    /** Un guetteur à Potsdam la voit à l'ordre, puis tombe : la cible sort de la vue. */
    const spotter = await troop(t, seat, { lon: 13.06, lat: 52.4 });
    const campId = await surveyCamp(t, seat, BERLIN);

    await t.mutation(api.movements.attack, {
      ...seat,
      origin: { kind: 'point', point: PARIS },
      troopIds: [hunter],
      target: { kind: 'camp', campId },
    });
    await t.run((ctx) => ctx.db.delete(spotter));
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
