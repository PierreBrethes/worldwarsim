import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { THEATRES } from '../src/domain/theatres';
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

/** Sort la garnison d'un bâtiment à quelques kilomètres : il redevient libre (U6). */
const vacate = (t: Bench, building: { _id: Id<'buildings'>; regionId: string; point?: unknown }) =>
  t.run(async (ctx) => {
    const [lon, lat] = pointOfBuilding(building as never)!;
    const inside = await ctx.db
      .query('troops')
      .withIndex('byStation', (q) => q.eq('stationedAt', building._id))
      .collect();
    for (const troop of inside) {
      await ctx.db.patch(troop._id, { stationedAt: { lon: lon + 1.5, lat } });
    }
    return inside;
  });

const fundsServed = async (t: Bench, seat: Seat) =>
  (await t.query(api.view.playerView, seat)).me.funds;

describe('la carte de départ de la Blitz', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  it('donne à chacun un QG, une caserne, un fantassin dans chacun et un pécule ; le reste est neutre', async () => {
    const t = boot();
    const { seat, guest } = await blitzLaunched(t);
    for (const who of [seat, guest]) {
      const me = await playerOf(t, who);
      const held = await buildingsOf(t, me._id);
      expect(held.map((building) => building.key).sort()).toEqual(['barracks', 'hq']);
      expect((await troopsOf(t, me._id)).map((troop) => troop.stationedAt).sort()).toEqual(
        held.map((building) => building._id).sort(),
      );
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

  it('n’assoit pas plus de joueurs que son théâtre n’en tient (T1)', async () => {
    const t = boot();
    const token = await signIn(t, 'Pierre');
    const { code } = await t.mutation(api.seasons.create, {
      token,
      compensation: 0.5,
      mode: 'blitz',
      theatre: 'pacific',
    });
    await joinSeat(t, code, 'Léa');
    const third = await signIn(t, 'Tiers');
    await expect(t.mutation(api.seasons.join, { token: third, code })).rejects.toThrow(
      /BLITZ_FULL/,
    );
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

  /** **Chaque théâtre se pose à son plafond** (T1) ; un de plus échouait sur six graines sur six
   *  le 14/10 (Pacifique à 3, Amériques et Méditerranée à 4), d'où les fourchettes de
   *  `THEATRES`. */
  for (const { id: theatre, players: range } of THEATRES) {
    const players = range.max;
    it(`pose à pied dans la tolérance — ${theatre} à ${String(players)}`, async () => {
      const t = boot();
      const seats = await blitzLaunchedOn(t, theatre, players);
      const season = (await t.run((ctx) => ctx.db.get(seats[0]!.seasonId)))!;
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

  it('perd la recrue déjà en formation, sans fonds ni alliage rendus', async () => {
    const t = boot();
    const { seat, guest } = await blitzLaunched(t);
    const me = await playerOf(t, seat);
    const loser = await playerOf(t, guest);
    const barracks = (await buildingsOf(t, loser._id)).find((b) => b.key === 'barracks')!;
    await vacate(t, barracks);
    await t.mutation(api.troops.recruit, {
      ...guest,
      buildingId: barracks._id,
      role: 'infantry',
      tier: 1,
    });
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
    expect((await playerOf(t, guest)).funds).toBe(before + minutes * BLITZ.fundsPerMinute.hq!);
    expect(await t.run((ctx) => ctx.db.query('recruitments').collect())).toEqual([]);
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
    await vacate(t, hq);
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
    expect((await troopsOf(t, me._id)).map((troop) => troop.stationedAt)).toContain(hq._id);
  });

  it('ne forme que dans un bâtiment libre, la recrue en formation comprise (U6)', async () => {
    const t = boot();
    const { seat } = await blitzLaunched(t);
    const me = await playerOf(t, seat);
    const hq = (await buildingsOf(t, me._id)).find((building) => building.key === 'hq')!;
    const order = { ...seat, buildingId: hq._id, role: 'infantry' as const, tier: 1 as const };
    await expect(t.mutation(api.troops.recruit, order)).rejects.toThrow(/SITE_OCCUPIED/);
    await vacate(t, hq);
    await t.mutation(api.troops.recruit, order);
    await expect(t.mutation(api.troops.recruit, order)).rejects.toThrow(/SITE_OCCUPIED/);
  });

  it('pose la recrue à la porte quand une des miennes est entrée entre-temps', async () => {
    const t = boot();
    const { seat } = await blitzLaunched(t);
    const me = await playerOf(t, seat);
    const hq = (await buildingsOf(t, me._id)).find((building) => building.key === 'hq')!;
    const [guard] = await vacate(t, hq);
    const { recruitmentId } = await t.mutation(api.troops.recruit, {
      ...seat,
      buildingId: hq._id,
      role: 'infantry',
      tier: 1,
    });
    await t.run((ctx) => ctx.db.patch(guard!._id, { stationedAt: hq._id }));
    await t.mutation(internal.troops.deliver, { recruitmentId });
    const [lon, lat] = pointOfBuilding(hq)!;
    expect(
      (await troopsOf(t, me._id))
        .filter((troop) => troop._id !== guard!._id)
        .map((troop) => troop.stationedAt),
    ).toContainEqual({ lon, lat });
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
    await vacate(t, barracks);
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

/** Une infanterie de `by` arrive sur `site` pour le capturer, et la capture va à son terme. */
async function captureToTheEnd(
  t: Bench,
  by: Id<'players'>,
  seasonId: Id<'seasons'>,
  site: { _id: Id<'buildings'>; regionId: string },
) {
  const [infantry] = (await troopsOf(t, by)).filter((troop) => troop.role === 'infantry');
  const [lon, lat] = pointOfBuilding(site as never)!;
  const movementId = await t.run((ctx) =>
    ctx.db.insert('movements', {
      seasonId,
      playerId: by,
      type: 'attack',
      fromBuildingId: null,
      target: { kind: 'building', buildingId: site._id },
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
      departedAt: Date.now(),
      arrivesAt: Date.now(),
      capture: { kind: 'building', buildingId: site._id },
    }),
  );
  await t.mutation(internal.movements.arrive, { movementId });
  const [capture] = await t.run((ctx) => ctx.db.query('captures').collect());
  vi.setSystemTime(capture!.completesAt);
  await t.mutation(internal.captures.complete, {
    captureId: capture!._id,
    expectedAt: capture!.completesAt,
  });
  return capture!;
}

describe('la chute d’un QG (B10)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  it('se capture en six minutes, élimine le perdant et conclut la Blitz à deux', async () => {
    const t = boot();
    const { seat, guest } = await blitzLaunched(t);
    const me = await playerOf(t, seat);
    const loser = await playerOf(t, guest);
    const held = await buildingsOf(t, loser._id);
    const hq = held.find((building) => building.key === 'hq')!;
    await vacate(t, hq);

    const capture = await captureToTheEnd(t, me._id, seat.seasonId, hq);
    expect(capture.completesAt - MIDDAY).toBe(6 * MINUTE);

    expect(await buildingsOf(t, loser._id)).toEqual([]);
    expect((await buildingsOf(t, me._id)).map((building) => building._id)).toEqual(
      expect.arrayContaining(held.map((building) => building._id)),
    );
    expect(await troopsOf(t, loser._id)).toEqual([]);
    expect((await playerOf(t, guest)).defeated).toBe(true);
    const season = (await t.run((ctx) => ctx.db.get(seat.seasonId)))!;
    expect(season).toMatchObject({
      status: 'concluded',
      winnerId: me._id,
      verdict: { reason: 'hqTaken' },
    });
    const view = await t.query(api.view.playerView, guest);
    expect(view.press).toMatchObject({ final: true });
    expect(view.season.verdict).toEqual({
      reason: 'hqTaken',
      winnerNation: 'france',
      perMinute: null,
    });
  });

  it('à trois, élimine sans conclure, et le dit à toute la table', async () => {
    const t = boot();
    const [first, second, third] = await blitzLaunchedOn(t, 'europe', 3);
    const me = await playerOf(t, first!);
    const loser = await playerOf(t, second!);
    const hq = (await buildingsOf(t, loser._id)).find((building) => building.key === 'hq')!;
    await vacate(t, hq);
    await captureToTheEnd(t, me._id, first!.seasonId, hq);

    expect((await t.run((ctx) => ctx.db.get(first!.seasonId)))!.status).toBe('launched');
    const watcher = await playerOf(t, third!);
    const notices = await t.run((ctx) =>
      ctx.db
        .query('notices')
        .withIndex('byPlayer', (q) => q.eq('playerId', watcher._id))
        .collect(),
    );
    expect(notices).toContainEqual(
      expect.objectContaining({ kind: 'playerEliminated', nation: 'ussr', by: 'france' }),
    );
    await expect(
      t.mutation(api.troops.recruit, {
        ...second!,
        buildingId: hq._id,
        role: 'infantry',
        tier: 1,
      }),
    ).rejects.toThrow();
  });
});

describe('la fin à deux heures (B11)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  const END = MIDDAY + 2 * 60 * MINUTE;

  it('se planifie au lancement, sans édition toutes les trois heures', async () => {
    const t = boot();
    await blitzLaunched(t);
    const jobs = await t.run((ctx) => ctx.db.system.query('_scheduled_functions').collect());
    expect(jobs.filter((job) => job.name.includes('closeAtClock'))).toEqual([
      expect.objectContaining({ scheduledTime: END }),
    ]);
    expect(jobs.filter((job) => job.name.includes('press'))).toEqual([]);
  });

  it('donne la saison au plus gros revenu, une seule fois', async () => {
    const t = boot();
    const { seat, guest } = await blitzLaunched(t);
    const me = await playerOf(t, seat);
    const city = (await buildingsOf(t, (await neutralOf(t, seat.seasonId))._id)).find(
      (building) => building.key === 'city',
    )!;
    await t.run((ctx) => ctx.db.patch(city._id, { playerId: me._id, capturedAt: MIDDAY }));
    vi.setSystemTime(END);
    await t.mutation(internal.blitz.closeAtClock, { seasonId: seat.seasonId, expectedAt: END });
    expect(await t.run((ctx) => ctx.db.get(seat.seasonId))).toMatchObject({
      status: 'concluded',
      winnerId: me._id,
      verdict: {
        reason: 'income',
        perMinute: BLITZ.fundsPerMinute.hq! + BLITZ.fundsPerMinute.city!,
      },
    });
    const editions = await t.run((ctx) => ctx.db.query('editions').collect());
    expect(editions.every((line) => line.final)).toBe(true);
    await t.mutation(internal.blitz.closeAtClock, { seasonId: seat.seasonId, expectedAt: END });
    expect(await t.run((ctx) => ctx.db.query('editions').collect())).toHaveLength(editions.length);
    expect((await t.query(api.view.playerView, guest)).season.verdict).toMatchObject({
      reason: 'income',
      winnerNation: 'france',
    });
  });

  it('déclare l’égalité à revenu et caisse égaux', async () => {
    const t = boot();
    const { seat } = await blitzLaunched(t);
    vi.setSystemTime(END);
    await t.mutation(internal.blitz.closeAtClock, { seasonId: seat.seasonId, expectedAt: END });
    expect(await t.run((ctx) => ctx.db.get(seat.seasonId))).toMatchObject({
      status: 'concluded',
      winnerId: null,
      verdict: { reason: 'draw' },
    });
  });
});
