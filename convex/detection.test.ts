import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
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
  routeMinutes,
} from './constants';
import { regionFacts } from './regions';
import { hostAtPoint, landAtPoint, routeBetween } from './routes';
import { reassessDetection } from './movement/detection';
import { forgetMovement } from './movement/arrival';
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
    return ctx.db.insert('buildings', { seasonId, playerId, key: 'listening', regionId, level: 1 });
  });
}

async function outpost(
  t: ReturnType<typeof boot>,
  seat: Seat,
  at: LonLat,
  specialization: Doc<'outposts'>['specialization'],
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
      specialization,
      foundedAt: Date.now(),
      ...(standsAt === undefined ? {} : { standsAt }),
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

  /** **A post with no coal hears nothing** (ADR 0028 §1), and the view says so. */
  it('files nothing for a station that has run out of coal, and serves it silent', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    await station(t, guest, PRAHOVA);
    const playerId = await playerOf(t, guest);
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

  /** Un chantier n'écoute pas : le point n'existe pas encore (révision du 15/09). */
  it('files nothing for a listening outpost still under construction', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const here = pointOf(PRAHOVA);
    await outpost(t, guest, here, 'listening', null, Date.now() + 3_600_000);

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
    const outpostId = await outpost(t, seat, northOf(here, 100), 'relay');
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
    const siteId = await outpost(
      t,
      seat,
      northOf(here, 100),
      'relay',
      null,
      Date.now() + 3_600_000,
    );
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
