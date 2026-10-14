import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { BLITZ } from './constants';
import { captureAimOf } from './movement/orders';
import { pointOfBuilding, regionFacts } from './regions';
import { routeKmFrom } from './routes';
import { surveyFromPoint } from './surveys';
import schema from './schema';
import { modules } from './test.setup';
import { joinSeat, seatIn, signIn, TEST_SEASON_SEED, type Seat } from './seats.fixture';

const boot = () => convexTest({ schema, modules, transactionLimits: true });
/** La pose mesure des routes sur la grille : quelques secondes sous `convex-test`. */
vi.setConfig({ testTimeout: 30_000 });
type Bench = ReturnType<typeof boot>;
const MIDDAY = Date.UTC(2026, 9, 14, 12);
const MINUTE = 60_000;

const NATIONS = ['france', 'ussr', 'japan', 'usa'] as const;

async function blitzLaunchedOn(t: Bench, theatre: string, players: number) {
  const token = await signIn(t, 'Pierre');
  const { code, seasonId } = await t.mutation(api.seasons.create, {
    token,
    compensation: 0.5,
    mode: 'blitz',
    theatre,
  });
  await t.run((ctx) => ctx.db.patch(seasonId, { seed: TEST_SEASON_SEED }));
  const seat: Seat = { token, seasonId };
  const seats = [seat];
  for (let rank = 1; rank < players; rank += 1) {
    seats.push(await joinSeat(t, code, `Joueur ${String(rank)}`));
  }
  for (const [rank, who] of seats.entries()) {
    await t.mutation(api.players.reserveNation, { ...who, nation: NATIONS[rank]! });
    await t.mutation(api.players.declareReady, { ...who, ready: true });
  }
  await t.mutation(api.seasons.launch, seat);
  await t.action(internal.blitz.place, { seasonId });
  return seats;
}

async function blitzLaunched(t: Bench) {
  const [seat, guest] = await blitzLaunchedOn(t, 'europe', 2);
  return { seat: seat!, guest: guest! };
}

const playerOf = (t: Bench, seat: Seat) => t.run((ctx) => seatIn(ctx, seat));

const buildingsOf = (t: Bench, playerId: Id<'players'>) =>
  t.run((ctx) =>
    ctx.db
      .query('buildings')
      .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
      .collect(),
  );

const troopsOf = (t: Bench, playerId: Id<'players'>) =>
  t.run((ctx) =>
    ctx.db
      .query('troops')
      .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
      .collect(),
  );

const neutralOf = (t: Bench, seasonId: Id<'seasons'>) =>
  t.run(async (ctx) => {
    const seats = await ctx.db
      .query('players')
      .withIndex('bySeason', (q) => q.eq('seasonId', seasonId))
      .collect();
    return seats.find((candidate) => candidate.irregular === true)!;
  });

const fundsServed = async (t: Bench, seat: Seat) =>
  (await t.query(api.view.playerView, seat)).me.funds;

