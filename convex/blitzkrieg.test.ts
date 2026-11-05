import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import type { UnitRole } from '../src/domain/ids';
import type { LonLat } from '../src/domain/geo';
import { nominalStrength } from './constants';
import { fullSupplies } from '../src/domain/supplies';
import { regionAtPoint } from './regionGeometry';
import { fileSurvey } from './surveys';
import schema from './schema';
import { modules } from './test.setup';
import { foundSeat, joinSeat, placeHq, seatIn, unclocked, type Seat } from './seats.fixture';

/**
 * **La Guerre éclair** (ADR 0039 §6) : une attaque allemande à terre porte deux cibles ; la
 * seconde jambe part du point de la première après une victoire, sous le même slot.
 */
const boot = () => convexTest({ schema, modules, transactionLimits: true });
type Bench = ReturnType<typeof boot>;

const MIDDAY = new Date(2026, 7, 17, 12, 0, 0);
const AACHEN: LonLat = [6.08, 50.78];
const LIEGE: LonLat = [5.57, 50.63];
const NAMUR: LonLat = [4.87, 50.47];
const BASTOGNE: LonLat = [5.72, 50.02];
const at = ([lon, lat]: LonLat) => ({ lon, lat });

const playerOf = (t: Bench, seat: Seat) => t.run(async (ctx) => (await seatIn(ctx, seat))._id);

/** L'Allemagne (`germany`) et la France (`france`), QG posés, sans troupe. */
async function launchedSeason(t: Bench, nation: 'germany' | 'italy' = 'germany') {
  const { seat, code } = await foundSeat(t, 'Pierre', 0.5);
  const guest = await joinSeat(t, code, 'Léa');
  await t.mutation(api.players.reserveNation, { ...seat, nation });
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
  return { germany: seat, france: guest };
}

async function plant(t: Bench, seat: Seat, point: LonLat) {
  const playerId = await playerOf(t, seat);
  return t.run(async (ctx) =>
    ctx.db.insert('outposts', {
      seasonId: (await ctx.db.get(playerId))!.seasonId,
      playerId,
      point: at(point),
      hostCountry: 'BEL',
      regionId: regionAtPoint(point)!.id,
      level: 1,
      foundedAt: Date.now() - 1,
      disabledUntil: null,
      immuneUntil: null,
    }),
  );
}

async function post(
  t: Bench,
  seat: Seat,
  role: UnitRole,
  stationedAt: Id<'outposts'> | Id<'buildings'> | { lon: number; lat: number },
  count = 1,
) {
  const playerId = await playerOf(t, seat);
  const ids: Id<'troops'>[] = [];
  for (let k = 0; k < count; k++)
    ids.push(
      await t.run(async (ctx) =>
        ctx.db.insert('troops', {
          seasonId: (await ctx.db.get(playerId))!.seasonId,
          playerId,
          role,
          tier: 1,
          nominalStrength: nominalStrength(role, 1),
          currentStrength: nominalStrength(role, 1),
          stationedAt,
        }),
      ),
    );
  return ids;
}

/** Deux avant-postes français relevés, Liège et Namur, un allemand à Bastogne, et trois chars
 *  allemands devant Aix-la-Chapelle. */
async function scene(t: Bench, nation: 'germany' | 'italy' = 'germany') {
  const { germany, france } = await launchedSeason(t, nation);
  const liege = await plant(t, france, LIEGE);
  const namur = await plant(t, france, NAMUR);
  const bastogne = await plant(t, germany, BASTOGNE);
  const tanks = await post(t, germany, 'armor', at(AACHEN), 3);
  const germanyId = await playerOf(t, germany);
  await t.run((ctx) =>
    fileSurvey(
      ctx,
      germanyId,
      [LIEGE, NAMUR].map((point) => ({ point, radiusKm: 1 })),
      Date.now(),
    ),
  );
  return { germany, france, liege, namur, bastogne, tanks };
}

const attack = (
  t: Bench,
  seat: Seat,
  troopIds: Id<'troops'>[],
  first: Id<'outposts'>,
  then?: Id<'outposts'>,
) =>
  t.mutation(api.movements.attack, {
    ...seat,
    origin: { kind: 'point', point: at(AACHEN) },
    troopIds,
    target: { kind: 'outpost', outpostId: first },
    ...(then === undefined ? {} : { then: { kind: 'outpost', outpostId: then } }),
  });

