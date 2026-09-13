import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { bearingDegrees, distanceKm, type LonLat } from '../src/domain/geo';
import { INTERCEPTION_SAMPLES, positionAt } from '../src/domain/interception';
import type { UnitRole } from '../src/domain/ids';
import { COST_BY_MEDIUM } from '../src/domain/routing';
import {
  LISTENING_STATION_RADIUS_KM,
  RELAY_SPEED_MULTIPLIER,
  DETECTION_RANGE_KM,
  detectionRangeOf,
  outpostReachKm,
  nominalStrength,
  routeMinutes,
} from './constants';
import { regionFacts } from './regions';
import { hostAtPoint, routeBetween } from './routes';
import { reassessDetection } from './movement/detection';
import schema from './schema';
import { modules } from './test.setup';
import { foundSeat, joinSeat, seatIn } from './seats.fixture';
import type { Seat } from './seats.fixture';

/**
 * **Les détecteurs de la fiche 04 font ce qu'ils vendent.** Le territoire, la station d'écoute,
 * l'avant-poste d'écoute et les troupes posées ou mobiles maintiennent une sortie identique — un
 * fil, un cap, une fenêtre — et jamais le type ni la nation. Le relais logistique, lui, accélère
 * la route de son propriétaire.
 */
const boot = () => convexTest(schema, modules);

const MARNE = 'FRA-5323';
const PRAHOVA = 'ROU-310';

/** Away from anyone's rest window: a held arrival would change the hours the relay is read on. */
const MIDDAY = new Date(2026, 7, 17, 12, 0, 0);

const asPoint = (point: LonLat) => ({ lon: point[0], lat: point[1] });
const pointOf = (regionId: string): LonLat => regionFacts(regionId)!.point;

const eastOf = (point: LonLat, km: number): LonLat => [
  point[0] + km / (111.32 * Math.cos((point[1] * Math.PI) / 180)),
  point[1],
];
const northOf = (point: LonLat, km: number): LonLat => [point[0], point[1] + km / 111.32];

describe('role detection ranges', () => {
  it('gives a stack its best role without adding ranges', () => {
    expect(detectionRangeOf(['infantry', 'fighter', 'cargo'])).toBe(DETECTION_RANGE_KM.fighter);
    expect(detectionRangeOf([])).toBe(0);
  });
});

/** Walked exactly as the detector walks it — `positionAt` over the sampled road — because the
 *  stored polyline is simplified and its vertices alone would read a road as further away than
 *  the one the fog actually measures. */
const nearestApproach = (points: ReadonlyArray<LonLat>, to: LonLat): number => {
  const road = { id: 'road', points, departedAt: 0, arrivesAt: 1 };
  let closest = Infinity;
  for (let index = 0; index <= INTERCEPTION_SAMPLES; index += 1) {
    closest = Math.min(closest, distanceKm(positionAt(road, index / INTERCEPTION_SAMPLES), to));
  }
  return closest;
};

async function launchedSeason(t: ReturnType<typeof boot>) {
  const { seat, code } = await foundSeat(t, 'Pierre', 48, 0.5);
  const guest = await joinSeat(t, code, 'Léa');
  await t.mutation(api.players.reserveNation, { ...seat, nation: 'france' });
  await t.mutation(api.players.declareReady, { ...seat, ready: true });
  await t.mutation(api.players.reserveNation, { ...guest, nation: 'ussr' });
  await t.mutation(api.players.declareReady, { ...guest, ready: true });
  await t.mutation(api.seasons.launch, seat);
  return { seat, guest };
}

async function playerOf(t: ReturnType<typeof boot>, seat: Seat): Promise<Id<'players'>> {
  return t.run(async (ctx) => {
    const player = await seatIn(ctx, seat);
    return player._id;
  });
}

async function form(
  t: ReturnType<typeof boot>,
  seat: Seat,
  role: UnitRole,
  stationedAt: Id<'buildings'> | null,
): Promise<Id<'troops'>> {
  const playerId = await playerOf(t, seat);
  const strength = nominalStrength(role, 1);
  return t.run(async (ctx) => {
    const seasonId = (await ctx.db.get(playerId))!.seasonId;
    return ctx.db.insert('troops', {
      seasonId,
      playerId,
      role,
      tier: 1,
      nominalStrength: strength,
      currentStrength: strength,
      stationedAt,
    });
  });
}