describe('la carte de départ de la Blitz', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  it('donne à chacun un QG, une caserne, deux fantassins et un pécule ; le reste est neutre', async () => {
    const t = boot();
    const { seat, guest } = await blitzLaunched(t);
    for (const who of [seat, guest]) {
      const me = await playerOf(t, who);
      const held = await buildingsOf(t, me._id);
      expect(held.map((building) => building.key).sort()).toEqual(['barracks', 'hq']);
      const hq = held.find((building) => building.key === 'hq')!;
      expect((await troopsOf(t, me._id)).map((troop) => [troop.role, troop.stationedAt])).toEqual([
        ['infantry', hq._id],
        ['infantry', hq._id],
      ]);
      expect(me.funds).toBe(BLITZ.startingFunds);
    }
    const neutral = await buildingsOf(t, (await neutralOf(t, seat.seasonId))._id);
    expect(neutral.length).toBeGreaterThan(4);
    expect(new Set(neutral.map((building) => building.key))).toContain('city');
    for (const port of neutral.filter((building) => building.key === 'port')) {
      expect(port.point).toBeDefined();
    }
    expect(await troopsOf(t, (await neutralOf(t, seat.seasonId))._id)).toEqual([]);
  });

  it('ferme la porte au lancement : ni place, ni entrée en guerre (E4)', async () => {
    const t = boot();
    const { seat } = await blitzLaunched(t);
    const { code } = (await t.run((ctx) => ctx.db.get(seat.seasonId)))!;
    const late = await signIn(t, 'Retard');
    await expect(t.mutation(api.seasons.join, { token: late, code })).rejects.toThrow(
      /BLITZ_STARTED/,
    );
  });

  it('revient au salon quand la pose échoue, au lieu de laisser une saison sans carte', async () => {
    const t = boot();
    const token = await signIn(t, 'Pierre');
    const { code, seasonId } = await t.mutation(api.seasons.create, {
      token,
      compensation: 0.5,
      mode: 'blitz',
      theatre: 'europe',
    });
    const seat: Seat = { token, seasonId };
    const guest = await joinSeat(t, code, 'Léa');
    for (const [who, nation] of [
      [seat, 'france'],
      [guest, 'ussr'],
    ] as const) {
      await t.mutation(api.players.reserveNation, { ...who, nation });
      await t.mutation(api.players.declareReady, { ...who, ready: true });
    }
    await t.mutation(api.seasons.launch, seat);
    await t.run((ctx) => ctx.db.patch(seasonId, { theatre: 'atlantide' }));
    await t.action(internal.blitz.place, { seasonId });
    expect(await t.run((ctx) => ctx.db.get(seasonId))).toMatchObject({
      status: 'lobby',
      launchRefusal: 'BLITZ_MAP_FAILED',
    });
    expect((await t.query(api.seasons.lobby, seat)).launchRefusal).toBe('BLITZ_MAP_FAILED');
  });

  it('ne se pose qu’une fois', async () => {
    const t = boot();
    const { seat } = await blitzLaunched(t);
    const before = await t.run((ctx) => ctx.db.query('buildings').collect());
    await t.action(internal.blitz.place, { seasonId: seat.seasonId });
    expect(await t.run((ctx) => ctx.db.query('buildings').collect())).toHaveLength(before.length);
  });

  it('sert les neutres à tout le monde, sans aucune des huit ressources', async () => {
    const t = boot();
    const { seat } = await blitzLaunched(t);
    const view = await t.query(api.view.playerView, seat);
    expect(view.neutralSites.length).toBeGreaterThan(4);
    expect(view.me.foundation).toEqual([]);
    expect(Object.values(view.me.resources).every((resource) => resource.stock === 0)).toBe(true);
  });
});

