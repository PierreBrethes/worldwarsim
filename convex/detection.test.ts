import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { bearingDegrees, distanceKm, type LonLat } from '../src/domain/geo';
import { INTERCEPTION_SAMPLES, positionAt } from '../src/domain/interception';
import type { UnitRole } from '../src/domain/ids';
import { COST_BY_MEDIUM } from '../src/domain/routing';
import {
  LAST_KNOWN_HOURS,
  LISTENING_STATION_RADIUS_KM,
  RELAY_SPEED_MULTIPLIER,
  DETECTION_RANGE_KM,
  detectionRangeOf,
  outpostReachKm,
  nominalStrength,
  RANGOON_SIGHTING_SHARE,
  routeMinutes,
  sightingReachKm,
} from './constants';
import { allRegions, regionFacts, pointOfRegion } from './regions';
import { hostAtPoint, landAtPoint, routeBetween } from './routes';
import { reassessDetection } from './movement/detection';
import { lookoutKmOf } from '../src/domain/outposts';
import { pacedMinutes } from './movement/pace';
import { settle } from './resources';
import { forgetMovement } from './movement/arrival';
import { handOver } from './strategicPoints';
import { neutralPoint } from './seats.fixture';
import schema from './schema';
import { modules } from './test.setup';
import { foundSeat, holdPoint, joinSeat, seatIn } from './seats.fixture';
import type { Seat } from './seats.fixture';

/**
 * **Les détecteurs de la fiche 04 font ce qu'ils vendent.** Le territoire, la station d'écoute,
 * l'avant-poste d'écoute et les troupes posées ou mobiles maintiennent une sortie identique — un
 * fil, un cap, une fenêtre — et jamais le type ni la nation. Le relais logistique, lui, accélère
 * la route de son propriétaire.
 */
const boot = () => convexTest({ schema, modules, transactionLimits: true });

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
    expect(detectionRangeOf(['infantry', 'fighter', 'cargo'], null)).toBe(
      DETECTION_RANGE_KM.fighter,
    );
    expect(detectionRangeOf([], null)).toBe(0);
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
  const { seat, code } = await foundSeat(t, 'Pierre', 0.5);
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
    return ctx.db.insert('buildings', {
      seasonId,
      playerId,
      key: 'listening',
      regionId,
      point: pointOfRegion(regionId),
      level: 1,
    });
  });
}

async function outpost(
  t: ReturnType<typeof boot>,
  seat: Seat,
  at: LonLat,
  disabledUntil: number | null = null,
  /** **En chantier jusque-là** (révision du 15/09) : un point qui n'est pas levé n'écoute pas.
   *  Omis, le point est debout — le repli de `isStanding` est `foundedAt`. */
  standsAt?: number,
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
      foundedAt: Date.now(),
      ...(standsAt === undefined ? {} : { standsAt }),
      disabledUntil,
      immuneUntil: null,
    });
  });
}

/** Le stock national de charbon à zéro, sous un débit qui brûle encore — et le réveil que le jeu
 *  aurait pris à cet instant (`players.dryJob`), puisque le stock est écrit à la main. */
