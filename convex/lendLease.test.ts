import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import type { UnitRole } from '../src/domain/ids';
import type { LonLat } from '../src/domain/geo';
import { depotCapacity, nominalStrength } from './constants';
import { pointOfRegion } from './regions';
import { fileSurvey } from './surveys';
import schema from './schema';
import { modules } from './test.setup';
import { foundSeat, joinSeat, placeHq, seatIn, unclocked, type Seat } from './seats.fixture';

/**
 * **Le Prêt-bail** (ADR 0039 §3) : un transport américain livre au dépôt d'un avant-poste
 * étranger que son relevé garde, et le dépôt de l'autre ne se relit qu'à l'arrivée.
 */
const boot = () => convexTest({ schema, modules, transactionLimits: true });
type Bench = ReturnType<typeof boot>;

const MIDDAY = new Date(2026, 7, 17, 12, 0, 0);
const MARNE = 'FRA-5323';
const RUHR = 'DEU-1572';
const CHALONS: LonLat = [pointOfRegion(MARNE).lon, pointOfRegion(MARNE).lat];
const ESSEN: LonLat = [pointOfRegion(RUHR).lon, pointOfRegion(RUHR).lat];
const CAPACITY = depotCapacity(1, 'general');
const ammunition = (n: number) => ({ ammunition: n, oil: 0, coal: 0 });

const playerOf = (t: Bench, seat: Seat) => t.run(async (ctx) => (await seatIn(ctx, seat))._id);

/** Les États-Unis (`usa`) et la France (`france`), QG posés, sans troupe. */
async function launchedSeason(t: Bench) {
  const { seat, code } = await foundSeat(t, 'Pierre', 0.5);
  const guest = await joinSeat(t, code, 'Léa');
  await t.mutation(api.players.reserveNation, { ...seat, nation: 'usa' });
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
  return { usa: seat, france: guest };
}

async function plant(
  t: Bench,
  seat: Seat,
  point: LonLat,
  where: { hostCountry: string; regionId: string },
) {
  const playerId = await playerOf(t, seat);
  return t.run(async (ctx) =>
    ctx.db.insert('outposts', {
      seasonId: (await ctx.db.get(playerId))!.seasonId,
      playerId,
      point: { lon: point[0], lat: point[1] },
      ...where,
      level: 1,
      foundedAt: Date.now() - 1,
      disabledUntil: null,
      immuneUntil: null,
    }),
  );
}

async function form(t: Bench, seat: Seat, role: UnitRole, stationedAt: Id<'outposts'>) {
  const playerId = await playerOf(t, seat);
  return t.run(async (ctx) =>
    ctx.db.insert('troops', {
      seasonId: (await ctx.db.get(playerId))!.seasonId,
      playerId,
      role,
      tier: 1,
      nominalStrength: nominalStrength(role, 1),
      currentStrength: nominalStrength(role, 1),
      stationedAt,
    }),
  );
}

/** Ce qu'une portée posée à ce point relève, comme un événement l'écrirait. */
const survey = async (t: Bench, seat: Seat, point: LonLat) => {
  const playerId = await playerOf(t, seat);
  await t.run(async (ctx) => {
    await fileSurvey(ctx, playerId, [{ point, radiusKm: 1 }], Date.now());
  });
};

/** Un camion américain chargé à son avant-poste de la Ruhr, et un point français à Châlons. */
async function scene(t: Bench, held = 150) {
  const { usa, france } = await launchedSeason(t);
  const base = await plant(t, usa, ESSEN, { hostCountry: 'DEU', regionId: RUHR });
  const truck = await form(t, usa, 'landTransport', base);
  await t.run(async (ctx) => ctx.db.patch(truck, { load: ammunition(held) }));
  const depot = await plant(t, france, CHALONS, { hostCountry: 'FRA', regionId: MARNE });
  return { usa, france, base, truck, depot };
}

const delivering = (
  t: Bench,
  seat: Seat,
  base: Id<'outposts'>,
  troopIds: Id<'troops'>[],
  outpostId: Id<'outposts'>,
) =>
  t.mutation(api.logistics.deliver, {
    ...seat,
    origin: { kind: 'outpost', outpostId: base },
    troopIds,
    outpostId,
  });