/** A column standing on plain ground, which is both a legal origin (ADR 0019 §1) and the one
 *  way to draw a road wherever a test needs it rather than wherever geography puts it. */
async function column(t: ReturnType<typeof boot>, seat: Seat, at: LonLat) {
  const troopId = await form(t, seat, 'infantry', null);
  await t.run(async (ctx) => ctx.db.patch(troopId, { stationedAt: asPoint(at) }));
  return { troopIds: [troopId], origin: { kind: 'point' as const, point: asPoint(at) } };
}

async function station(t: ReturnType<typeof boot>, seat: Seat, regionId: string) {
  const playerId = await playerOf(t, seat);
  return t.run(async (ctx) => {
    const seasonId = (await ctx.db.get(playerId))!.seasonId;
    return ctx.db.insert('buildings', { seasonId, playerId, key: 'listening', regionId, level: 1 });
  });
}

async function outpost(
  t: ReturnType<typeof boot>,
  seat: Seat,
  at: LonLat,
  specialization: Doc<'outposts'>['specialization'],
  disabledUntil: number | null = null,
) {
  const playerId = await playerOf(t, seat);
  return t.run(async (ctx) => {
    const seasonId = (await ctx.db.get(playerId))!.seasonId;
    return ctx.db.insert('outposts', {
      seasonId,
      playerId,
      point: asPoint(at),
      hostCountry: 'ROU',
      level: 1,
      specialization,
      foundedAt: Date.now(),
      disabledUntil,
      immuneUntil: null,
    });
  });
}

async function sightingsOf(t: ReturnType<typeof boot>, seat: Seat) {
  const playerId = await playerOf(t, seat);
  return t.run(async (ctx) =>
    ctx.db
      .query('sightings')
      .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
      .collect(),
  );
}

async function moving(
  t: ReturnType<typeof boot>,
  seat: Seat,
  troopId: Id<'troops'>,
  type: 'march' | 'attack' | 'raid' | 'return',
  from: LonLat,
  to: LonLat,
  durationMs: number,
) {
  const playerId = await playerOf(t, seat);
  return t.run(async (ctx) => {
    const seasonId = (await ctx.db.get(playerId))!.seasonId;
    const distanceUnits = distanceKm(from, to);
    const movementId = await ctx.db.insert('movements', {
      seasonId,
      playerId,
      type,
      fromBuildingId: null,
      target: { kind: 'point', point: asPoint(to) },
      from: asPoint(from),
      to: asPoint(to),
      hostCountry: hostAtPoint(to),
      points: [asPoint(from), asPoint(to)],
      legs: [{ medium: 'land', distanceUnits }],
      distanceUnits,
      costUnits: distanceUnits * COST_BY_MEDIUM.land,
      landCost: COST_BY_MEDIUM.land,
      troopIds: [troopId],
      departedAt: Date.now(),
      arrivesAt: Date.now() + durationMs,
    });
    await ctx.db.patch(troopId, { stationedAt: null });
    await reassessDetection(ctx, seasonId);
    return movementId;
  });
}