async function dryCoal(t: ReturnType<typeof boot>, seat: Seat) {
  const playerId = await playerOf(t, seat);
  await t.run(async (ctx) => {
    for (const row of await ctx.db
      .query('resources')
      .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
      .collect()) {
      await ctx.db.patch(row._id, {
        stock: row.key === 'coal' ? 0 : row.stock,
        updatedAt: Date.now(),
      });
    }
  });
  await t.mutation(internal.listening.reassess, { playerId });
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

  /** **A post with no coal hears nothing** (ADR 0028 §1), and the view says so. */
  it('files nothing for a station that has run out of coal, and serves it silent', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    await station(t, guest, PRAHOVA);
    await dryCoal(t, guest);

    const here = pointOf(PRAHOVA);
    const from = eastOf(northOf(here, 100), -150);
    const to = eastOf(northOf(here, 100), 150);
    const { troopIds, origin } = await column(t, seat, from);
    await t.mutation(api.movements.marchTo, { ...seat, origin, troopIds, point: asPoint(to) });

    expect(await sightingsOf(t, guest)).toEqual([]);
    expect((await t.query(api.view.playerView, guest)).me.upkeep.listeningSilent).toBe(true);
  });

  it('serves a station with coal in the stock as hearing', async () => {
    const t = boot();
    const { guest } = await launchedSeason(t);
    await station(t, guest, PRAHOVA);

    expect((await t.query(api.view.playerView, guest)).me.upkeep.listeningSilent).toBe(false);
  });

  /**
   * **Tout avant-poste guette, à mi-rayon** (ADR 0037 §1, §2) : soixante kilomètres pour un point
   * de niveau 1, sans métier à choisir. Et **un détecteur désactivé ne guette pas** — c'est le
   * second sens du raid (ADR 0018 §6).
   */
  it('files a sighting for any standing outpost whose lookout the road passes inside of', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const here = pointOf(PRAHOVA);
    await outpost(t, guest, here);

    const from = eastOf(northOf(here, 30), -150);
    const to = eastOf(northOf(here, 30), 150);
    expect(nearestApproach(routeBetween(from, to, 'land')!.points, here)).toBeLessThan(
      lookoutKmOf({ level: 1 }),
    );

    const { troopIds, origin } = await column(t, seat, from);
    await t.mutation(api.movements.marchTo, { ...seat, origin, troopIds, point: asPoint(to) });

    expect(await sightingsOf(t, guest)).toMatchObject([{ detector: 'outpost' }]);
  });

  /**
   * **Le Guet guette au rayon entier** (ADR 0037 §5), et **en généraliste dès le départ d'un
   * chantier de changement** (§7, décision du 01/11) : le départ relit ses seuls détecteurs, et le
   * relevé que sa vigie entière promettait s'efface.
   */
  it('watches the whole reach as a Guet, and only half of it once a change of trade starts', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const here = pointOf(PRAHOVA);
    const guet = await outpost(t, guest, here);
    await t.run(async (ctx) => ctx.db.patch(guet, { level: 2, specialty: 'lookout' }));

    const from = eastOf(northOf(here, 150), -250);
    const to = eastOf(northOf(here, 150), 250);
    const approach = nearestApproach(routeBetween(from, to, 'land')!.points, here);
    expect(approach).toBeGreaterThan(lookoutKmOf({ level: 2 }));
    expect(approach).toBeLessThan(lookoutKmOf({ level: 2, specialty: 'lookout' }));

    const { troopIds, origin } = await column(t, seat, from);
    await t.mutation(api.movements.marchTo, { ...seat, origin, troopIds, point: asPoint(to) });
    expect(await sightingsOf(t, guest)).toMatchObject([{ detector: 'outpost' }]);

    const guestId = await playerOf(t, guest);
    await t.run(async (ctx) => {
      for (const row of await ctx.db
        .query('resources')
        .withIndex('byPlayer', (q) => q.eq('playerId', guestId))
        .collect())
        if (row.key === 'steel') await ctx.db.patch(row._id, { stock: 1000 });
    });
    await t.mutation(api.constructions.respecializeOutpost, {
      ...guest,
      outpostId: guet,
      specialty: 'fort',
    });
    expect(await sightingsOf(t, guest)).toEqual([]);
  });

  it('files nothing for a road inside the reach of an outpost but outside its lookout', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const here = pointOf(PRAHOVA);
    await outpost(t, guest, here);

    const from = eastOf(northOf(here, 90), -150);
    const to = eastOf(northOf(here, 90), 150);
    const approach = nearestApproach(routeBetween(from, to, 'land')!.points, here);
    expect(approach).toBeGreaterThan(lookoutKmOf({ level: 1 }));
    expect(approach).toBeLessThan(outpostReachKm(1));

    const { troopIds, origin } = await column(t, seat, from);
    await t.mutation(api.movements.marchTo, { ...seat, origin, troopIds, point: asPoint(to) });

    expect(await sightingsOf(t, guest)).toEqual([]);
  });

  /** **À court de charbon, toutes les vigies se taisent ensemble** (ADR 0037 §2) : le stock est
   *  national, le silence aussi. */
  it('blinds an outpost lookout when the national coal runs dry, and serves it silent', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const here = pointOf(PRAHOVA);
    await outpost(t, guest, here);
    await dryCoal(t, guest);

    const from = eastOf(northOf(here, 30), -150);
    const to = eastOf(northOf(here, 30), 150);
    const { troopIds, origin } = await column(t, seat, from);
    await t.mutation(api.movements.marchTo, { ...seat, origin, troopIds, point: asPoint(to) });

    expect(await sightingsOf(t, guest)).toEqual([]);
    expect((await t.query(api.view.playerView, guest)).me.upkeep.listeningSilent).toBe(true);
  });

  /** **Le verdict se tient sur la ligne du joueur**, écrit par sa seule réévaluation et seulement
   *  quand il change : une écriture sur `players` refait toutes les vues de la saison. */
  it('writes a player’s silence on his row when it changes, and only then', async () => {
    const t = boot();
    const { guest } = await launchedSeason(t);
    await outpost(t, guest, pointOf(PRAHOVA));
    const guestId = await playerOf(t, guest);
    const row = () => t.run(async (ctx) => (await ctx.db.get(guestId))!);

    await dryCoal(t, guest);
    const silent = await row();
    expect(silent.listeningSilent).toBe(true);

    await t.mutation(internal.listening.reassess, { playerId: guestId });
    expect(await row()).toEqual(silent);
  });

  /** Le siège irrégulier ne tient aucun stock : les points qu'il hérite d'une chute sont aveugles. */
  it('files nothing for an outpost held by the irregular seat', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const here = pointOf(PRAHOVA);
    await outpost(t, guest, here);
    const irregular = await playerOf(t, guest);
    await t.run(async (ctx) => ctx.db.patch(irregular, { irregular: true }));

    const from = eastOf(northOf(here, 30), -150);
    const to = eastOf(northOf(here, 30), 150);
    const { troopIds, origin } = await column(t, seat, from);
    await t.mutation(api.movements.marchTo, { ...seat, origin, troopIds, point: asPoint(to) });

    expect(await sightingsOf(t, guest)).toEqual([]);
  });

  /** Un chantier n'écoute pas : le point n'existe pas encore (révision du 15/09). */
  it('files nothing for a listening outpost still under construction', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const here = pointOf(PRAHOVA);
    await outpost(t, guest, here, null, Date.now() + 3_600_000);

    const from = eastOf(northOf(here, 60), -150);
    const to = eastOf(northOf(here, 60), 150);

    const { troopIds, origin } = await column(t, seat, from);
    await t.mutation(api.movements.marchTo, { ...seat, origin, troopIds, point: asPoint(to) });

    expect(await sightingsOf(t, guest)).toEqual([]);
  });

  it('files nothing for a listening outpost a raid has put out of service', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const here = pointOf(PRAHOVA);
    await outpost(t, guest, here, Date.now() + 6 * 3_600_000);

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

    /** **250 km et pas 300** : la grille tient le lac Peïpous pour de l'eau à 300, et depuis le
     *  18/09 une colonne terrestre mouillée ne part plus (`NO_HULL_AT_SEA`). Ce que le cas mesure
     *  est la route, pas le rivage. */
    const { troopIds, origin } = await column(t, seat, eastOf(soviet, -250));
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

  /**
   * **Rangoun : vos tournées se relèvent à mi-portée** (ADR 0032). Un transport en tournée, en
   * marche ou posé, n'est relevé par un détecteur qu'à sa part de portée tant que son maître tient
   * le point — et de nouveau à portée entière dès qu'il le perd.
   */
  describe('Rangoon', () => {
    const R = LISTENING_STATION_RADIUS_KM;

    /** Un camion de tournée qui passe à `km` au nord de la station soviétique de Prahova. */
    async function touringPast(km: number, holdsRangoon: boolean) {
      const t = boot();
      const { seat, guest } = await launchedSeason(t);
      await station(t, guest, PRAHOVA);
      if (holdsRangoon) await holdPoint(t, seat, 'rangoon');
      const here = pointOf(PRAHOVA);
      const base = await outpost(t, seat, eastOf(here, -600));
      const truck = await form(t, seat, 'landTransport', null);
      await t.run((ctx) =>
        ctx.db.patch(truck, {
          tour: { base, stops: [], consigne: { ammunition: 0, oil: 0, coal: 0 }, next: 0 },
        }),
      );
      const road = northOf(here, km);
      await moving(t, seat, truck, 'march', eastOf(road, -150), eastOf(road, 150), 3_600_000);
      return { t, seat, guest };
    }
    const open = async (t: ReturnType<typeof boot>, seat: Seat) =>
      (await sightingsOf(t, seat)).filter((row) => row.to > Date.now());

    it('reads half a detector’s reach against a tour of the holder, and the whole of it otherwise', () => {
      expect(sightingReachKm(R, true)).toBe(R * RANGOON_SIGHTING_SHARE);
      expect(RANGOON_SIGHTING_SHARE).toBe(0.5);
      expect(sightingReachKm(R, false)).toBe(R);
    });

    it('sights a tour passing inside half the reach', async () => {
      const { t, guest } = await touringPast(R * 0.25, true);
      expect(await open(t, guest)).toMatchObject([{ detector: 'station' }]);
    });

    it('does not sight a tour passing between half the reach and the whole of it', async () => {
      const { t, guest } = await touringPast(R * 0.75, true);
      expect(await sightingsOf(t, guest)).toEqual([]);
    });

    it('sights the same tour at full reach when nobody holds the point', async () => {
      const { t, guest } = await touringPast(R * 0.75, false);
      expect(await open(t, guest)).toHaveLength(1);
    });

    it('re-reads the tour under way when the point changes hands, with no reassessment by hand', async () => {
      const { t, seat, guest } = await touringPast(R * 0.75, false);
      expect(await open(t, guest)).toHaveLength(1);

      const give = (to: Seat | null) =>
        t.run(async (ctx) => {
          const holder = to === null ? null : (await seatIn(ctx, to))._id;
          await handOver(
            ctx,
            await neutralPoint(ctx, seat.seasonId, 'rangoon'),
            holder,
            Date.now(),
          );
        });
      await give(seat);
      expect(await open(t, guest)).toEqual([]);

      await give(guest);
      expect(await open(t, guest)).toHaveLength(1);
    });

    it('does not shorten the reach against a column that is not on tour', async () => {
      const t = boot();
      const { seat, guest } = await launchedSeason(t);
      await station(t, guest, PRAHOVA);
      await holdPoint(t, seat, 'rangoon');
      const road = northOf(pointOf(PRAHOVA), R * 0.75);
      const truck = await form(t, seat, 'landTransport', null);
      await moving(t, seat, truck, 'march', eastOf(road, -150), eastOf(road, 150), 3_600_000);
      expect(await open(t, guest)).toHaveLength(1);
    });

    it('files a camp for a tour waiting at a stop only inside half the reach', async () => {
      const camps = async (km: number) => {
        const t = boot();
        const { seat, guest } = await launchedSeason(t);
        const here = pointOf(PRAHOVA);
        await outpost(t, guest, here);
        const at = northOf(here, km);
        const base = await outpost(t, seat, at);
        const truck = await form(t, seat, 'landTransport', null);
        await t.run((ctx) =>
          ctx.db.patch(truck, {
            stationedAt: asPoint(at),
            tour: { base, stops: [], consigne: { ammunition: 0, oil: 0, coal: 0 }, next: 0 },
          }),
        );
        await holdPoint(t, seat, 'rangoon');
        return t
          .run((ctx) => ctx.db.query('campSightings').collect())
          .then((rows) => rows.filter((row) => row.until === null));
      };
      const reach = lookoutKmOf({ level: 1 });
      expect(await camps(reach * 0.75)).toEqual([]);
      expect(await camps(reach * 0.25)).toHaveLength(1);
    });
  });

  /** Celui qui marche ne lit jamais ce qu'on a vu de lui : le relevé n'existe que chez
   *  l'observateur, et ses propres détecteurs ne se relèvent pas lui-même. */
  it('never files a sighting against the mover himself', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const here = pointOf(PRAHOVA);
    await outpost(t, seat, here);

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

/**
 * **Une force posée se voit dans la portée** (ADR 0024 §1). Ce qui est relevé est une position,
 * un milieu et une date ; ce qui ne l'est jamais est ce que la pile *est*. Le §3 en dépend : sans
 * ce relevé, un adversaire camperait chez soi sans que rien ne le dise.
 */
describe('what sees a camp standing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  /** La Roumanie n'est le sol de personne ici : ce qu'on mesure est une portée, pas un territoire. */
  const NEUTRAL = () => pointOf(PRAHOVA);

  async function campsOf(t: ReturnType<typeof boot>, seat: Seat) {
    const playerId = await playerOf(t, seat);
    return t.run(async (ctx) =>
      ctx.db
        .query('campSightings')
        .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
        .collect(),
    );
  }

  async function post(
    t: ReturnType<typeof boot>,
    seat: Seat,
    at: LonLat,
    role: UnitRole = 'infantry',
  ) {
    const troopId = await form(t, seat, role, null);
    await t.run(async (ctx) => {
      await ctx.db.patch(troopId, { stationedAt: asPoint(at) });
      await reassessDetection(ctx, (await ctx.db.get(troopId))!.seasonId);
    });
    return troopId;
  }

  it('gives each camp the other, at thirty kilometres, and neither as a movement', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const here = NEUTRAL();
    await post(t, seat, here);
    await post(t, guest, eastOf(here, 30));

    expect(await campsOf(t, seat)).toMatchObject([{ until: null, medium: 'land' }]);
    expect(await campsOf(t, guest)).toMatchObject([{ until: null, medium: 'land' }]);
    expect(await sightingsOf(t, seat)).toEqual([]);
    expect(await sightingsOf(t, guest)).toEqual([]);
  });

  /**
   * **En mer, on voit le navire, pas la cargaison** (ADR 0014, règle 6 du 18/09). Le milieu se lit
   * sur le point et jamais sur la pile : un cargo vide et un cargo chargé de fantassins laissent
   * la même ligne — une position, une silhouette de coque, une date. C'est le gain de leurre que
   * l'ADR 0014 annonçait, et rester en mer est ce qui le rend réel.
   */
  it('shows a camp moored at sea as a hull, and says nothing of what it carries', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    /** Plein mer au large de la Roumanie : la mer Noire, hôte de personne. */
    const water: LonLat = [31.5, 44.2];
    expect(landAtPoint(water)).toBe(false);
    await post(t, seat, water, 'cargo');
    await post(t, seat, water, 'infantry');
    await post(t, guest, eastOf(water, 30), 'escort');

    const seen = await campsOf(t, guest);
    expect(seen).toMatchObject([{ until: null, medium: 'sea' }]);
    /** Une ligne ne porte structurellement ni rôle ni effectif : il n'y a rien à cacher. */
    expect(Object.keys(seen[0]!)).not.toContain('roles');
    /** Et le chargement ne change pas la ligne : c'est une station, pas un manifeste. */
    expect(seen).toHaveLength(1);
  });

  it('gives neither anything at seventy, past the infantry range', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const here = NEUTRAL();
    await post(t, seat, here);
    await post(t, guest, eastOf(here, 70));

    expect(await campsOf(t, seat)).toEqual([]);
    expect(await campsOf(t, guest)).toEqual([]);
  });

  /** **Levé le camp, la fenêtre se ferme** : la colonne devient un fil relevé, et ce qui reste
   *  du camp est une dernière position connue (§2). */
  it('closes the window when the pile marches away, and files the thread instead', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const here = NEUTRAL();
    const troopId = await post(t, seat, here);
    await post(t, guest, eastOf(here, 30));
    expect(await campsOf(t, guest)).toMatchObject([{ until: null }]);

    await t.mutation(api.movements.marchTo, {
      ...seat,
      origin: { kind: 'point', point: asPoint(here) },
      troopIds: [troopId],
      point: asPoint(eastOf(here, 600)),
    });

    const [closed] = await campsOf(t, guest);
    expect(closed!.until).toBe(Date.now());
    expect(await sightingsOf(t, guest)).toMatchObject([{ detector: 'troop' }]);
    const served = (await t.query(api.view.playerView, guest)).camps;
    expect(served).toMatchObject([{ lastKnown: true, lastSeenAt: Date.now() }]);
  });

  /** Une garnison d'avant-poste est une pile posée comme une autre, et la station l'entend. */
  it('relève an outpost garrison standing inside a listening station', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const here = NEUTRAL();
    await station(t, guest, PRAHOVA);
    const outpostId = await outpost(t, seat, northOf(here, 100));
    const troopId = await form(t, seat, 'infantry', null);
    await t.run(async (ctx) => {
      await ctx.db.patch(troopId, { stationedAt: outpostId });
      await reassessDetection(ctx, (await ctx.db.get(troopId))!.seasonId);
    });

    expect(await campsOf(t, guest)).toMatchObject([{ detector: 'station' }]);
  });

  /** **Et un chantier n'y change rien** (ADR 0024 §1, révision du 15/09) : la garnison qui tient
   *  une fondation est une force posée comme une autre. Aucun cas spécial ne la cache. */
  it('relève the garrison holding a construction site exactly the same way', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const here = NEUTRAL();
    await station(t, guest, PRAHOVA);
    const siteId = await outpost(t, seat, northOf(here, 100), null, Date.now() + 3_600_000);
    const troopId = await form(t, seat, 'infantry', null);
    await t.run(async (ctx) => {
      await ctx.db.patch(troopId, { stationedAt: siteId });
      await reassessDetection(ctx, (await ctx.db.get(troopId))!.seasonId);
    });

    expect(await campsOf(t, guest)).toMatchObject([{ detector: 'station' }]);
  });

  /** **La forme est la garantie** : ni propriétaire, ni composition, ni effectif ne traversent. */
  it('serves a position, a medium and two dates — and nothing of what stands there', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const here = NEUTRAL();
    await post(t, seat, here);
    await post(t, guest, eastOf(here, 30));

    const [camp] = (await t.query(api.view.playerView, guest)).camps;
    expect(camp).toBeDefined();
    expect(Object.keys(camp!).sort()).toEqual([
      'detector',
      'detectorRegion',
      'id',
      'lastKnown',
      'lastSeenAt',
      'medium',
      'point',
      'seenMinutesAgo',
      'since',
    ]);
    expect(camp!.lastKnown).toBe(false);
    expect(camp!.seenMinutesAgo).toBeNull();
    expect(camp!.lastSeenAt).toBeNull();
  });

  /** **Le coût, mesuré** : une ligne par couple (observateur, camp) couvert, jamais un balayage
   *  de la table des troupes à la lecture. Huit camps à portée valent huit lignes chez le
   *  guetteur, et aucune chez personne d'autre. */
  it('costs one row per covered pair, at eight camps watched', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const here = NEUTRAL();
    await post(t, guest, here);
    for (let index = 0; index < 8; index += 1) {
      await post(t, seat, eastOf(northOf(here, index), 20));
    }

    expect(await campsOf(t, guest)).toHaveLength(8);
    expect(await campsOf(t, seat)).toHaveLength(1);
  });
});