const codeOf = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: { data?: { code?: string } }) => error.data?.code,
  );

const movements = (t: Bench) => t.run(async (ctx) => ctx.db.query('movements').collect());

/** L'arrivée seule : la seconde jambe attend sa propre mutation, planifiée par l'arrivée. */
const land = async (t: Bench, movementId: Id<'movements'>) => {
  const movement = await t.run(async (ctx) => ctx.db.get(movementId));
  vi.setSystemTime(movement!.arrivesAt + 1);
  await t.mutation(internal.movements.arrive, { movementId });
};

/** Ce qui est dû à l'instant : la seconde jambe qui part dans la seconde de l'arrivée. */
const runDue = async (t: Bench) => {
  vi.advanceTimersByTime(1);
  await t.finishInProgressScheduledFunctions();
};

const arrive = async (t: Bench, movementId: Id<'movements'>) => {
  await land(t, movementId);
  await runDue(t);
};

const blitzNotices = (t: Bench, seat: Seat) =>
  t.run(async (ctx) => {
    const player = await seatIn(ctx, seat);
    return (
      await ctx.db
        .query('notices')
        .withIndex('byPlayer', (q) => q.eq('playerId', player._id))
        .collect()
    ).filter((notice) => notice.kind === 'blitzkrieg');
  });