describe('what sees a movement go past', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  /**
   * **La station d'écoute écoute depuis le point de sa région**, et sur un rayon à elle. La
   * route est tirée à distance choisie de ce point plutôt que laissée à la géographie : c'est
   * le rayon qu'on mesure ici, pas le tracé de Dijkstra.
   */
  it('files a sighting for a listening station the road passes inside of', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    await station(t, guest, PRAHOVA);

    const here = pointOf(PRAHOVA);
    const from = eastOf(northOf(here, 100), -150);
    const to = eastOf(northOf(here, 100), 150);
    expect(nearestApproach(routeBetween(from, to, 'land')!.points, here)).toBeLessThan(
      LISTENING_STATION_RADIUS_KM,
    );

    const { troopIds, origin } = await column(t, seat, from);
    await t.mutation(api.movements.marchTo, { ...seat, origin, troopIds, point: asPoint(to) });

    expect(await sightingsOf(t, guest)).toMatchObject([{ detector: 'station' }]);
  });

  it('files nothing for a station the road stays outside of', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    await station(t, guest, PRAHOVA);

    const here = pointOf(PRAHOVA);
    const from = eastOf(northOf(here, 220), -150);
    const to = eastOf(northOf(here, 220), 150);
    expect(nearestApproach(routeBetween(from, to, 'land')!.points, here)).toBeGreaterThan(
      LISTENING_STATION_RADIUS_KM,
    );

    const { troopIds, origin } = await column(t, seat, from);
    await t.mutation(api.movements.marchTo, { ...seat, origin, troopIds, point: asPoint(to) });

    expect(await sightingsOf(t, guest)).toEqual([]);
  });

  /**
   * **Ce qu'un avant-poste ravitaille, il l'écoute** : son rayon de détection est son rayon
   * d'action — cent vingt kilomètres pour un point de niveau 1 depuis le 31/08, et non plus
   * quatre cents. Et **un détecteur désactivé n'écoute pas** — c'est le second sens du raid
   * (ADR 0018 §6).
   */
  it('files a sighting for a listening outpost the road passes inside of', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const here = pointOf(PRAHOVA);
    await outpost(t, guest, here, 'listening');

    const from = eastOf(northOf(here, 60), -150);
    const to = eastOf(northOf(here, 60), 150);
    expect(nearestApproach(routeBetween(from, to, 'land')!.points, here)).toBeLessThan(
      outpostReachKm(1),
    );

    const { troopIds, origin } = await column(t, seat, from);
    await t.mutation(api.movements.marchTo, { ...seat, origin, troopIds, point: asPoint(to) });

    expect(await sightingsOf(t, guest)).toMatchObject([{ detector: 'outpost' }]);
  });

  it('files nothing for a listening outpost a raid has put out of service', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const here = pointOf(PRAHOVA);
    await outpost(t, guest, here, 'listening', Date.now() + 6 * 3_600_000);

    const from = eastOf(northOf(here, 60), -150);
    const to = eastOf(northOf(here, 60), 150);

    const { troopIds, origin } = await column(t, seat, from);
    await t.mutation(api.movements.marchTo, { ...seat, origin, troopIds, point: asPoint(to) });

    expect(await sightingsOf(t, guest)).toEqual([]);
  });

  /**
   * **Le territoire n'a pas de rayon : c'est le sol lui-même.** Une colonne qui traverse le sol
   * d'un joueur y est relevée sans que rien de lui n'y soit bâti — c'est le premier détecteur de
   * la fiche 04, et le seul qui ne soit pas une chose posée.
   */
  it('files a sighting for the soil a road crosses, with nothing standing on it', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const soviet = pointOf('RUS-2335');

    const { troopIds, origin } = await column(t, seat, eastOf(soviet, -300));
    await t.mutation(api.movements.marchTo, {
      ...seat,
      origin,
      troopIds,
      point: asPoint(eastOf(soviet, 300)),
    });

    expect(await sightingsOf(t, guest)).toMatchObject([
      { detector: 'territory', detectorId: null },
    ]);
  });

  /** Celui qui marche ne lit jamais ce qu'on a vu de lui : le relevé n'existe que chez
   *  l'observateur, et ses propres détecteurs ne se relèvent pas lui-même. */
  it('never files a sighting against the mover himself', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const here = pointOf(PRAHOVA);
    await outpost(t, seat, here, 'listening');

    const from = eastOf(northOf(here, 100), -150);
    const { troopIds, origin } = await column(t, seat, from);
    await t.mutation(api.movements.marchTo, {
      ...seat,
      origin,
      troopIds,
      point: asPoint(eastOf(northOf(here, 100), 150)),
    });

    expect(await sightingsOf(t, seat)).toEqual([]);
    expect(await sightingsOf(t, guest)).toEqual([]);
  });
});