const arrive = async (t: Bench, arrivesAt: number) => {
  vi.setSystemTime(arrivesAt + 1);
  const movement = (await t.run(async (ctx) => ctx.db.query('movements').collect()))[0]!;
  await t.mutation(internal.movements.arrive, { movementId: movement._id });
};

const noticesOf = (t: Bench, seat: Seat, kind: string) =>
  t.run(async (ctx) => {
    const player = await seatIn(ctx, seat);
    return (
      await ctx.db
        .query('notices')
        .withIndex('byPlayer', (q) => q.eq('playerId', player._id))
        .collect()
    ).filter((notice) => notice.kind === kind);
  });

describe('lend-lease (ADR 0039 §3)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  it('keeps a standing foreign outpost in the survey: its id, point and host country, nothing more', async () => {
    const t = boot();
    const { usa, france, depot } = await scene(t);
    const building = await plant(t, france, [CHALONS[0] + 0.05, CHALONS[1]], {
      hostCountry: 'FRA',
      regionId: MARNE,
    });
    await t.run(async (ctx) => ctx.db.patch(building, { standsAt: Date.now() + 3_600_000 }));
    await survey(t, usa, CHALONS);

    const seen = (await t.query(api.view.playerView, usa)).surveyedOutposts;
    expect(seen).toEqual([{ id: depot, regionId: MARNE, point: CHALONS, hostCountry: 'FRA' }]);
    expect((await t.query(api.view.playerView, france)).surveyedOutposts).toEqual([]);
  });

  it('teaches nothing of a foreign outpost to a player who has not surveyed it', async () => {
    const t = boot();
    const { usa, base, truck, depot } = await scene(t);
    const gone = await plant(t, usa, CHALONS, { hostCountry: 'FRA', regionId: MARNE });
    await t.run(async (ctx) => ctx.db.delete(gone));

    expect((await t.query(api.view.playerView, usa)).surveyedOutposts).toEqual([]);
    const unseen = await delivering(t, usa, base, [truck], depot).catch((error) => error.data);
    const missing = await delivering(t, usa, base, [truck], gone).catch((error) => error.data);
    expect(unseen.code).toBe('UNKNOWN_OUTPOST');
    expect(missing.code).toBe('UNKNOWN_OUTPOST');
  });

  it('delivers what the depot holds room for, drives home with the rest, and tells each side its share', async () => {
    const t = boot();
    const { usa, france, base, truck, depot } = await scene(t);
    await t.run(async (ctx) => ctx.db.patch(depot, { depot: ammunition(CAPACITY - 50) }));
    await survey(t, usa, CHALONS);

    const { arrivesAt } = await delivering(t, usa, base, [truck], depot);
    await arrive(t, arrivesAt);

    expect((await t.run(async (ctx) => ctx.db.get(depot)))!.depot).toEqual(ammunition(CAPACITY));
    const sent = await noticesOf(t, usa, 'supplyDelivered');
    expect(sent).toMatchObject([
      { abroad: true, hostCountry: 'FRA', delivered: ammunition(50), kept: ammunition(100) },
    ]);
    /** La dépêche du convoi dit le lieu, jamais le teneur. */
    expect(Object.keys(sent[0]!)).not.toContain('nation');
    expect(await noticesOf(t, france, 'lendLeaseReceived')).toMatchObject([
      { nation: 'usa', hostCountry: 'FRA', delivered: ammunition(50) },
    ]);
    const movements = await t.run(async (ctx) => ctx.db.query('movements').collect());
    expect(movements).toMatchObject([{ type: 'return', troopIds: [truck] }]);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const back = (await t.run(async (ctx) => ctx.db.get(truck)))!;
    expect(back.load).toEqual(ammunition(100));
    expect(back.stationedAt).toBe(base);
  });

  it('refuses every other nation, and a column carrying anything but transports', async () => {
    const t = boot();
    const { usa, france, base, truck, depot } = await scene(t);
    const frenchTruck = await form(t, france, 'landTransport', depot);
    await t.run(async (ctx) => ctx.db.patch(frenchTruck, { load: ammunition(50) }));
    await survey(t, france, ESSEN);
    await survey(t, usa, CHALONS);
    const rifles = await form(t, usa, 'infantry', base);
    await t.run(async (ctx) => ctx.db.patch(rifles, { carriedBy: truck }));

    await expect(delivering(t, france, depot, [frenchTruck], base)).rejects.toThrow(
      'FOREIGN_DEPOT',
    );
    await expect(delivering(t, usa, base, [truck], depot)).rejects.toThrow(
      'LEND_LEASE_TRANSPORTS_ONLY',
    );
  });

  it('reads a full or dismantled depot only at arrival: the convoy brings everything home, and the holder learns nothing', async () => {
    const t = boot();
    const { usa, france, base, truck, depot } = await scene(t);
    await t.run(async (ctx) => ctx.db.patch(depot, { depot: ammunition(CAPACITY) }));
    await survey(t, usa, CHALONS);

    const full = await delivering(t, usa, base, [truck], depot);
    await arrive(t, full.arrivesAt);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await t.run(async (ctx) => ctx.db.get(truck)))!.load).toEqual(ammunition(150));

    await t.run(async (ctx) => ctx.db.delete(depot));
    const gone = await delivering(t, usa, base, [truck], depot);
    await arrive(t, gone.arrivesAt);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await t.run(async (ctx) => ctx.db.get(truck)))!.load).toEqual(ammunition(150));

    expect(await noticesOf(t, usa, 'supplyDelivered')).toMatchObject([
      { abroad: true, delivered: ammunition(0), kept: ammunition(150) },
      { abroad: true, delivered: ammunition(0), kept: ammunition(150) },
    ]);
    expect(await noticesOf(t, france, 'lendLeaseReceived')).toEqual([]);
  });

  it('delivers as at home when the point became American on the way', async () => {
    const t = boot();
    const { usa, base, truck, depot } = await scene(t);
    await survey(t, usa, CHALONS);

    const { arrivesAt } = await delivering(t, usa, base, [truck], depot);
    const american = await playerOf(t, usa);
    await t.run(async (ctx) => ctx.db.patch(depot, { playerId: american }));
    await arrive(t, arrivesAt);

    expect((await t.run(async (ctx) => ctx.db.get(depot)))!.depot).toEqual(ammunition(150));
    const [notice] = await noticesOf(t, usa, 'supplyDelivered');
    expect(notice).toMatchObject({ delivered: ammunition(150) });
    expect(notice).not.toHaveProperty('abroad');
  });

  /**
   * **Un avant-poste relevé se vise à son relevé** : démantelé depuis, l'aperçu ne lève pas et ne
   * dit pas qu'il a disparu — c'est l'arrivée qui ne trouve personne.
   */
  it('aims a surveyed outpost dismantled since at its surveyed point, and the column finds nobody', async () => {
    const t = boot();
    const { usa, base, depot } = await scene(t);
    const rifles = await form(t, usa, 'infantry', base);
    await survey(t, usa, CHALONS);
    await t.run(async (ctx) => ctx.db.delete(depot));
    const order = {
      ...usa,
      origin: { kind: 'outpost' as const, outpostId: base },
      troopIds: [rifles],
    };
    const target = { kind: 'outpost' as const, outpostId: depot };

    const raid = await t.query(api.movements.preview, { ...order, type: 'raid', target });
    expect(raid).toMatchObject({ destinationName: 'FRA' });
    expect(await t.query(api.movements.previewCapture, { ...order, target })).not.toBeNull();
    await expect(
      t.mutation(api.movements.enterOutpost, { ...order, outpostId: depot }),
    ).rejects.toThrow('POINT_TARGET_ONLY');

    const { arrivesAt } = await t.mutation(api.movements.raid, { ...order, outpostId: depot });
    await arrive(t, arrivesAt);
    expect(await noticesOf(t, usa, 'columnFoundNothing')).toMatchObject([
      { movementType: 'raid', hostCountry: 'FRA' },
    ]);
  });
});
