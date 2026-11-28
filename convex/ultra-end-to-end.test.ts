import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import type { LonLat } from '../src/domain/geo';
import { distanceKm } from '../src/domain/geo';
import type { Nation, UnitRole } from '../src/domain/ids';
import { INTERCEPTION_SAMPLES, positionAt } from '../src/domain/interception';
import { LAST_KNOWN_HOURS, LISTENING_STATION_RADIUS_KM, nominalStrength } from './constants';
import { marchingForce } from './movement/detection';
import { capitalRegionOf, pointOfBuilding } from './regions';
import { gridStepOf } from '../src/domain/sighting-windows';
import schema from './schema';
import { modules } from './test.setup';
import {
  foundSeat,
  joinSeat,
  signIn,
  TEST_SEASON_SEED,
  placeHq,
  pointIn,
  seatIn,
  surveyRegion,
  unclocked,
  type Seat,
} from './seats.fixture';

/**
 * **Ultra de bout en bout** (ADR 0047 §3, #726) : de vraies mutations, la station posée avant tout
 * départ, aucune réévaluation à la main, et le planificateur qui joue ses jobs. Ce que le
 * Britannique lit est la destination que sa station a entendue, jamais celle du moment où elle
 * est sourde.
 */
const boot = () => convexTest({ schema, modules, transactionLimits: true });
type Bench = ReturnType<typeof boot>;

const MIDDAY = new Date(2026, 7, 17, 12, 0, 0);

const playerOf = (t: Bench, seat: Seat) => t.run(async (ctx) => (await seatIn(ctx, seat))._id);

/** Les nations dites, le Royaume-Uni en tête, QG posés, sans troupe. */
async function launchedSeason<N extends Nation>(
  t: Bench,
  nations: ReadonlyArray<N> = ['uk', 'france', 'germany'] as unknown as ReadonlyArray<N>,
): Promise<Record<N, Seat>> {
  const { seat, code } = await foundSeat(t, 'Pierre', 0.5);
  const seats = { [nations[0]!]: seat } as Record<N, Seat>;
  for (const [rank, nation] of nations.entries())
    if (rank > 0) seats[nation] = await joinSeat(t, code, `Joueur ${String(rank)}`);
  for (const nation of nations) {
    await t.mutation(api.players.reserveNation, { ...seats[nation], nation });
    await t.mutation(api.players.declareReady, { ...seats[nation], ready: true });
  }
  await t.mutation(api.seasons.launch, seat);
  await unclocked(t);
  for (const nation of nations) {
    await placeHq(t, seats[nation]);
    const playerId = await playerOf(t, seats[nation]);
    await t.run(async (ctx) => {
      for (const troop of await ctx.db
        .query('troops')
        .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
        .collect())
        await ctx.db.delete(troop._id);
    });
  }
  return seats;
}

async function postAt(t: Bench, seat: Seat, role: UnitRole, at: { lon: number; lat: number }) {
  const playerId = await playerOf(t, seat);
  return t.run(async (ctx) =>
    ctx.db.insert('troops', {
      seasonId: (await ctx.db.get(playerId))!.seasonId,
      playerId,
      role,
      tier: 1,
      nominalStrength: nominalStrength(role, 1),
      currentStrength: nominalStrength(role, 1),
      stationedAt: at,
    }),
  );
}

/** Une station debout avant tout départ : aucune ligne n'existe encore à relire. */
async function standingStation(
  t: Bench,
  seat: Seat,
  at: LonLat,
  nation: Nation,
  regionId = capitalRegionOf(nation),
) {
  const playerId = await playerOf(t, seat);
  return t.run(async (ctx) =>
    ctx.db.insert('buildings', {
      seasonId: seat.seasonId,
      playerId,
      key: 'listening',
      regionId,
      point: { lon: at[0], lat: at[1] },
      level: 1,
    }),
  );
}

