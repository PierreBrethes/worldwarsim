import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import type { UnitRole } from '../src/domain/ids';
import type { LonLat } from '../src/domain/geo';
import { nominalStrength } from './constants';
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
  stationedAt: Id<'outposts'> | { lon: number; lat: number },
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

const arrive = async (t: Bench, movementId: Id<'movements'>) => {
  const movement = await t.run(async (ctx) => ctx.db.get(movementId));
  vi.setSystemTime(movement!.arrivesAt + 1);
  await t.mutation(internal.movements.arrive, { movementId });
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

  it('is Germany’s alone', async () => {
    const t = boot();
    const { germany, liege, namur, tanks } = await scene(t, 'italy');
    expect(await codeOf(attack(t, germany, tanks, liege, namur))).toBe('NO_BLITZKRIEG');
    expect(await movements(t)).toEqual([]);
  });

  it('refuses a second leg the fuel cannot carry, at the order', async () => {
    const t = boot();
    const { germany, liege, namur, tanks } = await scene(t);
    await t.run(async (ctx) => {
      for (const id of tanks) await ctx.db.patch(id, { fuel: 1 });
    });
    expect(await codeOf(attack(t, germany, tanks, liege, namur))).toBe('NOT_ENOUGH_FUEL');
    expect(await movements(t)).toEqual([]);
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
    expect(await blitzNotices(t, germany)).toMatchObject([
      { outcome: 'halted', refusal: 'NO_ROUNDS' },
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
});