/**
 * **Rien ne se bat en route** (ADR 0024 §3, révision de l'ADR 0021 §2). La rencontre de deux
 * colonnes a été retirée : une colonne va où on l'envoie, et deux qui se croisent se relèvent
 * l'une l'autre sans que personne tire. La géométrie de l'interception reste dans le domaine,
 * pour l'intercepteur de la V1.
 */
describe('two columns crossing in flight', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  it('relève l’une l’autre and opens no pass, attack or not', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const attacker = await form(t, seat, 'fighter', null);
    const other = await form(t, guest, 'fighter', null);
    const duration = 4 * 3_600_000;

    const attackId = await moving(t, seat, attacker, 'attack', [-2, 0], [2, 0], duration);
    const crossingId = await moving(t, guest, other, 'attack', [0, -2], [0, 2], duration);

    const movements = await t.run(async (ctx) =>
      Promise.all([ctx.db.get(attackId), ctx.db.get(crossingId)]),
    );
    /** Aucun rendez-vous n'est pris : le champ reste au schéma, jamais écrit. */
    expect(movements.every((movement) => movement!.contactJobId === undefined)).toBe(true);
    expect(await sightingsOf(t, seat)).toMatchObject([
      { movementId: crossingId, detector: 'troop' },
    ]);
    expect(await sightingsOf(t, guest)).toMatchObject([
      { movementId: attackId, detector: 'troop' },
    ]);

    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await t.run(async (ctx) => ctx.db.query('engagements').collect())).toEqual([]);
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
 * **Les liaisons font ce que faisait le relais** (ADR 0037 §8) : la route de son propriétaire qui
 * passe dans le rayon d'un point **en liaison** se parcourt plus vite ; un point seul n'accélère
 * rien. L'aperçu et le départ passent par la même fonction, donc ils datent l'arrivée à la même
 * minute, et l'aperçu dit ce que les liaisons ont pris.
 */
/**
 * **Les vigies s'aveuglent à l'heure où le charbon tombe à zéro** (ADR 0037 §2), chaînes de
 * l'usine comprises : un réveil calé sur le seul entretien partirait trop tard, et une colonne
 * passée entre-temps serait servie par une vigie qui n'a plus de quoi brûler.
 */
describe('the instant the coal runs dry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  const HOUR = 3_600_000;

  /** Dix charbons, deux points de niveau 1 (2/h) et un lot de munitions à l'arsenal (3/h). */
  async function burning(t: ReturnType<typeof boot>) {
    const { seat, guest } = await launchedSeason(t);
    const guestId = await playerOf(t, guest);
    await outpost(t, guest, pointOf(PRAHOVA));
    await outpost(t, guest, eastOf(pointOf(PRAHOVA), 400));
    await t.run(async (ctx) => {
      await ctx.db.insert('buildings', {
        seasonId: guest.seasonId,
        playerId: guestId,
        key: 'arsenal',
        regionId: 'RUS-2335',
        point: pointOfRegion('RUS-2335'),
        level: 1,
      });
      for (const row of await ctx.db
        .query('resources')
        .withIndex('byPlayer', (q) => q.eq('playerId', guestId))
        .collect())
        await ctx.db.patch(row._id, {
          stock: row.key === 'coal' ? 10 : row.stock,
          updatedAt: Date.now(),
        });
    });
    await t.mutation(api.industry.order, { ...guest, chain: 'arsenal', quantity: 10 });
    const reassess = () =>
      t.run((ctx) => reassessDetection(ctx, guest.seasonId, Date.now(), guestId));
    const dryJob = () => t.run(async (ctx) => (await ctx.db.get(guestId))!.dryJob);
    return { seat, guest, reassess, dryJob };
  }

  it('wakes the lookouts at two hours, the arsenal burning its share', async () => {
    const t = boot();
    const { reassess, dryJob } = await burning(t);
    await reassess();

    const job = await dryJob();
    expect(job).toBeDefined();
    expect(job!.at - MIDDAY.getTime()).toBeGreaterThan(2 * HOUR - 60_000);
    expect(job!.at - MIDDAY.getTime()).toBeLessThan(2 * HOUR + 60_000);
  });

  /** **Le règlement recale le réveil lui-même** : une couleur changée par un autre joueur règle
   *  celui-ci (`reportChange`) sans toucher ses détecteurs, et c'est ce réveil qui viendra à temps. */
  it('sets the wake-up from the settlement that changed the burn, with no reassessment', async () => {
    const t = boot();
    const { guest, dryJob } = await burning(t);
    const guestId = await playerOf(t, guest);
    await t.run((ctx) => settle(ctx, guestId, Date.now()).then(() => undefined));

    const job = await dryJob();
    expect(job).toBeDefined();
    expect(job!.at - MIDDAY.getTime()).toBeLessThan(2 * HOUR + 60_000);
  });

  /** Le réveil en attente qui tombe à temps reste : le joueur n'est réécrit que s'il change. */
  it('keeps the pending wake-up across a later reassessment that does not need an earlier one', async () => {
    const t = boot();
    const { reassess, dryJob } = await burning(t);
    await reassess();
    const first = await dryJob();

    vi.advanceTimersByTime(10 * 60_000);
    await reassess();

    expect(await dryJob()).toEqual(first);
  });
});