/** Le sol britannique de la Manche : la pointe de Cornouailles domine son entrée. */
const CORNWALL = 'GBR-2110';
/** De l'Atlantique au milieu de la Manche : la flotte passe au large de la pointe. */
const OFFING = { lon: -12, lat: 49.5 };
const CHANNEL = { lon: -1, lat: 50.1 };
/** Un pas à l'intérieur de la pointe : l'infanterie qui prend la station part d'ici. */
const NEAR_THE_STATION = { lon: -4.4, lat: 50.5 };
/** Le Finistère, et la route qui double Ouessant sous sa station. */
const FINISTERE = 'FRA-5292';
const NEAR_FINISTERE = { lon: -3.8, lat: 48.35 };
const OFF_USHANT = { lon: -12, lat: 48 };
/** Au sud de Westminster : l'infanterie qui prend le QG britannique part d'ici. */
const NEAR_WESTMINSTER = { lon: -0.2, lat: 51.45 };
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** **La station par sa fin de chantier** : la carte ouverte, les stocks pleins, le chantier lancé
 *  et le planificateur qui le termine. */
async function builtStation(t: Bench, seat: Seat, regionId: string) {
  const playerId = await playerOf(t, seat);
  await t.run(async (ctx) => {
    const player = (await ctx.db.get(playerId))!;
    await ctx.db.patch(playerId, { researched: [...(player.researched ?? []), 'listening'] });
    for (const row of await ctx.db
      .query('resources')
      .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
      .collect())
      await ctx.db.patch(row._id, { stock: 10_000, updatedAt: Date.now() });
  });
  const { finishesAt } = await t.mutation(api.constructions.start, {
    ...seat,
    building: 'listening',
    regionId,
    point: pointIn(regionId),
  });
  await reach(t, finishesAt!);
  const built = await t.run(async (ctx) =>
    (
      await ctx.db
        .query('buildings')
        .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
        .collect()
    ).find((building) => building.key === 'listening'),
  );
  expect(built).toBeDefined();
  return built!;
}

/** Une colonne partie par `marchTo`, de ce point à celui-là. */
async function sailing(
  t: Bench,
  seat: Seat,
  roles: ReadonlyArray<UnitRole> = ['escort', 'cargo'],
  [from, to]: readonly [{ lon: number; lat: number }, { lon: number; lat: number }] = [
    OFFING,
    CHANNEL,
  ],
) {
  const troopIds = [];
  for (const role of roles) troopIds.push(await postAt(t, seat, role, from));
  const { movementId } = await t.mutation(api.movements.marchTo, {
    ...seat,
    origin: { kind: 'point', point: from },
    troopIds,
    point: to,
  });
  return (await t.run((ctx) => ctx.db.get(movementId)))!;
}

const rowsOf = async (t: Bench, seat: Seat) => {
  const playerId = await playerOf(t, seat);
  return t.run((ctx) =>
    ctx.db
      .query('sightings')
      .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
      .collect(),
  );
};

/** La ligne de ce joueur sur ce mouvement : d'autres colonnes (une prise) ont la leur. */
const rowOf = async (t: Bench, seat: Seat, movementId: Id<'movements'>) =>
  (await rowsOf(t, seat)).find((row) => row.movementId === movementId);

const jobOf = (t: Bench, jobId: Id<'_scheduled_functions'>) =>
  t.run((ctx) => ctx.db.system.get(jobId));

/** Ce que la France lit de sa propre colonne : le point et le nom qu'Ultra doit rendre. */
async function ownDestination(t: Bench, seat: Seat, movementId: Id<'movements'>) {
  const own = (await t.query(api.view.playerView, seat)).movements.find(
    (one) => one.id === movementId,
  )!;
  return { point: own.to, name: own.destinationName };
}

/** Rien de ce que ce joueur lit ne porte de destination relevée. */
async function servesNoDestination(t: Bench, seat: Seat) {
  const view = await t.query(api.view.playerView, seat);
  expect(JSON.stringify([view.detected ?? [], view.camps ?? []])).not.toContain('"destination"');
}

/**
 * **L'heure qui passe jusqu'à `time`**, chaque job joué à la sienne, dans l'ordre : ce que
 * `finishAllScheduledFunctions` ferait, borné à un instant pour regarder entre deux.
 */
async function reach(t: Bench, time: number) {
  for (let job = 0; job < 500; job += 1) {
    const due = await t.run(
      async (ctx) =>
        (await ctx.db.system.query('_scheduled_functions').collect())
          .filter((one) => one.state.kind === 'pending' && one.scheduledTime <= time)
          .map((one) => one.scheduledTime)
          .sort((a, b) => a - b)
          .at(0) ?? null,
    );
    if (due === null) {
      vi.advanceTimersByTime(Math.max(0, time - Date.now()));
      await t.finishInProgressScheduledFunctions();
      return;
    }
    vi.advanceTimersByTime(Math.max(0, due - Date.now()));
    await t.finishInProgressScheduledFunctions();
  }
  throw new Error('the scheduler never settles');
}