describe('la carte de départ, théâtre par théâtre', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  /** **Le Pacifique à quatre est refusé** : le cercle passe sur l'océan, et les QG d'où l'on
   *  marche (Japon, Philippines, Papouasie, Nouvelle-Zélande) sont à 0,31 d'équité. */
  for (const [theatre, players, fair] of [
    ['europe', 4, true],
    ['pacific', 2, true],
    ['pacific', 4, false],
    ['americas', 3, true],
    ['mediterranean', 3, true],
  ] as const) {
    it(`pose à pied dans la tolérance, ou revient au salon — ${theatre} à ${String(players)}`, async () => {
      const t = boot();
      const seats = await blitzLaunchedOn(t, theatre, players);
      const season = (await t.run((ctx) => ctx.db.get(seats[0]!.seasonId)))!;
      if (!fair) {
        expect(season).toMatchObject({ status: 'lobby', launchRefusal: 'BLITZ_MAP_UNFAIR' });
        expect(await t.run((ctx) => ctx.db.query('resources').collect())).toEqual([]);
        return;
      }
      expect(season.status).toBe('launched');
      const neutral = await neutralOf(t, season._id);
      const neutrals = await buildingsOf(t, neutral._id);
      const ports = neutrals.filter((building) => building.key === 'port');
      expect(ports.length).toBeGreaterThanOrEqual(players);
      for (const port of ports) expect(port.point).toBeDefined();
      for (const who of seats) {
        const me = await playerOf(t, who);
        const held = await buildingsOf(t, me._id);
        const hq = held.find((building) => building.key === 'hq')!;
        const others = [...held.filter((building) => building.key !== 'hq'), ...neutrals];
        const onFoot = routeKmFrom(
          pointOfBuilding(hq)!,
          others.map((building) => ({
            id: building._id as string,
            point: regionFacts(building.regionId)!.point,
          })),
          'land',
        );
        const barracks = held.find((building) => building.key === 'barracks')!;
        const target = BLITZ.map.starting[0]!.km;
        expect(Math.abs(onFoot.get(barracks._id)! - target)).toBeLessThanOrEqual(
          target * BLITZ.map.tolerance,
        );
        const cities = neutrals.filter(
          (building) =>
            building.key === 'city' &&
            Math.abs((onFoot.get(building._id) ?? Infinity) - 250) <= 250 * BLITZ.map.tolerance,
        );
        expect(cities.length).toBeGreaterThan(0);
      }
    });
  }
});

describe('les fonds de la Blitz', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  it('tombent chaque minute pour le QG tenu', async () => {
    const t = boot();
    const { seat } = await blitzLaunched(t);
    vi.setSystemTime(MIDDAY + 2 * MINUTE);
    expect(await fundsServed(t, seat)).toEqual({
      stock: BLITZ.startingFunds + 2 * BLITZ.fundsPerMinute.hq!,
      perMinute: BLITZ.fundsPerMinute.hq,
    });
  });

  it('suivent une ville neutre capturée, réglés à l’heure de la capture', async () => {
    const t = boot();
    const { seat, guest } = await blitzLaunched(t);
    const me = await playerOf(t, seat);
    const neutral = await neutralOf(t, seat.seasonId);
    const city = (await buildingsOf(t, neutral._id)).find((building) => building.key === 'city')!;
    const aimed = await t.run((ctx) =>
      captureAimOf(ctx, me, { kind: 'building', buildingId: city._id }),
    );
    expect(aimed.target).toEqual({ kind: 'building', buildingId: city._id });

    const [infantry] = await troopsOf(t, me._id);
    const [lon, lat] = pointOfBuilding(city)!;
    const movementId = await t.run((ctx) =>
      ctx.db.insert('movements', {
        seasonId: seat.seasonId,
        playerId: me._id,
        type: 'attack',
        fromBuildingId: null,
        target: { kind: 'building', buildingId: city._id },
        from: { lon: lon - 1, lat },
        to: { lon, lat },
        hostCountry: '',
        points: [
          { lon: lon - 1, lat },
          { lon, lat },
        ],
        legs: [{ medium: 'land', distanceUnits: 1 }],
        distanceUnits: 1,
        costUnits: 1,
        troopIds: [infantry!._id],
        departedAt: MIDDAY,
        arrivesAt: MIDDAY,
        capture: { kind: 'building', buildingId: city._id },
      }),
    );
    await t.mutation(internal.movements.arrive, { movementId });
    const [capture] = await t.run((ctx) => ctx.db.query('captures').collect());
    expect(capture!.completesAt).toBe(MIDDAY + 3 * MINUTE);

    vi.setSystemTime(capture!.completesAt);
    await t.mutation(internal.captures.complete, {
      captureId: capture!._id,
      expectedAt: capture!.completesAt,
    });
    expect((await t.run((ctx) => ctx.db.get(city._id)))!.playerId).toBe(me._id);
    vi.setSystemTime(MIDDAY + 4 * MINUTE);
    const hq = BLITZ.fundsPerMinute.hq!;
    const town = BLITZ.fundsPerMinute.city!;
    expect(await fundsServed(t, seat)).toEqual({
      stock: BLITZ.startingFunds + 4 * hq + town,
      perMinute: hq + town,
    });

    /** **Le brouillard tient** : l'autre la voit neutre tant qu'il ne l'a pas relevée. */
    const neutralFor = async (who: Seat) =>
      (await t.query(api.view.playerView, who)).neutralSites.map((site) => site.id);
    expect(await neutralFor(seat)).not.toContain(city._id);
    expect(await neutralFor(guest)).toContain(city._id);
    const other = await playerOf(t, guest);
    /** L'ordre part sur la foi de ce qu'il voit : un refus lui apprendrait la prise. */
    await expect(
      t.run((ctx) => captureAimOf(ctx, other, { kind: 'building', buildingId: city._id })),
    ).resolves.toMatchObject({ target: { kind: 'building', buildingId: city._id } });
    await t.run((ctx) => surveyFromPoint(ctx, other._id, pointOfBuilding(city)!, Date.now()));
    expect(await neutralFor(guest)).not.toContain(city._id);
  });
});