describe('event-driven mobile contact', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  it('lets an attack initiate one pass against a crossing march, never the same pass twice', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const attacker = await form(t, seat, 'fighter', null);
    const observer = await form(t, guest, 'fighter', null);
    const duration = 4 * 3_600_000;

    const attackId = await moving(t, seat, attacker, 'attack', [-2, 0], [2, 0], duration);
    const marchId = await moving(t, guest, observer, 'march', [0, -2], [0, 2], duration);
    const reserved = await t.run(async (ctx) => ctx.db.get(attackId));
    expect(reserved).toMatchObject({
      contactWithId: marchId,
      contactInitiatorId: attackId,
    });
    expect(reserved!.contactAt).toBeGreaterThan(Date.now());
    expect(await sightingsOf(t, seat)).toMatchObject([{ movementId: marchId, detector: 'troop' }]);
    expect(await sightingsOf(t, guest)).toMatchObject([
      { movementId: attackId, detector: 'troop' },
    ]);

    await t.run(async (ctx) => reassessDetection(ctx, reserved!.seasonId));
    const refreshed = await t.run(async (ctx) => ctx.db.get(attackId));
    vi.advanceTimersByTime(refreshed!.contactAt! - Date.now());
    await t.finishInProgressScheduledFunctions();

    expect(await t.run(async (ctx) => ctx.db.query('engagements').collect())).toHaveLength(1);
    await t.run(async (ctx) => reassessDetection(ctx, refreshed!.seasonId));
    await t.finishInProgressScheduledFunctions();
    expect(await t.run(async (ctx) => ctx.db.query('engagements').collect())).toHaveLength(1);
  });

  it('keeps two crossing marches observational', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const first = await form(t, seat, 'fighter', null);
    const second = await form(t, guest, 'fighter', null);
    const duration = 4 * 3_600_000;

    const firstId = await moving(t, seat, first, 'march', [-2, 0], [2, 0], duration);
    const secondId = await moving(t, guest, second, 'march', [0, -2], [0, 2], duration);
    const movements = await t.run(async (ctx) =>
      Promise.all([ctx.db.get(firstId), ctx.db.get(secondId)]),
    );
    expect(movements.every((movement) => movement!.contactJobId === undefined)).toBe(true);
  });

  it('adds a future sighting when a detector appears after departure', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const target = await form(t, guest, 'infantry', null);
    const movementId = await moving(t, guest, target, 'march', [0, 0], [4, 0], 4 * 3_600_000);
    expect(await sightingsOf(t, seat)).toEqual([]);

    const detector = await form(t, seat, 'infantry', null);
    await t.run(async (ctx) => {
      await ctx.db.patch(detector, { stationedAt: asPoint([2, 0]) });
      const movement = (await ctx.db.get(movementId))!;
      await reassessDetection(ctx, movement.seasonId);
    });

    const [sighting] = await sightingsOf(t, seat);
    expect(sighting).toMatchObject({ movementId, detector: 'troop' });
    expect(sighting!.from).toBeGreaterThan(Date.now());
  });

  it('cancels a future sighting when its detector leaves before the window', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const target = await form(t, guest, 'infantry', null);
    const movementId = await moving(t, guest, target, 'march', [0, 0], [4, 0], 4 * 3_600_000);
    const detector = await form(t, seat, 'infantry', null);
    await t.run(async (ctx) => {
      await ctx.db.patch(detector, { stationedAt: asPoint([2, 0]) });
      await reassessDetection(ctx, (await ctx.db.get(movementId))!.seasonId);
    });
    const [future] = await sightingsOf(t, seat);
    expect(future).toBeDefined();

    await moving(t, seat, detector, 'march', [2, 0], [2, 4], 4 * 3_600_000);
    expect(await sightingsOf(t, seat)).toEqual([]);
    vi.advanceTimersByTime(future!.from - Date.now());
    await t.finishInProgressScheduledFunctions();
    const playerId = await playerOf(t, seat);
    const notices = await t.run(async (ctx) =>
      ctx.db
        .query('notices')
        .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
        .collect(),
    );
    expect(notices.filter((notice) => notice.kind === 'movementSighted')).toEqual([]);
  });
});

/**
 * **Le relais logistique fait ce qu'il vend** (fiche 03) : la route de son propriétaire qui
 * passe dans son rayon se parcourt plus vite. L'aperçu et le départ passent par la même
 * fonction, donc ils datent l'arrivée à la même minute — c'est tout l'objet du partage.
 */