describe('what liaisons do to a departure', () => {
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
  /** Standing on the road itself, and a neighbour 150 km off it: their reaches touch. */
  const onRoad = (route: { points: ReadonlyArray<LonLat> }) =>
    route.points[Math.floor(route.points.length / 2)]!;

  async function marched(t: ReturnType<typeof boot>, seat: Seat, from: LonLat, to: LonLat) {
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
    return { previewed: previewed!, sent };
  }

  it('shortens a march under two points in liaison, and the preview says the same minute', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const { from, to, route } = road();
    const plain = routeMinutes(route.costUnits);
    await outpost(t, seat, onRoad(route));
    await outpost(t, seat, northOf(onRoad(route), 150));

    const { previewed, sent } = await marched(t, seat, from, to);

    expect(sent.minutes).toBeLessThan(plain);
    expect(sent.minutes).toBeGreaterThan(plain / RELAY_SPEED_MULTIPLIER - 1);
    expect(previewed.minutes).toBe(sent.minutes);
    expect(previewed.relayed).toBe(plain - sent.minutes);
  });

  it('leaves a march under a lone point at the ordinary pace', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const { from, to, route } = road();
    await outpost(t, seat, onRoad(route));

    const { previewed, sent } = await marched(t, seat, from, to);

    expect(sent.minutes).toBe(routeMinutes(route.costUnits));
    expect(previewed.relayed).toBe(0);
  });

  it('leaves a march no liaison of its owner watches at the ordinary pace', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const { from, to, route } = road();

    /** An opponent's liaison carries nobody but him, and the mover's own far off the road carry
     *  nothing at all. */
    await outpost(t, guest, onRoad(route));
    await outpost(t, guest, northOf(onRoad(route), 150));
    await outpost(t, seat, [0, 40]);
    await outpost(t, seat, [1, 40]);

    const { sent } = await marched(t, seat, from, to);

    expect(sent.minutes).toBe(routeMinutes(route.costUnits));
  });

  it('breaks the liaison of a point out of service: its neighbour stands alone', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const { from, to, route } = road();
    await outpost(t, seat, onRoad(route));
    await outpost(t, seat, northOf(onRoad(route), 150), Date.now() + 6 * 3_600_000);

    const { sent } = await marched(t, seat, from, to);

    expect(sent.minutes).toBe(routeMinutes(route.costUnits));
  });

  /** **Une liaison n'accélère pas l'air** (Pierre, 01/11) : un vol garde sa durée pleine. */
  it('leaves a flight under two points in liaison at its full length', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const from = pointOf(MARNE);
    const to = eastOf(from, 300);
    await outpost(t, seat, eastOf(from, 150));
    await outpost(t, seat, northOf(eastOf(from, 150), 150));
    const flight = routeBetween(from, to, 'air')!;
    const playerId = await playerOf(t, seat);
    /** The one road to a duration every order takes, flights included (`movement/orders.ts`). */
    const minutes = await t.run((ctx) => pacedMinutes(ctx, playerId, flight, Date.now()));

    expect(minutes).toBe(routeMinutes(flight.costUnits));
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
    /** The served points carry the line anyway: the heading is that line's, to the degree
     *  (decision of 22/10 on #231). */
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
    await outpost(t, guest, eastOf(pointOf(MARNE), 800));
    await watchedMarch(t, seat, guest);

    const [seen] = (await t.query(api.view.playerView, guest)).detected;
    expect(seen!.headingAtMe).toBe(true);
  });

  it('stays quiet for a column that passes beside me and points elsewhere', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    await outpost(t, guest, northOf(eastOf(pointOf(MARNE), 800), 400));
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

/**
 * **Une dernière position connue survit au mouvement** (ADR 0024 §2). Une fenêtre ouverte laisse
 * une trace quoi qu'il arrive à ce qu'elle a vu — et elle s'efface après `LAST_KNOWN_HOURS`,
 * parce que le brouillard périme l'information au lieu de l'éterniser.
 */
describe('what survives the movement it watched', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  const HOUR = 3_600_000;

  async function sentry(t: ReturnType<typeof boot>, seat: Seat, at: LonLat) {
    const troopId = await form(t, seat, 'infantry', null);
    await t.run(async (ctx) => {
      await ctx.db.patch(troopId, { stationedAt: asPoint(at) });
      await reassessDetection(ctx, (await ctx.db.get(troopId))!.seasonId);
    });
    return troopId;
  }

  /** La colonne s'arrête à trente kilomètres du guetteur : la fenêtre s'est ouverte, elle se
   *  ferme avec l'arrivée, et ce qui arrive devient aussi un camp. */
  async function marchedIn(t: ReturnType<typeof boot>, seat: Seat, guest: Seat) {
    const here = pointOf(PRAHOVA);
    const landing = eastOf(here, 30);
    await sentry(t, guest, here);
    const troopId = await form(t, seat, 'infantry', null);
    const from = eastOf(here, 600);
    await t.run(async (ctx) => ctx.db.patch(troopId, { stationedAt: asPoint(from) }));
    const sent = await t.mutation(api.movements.marchTo, {
      ...seat,
      origin: { kind: 'point', point: asPoint(from) },
      troopIds: [troopId],
      point: asPoint(landing),
    });
    /** À la minute de l'arrivée, et pas une de plus : `runAllTimers` emporterait la presse et
     *  ses rendez-vous, et le souvenir serait déjà périmé avant d'être lu. */
    vi.advanceTimersByTime(sent.minutes * 60_000);
    await t.finishInProgressScheduledFunctions();
    return { landing };
  }

  it('freezes the thread where the column landed, and reads the camp beside it', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const { landing } = await marchedIn(t, seat, guest);

    const view = await t.query(api.view.playerView, guest);
    const [seen] = view.detected;
    expect(seen).toBeDefined();
    /** Le tronçon est coupé à l'arrivée : sa fin est là où la colonne s'est posée. */
    expect(distanceKm([seen!.to.lon, seen!.to.lat], landing)).toBeLessThan(60);
    expect(seen!.seenTo).toBe(Date.now());
    /** Les deux coexistent : l'un est le souvenir du fil, l'autre la vue du camp. */
    expect(view.camps).toHaveLength(1);
    expect(view.camps[0]!.lastKnown).toBe(false);
  });

  it('drops the frozen arc past the delay and keeps the camp it still covers', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    await marchedIn(t, seat, guest);

    vi.advanceTimersByTime(LAST_KNOWN_HOURS * HOUR + 60_000);
    expect((await t.query(api.view.playerView, guest)).detected).toEqual([]);
    expect((await t.query(api.view.playerView, guest)).camps).toHaveLength(1);
  });

  /** Une fenêtre qui ne s'est jamais ouverte n'a rien montré : elle part avec le mouvement, et
   *  il ne reste aucun fantôme. */
  it('leaves nothing behind for a window that never opened', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const target = await form(t, guest, 'infantry', null);
    const movementId = await moving(t, guest, target, 'march', [0, 0], [4, 0], 4 * HOUR);
    const detector = await form(t, seat, 'infantry', null);
    await t.run(async (ctx) => {
      await ctx.db.patch(detector, { stationedAt: asPoint([2, 0]) });
      await reassessDetection(ctx, (await ctx.db.get(movementId))!.seasonId);
    });
    const [future] = await sightingsOf(t, seat);
    expect(future!.from).toBeGreaterThan(Date.now());

    await t.run(async (ctx) => forgetMovement(ctx, movementId));
    expect(await sightingsOf(t, seat)).toEqual([]);
  });

  /** **Coupé à l'instant de la passe** : le souvenir s'arrête là où la colonne a cessé
   *  d'exister, jamais au bout d'une route qu'elle n'a pas marchée. */
  it('cuts the memory at the instant the column stopped existing', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const here = pointOf(PRAHOVA);
    await sentry(t, guest, here);
    const troopId = await form(t, seat, 'infantry', null);
    const from = eastOf(here, 30);
    await t.run(async (ctx) => ctx.db.patch(troopId, { stationedAt: asPoint(from) }));
    const movementId = await moving(t, seat, troopId, 'march', from, eastOf(here, 900), 6 * HOUR);
    const [window] = await sightingsOf(t, guest);
    expect(window!.from).toBeLessThanOrEqual(Date.now());

    vi.advanceTimersByTime(HOUR);
    const cut = Date.now();
    await t.run(async (ctx) => forgetMovement(ctx, movementId));

    const [frozen] = await sightingsOf(t, guest);
    expect(frozen!.frozen).toBeDefined();
    expect(frozen!.frozen!.closedAt).toBe(Math.min(window!.to, cut));
    const [seen] = (await t.query(api.view.playerView, guest)).detected;
    expect(seen!.seenTo).toBe(frozen!.frozen!.closedAt);
    expect(seen!.arrivesAt).toBe(frozen!.frozen!.closedAt);
  });
});

