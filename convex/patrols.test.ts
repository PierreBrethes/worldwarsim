import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import type { UnitRole } from '../src/domain/ids';
import type { LonLat } from '../src/domain/geo';
import { nominalStrength } from './constants';
import { resolveContact } from './combat';
import schema from './schema';
import { modules } from './test.setup';
import { foundSeat, joinSeat, placeHq, seatIn, unclocked, type Seat } from './seats.fixture';

/** **La ronde** (ADR 0037 §10, #376) : chaque chemin du joueur, par la porte serveur. */
const boot = () => convexTest({ schema, modules, transactionLimits: true });
type Bench = ReturnType<typeof boot>;

const MIDDAY = new Date(2026, 7, 17, 12, 0, 0);
const ESSEN: LonLat = [7.01, 51.45];
const KASSEL: LonLat = [9.5, 51.31];
/** Entre les deux, plus près de chacun qu'ils ne le sont entre eux : la liaison longue tombe. */
const SAUERLAND: LonLat = [8.25, 51.38];
const GERMANY = { hostCountry: 'DEU', regionId: 'DEU-1572' };
const HOUR = 3_600_000;

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

async function plant(t: Bench, seat: Seat, point: LonLat) {
  const playerId = await playerOf(t, seat);
  return t.run(async (ctx) =>
    ctx.db.insert('outposts', {
      seasonId: (await ctx.db.get(playerId))!.seasonId,
      playerId,
      point: { lon: point[0], lat: point[1] },
      ...GERMANY,
      level: 1,
      foundedAt: Date.now() - 1,
      disabledUntil: null,
      immuneUntil: null,
    }),
  );
}

