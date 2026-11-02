import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import type { UnitRole } from '../src/domain/ids';
import type { LonLat } from '../src/domain/geo';
import { nominalStrength } from './constants';
import { resolveContact } from './combat';
import { reassessDetection } from './movement/detection';
import { hostAtPoint } from './routes';
import { COST_BY_MEDIUM } from '../src/domain/routing';
import { distanceKm } from '../src/domain/geo';
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
      waiting: null,
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

  it('says its end is lost, not its liaison withdrawn, when the end it left is disabled', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const { essen, troop } = await patrolling(t, seat);
    await t.run(async (ctx) => ctx.db.patch(essen, { disabledUntil: Date.now() + 24 * HOUR }));
    await arriveNext(t);
    expect((await troopOf(t, troop))!.patrol).toBeUndefined();
    expect(await ended(t)).toMatchObject([{ why: 'lost' }]);
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
    const view = await t.query(api.view.playerView, seat);
    expect(view.me.troops.find((one) => one.id === troop)?.patrol?.waiting).toBe('road');
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

  it('takes no troop on patrol aboard, nor a transport that carries one', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const { kassel, troop } = await patrolling(t, seat);
    await arriveNext(t);
    const truck = await form(t, seat, 'landTransport', kassel);
    await expect(
      t.mutation(api.movements.board, { ...seat, troopIds: [troop], carrierId: truck }),
    ).rejects.toThrow('ON_PATROL');
    await t.run(async (ctx) => ctx.db.patch(troop, { carriedBy: truck }));
    await expect(
      t.mutation(api.movements.marchTo, {
        ...seat,
        origin: { kind: 'outpost', outpostId: kassel },
        troopIds: [truck],
        point: { lon: 9.6, lat: 51.2 },
      }),
    ).rejects.toThrow('ON_PATROL');
  });

  it('fires no gun on patrol', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const { troop } = await patrolling(t, seat, 'artillery');
    const leg = await arriveNext(t);
    await expect(
      t.mutation(api.movements.bombard, {
        ...seat,
        troopId: troop,
        target: { kind: 'track', movementId: leg._id },
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

/** Une colonne de Léa tirée droit d'un point à l'autre, sans Dijkstra : c'est la ligne qu'on
 *  mesure ici, pas la route. */
async function enemyColumn(
  t: Bench,
  seat: Seat,
  from: LonLat,
  to: LonLat,
  durationMs: number,
  /** Un aller-retour : la colonne revient là, après `to`. */
  back?: LonLat,
) {
  const playerId = await playerOf(t, seat);
  const troopId = await t.run(async (ctx) =>
    ctx.db.insert('troops', {
      seasonId: (await ctx.db.get(playerId))!.seasonId,
      playerId,
      role: 'armor',
      tier: 1,
      nominalStrength: nominalStrength('armor', 1),
      currentStrength: nominalStrength('armor', 1),
      stationedAt: null,
    }),
  );
  return t.run(async (ctx) => {
    const seasonId = (await ctx.db.get(playerId))!.seasonId;
    const path = back === undefined ? [from, to] : [from, to, back];
    const end = path.at(-1)!;
    const distanceUnits = path
      .slice(1)
      .reduce((sum, point, k) => sum + distanceKm(path[k]!, point), 0);
    const movementId = await ctx.db.insert('movements', {
      seasonId,
      playerId,
      type: 'march',
      fromBuildingId: null,
      target: { kind: 'point', point: { lon: end[0], lat: end[1] } },
      from: { lon: from[0], lat: from[1] },
      to: { lon: end[0], lat: end[1] },
      hostCountry: hostAtPoint(end),
      points: path.map(([lon, lat]) => ({ lon, lat })),
      legs: [{ medium: 'land', distanceUnits }],
      distanceUnits,
      costUnits: distanceUnits * COST_BY_MEDIUM.land,
      landCost: COST_BY_MEDIUM.land,
      troopIds: [troopId],
      departedAt: Date.now(),
      arrivesAt: Date.now() + durationMs,
    });
    await reassessDetection(ctx, seasonId);
    return movementId;
  });
}

const sighted = (t: Bench) =>
  t.run(async (ctx) =>
    ctx.db
      .query('notices')
      .filter((q) => q.eq(q.field('kind'), 'movementSighted'))
      .collect(),
  );

/** Chaque franchissement en attente, mené à son heure. */
async function fileCrossings(t: Bench, seat: Seat) {
  for (const row of await sightingsOf(t, seat))
    for (const crossing of row.crossings ?? []) {
      if (crossing.jobId === undefined) continue;
      vi.setSystemTime(crossing.at);
      await t.mutation(internal.movements.fileCrossing, {
        sightingId: row._id,
        troopId: crossing.troopId,
        at: crossing.at,
      });
    }
}

const sightingsOf = (t: Bench, seat: Seat) =>
  t.run(async (ctx) => {
    const playerId = (await seatIn(ctx, seat))._id;
    return ctx.db
      .query('sightings')
      .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
      .collect();
  });

/** Au milieu de la liaison, hors de la vigie des deux bouts (60 km) et des guetteurs de la ronde
 *  en halte à Kassel. */
const ACROSS: [LonLat, LonLat] = [
  [SAUERLAND[0], SAUERLAND[1] + 0.3],
  [SAUERLAND[0], SAUERLAND[1] - 0.3],
];

describe('the watch line of a patrol', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  it('sights an enemy column at the point it crosses, without its pile, and the dispatch says so', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    await patrolling(t, seat);
    await arriveNext(t);
    const departed = Date.now();
    await enemyColumn(t, guest, ...ACROSS, HOUR);

    const [sighting, ...more] = await sightingsOf(t, seat);
    expect(more).toEqual([]);
    expect(sighting).toMatchObject({
      detector: 'patrol',
      detectorId: null,
      detectorHostCountry: 'DEU',
    });
    expect(sighting!.from).toBe(sighting!.to);
    expect(sighting!.from).toBeGreaterThan(departed + 0.45 * HOUR);
    expect(sighting!.from).toBeLessThan(departed + 0.55 * HOUR);
    expect(sighting!.stack).toBeUndefined();
    expect(await sightingsOf(t, guest)).toEqual([]);

    vi.setSystemTime(sighting!.from);
    await t.mutation(internal.movements.revealSighting, { sightingId: sighting!._id });
    await fileCrossings(t, seat);
    expect(await sighted(t)).toMatchObject([{ detector: 'patrol', hostCountry: 'DEU' }]);
  });

  /** **Décisions (02/11)** : chaque premier franchissement fait sa dépêche, même sur une colonne
   *  qu'une vigie relève déjà ; la ligne de relevé, elle, reste une. */
  it('files its own dispatch for a column a lookout already sights, once per line', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const { troop } = await patrolling(t, seat);
    await arriveNext(t);
    /** Partie dans la vigie d'Essen, elle coupe la liaison à quelque 45 km du point. */
    await enemyColumn(t, guest, [7.3, 51.6], [8.25, 51.08], HOUR);

    const [row, ...more] = await sightingsOf(t, seat);
    expect(more).toEqual([]);
    expect(row).toMatchObject({ detector: 'outpost' });
    expect(row!.crossings).toMatchObject([{ troopId: troop }]);
    expect(await sighted(t)).toMatchObject([{ detector: 'outpost' }]);

    await fileCrossings(t, seat);
    expect(await sighted(t)).toMatchObject([{ detector: 'outpost' }, { detector: 'patrol' }]);
    await t.run(async (ctx) => reassessDetection(ctx, (await ctx.db.get(troop))!.seasonId));
    await fileCrossings(t, seat);
    expect(await sighted(t)).toHaveLength(2);
  });

  it('keeps a due dispatch that a reading just past the crossing finds behind it', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const { troop } = await patrolling(t, seat);
    await arriveNext(t);
    await enemyColumn(t, guest, ...ACROSS, HOUR);
    const [row] = await sightingsOf(t, seat);
    vi.setSystemTime(row!.from + 1);
    await t.run(async (ctx) => reassessDetection(ctx, (await ctx.db.get(troop))!.seasonId));
    await fileCrossings(t, seat);
    expect(await sighted(t)).toMatchObject([{ detector: 'patrol' }]);
  });

  /** Revue de #377 : le second franchissement d'une même ligne n'étend pas le relevé — l'aller
   *  et le retour seraient un tronçon que personne n'a vu. */
  it('keeps the sighting at the first crossing when the column crosses the line back', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const { troop } = await patrolling(t, seat);
    await arriveNext(t);
    await enemyColumn(t, guest, ACROSS[0], ACROSS[1], 2 * HOUR, ACROSS[0]);
    const [first] = await sightingsOf(t, seat);
    expect(first!.from).toBeLessThan(Date.now() + HOUR);

    vi.setSystemTime(first!.from + 1);
    await t.run(async (ctx) => reassessDetection(ctx, (await ctx.db.get(troop))!.seasonId));
    const [row, ...more] = await sightingsOf(t, seat);
    expect(more).toEqual([]);
    expect(row).toMatchObject({ from: first!.from, to: first!.from });
    expect(row!.crossings).toHaveLength(1);
  });

  it('sights nothing that runs beside the line, nor past a disabled end', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const { kassel } = await patrolling(t, seat);
    await arriveNext(t);
    await enemyColumn(t, guest, [SAUERLAND[0] - 0.5, 51.9], [SAUERLAND[0] + 0.5, 51.9], HOUR);
    expect(await sightingsOf(t, seat)).toEqual([]);

    await t.run(async (ctx) => ctx.db.patch(kassel, { disabledUntil: Date.now() + 24 * HOUR }));
    await enemyColumn(t, guest, ...ACROSS, HOUR);
    expect(await sightingsOf(t, seat)).toEqual([]);
  });
});