/**
 * **Un événement d'un seul joueur ne relit que lui** (#145) : un départ ou une arrivée sans combat
 * refait les relevés de son joueur et ceux tenus sur ses colonnes, rien d'autre. Sur une scène
 * dense — quatre joueurs, leurs piles et leurs colonnes croisées dans un même carré —, une
 * réévaluation complète au même instant ne change plus une ligne : la portée n'a rien oublié.
 */
describe('a one-player event reassesses what the whole pass would', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  let seed = 3;
  const near = (spread: number) => {
    const shift = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
    return { lon: 8 + shift() * spread, lat: 50 + shift() * spread };
  };

  const ledger = async (t: ReturnType<typeof boot>) =>
    t.run(async (ctx) =>
      (await ctx.db.query('sightings').collect())
        .map((row) =>
          JSON.stringify([
            row.movementId,
            row.playerId,
            row.from,
            row.to,
            row.detector,
            row.detectorId,
            row.detectorHostCountry,
            row.detectorRegion,
            row.noticeFiled ?? null,
            row.frozen?.closedAt ?? null,
          ]),
        )
        .sort(),
    );

  const wholePass = (t: ReturnType<typeof boot>, seasonId: Id<'seasons'>) =>
    t.run(async (ctx) => reassessDetection(ctx, seasonId, Date.now()));

  /** Rangoun tenu par le joueur de la tournée : la mi-portée passe par la même fonction dans
   *  les deux calculs, et la prise du point réévalue en entier. */
  it.each([
    ['', false],
    [', Rangoon held by the touring player', true],
  ])(
    'leaves nothing for a full pass to change, with no full pass in between%s',
    async (_, rangoon) => {
      const t = boot();
      const { seat, code } = await foundSeat(t, 'Pierre', 0.5);
      const seats = [seat];
      for (const name of ['Léa', 'Marc', 'Inès']) seats.push(await joinSeat(t, code, name));
      /** L'Allemagne est jouée : les colonnes du carré roulent sur son sol, et son territoire relève. */
      const nations = ['france', 'germany', 'uk', 'italy'] as const;
      for (const [k, one] of seats.entries()) {
        await t.mutation(api.players.reserveNation, { ...one, nation: nations[k]! });
        await t.mutation(api.players.declareReady, { ...one, ready: true });
      }
      await t.mutation(api.seasons.launch, seat);
      if (rangoon) await holdPoint(t, seat, 'rangoon');
      const players = await Promise.all(seats.map((one) => playerOf(t, one)));
      const scenes = [];
      for (const [k, playerId] of players.entries()) {
        scenes.push(
          await t.mutation(internal.dev.benchScene, {
            playerId,
            squads: Array.from({ length: 5 }, () => near(0.8)),
            reserve: { at: near(0.8), count: 4 },
            /** Le premier joueur tient quatre dépôts et un camion : de quoi lancer une tournée. */
            outposts: k === 0 ? Array.from({ length: 4 }, () => near(0.6)) : [],
          }),
        );
      }
      /** Une station d'écoute anglaise sur sol allemand, un avant-poste italien qui guette, une
       *  caserne française pour la recrue — posés à la main, donc relus une fois en entier. */
      const german = allRegions()
        .filter((region) => region.country === 'DEU')
        .sort((a, b) => distanceKm(a.point, [8.3, 50.2]) - distanceKm(b.point, [8.3, 50.2]));
      const barracks = await t.run(async (ctx) => {
        await ctx.db.insert('buildings', {
          seasonId: seat.seasonId,
          playerId: players[2]!,
          key: 'listening',
          regionId: german[0]!.id,
          point: pointOfRegion(german[0]!.id),
          level: 1,
        });
        await ctx.db.insert('outposts', {
          seasonId: seat.seasonId,
          playerId: players[3]!,
          point: near(0.5),
          hostCountry: 'DEU',
          /** Niveau 2 : sa vigie porte à 90 km, la portée que la tournée doit croiser. */
          level: 2,
          foundedAt: Date.now() - 1,
          disabledUntil: null,
          immuneUntil: null,
        });
        return ctx.db.insert('buildings', {
          seasonId: seat.seasonId,
          playerId: players[0]!,
          key: 'barracks',
          regionId: german[1]!.id,
          point: pointOfRegion(german[1]!.id),
          level: 1,
        });
      });
      await wholePass(t, seat.seasonId);
      /** La tournée prend son slot avant que les escouades ne remplissent le ciel. */
      await t.mutation(api.tours.start, {
        ...seat,
        troopId: scenes[0]!.truckId!,
        stops: scenes[0]!.outpostIds.slice(1),
      });

      for (let squad = 0; squad < 4; squad += 1) {
        for (const [k, playerId] of players.entries()) {
          const { ids, at } = scenes[k]!.squads[squad]!;
          const { filed } = await t.mutation(internal.dev.benchFlights, {
            playerId,
            flights: [{ ids, from: at, to: near(2.5) }],
          });
          expect(filed).toBe(1);
        }
      }
      const departed = await ledger(t);
      /** La tournée passe sous une portée qui se mesure : la mi-portée est bien en jeu. */
      const tourSeenBy = await t.run(async (ctx) => {
        const leg = (await ctx.db.query('movements').collect()).find(
          (movement) => movement.tourLeg !== undefined,
        );
        return (await ctx.db.query('sightings').collect())
          .filter((row) => row.movementId === leg?._id)
          .map((row) => row.detector);
      });
      expect(tourSeenBy).toEqual(expect.arrayContaining(['station', 'outpost']));
      expect(new Set(departed.map((row) => JSON.parse(row)[4]))).toEqual(
        new Set(['territory', 'station', 'outpost', 'troop']),
      );

      /** Les arrivées tombent à leur heure, le pas de tournée arrive, une recrue sort : chaque
       *  événement ne relit que son joueur, et rien ne relit tout entre-temps. */
      const { leg, firstLanding } = await t.run(async (ctx) => {
        const flying = await ctx.db.query('movements').collect();
        return {
          leg: flying.find((movement) => movement.tourLeg !== undefined),
          firstLanding: Math.min(
            ...flying.filter((one) => one.tourLeg === undefined).map((one) => one.arrivesAt),
          ),
        };
      });
      expect(leg).toBeDefined();
      vi.advanceTimersByTime(Math.max(leg!.arrivesAt, firstLanding) - Date.now() + 1_000);
      await t.finishInProgressScheduledFunctions();
      const recruitmentId = await t.run(async (ctx) =>
        ctx.db.insert('recruitments', {
          playerId: players[0]!,
          buildingId: barracks,
          role: 'infantry',
          tier: 1,
          rank: 0,
          finishesAt: Date.now(),
        }),
      );
      await t.mutation(internal.troops.deliver, { recruitmentId });
      const arrived = await t.run(async (ctx) => ({
        leg: await ctx.db.get(leg!._id),
        landed: (await ctx.db.query('notices').collect()).filter(
          (notice) => notice.kind === 'columnArrived',
        ).length,
      }));
      expect(arrived.leg).toBeNull();
      expect(arrived.landed).toBeGreaterThan(0);

      const relit = await ledger(t);
      expect(relit).not.toEqual(departed);
      await wholePass(t, seat.seasonId);
      expect(await ledger(t)).toEqual(relit);
    },
  );

  /** Un camion voit à quarante kilomètres, un fantassin à soixante (le blindé aussi, d'où le
   *  camion) : la même paire, deux fenêtres. */
  it('serves each column its own window when the radii differ', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const truck = await form(t, seat, 'landTransport', null);
    const rifle = await form(t, guest, 'infantry', null);
    expect(detectionRangeOf(['landTransport'], null)).toBeLessThan(
      detectionRangeOf(['infantry'], null),
    );
    const duration = 4 * 3_600_000;
    const truckId = await moving(t, seat, truck, 'march', [-2, 0.1], [2, 0.1], duration);
    const rifleId = await moving(t, guest, rifle, 'march', [2, -0.1], [-2, -0.1], duration);

    const [truckSees] = await sightingsOf(t, seat);
    const [rifleSees] = await sightingsOf(t, guest);
    expect(truckSees).toMatchObject({ movementId: rifleId, detector: 'troop' });
    expect(rifleSees).toMatchObject({ movementId: truckId, detector: 'troop' });
    expect(rifleSees!.from).toBeLessThan(truckSees!.from);
    expect(rifleSees!.to).toBeGreaterThan(truckSees!.to);
  });
});