describe('la capture d’un neutre', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  it('part de la rose sans relevé, et la vue s’ouvre sur le QG', async () => {
    const t = boot();
    const { seat } = await blitzLaunched(t);
    const me = await playerOf(t, seat);
    const hq = (await buildingsOf(t, me._id)).find((building) => building.key === 'hq')!;
    const neutral = await neutralOf(t, seat.seasonId);
    const city = (await buildingsOf(t, neutral._id)).find((building) => building.key === 'city')!;
    const [infantry] = await troopsOf(t, me._id);
    await expect(
      t.mutation(api.movements.capture, {
        ...seat,
        origin: { kind: 'building', buildingId: hq._id },
        troopIds: [infantry!._id],
        target: { kind: 'building', buildingId: city._id },
      }),
    ).resolves.toMatchObject({ movementId: expect.any(String) });
    expect((await t.query(api.view.playerView, seat)).me.openingPoint).toEqual(pointOfBuilding(hq));
  });
});

describe('un site capturé avec sa file', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  it('rend au perdant les fonds d’une recrue qui n’a pas commencé, jamais de l’alliage', async () => {
    const t = boot();
    const { seat, guest } = await blitzLaunched(t);
    const me = await playerOf(t, seat);
    const loser = await playerOf(t, guest);
    const barracks = (await buildingsOf(t, loser._id)).find((b) => b.key === 'barracks')!;
    for (let rank = 0; rank < 2; rank += 1) {
      await t.mutation(api.troops.recruit, {
        ...guest,
        buildingId: barracks._id,
        role: 'infantry',
        tier: 1,
      });
    }
    const [infantry] = await troopsOf(t, me._id);
    const [lon, lat] = pointOfBuilding(barracks)!;
    const movementId = await t.run((ctx) =>
      ctx.db.insert('movements', {
        seasonId: seat.seasonId,
        playerId: me._id,
        type: 'attack',
        fromBuildingId: null,
        target: { kind: 'building', buildingId: barracks._id },
        from: { lon: lon - 1, lat },
        to: { lon, lat },
        hostCountry: '',
        points: [
          { lon: lon - 1, lat },
          { lon, lat },
        ],
        legs: [{ medium: 'land', distanceUnits: 1 }],
        distanceUnits: 1,
        costUnits: 1,
        troopIds: [infantry!._id],
        departedAt: MIDDAY,
        arrivesAt: MIDDAY,
        capture: { kind: 'building', buildingId: barracks._id },
      }),
    );
    await t.mutation(internal.movements.arrive, { movementId });
    const [capture] = await t.run((ctx) => ctx.db.query('captures').collect());
    const before = (await playerOf(t, guest)).funds!;
    vi.setSystemTime(capture!.completesAt);
    await t.mutation(internal.captures.complete, {
      captureId: capture!._id,
      expectedAt: capture!.completesAt,
    });
    const minutes = (capture!.completesAt - MIDDAY) / MINUTE;
    expect((await playerOf(t, guest)).funds).toBe(
      before + BLITZ.rolePrice.infantry + minutes * BLITZ.fundsPerMinute.hq!,
    );
    const alloy = await t.run(async (ctx) =>
      (
        await ctx.db
          .query('resources')
          .withIndex('byPlayer', (q) => q.eq('playerId', loser._id))
          .collect()
      ).find((row) => row.key === 'alloy'),
    );
    expect(alloy!.stock).toBe(0);
  });
});