/** Un avant-poste de vigie debout avant tout départ : il relève, il n'entend pas. */
async function vigie(t: Bench, seat: Seat, at: { lon: number; lat: number }) {
  const playerId = await playerOf(t, seat);
  return t.run(async (ctx) =>
    ctx.db.insert('outposts', {
      seasonId: seat.seasonId,
      playerId,
      point: at,
      hostCountry: 'GBR',
      level: 1,
      foundedAt: Date.now() - 1,
      disabledUntil: null,
      immuneUntil: null,
    }),
  );
}

/**
 * **Une prise par la vraie marche** : le site relevé, une infanterie posée à côté, l'ordre de
 * capture, et le planificateur jusqu'à son arrivée. Rend la capture en cours. Le défenseur n'a pas
 * de plage de repos : la prise dure ses six heures, pas plus.
 */
async function capturing(
  t: Bench,
  attacker: Seat,
  defender: Seat,
  building: Doc<'buildings'>,
  from: { lon: number; lat: number },
) {
  const defenderId = await playerOf(t, defender);
  await t.run((ctx) =>
    ctx.db.patch(defenderId, { restWindow: { startMinutes: 0, endMinutes: 0 } }),
  );
  await surveyRegion(t, attacker, building.regionId);
  const infantry = await postAt(t, attacker, 'infantry', from);
  const { arrivesAt } = await t.mutation(api.movements.capture, {
    ...attacker,
    origin: { kind: 'point', point: from },
    troopIds: [infantry],
    target: { kind: 'building', buildingId: building._id },
  });
  await reach(t, arrivesAt);
  const capture = await t.run(async (ctx) =>
    (await ctx.db.query('captures').collect()).find(
      (one) =>
        one.stoppedAt === undefined &&
        one.target.kind === 'building' &&
        one.target.buildingId === building._id,
    ),
  );
  expect(capture).toBeDefined();
  return capture!;
}

const holderOf = async (t: Bench, buildingId: Id<'buildings'>) =>
  (await t.run((ctx) => ctx.db.get(buildingId)))?.playerId;

/** L'arc de ce mouvement, vivant ou figé : un souvenir se sert sous l'id de sa ligne. */
async function arcOf(t: Bench, seat: Seat, movementId: Id<'movements'>) {
  const rows = (await rowsOf(t, seat)).filter((row) => row.movementId === movementId);
  const ids = new Set<string>([movementId, ...rows.map((row) => row._id)]);
  return ((await t.query(api.view.playerView, seat)).detected ?? []).find((arc) => ids.has(arc.id));
}