describe('what a logistics relay does to a departure', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  const road = () => {
    const from = pointOf(MARNE);
    const to = pointOf(PRAHOVA);
    return { from, to, route: routeBetween(from, to, 'land')! };
  };

  it('shortens a march whose road it covers, and the preview says the same minute', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const { from, to, route } = road();
    const plain = routeMinutes(route.costUnits);

    /** Standing on the road itself: what a relay covers is measured on the polyline, so a point
     *  the column actually walks past is the honest way to say "this road is watched". */
    await outpost(t, seat, route.points[Math.floor(route.points.length / 2)]!, 'relay');

    const { troopIds, origin } = await column(t, seat, from);
    const previewed = await t.query(api.movements.preview, {
      ...seat,
      origin,
      troopIds,
      target: { kind: 'point', point: asPoint(to) },
      type: 'march',
    });
    const sent = await t.mutation(api.movements.marchTo, {
      ...seat,
      origin,
      troopIds,
      point: asPoint(to),
    });

    expect(sent.minutes).toBeLessThan(plain);
    expect(sent.minutes).toBeGreaterThan(plain / RELAY_SPEED_MULTIPLIER - 1);
    expect(previewed!.minutes).toBe(sent.minutes);
    expect(previewed!.relayed).toBe(plain - sent.minutes);
  });

  it('leaves a march no relay of its owner watches at the ordinary pace', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const { from, to, route } = road();

    /** An opponent's relay carries nobody but him, and one of the mover's own standing far off
     *  the road carries nothing at all. */
    await outpost(t, guest, route.points[Math.floor(route.points.length / 2)]!, 'relay');
    await outpost(t, seat, [0, 40], 'relay');

    const { troopIds, origin } = await column(t, seat, from);
    const sent = await t.mutation(api.movements.marchTo, {
      ...seat,
      origin,
      troopIds,
      point: asPoint(to),
    });

    expect(sent.minutes).toBe(routeMinutes(route.costUnits));
  });

  it('does not speed up a march a relay out of service was covering', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const { from, to, route } = road();
    await outpost(
      t,
      seat,
      route.points[Math.floor(route.points.length / 2)]!,
      'relay',
      Date.now() + 6 * 3_600_000,
    );

    const { troopIds, origin } = await column(t, seat, from);
    const sent = await t.mutation(api.movements.marchTo, {
      ...seat,
      origin,
      troopIds,
      point: asPoint(to),
    });

    expect(sent.minutes).toBe(routeMinutes(route.costUnits));
  });
});

/**
 * **Un relevé sert le tronçon vu, le cap à la sortie et l'arrivée estimée — jamais la
 * destination** (fiche 04 révisée le 13/09/2026, décision 4a). Avant, `detectedArcs` servait le
 * fil entier et les deux extrémités déclarées : le premier guetteur venu apprenait où allait la
 * colonne, c'est-à-dire la seule chose que le brouillard est là pour garder.
 *
 * Le fil est droit et posé à la main (`moving`) : ce qui est mesuré ici est la troncature, pas le
 * zigzag d'un Dijkstra sur raster.
 */