describe('le recrutement de la Blitz', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  it('forme une infanterie au QG en une minute, payée en fonds', async () => {
    const t = boot();
    const { seat } = await blitzLaunched(t);
    const me = await playerOf(t, seat);
    const hq = (await buildingsOf(t, me._id)).find((building) => building.key === 'hq')!;
    const { recruitmentId } = await t.mutation(api.troops.recruit, {
      ...seat,
      buildingId: hq._id,
      role: 'infantry',
      tier: 1,
    });
    expect((await playerOf(t, seat)).funds).toBe(BLITZ.startingFunds - BLITZ.rolePrice.infantry);
    const batch = await t.run((ctx) => ctx.db.get(recruitmentId));
    expect(batch!.finishesAt).toBe(MIDDAY + BLITZ.recruitMinutes * MINUTE);

    await t.mutation(internal.troops.deliver, { recruitmentId });
    expect(await troopsOf(t, me._id)).toHaveLength(3);
  });

  it('refuse un blindé au QG, et ce que les fonds ne paient pas', async () => {
    const t = boot();
    const { seat } = await blitzLaunched(t);
    const me = await playerOf(t, seat);
    const held = await buildingsOf(t, me._id);
    const hq = held.find((building) => building.key === 'hq')!;
    const barracks = held.find((building) => building.key === 'barracks')!;
    await expect(
      t.mutation(api.troops.recruit, { ...seat, buildingId: hq._id, role: 'armor', tier: 1 }),
    ).rejects.toThrow(/WRONG_PROJECTION_BUILDING/);
    await t.run((ctx) => ctx.db.patch(me._id, { funds: 100 }));
    await expect(
      t.mutation(api.troops.recruit, { ...seat, buildingId: barracks._id, role: 'armor', tier: 1 }),
    ).rejects.toThrow(/INSUFFICIENT_FUNDS/);
  });
});

describe('le soin et l’absence de chantier', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  it('soigne une troupe entamée sur son QG, contre des fonds', async () => {
    const t = boot();
    const { seat } = await blitzLaunched(t);
    const me = await playerOf(t, seat);
    const [wounded] = await troopsOf(t, me._id);
    await t.run((ctx) => ctx.db.patch(wounded!._id, { currentStrength: 20 }));
    expect(
      (await t.query(api.view.playerView, seat)).me.troops.find(
        (troop) => troop.id === wounded!._id,
      )!.mending,
    ).toBe(true);

    await t.mutation(internal.blitz.mend, { seasonId: seat.seasonId });
    expect((await t.run((ctx) => ctx.db.get(wounded!._id)))!.currentStrength).toBe(25);
    expect((await playerOf(t, seat)).funds).toBe(BLITZ.startingFunds - 3);
  });

  it('refuse de démolir : en Blitz on ne bâtit rien', async () => {
    const t = boot();
    const { seat } = await blitzLaunched(t);
    const me = await playerOf(t, seat);
    const [first] = await buildingsOf(t, me._id);
    await expect(
      t.mutation(api.buildings.demolish, { ...seat, buildingId: first!._id }),
    ).rejects.toThrow(/NOT_IN_BLITZ/);
  });
});