async function form(t: Bench, seat: Seat, role: UnitRole, stationedAt: Id<'outposts'>) {
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

const troopOf = (t: Bench, id: Id<'troops'>) => t.run(async (ctx) => ctx.db.get(id));
const flying = (t: Bench) => t.run(async (ctx) => ctx.db.query('movements').collect());
const ended = (t: Bench) =>
  t.run(async (ctx) =>
    ctx.db
      .query('notices')
      .filter((q) => q.eq(q.field('kind'), 'patrolEnded'))
      .collect(),
  );

/** Le seul mouvement en vol, mené à son arrivée. */
async function arriveNext(t: Bench) {
  const [movement] = await flying(t);
  vi.setSystemTime(movement!.arrivesAt + 1);
  await t.mutation(internal.movements.arrive, { movementId: movement!._id });
  return movement!;
}

/** La halte menée à son échéance. */
async function haltEnds(t: Bench, troopId: Id<'troops'>) {
  const troop = await troopOf(t, troopId);
  vi.setSystemTime(troop!.patrol!.haltUntil! + 1);
  await t.mutation(internal.patrols.haltEnds, { troopId });
}

/** Une ronde lancée d'Essen vers Kassel. */
async function patrolling(t: Bench, seat: Seat, role: UnitRole = 'infantry') {
  const essen = await plant(t, seat, ESSEN);
  const kassel = await plant(t, seat, KASSEL);
  const troop = await form(t, seat, role, essen);
  await t.mutation(api.patrols.start, { ...seat, troopId: troop, ends: [kassel, essen] });
  return { essen, kassel, troop };
}

describe('a patrol on a liaison', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  it('leaves at once for the other end, keeps its slot, and serves its patrol to its owner only', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const { essen, kassel, troop } = await patrolling(t, seat);

    expect(await flying(t)).toMatchObject([
      { patrolLeg: true, target: { kind: 'outpost', outpostId: kassel } },
    ]);
    const view = await t.query(api.view.playerView, seat);
    expect(view.me.slots.used).toBe(1);
    expect(view.me.troops.find((one) => one.id === troop)?.patrol).toEqual({
      ends: [kassel, essen],
      to: kassel,
      haltUntil: null,
      recalled: false,
    });
    expect(JSON.stringify(await t.query(api.view.playerView, guest))).not.toContain('patrol');
  });

  it('halts an hour in garrison at the end it reaches, its slot kept, then leaves for the other', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const { essen, kassel, troop } = await patrolling(t, seat);

    const leg = await arriveNext(t);
    expect(await flying(t)).toEqual([]);
    const halted = (await troopOf(t, troop))!;
    expect(halted.stationedAt).toBe(kassel);
    expect(halted.patrol?.haltUntil).toBe(leg.arrivesAt + 1 + HOUR);
    expect((await t.query(api.view.playerView, seat)).me.slots.used).toBe(1);

    await haltEnds(t, troop);
    expect(await flying(t)).toMatchObject([
      { patrolLeg: true, target: { kind: 'outpost', outpostId: essen } },
    ]);
    expect((await troopOf(t, troop))!.patrol).toMatchObject({ to: essen });
    expect((await troopOf(t, troop))!.patrol?.haltUntil).toBeUndefined();
  });

  it('ends at once when recalled at a halt, and finishes its leg when recalled on the road', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const { kassel, troop } = await patrolling(t, seat);

    await t.mutation(api.patrols.recall, { ...seat, troopId: troop });
    expect((await troopOf(t, troop))!.patrol?.recalled).toBe(true);
    await arriveNext(t);
    expect((await troopOf(t, troop))!).toMatchObject({ stationedAt: kassel });
    expect((await troopOf(t, troop))!.patrol).toBeUndefined();
    expect(await ended(t)).toMatchObject([{ why: 'recalled', hostCountry: 'DEU' }]);
    expect((await t.query(api.view.playerView, seat)).me.slots.used).toBe(0);

    const second = await patrolling(t, seat);
    await arriveNext(t);
    const jobId = (await troopOf(t, second.troop))!.patrol!.jobId!;
    await t.mutation(api.patrols.recall, { ...seat, troopId: second.troop });
    expect((await troopOf(t, second.troop))!.patrol).toBeUndefined();
    expect((await t.run(async (ctx) => ctx.db.system.get(jobId)))?.state.kind).toBe('canceled');
    expect(await flying(t)).toEqual([]);
  });

  it('stands at the point reached, out of garrison, when its end is captured during the leg', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const { kassel, troop } = await patrolling(t, seat);
    const enemy = await playerOf(t, guest);
    await t.run(async (ctx) => ctx.db.patch(kassel, { playerId: enemy }));

    await arriveNext(t);
    const stood = (await troopOf(t, troop))!;
    expect(stood.patrol).toBeUndefined();
    expect(typeof stood.stationedAt).not.toBe('string');
    expect(await ended(t)).toMatchObject([{ why: 'lost' }]);
    expect((await t.query(api.view.playerView, seat)).me.slots.used).toBe(0);
  });

  it('stops in garrison when a new point takes its liaison off the drawing, read at the halt', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const { kassel, troop } = await patrolling(t, seat);
    await arriveNext(t);
    await plant(t, seat, SAUERLAND);

    await haltEnds(t, troop);
    expect(await flying(t)).toEqual([]);
    expect((await troopOf(t, troop))!).toMatchObject({ stationedAt: kassel });
    expect((await troopOf(t, troop))!.patrol).toBeUndefined();
    expect(await ended(t)).toMatchObject([{ why: 'withdrawn' }]);
  });

  it('ends on a rout at its halt, its halt job cancelled', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const { kassel, troop } = await patrolling(t, seat);
    await arriveNext(t);
    await t.run(async (ctx) => ctx.db.patch(troop, { currentStrength: 30 }));
    const jobId = (await troopOf(t, troop))!.patrol!.jobId!;
    const enemy = await playerOf(t, guest);
    const rifles = await t.run(async (ctx) => {
      const strength = nominalStrength('infantry', 1);
      const ids = [];
      for (let n = 0; n < 1; n += 1)
        ids.push(
          await ctx.db.insert('troops', {
            seasonId: seat.seasonId,
            playerId: enemy,
            role: 'infantry',
            tier: 1,
            nominalStrength: strength,
            currentStrength: strength,
            stationedAt: null,
          }),
        );
      return ids;
    });
    await t.run(async (ctx) => {
      const troops = async (ids: Array<Id<'troops'>>) =>
        (await Promise.all(ids.map((id) => ctx.db.get(id)))).filter((one) => one !== null);
      await resolveContact(ctx, {
        seasonId: seat.seasonId,
        attacker: { playerId: enemy, troops: await troops(rifles) },
        defender: { playerId: (await seatIn(ctx, seat))._id, troops: await troops([troop]) },
        cause: 'arrival',
        point: { lon: KASSEL[0], lat: KASSEL[1] },
        hostCountry: 'DEU',
        outpostId: kassel,
        disabledUntil: null,
        at: Date.now(),
      });
    });

    expect((await troopOf(t, troop))!.patrol).toBeUndefined();
    expect(await ended(t)).toMatchObject([{ why: 'routed' }]);
    expect((await t.run(async (ctx) => ctx.db.system.get(jobId)))?.state.kind).toBe('canceled');
  });

  it('stays at its halt while the fuel is short, and ends after three refused roads', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const { troop } = await patrolling(t, seat, 'armor');
    await arriveNext(t);
    await t.run(async (ctx) => ctx.db.patch(troop, { fuel: 0 }));

    await haltEnds(t, troop);
    expect(await flying(t)).toEqual([]);
    expect((await troopOf(t, troop))!.patrol?.roads).toBe(1);
    await haltEnds(t, troop);
    await haltEnds(t, troop);
    expect((await troopOf(t, troop))!.patrol).toBeUndefined();
    expect(await ended(t)).toMatchObject([{ why: 'road' }]);
  });

  it('refuses, by the same codes the rose says: a transport, an undrawn pair, a taken liaison, away from an end', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const { essen, kassel } = await patrolling(t, seat);
    const truck = await form(t, seat, 'landTransport', essen);
    await expect(
      t.mutation(api.patrols.start, { ...seat, troopId: truck, ends: [essen, kassel] }),
    ).rejects.toThrow('PATROL_LAND_COMBAT_ONLY');
    const second = await form(t, seat, 'infantry', essen);
    await expect(
      t.mutation(api.patrols.start, { ...seat, troopId: second, ends: [essen, kassel] }),
    ).rejects.toThrow('PATROL_TAKEN');
    const far = await plant(t, seat, [20, 50]);
    await expect(
      t.mutation(api.patrols.start, { ...seat, troopId: second, ends: [essen, far] }),
    ).rejects.toThrow('PATROL_NOT_DRAWN');
    const lone = await form(t, seat, 'infantry', far);
    await expect(
      t.mutation(api.patrols.start, { ...seat, troopId: lone, ends: [essen, kassel] }),
    ).rejects.toThrow('PATROL_NOT_AT_END');
  });

  it('refuses any other order to a troop on patrol, naming it', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const { kassel, troop } = await patrolling(t, seat);
    await arriveNext(t);
    await expect(
      t.mutation(api.movements.marchTo, {
        ...seat,
        origin: { kind: 'outpost', outpostId: kassel },
        troopIds: [troop],
        point: { lon: 9.6, lat: 51.2 },
      }),
    ).rejects.toThrow('ON_PATROL');
  });

  it('is not offered in Blitz', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const essen = await plant(t, seat, ESSEN);
    const kassel = await plant(t, seat, KASSEL);
    const troop = await form(t, seat, 'infantry', essen);
    await t.run(async (ctx) => ctx.db.patch(seat.seasonId, { mode: 'blitz' }));
    await expect(
      t.mutation(api.patrols.start, { ...seat, troopId: troop, ends: [essen, kassel] }),
    ).rejects.toThrow('NOT_IN_BLITZ');
  });
});