describe('Ultra, de bout en bout (#726)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  it('1. serves a naval column the destination, at the wake of the station that hears it', async () => {
    const t = boot();
    const { uk, france, germany } = await launchedSeason(t);
    const station = await builtStation(t, uk, CORNWALL);
    const movement = await sailing(t, france);

    const row = await rowOf(t, uk, movement._id);
    expect(row).toMatchObject({ detector: 'station', detectorId: station._id });
    expect(row!.ultraFrom).toBeGreaterThan(Date.now());
    expect(row).not.toHaveProperty('heardDestination');
    expect(await jobOf(t, row!.ultraJobId!)).toMatchObject({
      name: 'movements:wakeUltra',
      scheduledTime: row!.ultraFrom,
    });

    /** Deux pas de grille avant : hors de portée. Entre deux échantillons, une réévaluation peut
     *  déjà l'entendre à l'instant, et c'est juste. */
    await reach(t, row!.ultraFrom! - 2 * gridStepOf(movement));
    expect((await arcOf(t, uk, movement._id))?.destination).toBeUndefined();
    expect(await rowOf(t, uk, movement._id)).not.toHaveProperty('heardDestination');
    await reach(t, row!.ultraFrom!);
    expect(await jobOf(t, row!.ultraJobId!)).toMatchObject({ state: { kind: 'success' } });
    expect((await arcOf(t, uk, movement._id))!.destination).toEqual(
      await ownDestination(t, france, movement._id),
    );
    await servesNoDestination(t, france);
    await servesNoDestination(t, germany);
  });

  it('2. serves nothing of a land column nor of an air column a station hears', async () => {
    const t = boot();
    const { uk, france } = await launchedSeason(t);
    const station = await builtStation(t, uk, CORNWALL);
    const land = await sailing(
      t,
      france,
      ['infantry'],
      [
        { lon: -3.6, lat: 50.75 },
        { lon: -5.2, lat: 50.15 },
      ],
    );
    /** Un bombardier part d'un terrain : celui du Finistère, posé avant tout départ. */
    const franceId = await playerOf(t, france);
    const airfield = await t.run((ctx) =>
      ctx.db.insert('buildings', {
        seasonId: france.seasonId,
        playerId: franceId,
        key: 'airfield',
        regionId: FINISTERE,
        point: pointIn(FINISTERE),
        level: 1,
      }),
    );
    const bomber = await postAt(t, france, 'bomber', pointIn(FINISTERE));
    await t.run((ctx) => ctx.db.patch(bomber, { stationedAt: airfield }));
    const { movementId: airId } = await t.mutation(api.movements.marchTo, {
      ...france,
      origin: { kind: 'building', buildingId: airfield },
      troopIds: [bomber],
      point: { lon: -4.9, lat: 50.2 },
    });
    const air = (await t.run((ctx) => ctx.db.get(airId)))!;
    const heard = pointOfBuilding(station)!;
    for (const movement of [land, air]) {
      /** La route passe sous la station : c'est la nature de la colonne qui la tait. */
      expect(movement.points.some((point) => distanceKm([point.lon, point.lat], heard) <= 60)).toBe(
        true,
      );
    }
    await reach(t, Math.max(land.arrivesAt, air.arrivesAt) - 1);
    const rows = await rowsOf(t, uk);
    expect(rows.map((row) => row.movementId).sort()).toEqual([land._id, air._id].sort());
    for (const row of rows) {
      expect(row).not.toHaveProperty('ultraFrom');
      expect(row).not.toHaveProperty('heardDestination');
    }
    await servesNoDestination(t, uk);
  });

  it('3. serves the destination of an embarked column, tanks aboard a cargo', async () => {
    const t = boot();
    const { uk, france } = await launchedSeason(t);
    await builtStation(t, uk, CORNWALL);
    const movement = await sailing(t, france, ['armor', 'cargo']);
    const destination = await ownDestination(t, france, movement._id);

    const row = await rowOf(t, uk, movement._id);
    await reach(t, row!.ultraFrom!);
    expect((await arcOf(t, uk, movement._id))!.destination).toEqual(destination);
  });

  it('4. serves nothing under a German station alone', async () => {
    const t = boot();
    const { uk, france, germany } = await launchedSeason(t);
    await standingStation(t, germany, [pointIn(CORNWALL).lon, pointIn(CORNWALL).lat], 'germany');
    const movement = await sailing(t, france);

    await reach(t, movement.arrivesAt - 1);
    const row = await rowOf(t, germany, movement._id);
    expect(row).toMatchObject({ detector: 'station' });
    expect(row).not.toHaveProperty('ultraFrom');
    expect(row).not.toHaveProperty('heardDestination');
    expect(await rowsOf(t, uk)).toEqual([]);
    for (const seat of [germany, uk, france]) await servesNoDestination(t, seat);
  });

  it('5a. hears nothing of a station razed before the column passes', async () => {
    const t = boot();
    const { uk, france } = await launchedSeason(t);
    const station = await builtStation(t, uk, CORNWALL);
    await vigie(t, uk, OFFING);
    const movement = await sailing(t, france);
    const row = await rowOf(t, uk, movement._id);
    expect(row!.ultraFrom).toBeGreaterThan(Date.now());

    await t.mutation(api.buildings.demolish, { ...uk, buildingId: station._id });

    const razed = await rowOf(t, uk, movement._id);
    expect(razed).not.toHaveProperty('ultraFrom');
    expect(await jobOf(t, row!.ultraJobId!)).toMatchObject({ state: { kind: 'canceled' } });
    await reach(t, movement.arrivesAt);
    const frozen = await rowOf(t, uk, movement._id);
    expect(frozen!.frozen).toBeDefined();
    await servesNoDestination(t, uk);
  });

  it('5b. keeps what a station razed afterwards had heard', async () => {
    const t = boot();
    const { uk, france } = await launchedSeason(t);
    const station = await builtStation(t, uk, CORNWALL);
    const movement = await sailing(t, france);
    const destination = await ownDestination(t, france, movement._id);
    const row = await rowOf(t, uk, movement._id);
    await reach(t, row!.ultraFrom! + 1);
    expect((await arcOf(t, uk, movement._id))!.destination).toEqual(destination);

    await t.mutation(api.buildings.demolish, { ...uk, buildingId: station._id });

    expect((await arcOf(t, uk, movement._id))!.destination).toEqual(destination);
    await reach(t, movement.arrivesAt);
    expect((await arcOf(t, uk, movement._id))!.destination).toEqual(destination);
  });

  it('6a. hears nothing of a station the Germans take before the column passes', async () => {
    const t = boot();
    const { uk, france, germany } = await launchedSeason(t);
    const station = await builtStation(t, uk, CORNWALL);
    await vigie(t, uk, OFFING);
    const capture = await capturing(t, germany, uk, station, NEAR_THE_STATION);
    await reach(t, capture.completesAt - 30 * MINUTE);
    const movement = await sailing(t, france);
    const row = await rowOf(t, uk, movement._id);
    expect(row!.ultraFrom).toBeGreaterThan(capture.completesAt);

    await reach(t, capture.completesAt);

    expect(await holderOf(t, station._id)).toBe(await playerOf(t, germany));
    const lost = await rowOf(t, uk, movement._id);
    expect(lost).not.toHaveProperty('ultraFrom');
    expect(await jobOf(t, row!.ultraJobId!)).toMatchObject({ state: { kind: 'canceled' } });
    await reach(t, movement.arrivesAt);
    for (const one of await rowsOf(t, germany)) expect(one).not.toHaveProperty('ultraFrom');
    for (const seat of [uk, germany]) await servesNoDestination(t, seat);
  });

  it('6b. keeps what a station the Germans take afterwards had heard', async () => {
    const t = boot();
    const { uk, france, germany } = await launchedSeason(t);
    const station = await builtStation(t, uk, CORNWALL);
    const capture = await capturing(t, germany, uk, station, NEAR_THE_STATION);
    await reach(t, capture.completesAt - 100 * MINUTE);
    const movement = await sailing(t, france);
    const destination = await ownDestination(t, france, movement._id);
    const row = await rowOf(t, uk, movement._id);
    expect(row!.ultraFrom).toBeLessThan(capture.completesAt);
    expect(movement.arrivesAt).toBeGreaterThan(capture.completesAt);
    await reach(t, row!.ultraFrom! + 1);
    expect((await arcOf(t, uk, movement._id))!.destination).toEqual(destination);

    await reach(t, capture.completesAt);

    expect(await holderOf(t, station._id)).toBe(await playerOf(t, germany));
    expect((await arcOf(t, uk, movement._id))!.destination).toEqual(destination);
    await reach(t, movement.arrivesAt);
    expect((await arcOf(t, uk, movement._id))!.destination).toEqual(destination);
    await servesNoDestination(t, germany);
  });

  it('6c. hears through a German station the British take', async () => {
    const t = boot();
    const { uk, france, germany } = await launchedSeason(t);
    const stationId = await standingStation(
      t,
      germany,
      [pointIn(FINISTERE).lon, pointIn(FINISTERE).lat],
      'germany',
      FINISTERE,
    );
    const station = (await t.run((ctx) => ctx.db.get(stationId)))!;
    const capture = await capturing(t, uk, germany, station, NEAR_FINISTERE);
    await reach(t, capture.completesAt);
    expect(await holderOf(t, stationId)).toBe(await playerOf(t, uk));

    const movement = await sailing(t, france, ['escort', 'cargo'], [OFF_USHANT, CHANNEL]);
    const destination = await ownDestination(t, france, movement._id);
    const row = await rowOf(t, uk, movement._id);
    expect(row).toMatchObject({ detectorId: stationId });
    await reach(t, row!.ultraFrom!);
    expect((await arcOf(t, uk, movement._id))!.destination).toEqual(destination);
    await servesNoDestination(t, germany);
  });

  it('7. hears nothing from a station whose coal has run dry', async () => {
    const t = boot();
    const { uk, france } = await launchedSeason(t);
    await builtStation(t, uk, CORNWALL);
    const ukId = await playerOf(t, uk);
    await t.run(async (ctx) => {
      const coal = (
        await ctx.db
          .query('resources')
          .withIndex('byPlayer', (q) => q.eq('playerId', ukId))
          .collect()
      ).find((row) => row.key === 'coal')!;
      await ctx.db.patch(coal._id, { stock: 0, updatedAt: Date.now() });
    });
    /** Le réveil que l'économie pose à l'instant où le charbon manque. */
    await t.mutation(internal.listening.reassess, { playerId: ukId });
    expect((await t.run((ctx) => ctx.db.get(ukId)))!.listeningSilent).toBe(true);

    const movement = await sailing(t, france);
    await reach(t, movement.arrivesAt);
    for (const row of await rowsOf(t, uk)) {
      expect(row.detector).not.toBe('station');
      expect(row).not.toHaveProperty('ultraFrom');
    }
    await servesNoDestination(t, uk);
  });

  /**
   * **8. Le coude de la Doctrine, hors d'écoute** : le Japon vire au large d'une vigie, loin de la
   * station qui l'avait entendu. Le nouveau mouvement naît sans destination ; l'ancien, figé,
   * garde celle que la station avait entendue.
   */
  it('8. serves no destination for a Doctrine turn the station does not hear', async () => {
    const t = boot();
    const { uk, japan } = await launchedSeason(t, ['uk', 'japan']);
    const quarter: LonLat = [147.5, 27];
    /** Avant la mi-route : la Doctrine ne vire pas au-delà. */
    const turning = { lon: 149.5, lat: 26.2 };
    await standingStation(t, uk, [quarter[0], quarter[1] + 0.3], 'uk');
    await vigie(t, uk, turning);
    const movement = await sailing(
      t,
      japan,
      ['escort', 'cargo'],
      [
        { lon: 145, lat: 28 },
        { lon: 155, lat: 24 },
      ],
    );
    const destination = await ownDestination(t, japan, movement._id);
    const row = await rowOf(t, uk, movement._id);
    await reach(t, row!.ultraFrom!);
    expect((await arcOf(t, uk, movement._id))!.destination).toEqual(destination);

    /** Au plus près de la vigie, loin de la station : elle relève le coude, rien ne l'entend. */
    const force = marchingForce(movement);
    const span = movement.arrivesAt - movement.departedAt;
    const turnAt = movement.departedAt + span * 0.45;
    const [lon, lat] = positionAt(force, turnAt);
    expect(distanceKm([lon, lat], [quarter[0], quarter[1] + 0.3])).toBeGreaterThan(
      LISTENING_STATION_RADIUS_KM,
    );
    await reach(t, turnAt);
    const turned = await t.mutation(api.movements.changeCourse, {
      ...japan,
      movementId: movement._id,
      type: 'march',
      target: { kind: 'point', point: { lon: 147, lat: 16 } },
    });

    const fresh = (await rowsOf(t, uk)).find((one) => one.movementId === turned.movementId);
    expect(fresh).toBeDefined();
    expect(fresh).not.toHaveProperty('ultraFrom');
    expect(fresh).not.toHaveProperty('heardDestination');
    expect((await arcOf(t, uk, turned.movementId))?.destination).toBeUndefined();
    expect((await arcOf(t, uk, movement._id))!.destination).toEqual(destination);
  });

  /**
   * **9. La poursuite navale** : la flotte qui poursuit recourbe sa route sur place, à chaque
   * réveil. Une station l'entend au départ, puis la perd ; chaque coude d'après est un ordre
   * qu'elle n'a pas entendu. Plus loin, une seconde station l'entend de nouveau, au milieu d'une
   * jambe : elle entend la route de l'instant. Ne se teste ici que la destination, pas l'arc.
   */
  it('9. serves a pursuing fleet the destination of the last leg a station heard', async () => {
    const t = boot();
    const { uk, france, germany } = await launchedSeason(t);
    const FR = { lon: -19.5, lat: 45 };
    const DE = { lon: -17.3, lat: 45 };
    const stations: ReadonlyArray<LonLat> = [
      [FR.lon, FR.lat + 0.3],
      [-15.5, 45.35],
    ];
    for (const at of stations) await standingStation(t, uk, at, 'uk');
    const hunters = [await postAt(t, france, 'carrier', FR), await postAt(t, france, 'escort', FR)];
    const cargo = await postAt(t, germany, 'cargo', DE);
    await t.mutation(api.movements.marchTo, {
      ...germany,
      origin: { kind: 'point', point: DE },
      troopIds: [cargo],
      point: { lon: -8, lat: 45 },
    });
    const track = (await t.query(api.view.playerView, france)).detected!.find(
      (arc) => arc.seenTo >= Date.now(),
    )!;
    await t.mutation(api.movements.attack, {
      ...france,
      origin: { kind: 'point', point: FR },
      troopIds: hunters,
      target: { kind: 'track', movementId: track.id as Id<'movements'> },
    });
    const chaseOf = () =>
      t.run(
        async (ctx) =>
          (await ctx.db.query('movements').collect()).find((one) =>
            one.troopIds.includes(hunters[0]!),
          ) ?? null,
      );
    const chase0 = (await chaseOf())!;

    /**
     * **Une jambe entendue** : un échantillon de sa grille, depuis son départ et jusqu'à `until`,
     * tombe sous une station. C'est la grille de la détection ; l'instant où la jambe est entendue
     * pour la première fois, ou `null`.
     */
    const legs = [chase0];
    const heardAt = (index: number, until: number): number | null => {
      const leg = legs[index]!;
      const end = Math.min(until, legs[index + 1]?.departedAt ?? Infinity);
      const step = (leg.arrivesAt - leg.departedAt) / INTERCEPTION_SAMPLES;
      for (let sample = 0; sample <= INTERCEPTION_SAMPLES; sample += 1) {
        const at = leg.departedAt + sample * step;
        if (at > end) return null;
        const here = positionAt(marchingForce(leg), at);
        if (stations.some((station) => distanceKm(here, station) <= LISTENING_STATION_RADIUS_KM))
          return at;
      }
      return null;
    };
    /** La destination de la dernière jambe entendue à l'instant. */
    const heardTo = () => {
      for (let index = legs.length - 1; index >= 0; index -= 1)
        if (heardAt(index, Date.now()) !== null) return legs[index]!.to;
      return null;
    };
    expect(heardAt(0, chase0.departedAt)).toBe(chase0.departedAt);

    let served = 0;
    let stale = 0;
    for (let step = 0; step < 2000; step += 1) {
      if ((await chaseOf())?.pursuit === undefined) break;
      /** Le prochain job, ou cinq minutes : on regarde aussi entre deux coudes. */
      const next = await t.run(async (ctx) =>
        Math.min(
          ...(await ctx.db.system.query('_scheduled_functions').collect())
            .filter((one) => one.state.kind === 'pending')
            .map((one) => one.scheduledTime),
        ),
      );
      await reach(t, Math.min(next, Date.now() + 5 * MINUTE));
      const after = await chaseOf();
      if (after !== null && after.departedAt !== legs.at(-1)!.departedAt) legs.push(after);
      const arc = await arcOf(t, uk, chase0._id);
      if (arc?.destination === undefined) continue;
      served += 1;
      const expected = heardTo();
      if (
        distanceKm([expected!.lon, expected!.lat], [legs.at(-1)!.to.lon, legs.at(-1)!.to.lat]) > 1
      )
        stale += 1;
      expect(arc.destination.point).toEqual(expected);
    }
    /** La scène prouve quelque chose : la flotte a tourné hors d'écoute sous un arc servi, et une
     *  station l'a reprise au milieu d'une jambe, loin de tout coude. */
    expect(served).toBeGreaterThan(0);
    expect(stale).toBeGreaterThan(0);
    const late = legs.filter((leg, index) => {
      const at = heardAt(index, Infinity);
      return at !== null && at > leg.departedAt;
    });
    expect(late.length).toBeGreaterThan(0);
  });

  it('10. keeps the destination through the arrival, and forgets it with the last position', async () => {
    const t = boot();
    const { uk, france } = await launchedSeason(t);
    await builtStation(t, uk, CORNWALL);
    const movement = await sailing(t, france);
    const destination = await ownDestination(t, france, movement._id);

    await reach(t, movement.arrivesAt);

    /** L'arrivée est celle du jeu : le job `arrive` posé au départ, joué à son heure. */
    const arrival = await t.run(async (ctx) =>
      (await ctx.db.system.query('_scheduled_functions').collect()).find(
        (job) => job.name === 'movements:arrive' && job.args[0]?.movementId === movement._id,
      ),
    );
    expect(arrival).toMatchObject({ state: { kind: 'success' } });
    expect(await t.run((ctx) => ctx.db.get(movement._id))).toBeNull();
    const row = await rowOf(t, uk, movement._id);
    expect(row!.frozen!.destination).toEqual(destination);
    expect((await arcOf(t, uk, movement._id))!.destination).toEqual(destination);
    const forgotten = row!.frozen!.closedAt + LAST_KNOWN_HOURS * HOUR;
    await reach(t, forgotten - 1);
    expect((await arcOf(t, uk, movement._id))!.destination).toEqual(destination);
    await reach(t, forgotten);
    expect(await arcOf(t, uk, movement._id)).toBeUndefined();
  });

  it('11. forgets the future hearing of a fallen headquarters, keeps what it heard', async () => {
    const t = boot();
    const { uk, france, germany } = await launchedSeason(t);
    const station = await builtStation(t, uk, CORNWALL);
    await vigie(t, uk, OFFING);
    const hq = await t.run(async (ctx) =>
      (await ctx.db.query('buildings').collect()).find(
        (one) =>
          one.key === 'hq' && one.homeOf !== undefined && one.regionId === capitalRegionOf('uk'),
      ),
    );
    const capture = await capturing(t, germany, uk, hq!, NEAR_WESTMINSTER);
    await reach(t, capture.completesAt - 100 * MINUTE);
    const heard = await sailing(t, france);
    const heardDestination = await ownDestination(t, france, heard._id);
    await reach(t, capture.completesAt - 60 * MINUTE);
    const unheard = await sailing(t, france);
    const rows = await rowsOf(t, uk);
    const past = rows.find((one) => one.movementId === heard._id)!;
    const future = rows.find((one) => one.movementId === unheard._id)!;
    expect(past.ultraFrom).toBeLessThan(capture.completesAt);
    expect(future.ultraFrom).toBeGreaterThan(capture.completesAt);
    await reach(t, past.ultraFrom! + 1);

    await reach(t, capture.completesAt);

    expect(await holderOf(t, station._id)).not.toBe(await playerOf(t, uk));
    const fallen = (await rowsOf(t, uk)).find((one) => one.movementId === unheard._id);
    expect(fallen).not.toHaveProperty('ultraFrom');
    expect(await jobOf(t, future.ultraJobId!)).toMatchObject({ state: { kind: 'canceled' } });
    expect((await arcOf(t, uk, heard._id))!.destination).toEqual(heardDestination);
    await reach(t, unheard.arrivesAt);
    expect((await arcOf(t, uk, heard._id))!.destination).toEqual(heardDestination);
    expect((await arcOf(t, uk, unheard._id))?.destination).toBeUndefined();
  });

  it('12. never hears in a season founded in Blitz', async () => {
    const t = boot();
    const token = await signIn(t, 'Pierre');
    const { code, seasonId } = await t.mutation(api.seasons.create, {
      token,
      compensation: 0.5,
      mode: 'blitz',
      theatre: 'europe',
    });
    await t.run((ctx) => ctx.db.patch(seasonId, { seed: TEST_SEASON_SEED }));
    const uk: Seat = { token, seasonId };
    const france = await joinSeat(t, code, 'Léa');
    for (const [seat, nation] of [
      [uk, 'uk'],
      [france, 'france'],
    ] as const) {
      await t.mutation(api.players.reserveNation, { ...seat, nation });
      await t.mutation(api.players.declareReady, { ...seat, ready: true });
    }
    await t.mutation(api.seasons.launch, uk);
    await t.action(internal.blitz.place, { seasonId });
    await standingStation(t, uk, [pointIn(CORNWALL).lon, pointIn(CORNWALL).lat], 'uk');

    /** Une colonne d'une seule pièce : la Blitz n'en marche pas d'autre. */
    const movement = await sailing(t, france, ['escort']);
    await reach(t, movement.arrivesAt);
    const rows = await rowsOf(t, uk);
    expect(rows.some((row) => row.detector === 'station')).toBe(true);
    for (const row of rows) {
      expect(row).not.toHaveProperty('ultraFrom');
      expect(row).not.toHaveProperty('heardDestination');
    }
    await servesNoDestination(t, uk);
  });
});