describe('the blitzkrieg (ADR 0039 §6)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  it('files one attack with a second target under one slot, that its author alone reads', async () => {
    const t = boot();
    const { germany, france, liege, namur, tanks } = await scene(t);
    await attack(t, germany, tanks, liege, namur);

    const [movement] = await movements(t);
    expect(movement).toMatchObject({
      type: 'attack',
      target: { kind: 'outpost', outpostId: liege },
      blitzkrieg: { then: { kind: 'outpost', outpostId: namur }, point: at(NAMUR) },
    });
    expect(movement!.blitzkrieg!.points.length).toBeGreaterThan(1);
    const mine = (await t.query(api.view.playerView, germany)).movements!.find(
      (arc) => arc.id === movement!._id,
    );
    expect(mine).toMatchObject({ then: { point: at(NAMUR), name: 'Namur' } });
    /** Rien de la seconde cible chez l'autre : ni ses relevés, ni ses dépêches. */
    expect(JSON.stringify(await t.query(api.view.playerView, france))).not.toMatch(
      /"then"|blitzkrieg/,
    );
    /** Un seul slot : le second des deux reste libre. */
    expect((await t.query(api.view.playerView, germany)).me.slots.used).toBe(1);
  });

  it('refuses a second target an attack may not aim at, and sends neither', async () => {
    const t = boot();
    const { germany, liege, bastogne, tanks } = await scene(t);
    expect(await codeOf(attack(t, germany, tanks, liege, bastogne))).toBe('FRIENDLY_TARGET');
    expect(await codeOf(attack(t, germany, tanks, liege, liege))).toBe('SAME_TARGET');
    expect(await movements(t)).toEqual([]);
  });

  it('previews the second leg after the first, or says its refusal as a value', async () => {
    const t = boot();
    const { germany, liege, namur, bastogne, tanks } = await scene(t);
    const preview = (then: Id<'outposts'>) =>
      t.query(api.movements.preview, {
        ...germany,
        origin: { kind: 'point', point: at(AACHEN) },
        troopIds: tanks,
        target: { kind: 'outpost', outpostId: liege },
        type: 'attack',
        then: { kind: 'outpost', outpostId: then },
      });
    const onward = (await preview(namur))!.then;
    expect(onward).toMatchObject({ refusal: null, fuel: { gauge: { held: 2 } } });
    expect(onward!.refusal === null && onward!.minutes > 0).toBe(true);
    expect((await preview(bastogne))!.then).toMatchObject({ refusal: { code: 'FRIENDLY_TARGET' } });
  });

  it('is Germany’s alone, and the Mondiale’s', async () => {
    const t = boot();
    const { germany, liege, namur, tanks } = await scene(t, 'italy');
    expect(await codeOf(attack(t, germany, tanks, liege, namur))).toBe('NO_BLITZKRIEG');
    expect(await movements(t)).toEqual([]);

    const t2 = boot();
    const blitz = await scene(t2);
    await t2.run((ctx) =>
      ctx.db.patch(blitz.germany.seasonId, { mode: 'blitz', theatre: 'europe' }),
    );
    expect(await codeOf(attack(t2, blitz.germany, blitz.tanks, blitz.liege, blitz.namur))).toBe(
      'NO_BLITZKRIEG',
    );
    expect(await movements(t2)).toEqual([]);
  });

  it('chains ashore only: an air road does not chain', async () => {
    const t = boot();
    const { germany, liege, namur } = await scene(t);
    const germanyId = await playerOf(t, germany);
    const airfield = await t.run(async (ctx) =>
      ctx.db.insert('buildings', {
        seasonId: germany.seasonId,
        playerId: germanyId,
        key: 'airfield',
        regionId: regionAtPoint(AACHEN)!.id,
        point: at(AACHEN),
        level: 1,
      }),
    );
    const fighters = await post(t, germany, 'fighter', airfield, 2);
    const flown = t.mutation(api.movements.attack, {
      ...germany,
      origin: { kind: 'building', buildingId: airfield },
      troopIds: fighters,
      target: { kind: 'outpost', outpostId: liege },
      then: { kind: 'outpost', outpostId: namur },
    });
    expect(await codeOf(flown)).toBe('CHAIN_ASHORE_ONLY');
    expect(await movements(t)).toEqual([]);
  });

  it('chains ashore only: a mixed column does not sail its second road', async () => {
    const t = boot();
    const { germany, france } = await scene(t);
    const KIEL: LonLat = [10.14, 54.32];
    const KOLDING: LonLat = [9.47, 55.49];
    const GOTHENBURG: LonLat = [11.97, 57.7];
    const germanyId = await playerOf(t, germany);
    const harbour = await t.run(async (ctx) =>
      ctx.db.insert('buildings', {
        seasonId: germany.seasonId,
        playerId: germanyId,
        key: 'port',
        regionId: regionAtPoint(KIEL)!.id,
        point: at(KIEL),
        level: 1,
      }),
    );
    const kolding = await plant(t, france, KOLDING);
    const gothenburg = await plant(t, france, GOTHENBURG);
    await t.run((ctx) =>
      fileSurvey(
        ctx,
        germanyId,
        [KOLDING, GOTHENBURG].map((point) => ({ point, radiusKm: 1 })),
        Date.now(),
      ),
    );
    /** Un cargo dans la colonne la fait `combined` : à terre jusqu'au Jutland, en mer au-delà. */
    const column = [
      ...(await post(t, germany, 'infantry', harbour, 2)),
      ...(await post(t, germany, 'cargo', harbour)),
    ];
    const sent = t.mutation(api.movements.attack, {
      ...germany,
      origin: { kind: 'building', buildingId: harbour },
      troopIds: column,
      target: { kind: 'outpost', outpostId: kolding },
      then: { kind: 'outpost', outpostId: gothenburg },
    });
    expect(await codeOf(sent)).toBe('CHAIN_ASHORE_ONLY');
    expect(await movements(t)).toEqual([]);
  });

  it('previews a march with a second target as an order that does not chain', async () => {
    const t = boot();
    const { germany, namur, tanks } = await scene(t);
    const preview = await t.query(api.movements.preview, {
      ...germany,
      origin: { kind: 'point', point: at(AACHEN) },
      troopIds: tanks,
      target: { kind: 'point', point: at([5.86, 50.49]) },
      type: 'march',
      then: { kind: 'outpost', outpostId: namur },
    });
    expect(preview!.then).toEqual({
      refusal: { code: 'CHAIN_ATTACK_ONLY', details: { type: 'march' } },
    });
  });

  it('shows a short second leg at the order, and stays at its departure when nothing filled it', async () => {
    const t = boot();
    const { germany, liege, namur, tanks } = await scene(t);
    await t.run(async (ctx) => {
      for (const id of tanks) await ctx.db.patch(id, { fuel: 1 });
    });
    const preview = await t.query(api.movements.preview, {
      ...germany,
      origin: { kind: 'point', point: at(AACHEN) },
      troopIds: tanks,
      target: { kind: 'outpost', outpostId: liege },
      type: 'attack',
      then: { kind: 'outpost', outpostId: namur },
    });
    expect(preview!.then).toMatchObject({ refusal: null, fuel: { gauge: { short: 1 } } });
    const first = await attack(t, germany, tanks, liege, namur);
    await arrive(t, first.movementId);
    expect(await blitzNotices(t, germany)).toMatchObject([
      { outcome: 'halted', refusal: 'NOT_ENOUGH_FUEL' },
    ]);
    expect((await t.run(async (ctx) => ctx.db.get(tanks[0]!)))!.stationedAt).toEqual(at(LIEGE));
  });

  it('runs on from an empty first target to the second, the same slot held, and says so', async () => {
    const t = boot();
    const { germany, liege, namur, tanks } = await scene(t);
    const first = await attack(t, germany, tanks, liege, namur);
    /** L'autre slot pris : la seconde jambe ne reprend pas de slot. */
    const others = await post(t, germany, 'armor', at(AACHEN));
    await t.mutation(api.movements.marchTo, {
      ...germany,
      origin: { kind: 'point', point: at(AACHEN) },
      troopIds: others,
      point: at([6.2, 50.9]),
    });
    await arrive(t, first.movementId);

    const onward = (await movements(t)).find((movement) => movement.troopIds.includes(tanks[0]!));
    expect(onward).toMatchObject({
      type: 'attack',
      from: at(LIEGE),
      target: { kind: 'outpost', outpostId: namur },
      troopIds: tanks,
    });
    expect(onward!.blitzkrieg).toBeUndefined();
    expect(await blitzNotices(t, germany)).toMatchObject([
      {
        outcome: 'onward',
        point: at(LIEGE),
        then: { point: at(NAMUR) },
        arrivesAt: onward!.arrivesAt,
      },
    ]);
  });

  it('sends a routed attacker home, never on to the second target', async () => {
    const t = boot();
    const { germany, france, liege, namur, tanks } = await scene(t);
    await post(t, france, 'infantry', liege);
    /** Sous le quart de son effectif, ce char rompt le contact même si la colonne l'emporte. */
    await t.run(async (ctx) => ctx.db.patch(tanks[0]!, { currentStrength: 1 }));
    const first = await attack(t, germany, tanks, liege, namur);
    await arrive(t, first.movementId);
    const onward = (await movements(t)).find((movement) => movement.type === 'attack')!;
    expect(onward.troopIds).toEqual(tanks.slice(1));
    const home = (await movements(t)).find((movement) => movement.type === 'return');
    expect(home?.troopIds).toEqual([tanks[0]]);
  });

  it('runs on after a won engagement, and lets the beaten second leg fall', async () => {
    const t = boot();
    const { germany, france, liege, namur, tanks } = await scene(t);
    await post(t, france, 'infantry', liege);
    const won = await attack(t, germany, tanks, liege, namur);
    await arrive(t, won.movementId);
    const onward = (await movements(t)).find((movement) => movement.type === 'attack');
    expect(onward).toMatchObject({
      from: at(LIEGE),
      target: { kind: 'outpost', outpostId: namur },
    });

    const t2 = boot();
    const beaten = await scene(t2);
    await post(t2, beaten.france, 'armor', beaten.liege, 6);
    const lost = await attack(t2, beaten.germany, beaten.tanks, beaten.liege, beaten.namur);
    await arrive(t2, lost.movementId);
    expect((await movements(t2)).filter((movement) => movement.type === 'attack')).toEqual([]);
    expect(await blitzNotices(t2, beaten.germany)).toMatchObject([
      { outcome: 'lost', point: at(LIEGE), then: { point: at(NAMUR) } },
    ]);
  });

  it('stays on the ground it took when the second leg lacks rounds or its target, and gives its slot back', async () => {
    const t = boot();
    const { germany, france, liege, namur, tanks } = await scene(t);
    await post(t, france, 'infantry', liege);
    /** Un coup chacun : le combat de Liège les tire tous. */
    await t.run(async (ctx) => {
      for (const id of tanks) await ctx.db.patch(id, { rounds: 1 });
    });
    const first = await attack(t, germany, tanks, liege, namur);
    await arrive(t, first.movementId);

    expect((await movements(t)).filter((movement) => movement.type === 'attack')).toEqual([]);
    const standing = await t.run(async (ctx) => ctx.db.get(tanks[0]!));
    expect(standing!.stationedAt).toEqual(at(LIEGE));
    /** Les troupes restées, que leur pièce reconnaît. */
    expect(await blitzNotices(t, germany)).toMatchObject([
      { outcome: 'halted', refusal: 'NO_ROUNDS', troopIds: expect.arrayContaining([tanks[0]]) },
    ]);
    expect((await t.query(api.view.playerView, germany)).me.slots.used).toBe(0);

    const t2 = boot();
    const lost = await scene(t2);
    const order = await attack(t2, lost.germany, lost.tanks, lost.liege, lost.namur);
    /** Namur pris par l'Allemagne en route : la cible relue est la sienne. */
    const germanyId = await playerOf(t2, lost.germany);
    await t2.run(async (ctx) => ctx.db.patch(lost.namur, { playerId: germanyId }));
    await arrive(t2, order.movementId);
    expect(await blitzNotices(t2, lost.germany)).toMatchObject([
      { outcome: 'halted', refusal: 'FRIENDLY_TARGET' },
    ]);

    /** Namur rasé en route, et son relevé avec lui : la cible relue n'existe plus. */
    const t3 = boot();
    const gone = await scene(t3);
    const sent = await attack(t3, gone.germany, gone.tanks, gone.liege, gone.namur);
    await t3.run(async (ctx) => {
      await ctx.db.delete(gone.namur);
      for (const row of await ctx.db.query('regionSightings').collect())
        await ctx.db.delete(row._id);
    });
    await arrive(t3, sent.movementId);
    expect(await blitzNotices(t3, gone.germany)).toMatchObject([
      { outcome: 'halted', refusal: 'UNKNOWN_OUTPOST' },
    ]);
    expect((await t3.run(async (ctx) => ctx.db.get(gone.tanks[0]!)))!.stationedAt).toEqual(
      at(LIEGE),
    );
    expect((await movements(t3)).filter((movement) => movement.type === 'attack')).toEqual([]);
    expect((await t3.query(api.view.playerView, gone.germany)).me.slots.used).toBe(0);
  });

  it('rereads the second leg in its own mutation: a map changed since the arrival halts it', async () => {
    const t = boot();
    const { germany, liege, namur, tanks } = await scene(t);
    const order = await attack(t, germany, tanks, liege, namur);
    await land(t, order.movementId);
    /** Rien n'est encore parti : la colonne attend sa jambe, ni posée ni relancée. */
    expect(await blitzNotices(t, germany)).toEqual([]);
    expect((await movements(t)).filter((movement) => movement.type === 'attack')).toHaveLength(1);
    /** Namur pris par l'Allemagne entre l'arrivée et la jambe : la cible relue est la sienne. */
    const germanyId = await playerOf(t, germany);
    await t.run(async (ctx) => ctx.db.patch(namur, { playerId: germanyId }));
    await runDue(t);
    expect(await blitzNotices(t, germany)).toMatchObject([
      { outcome: 'halted', refusal: 'FRIENDLY_TARGET' },
    ]);
    expect((await movements(t)).filter((movement) => movement.type === 'attack')).toEqual([]);
    expect((await t.run(async (ctx) => ctx.db.get(tanks[0]!)))!.stationedAt).toEqual(at(LIEGE));
  });

  it('rearms a halted column from the depot it stands by, as any arrival does', async () => {
    const t = boot();
    const { germany, france, liege, namur, tanks } = await scene(t);
    /** Un dépôt allemand au bord de Liège : la colonne posée s'y recharge (ADR 0028 §3). */
    const depot = await plant(t, germany, [5.6, 50.64]);
    await t.run(async (ctx) =>
      ctx.db.patch(depot, { depot: { ammunition: 400, oil: 400, coal: 0 } }),
    );
    await post(t, france, 'infantry', liege);
    await t.run(async (ctx) => {
      for (const id of tanks) await ctx.db.patch(id, { rounds: 1 });
    });
    const order = await attack(t, germany, tanks, liege, namur);
    const germanyId = await playerOf(t, germany);
    await t.run(async (ctx) => ctx.db.patch(namur, { playerId: germanyId }));
    await arrive(t, order.movementId);
    expect(await blitzNotices(t, germany)).toMatchObject([
      { outcome: 'halted', refusal: 'FRIENDLY_TARGET' },
    ]);
    expect((await t.run(async (ctx) => ctx.db.get(tanks[1]!)))!.rounds).toBe(
      fullSupplies('armor').rounds,
    );
  });

  it('only stands the column when the season closed between the arrival and the leg', async () => {
    const t = boot();
    const { germany, liege, namur, tanks } = await scene(t);
    const order = await attack(t, germany, tanks, liege, namur);
    await land(t, order.movementId);
    await t.run(async (ctx) => ctx.db.patch(germany.seasonId, { status: 'concluded' }));
    await runDue(t);
    expect(await blitzNotices(t, germany)).toEqual([]);
    expect(await movements(t)).toEqual([]);
    expect((await t.run(async (ctx) => ctx.db.get(tanks[0]!)))!.stationedAt).toEqual(at(LIEGE));
  });

  it('plans nothing after a lost first attack', async () => {
    const t = boot();
    const { germany, france, liege, namur, tanks } = await scene(t);
    await post(t, france, 'armor', liege, 6);
    const lost = await attack(t, germany, tanks, liege, namur);
    await land(t, lost.movementId);
    const planned = await t.run(async (ctx) =>
      (await ctx.db.system.query('_scheduled_functions').collect()).filter(
        (job) => job.name.includes('pressOn') && job.state.kind === 'pending',
      ),
    );
    expect(planned).toEqual([]);
  });

  it('shows the column leaving the first target to a watcher as a departure, without a second dispatch', async () => {
    const t = boot();
    const { germany, france, liege, namur, tanks } = await scene(t);
    /** Une sentinelle française au nord de Liège, qui voit l'attaque arriver. */
    await post(t, france, 'infantry', at([5.45, 50.85]));
    const first = await attack(t, germany, tanks, liege, namur);
    const franceId = await playerOf(t, france);
    const sightingsOf = (movementId: Id<'movements'>) =>
      t.run(async (ctx) =>
        (
          await ctx.db
            .query('sightings')
            .withIndex('byMovement', (q) => q.eq('movementId', movementId))
            .collect()
        ).filter((row) => row.playerId === franceId),
      );
    expect((await sightingsOf(first.movementId)).map((row) => row.noticeFiled)).toEqual([true]);
    await arrive(t, first.movementId);
    const onward = (await movements(t)).find((movement) => movement.type === 'attack')!;
    const seen = await sightingsOf(onward._id);
    expect(seen.map((row) => row.noticeFiled)).toEqual([true]);
    const sighted = await t.run(async (ctx) =>
      (
        await ctx.db
          .query('notices')
          .withIndex('byPlayer', (q) => q.eq('playerId', franceId))
          .collect()
      ).filter((notice) => notice.kind === 'movementSighted'),
    );
    expect(sighted).toHaveLength(1);
  });

  it('counts a second leg that left in the season report', async () => {
    const t = boot();
    const { germany, liege, namur, tanks } = await scene(t);
    const first = await attack(t, germany, tanks, liege, namur);
    await arrive(t, first.movementId);
    const germanyId = await playerOf(t, germany);
    const page = await t.query(internal.seasonReport.outpostEvents, {
      playerId: germanyId,
      cursor: null,
    });
    expect(page.uses).toBe(1);

    /** Une seconde jambe tombée n'est pas un usage. */
    const t2 = boot();
    const beaten = await scene(t2);
    await post(t2, beaten.france, 'armor', beaten.liege, 6);
    const lost = await attack(t2, beaten.germany, beaten.tanks, beaten.liege, beaten.namur);
    await arrive(t2, lost.movementId);
    const none = await t2.query(internal.seasonReport.outpostEvents, {
      playerId: await playerOf(t2, beaten.germany),
      cursor: null,
    });
    expect(none.uses).toBe(0);
  });

  it('stages each state of the gesture for the captures (--guerre-eclair)', async () => {
    const t = boot();
    const { germany, france } = await launchedSeason(t);
    const places = await t.mutation(internal.dev.blitzkriegScene, { seasonId: germany.seasonId });
    expect(Object.keys(places)).toContain('guerre-eclair-tenue');
    /** Les arrivées, puis les jambes qu'elles planifient. */
    await runDue(t);
    await runDue(t);
    expect((await blitzNotices(t, germany)).map((notice) => notice.outcome).sort()).toEqual([
      'halted',
      'lost',
      'onward',
    ]);
    const chained = (await movements(t)).filter((movement) => movement.blitzkrieg !== undefined);
    expect(chained).toHaveLength(1);
    expect((await t.query(api.view.playerView, france)).detected.length).toBeGreaterThan(0);
  });
});