describe('what a sighting serves of the thread', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  const HOUR = 3_600_000;
  const THREAD_KM = 1200;
  /** The window opens and closes well inside the trip: a sentry standing thirty kilometres off a
   *  straight thread sees about a hundred kilometres of it, out of twelve hundred. */
  const SENTRY_AT_KM = 300;
  const SENTRY_OFF_KM = 30;

  /** A posted troop rather than an outpost: an outpost of mine is **ground of mine**
   *  (`isAnchored`), and the detector would then answer the "coming for me" question by itself. */
  async function sentry(t: ReturnType<typeof boot>, seat: Seat, at: LonLat) {
    const troopId = await form(t, seat, 'infantry', null);
    await t.run(async (ctx) => ctx.db.patch(troopId, { stationedAt: asPoint(at) }));
    return troopId;
  }

  async function watchedMarch(t: ReturnType<typeof boot>, seat: Seat, guest: Seat) {
    const from = pointOf(MARNE);
    const to = eastOf(from, THREAD_KM);
    await sentry(t, guest, northOf(eastOf(from, SENTRY_AT_KM), SENTRY_OFF_KM));
    const troopId = await form(t, seat, 'infantry', null);
    await t.run(async (ctx) => ctx.db.patch(troopId, { stationedAt: asPoint(from) }));
    const movementId = await moving(t, seat, troopId, 'march', from, to, 6 * HOUR);
    const [window] = await sightingsOf(t, guest);
    expect(window).toBeDefined();
    /** Read inside the window, so the arc is the watched state and not yet a memory. */
    vi.advanceTimersByTime((window!.from + window!.to) / 2 - Date.now());
    return { from, to, movementId, window: window! };
  }

  it('serves the stretch between the two dates of the window, and no further', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const { from, to, window } = await watchedMarch(t, seat, guest);

    const [seen] = (await t.query(api.view.playerView, guest)).detected;
    expect(seen).toBeDefined();
    const served = seen!.points.map((point): LonLat => [point.lon, point.lat]);

    /** Every point served stands on the thread, between where the column was when the window
     *  opened and where it was when the window closed. */
    const thread = {
      id: 'thread',
      points: [from, to],
      departedAt: MIDDAY.getTime(),
      arrivesAt: MIDDAY.getTime() + 6 * HOUR,
    };
    const opened = positionAt(thread, window.from);
    const closed = positionAt(thread, window.to);
    expect(distanceKm(served[0]!, opened)).toBeLessThan(1);
    expect(distanceKm(served[served.length - 1]!, closed)).toBeLessThan(1);
    /** One step of the measuring walk is the tolerance: `nearestApproach` samples the thread, so
     *  a point sitting exactly on it still reads half a step away. */
    const step = THREAD_KM / INTERCEPTION_SAMPLES;
    for (const point of served) expect(nearestApproach([from, to], point)).toBeLessThan(step);

    /** **The destination is not served.** The far end of what travels is the end of the watch. */
    expect(distanceKm([seen!.to.lon, seen!.to.lat], to)).toBeGreaterThan(500);
    expect(distanceKm([seen!.to.lon, seen!.to.lat], closed)).toBeLessThan(1);
    expect(seen!.distanceUnits).toBeLessThan(THREAD_KM / 4);
  });

  it('serves the heading the column held on leaving the radius', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    await watchedMarch(t, seat, guest);

    const [seen] = (await t.query(api.view.playerView, guest)).detected;
    const served = seen!.points.map((point): LonLat => [point.lon, point.lat]);
    expect(seen!.headingDegrees).toBeCloseTo(
      bearingDegrees(served[served.length - 2]!, served[served.length - 1]!),
      6,
    );
    // Due east, on a thread that runs due east.
    expect(seen!.headingDegrees).toBeGreaterThan(80);
    expect(seen!.headingDegrees).toBeLessThan(100);
  });

  /** « Cap sur moi » sans destination : le cap prolongé sur ce qu'il reste à marcher tombe dans
   *  le rayon d'un de mes points, ou il ne tombe nulle part. C'est une estimation, et l'étiquette
   *  le dit déjà. */
  it('turns critical when the prolonged heading reaches ground of mine', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    await outpost(t, guest, eastOf(pointOf(MARNE), 800), 'relay');
    await watchedMarch(t, seat, guest);

    const [seen] = (await t.query(api.view.playerView, guest)).detected;
    expect(seen!.headingAtMe).toBe(true);
  });

  it('stays quiet for a column that passes beside me and points elsewhere', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    await outpost(t, guest, northOf(eastOf(pointOf(MARNE), 800), 400), 'relay');
    await watchedMarch(t, seat, guest);

    const [seen] = (await t.query(api.view.playerView, guest)).detected;
    expect(seen!.headingAtMe).toBe(false);
  });

  /**
   * **Le coût, mesuré.** Le calcul est par ligne `sightings` et non par mouvement : huit
   * mouvements vus valent huit échantillonnages bornés, et la vue reste du même ordre de
   * grandeur qu'avant la troncature — elle sert même moins de points, un tronçon n'étant qu'une
   * part du fil.
   */
  it('costs one bounded sampling per row, at eight movements watched', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const from = pointOf(MARNE);
    await sentry(t, guest, northOf(eastOf(from, SENTRY_AT_KM), SENTRY_OFF_KM));
    for (let index = 0; index < 8; index += 1) {
      const troopId = await form(t, seat, 'infantry', null);
      await t.run(async (ctx) => ctx.db.patch(troopId, { stationedAt: asPoint(from) }));
      await moving(t, seat, troopId, 'march', from, eastOf(from, THREAD_KM), 6 * HOUR);
    }
    const [window] = await sightingsOf(t, guest);
    vi.advanceTimersByTime((window!.from + window!.to) / 2 - Date.now());

    const view = await t.query(api.view.playerView, guest);

    expect(view.detected).toHaveLength(8);
    const served = view.detected.map((seen) => seen.points.length);
    /** Une trentaine de points par arc sur une fenêtre d'une demi-heure : ~un échantillon par
     *  minute de marche, borné à 96 + 1 quelle que soit la durée de la fenêtre. */
    expect(Math.max(...served)).toBeLessThanOrEqual(97);
    expect(served.reduce((sum, count) => sum + count, 0)).toBeLessThan(800);
  });
});
