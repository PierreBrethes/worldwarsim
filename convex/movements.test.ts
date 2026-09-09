import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { distanceKm, type LonLat } from '../src/domain/geo';
import {
  ARRIVAL_RADIUS_KM,
  nominalStrength,
  OUTPOST_DISABLED_HOURS,
  outpostReachKm,
  REST_WINDOW_MINUTES,
  DETECTION_RANGE_KM,
  unlockLevel,
} from './constants';
import { ConvexError } from 'convex/values';
import type { BuildingKey, UnitRole } from '../src/domain/ids';
import {
  landCostOf,
  legalMovementTypes,
  refusalOf,
  type Column,
  type MovementAim,
} from '../src/domain/movement-orders';
import { COST_BY_MEDIUM } from '../src/domain/routing';
import { regionFacts } from './regions';
import { asPoint, pointOf } from './movement/forces';
import { coastAtPoint, hostAtPoint, landAtPoint, routeBetween } from './routes';
import schema from './schema';
import { modules } from './test.setup';

/** Le rayon d'un point neuf : la portée suit le niveau depuis le 31/08, et ces cas plantent
 *  tous un avant-poste de niveau 1. */
const REACH_KM = outpostReachKm(1);

const boot = () => convexTest(schema, modules);

const MARNE = 'FRA-5323'; // where the barracks stands
const PRAHOVA = 'ROU-310'; // Romanian oil, 1 800 km east — nobody's home country
const RUHR = 'DEU-1572'; // German, and far out of any Romanian reach
const RIYADH = 'SAU-1097'; // Ar Riyad — a second neutral, to prove neutrals are not one country
const PSKOV = 'RUS-2335'; // Soviet, so somebody sleeps there
/** **Une région immense, et un point dedans qui est loin de son pôle d'inaccessibilité** : le
 *  Fort McMurray albertain se tient à 378 km du point que `region-index.json` donne à l'Alberta,
 *  soit trois fois la portée d'un avant-poste neuf. C'est le cas qui a fait écrire la précision
 *  du 04/09 — et l'Alberta porte du pétrole, comme la Sibérie de la partie de test. */
const ALBERTA = 'CAN-632';
const FORT_MCMURRAY: LonLat = [-111.38, 56.73];
const SASKATCHEWAN = 'CAN-631'; // voisine, son point à 659 km : hors de portée et elle le reste

async function launchedSeason(t: ReturnType<typeof boot>) {
  const { code, token } = await t.mutation(api.seasons.create, {
    nickname: 'Pierre',
    durationHours: 48,
    compensation: 0.5,
  });
  const { token: guest } = await t.mutation(api.seasons.join, { code, nickname: 'Léa' });
  await t.mutation(api.players.reserveNation, { token, nation: 'france' });
  await t.mutation(api.players.declareReady, { token, ready: true });
  await t.mutation(api.players.reserveNation, { token: guest, nation: 'ussr' });
  await t.mutation(api.players.declareReady, { token: guest, ready: true });
  await t.mutation(api.seasons.launch, { token });
  await disbandTheGift(t, token, guest);
  return { token, guest };
}

/**
 * **The company the launch hands out, taken back** (`seasons.endow`, 25/08). Every count in
 * this file is about an army a test formed on purpose, so the endowment is cleared at the door
 * rather than added to twenty expectations. What it *is* is graved in `off-season.test.ts`,
 * where the endowment itself is under test.
 */
async function disbandTheGift(t: ReturnType<typeof boot>, ...tokens: ReadonlyArray<string>) {
  for (const token of tokens) {
    const playerId = await playerOf(t, token);
    await t.run(async (ctx) => {
      const held = await ctx.db
        .query('troops')
        .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
        .collect();
      for (const troop of held) await ctx.db.delete(troop._id);
    });
  }
}

async function playerOf(t: ReturnType<typeof boot>, token: string) {
  return t.run(async (ctx) => {
    const player = await ctx.db
      .query('players')
      .withIndex('byToken', (q) => q.eq('token', token))
      .unique();
    if (!player) throw new Error('player not found');
    return player._id;
  });
}

/** A standing building and a formed troop, without paying for either: what is under test is
 *  the march, not the production that fed it. */
async function raise(
  t: ReturnType<typeof boot>,
  token: string,
  key: BuildingKey,
  regionId: string,
  /** The quay a port stands on, when the test needs it away from its region's centroid. */
  point?: { lon: number; lat: number },
): Promise<Id<'buildings'>> {
  const playerId = await playerOf(t, token);
  return t.run(async (ctx) => {
    const seasonId = (await ctx.db.get(playerId))!.seasonId;
    return ctx.db.insert('buildings', {
      seasonId,
      playerId,
      key,
      regionId,
      level: 1,
      ...(point === undefined ? {} : { point }),
    });
  });
}

/** The headquarters is not raised, it is promoted: one already stands on the capital. */
async function setHqLevel(t: ReturnType<typeof boot>, token: string, level: number) {
  const playerId = await playerOf(t, token);
  await t.run(async (ctx) => {
    const hq = (
      await ctx.db
        .query('buildings')
        .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
        .collect()
    ).find((building) => building.key === 'hq');
    if (!hq) throw new Error('no headquarters');
    await ctx.db.patch(hq._id, { level });
  });
}

async function form(
  t: ReturnType<typeof boot>,
  token: string,
  role: UnitRole,
  stationedAt: Id<'buildings'> | null,
): Promise<Id<'troops'>> {
  const playerId = await playerOf(t, token);
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

async function outpostsOf(t: ReturnType<typeof boot>, token: string) {
  const playerId = await playerOf(t, token);
  return t.run(async (ctx) =>
    ctx.db
      .query('outposts')
      .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
      .collect(),
  );
}

async function movementsOf(t: ReturnType<typeof boot>, token: string) {
  const playerId = await playerOf(t, token);
  return t.run(async (ctx) =>
    ctx.db
      .query('movements')
      .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
      .collect(),
  );
}

async function engagementsIn(t: ReturnType<typeof boot>) {
  return t.run(async (ctx) => ctx.db.query('engagements').collect());
}

/** Le détail frappe par frappe pend à l'engagement (`strikes`), il n'est plus dans son document. */
async function strikesIn(t: ReturnType<typeof boot>, engagementId: Id<'engagements'>) {
  return t.run(async (ctx) =>
    (
      await ctx.db
        .query('strikes')
        .withIndex('byEngagement', (q) => q.eq('engagementId', engagementId))
        .collect()
    ).sort((a, b) => a.rank - b.rank),
  );
}

async function ammunitionOf(t: ReturnType<typeof boot>, token: string): Promise<number> {
  const view = await t.query(api.view.playerView, { token });
  return view.me.resources.ammunition.stock;
}

/** The magazine, set where a case needs it — full, or too thin to cover the pass. */
async function setAmmunition(t: ReturnType<typeof boot>, token: string, stock: number) {
  const playerId = await playerOf(t, token);
  await t.run(async (ctx) => {
    const row = await ctx.db
      .query('resources')
      .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
      .collect();
    const held = row.find((one) => one.key === 'ammunition');
    if (!held) throw new Error('no ammunition row');
    await ctx.db.patch(held._id, { stock, updatedAt: Date.now() });
  });
}

/** An outpost planted without walking to it: what is under test is what happens *at* it. */
async function plant(
  t: ReturnType<typeof boot>,
  token: string,
  point: LonLat,
  hostCountry: string,
  /** La région où il se plante, telle que la carte la nomme. Omise, le point se relit par le
   *  repli, comme ceux d'avant le champ (précision du 04/09). */
  regionId?: string,
): Promise<Id<'outposts'>> {
  const playerId = await playerOf(t, token);
  return t.run(async (ctx) => {
    const seasonId = (await ctx.db.get(playerId))!.seasonId;
    return ctx.db.insert('outposts', {
      seasonId,
      playerId,
      point: { lon: point[0], lat: point[1] },
      hostCountry,
      ...(regionId === undefined ? {} : { regionId }),
      level: 1,
      specialization: 'relay',
      foundedAt: Date.now(),
      disabledUntil: null,
      immuneUntil: null,
    });
  });
}

async function garrison(t: ReturnType<typeof boot>, token: string, outpostId: Id<'outposts'>) {
  const troopId = await form(t, token, 'infantry', null);
  await t.run(async (ctx) => ctx.db.patch(troopId, { stationedAt: outpostId }));
  return troopId;
}

/** A column left standing on the map — the third form of an address (ADR 0019 §1). */
async function post(
  t: ReturnType<typeof boot>,
  token: string,
  point: LonLat,
  role: UnitRole = 'infantry',
) {
  const troopId = await form(t, token, role, null);
  await t.run(async (ctx) =>
    ctx.db.patch(troopId, { stationedAt: { lon: point[0], lat: point[1] } }),
  );
  return troopId;
}

/** A point a given distance due east of another, at this latitude. Written out rather than
 *  eyeballed: the tests below turn on being just inside or just outside `ARRIVAL_RADIUS_KM`. */
const eastOf = (point: LonLat, km: number): LonLat => [
  point[0] + km / (111.32 * Math.cos((point[1] * Math.PI) / 180)),
  point[1],
];

/** Away from anyone's rest window, so the march is the only thing being measured. */
const MIDDAY = new Date(2026, 7, 17, 12, 0, 0);

describe('a posted column founds an outpost where it stands', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  const asPoint = (point: LonLat) => ({ lon: point[0], lat: point[1] });

  it('plants the point under its feet and becomes its garrison', async () => {
    const t = boot();
    const { token } = await launchedSeason(t);
    const point = regionFacts(PRAHOVA)!.point;
    const posted = await post(t, token, point);

    await t.mutation(api.movements.foundOutpostHere, {
      regionId: null,
      token,
      point: asPoint(point),
      specialization: 'relay',
      troopIds: [posted],
    });

    const [outpost] = await outpostsOf(t, token);
    expect(outpost).toBeDefined();
    expect(outpost!.hostCountry).toBe('ROU');
    expect(outpost!.specialization).toBe('relay');
    expect(outpost!.level).toBe(1);
    /** Exactly where the column stood: nothing walks, so nothing rounds the place either. */
    expect(outpost!.point).toEqual(asPoint(point));

    // The founding column becomes the garrison — one address, and it changed (ADR 0014).
    expect((await t.run(async (ctx) => ctx.db.get(posted)))!.stationedAt).toBe(outpost!._id);
    const view = await t.query(api.view.playerView, { token });
    expect(view.me.outposts[0]!.garrison).toBe(1);
    expect(view.me.armyPresent.infantry ?? 0).toBe(0);
    expect(view.me.troops).toHaveLength(1);

    /** **Founding is not a march**: no slot is spent, nothing is scheduled, nothing walks. */
    expect(view.me.slots.used).toBe(0);
    expect(await movementsOf(t, token)).toHaveLength(0);
  });

  /**
   * The intention, graven. Romania and Arabia are two hosts, and every rule of fiche 03 that is
   * still unwritten — decreasing yield per host, finite trade capacity, relation per player,
   * expulsion of a country saturated with outposts — has this string for its key. It was worth
   * nothing while every country nobody plays answered the same one.
   */
  it('gives two outposts in two neutral countries two different hosts', async () => {
    const t = boot();
    const { token } = await launchedSeason(t);

    for (const regionId of [PRAHOVA, RIYADH]) {
      const point = regionFacts(regionId)!.point;
      await t.mutation(api.movements.foundOutpostHere, {
        regionId: null,
        token,
        point: asPoint(point),
        specialization: 'relay',
        troopIds: [await post(t, token, point)],
      });
    }

    const hosts = (await outpostsOf(t, token)).map((outpost) => outpost.hostCountry);
    expect([...hosts].sort()).toEqual(['ROU', 'SAU']);
  });

  it('refuses a pile that is not infantry alone', async () => {
    const t = boot();
    const { token } = await launchedSeason(t);
    const point = regionFacts(PRAHOVA)!.point;
    const tank = await post(t, token, point, 'armor');

    await expect(
      t.mutation(api.movements.foundOutpostHere, {
        regionId: null,
        token,
        point: asPoint(point),
        specialization: 'relay',
        troopIds: [tank],
      }),
    ).rejects.toThrow('INFANTRY_ONLY');
  });

  /** An outpost is what carries a build site beyond one's own ground: on ground already
   *  carrying a building of mine it has nothing to offer (ADR 0004). */
  it('refuses ground that already carries a building of mine', async () => {
    const t = boot();
    const { token } = await launchedSeason(t);
    await raise(t, token, 'barracks', MARNE);
    const point = regionFacts(MARNE)!.point;
    const posted = await post(t, token, point);

    await expect(
      t.mutation(api.movements.foundOutpostHere, {
        regionId: null,
        token,
        point: asPoint(point),
        specialization: 'relay',
        troopIds: [posted],
      }),
    ).rejects.toThrow('FRIENDLY_TARGET');
  });

  /** The address survives the departure — it is what the column comes back to — so a column
   *  already walking would otherwise plant a point it left hours ago. */
  it('refuses a column that has left the point it still hangs from', async () => {
    const t = boot();
    const { token } = await launchedSeason(t);
    const point = regionFacts(PRAHOVA)!.point;
    const posted = await post(t, token, point);

    await t.mutation(api.movements.attack, {
      token,
      origin: { kind: 'point', point: asPoint(point) },
      troopIds: [posted],
      target: { kind: 'region', regionId: RUHR },
    });

    await expect(
      t.mutation(api.movements.foundOutpostHere, {
        regionId: null,
        token,
        point: asPoint(point),
        specialization: 'relay',
        troopIds: [posted],
      }),
    ).rejects.toThrow('TROOP_NOT_AT_ORIGIN');
  });

  it('refuses a column standing somewhere else, and one with nothing in it', async () => {
    const t = boot();
    const { token } = await launchedSeason(t);
    const point = regionFacts(PRAHOVA)!.point;
    const posted = await post(t, token, point);

    await expect(
      t.mutation(api.movements.foundOutpostHere, {
        regionId: null,
        token,
        point: asPoint(regionFacts(RUHR)!.point),
        specialization: 'relay',
        troopIds: [posted],
      }),
    ).rejects.toThrow('TROOP_NOT_AT_ORIGIN');

    await expect(
      t.mutation(api.movements.foundOutpostHere, {
        regionId: null,
        token,
        point: asPoint(point),
        specialization: 'relay',
        troopIds: [],
      }),
    ).rejects.toThrow('EMPTY_MOVEMENT');
  });
});

/**
 * Design sheet 07: the window forbids **arrivals** at a player who is resting. A column
 * reaching neutral ground wakes nobody and never waits.
 */
describe('the rest window holds an arrival at the border', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('waits for the window of the player whose home it reaches', async () => {
    vi.setSystemTime(new Date(2026, 7, 17, 23, 0, 0));
    const t = boot();
    const { token } = await launchedSeason(t);
    const barracks = await raise(t, token, 'barracks', MARNE);
    const troop = await form(t, token, 'infantry', barracks);

    const sent = await t.mutation(api.movements.attack, {
      token,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [troop],
      target: { kind: 'region', regionId: PSKOV },
    });

    vi.advanceTimersByTime(sent.minutes * 60_000);
    await t.finishInProgressScheduledFunctions();

    const [held] = await movementsOf(t, token);
    expect(held).toBeDefined();
    expect(held!.type).toBe('attack');
    // The guest sleeps from 23h00: the column stands at the border until the window closes.
    const exit = new Date(held!.arrivesAt);
    expect(exit.getHours() * 60 + exit.getMinutes()).toBe(23 * 60 + REST_WINDOW_MINUTES - 1440);

    // Once it closes, the arrival resolves: empty ground, so the column simply walks back.
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await movementsOf(t, token)).toHaveLength(0);
    expect((await t.run(async (ctx) => ctx.db.get(troop)))!.stationedAt).toBe(barracks);
  });

  it('lets a column reach neutral ground while its neighbour sleeps', async () => {
    vi.setSystemTime(new Date(2026, 7, 17, 23, 0, 0));
    const t = boot();
    const { token } = await launchedSeason(t);
    const barracks = await raise(t, token, 'barracks', MARNE);
    const troop = await form(t, token, 'infantry', barracks);

    const sent = await t.mutation(api.movements.attack, {
      token,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [troop],
      target: { kind: 'region', regionId: PRAHOVA },
    });
    vi.advanceTimersByTime(sent.minutes * 60_000);
    await t.finishInProgressScheduledFunctions();

    /** Nothing waited: the arrival resolved on the hour it was dated, and the column is already
     *  walking back rather than standing at a border. */
    const [back] = await movementsOf(t, token);
    expect(back?.type).toBe('return');
  });
});

describe('an outpost opens a radius to build in', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  /** Founded on the spot by the column standing there — the walk is another test's subject. */
  async function withOutpostAtPrahova(t: ReturnType<typeof boot>) {
    const { token } = await launchedSeason(t);
    const point = regionFacts(PRAHOVA)!.point;
    await t.mutation(api.movements.foundOutpostHere, {
      regionId: null,
      token,
      point: { lon: point[0], lat: point[1] },
      specialization: 'relay',
      troopIds: [await post(t, token, point)],
    });
    return token;
  }

  /**
   * **Un avant-poste atteint toujours la région où il se tient** (précision de l'ADR 0020 du
   * 04/09). Le rayon se mesure au pôle d'inaccessibilité de la région, et celui d'une région
   * grande comme l'Alberta est à 378 km du point où l'on plante : le puits de la région même de
   * l'avant-poste se faisait refuser.
   */
  it('accepts the region the point stands in, however far its own point is', async () => {
    const t = boot();
    const { token } = await launchedSeason(t);
    await plant(t, token, FORT_MCMURRAY, 'CAN', ALBERTA);

    const started = await t.mutation(api.constructions.start, {
      token,
      building: 'oilWell',
      regionId: ALBERTA,
    });
    expect(started.finishesAt).toBeGreaterThan(Date.now());
  });

  /** **La règle métrique ne bouge pas** : on ajoute l'évidence qu'elle oubliait, on ne l'élargit
   *  pas. La voisine reste à 659 km du point, donc dehors. */
  it('leaves the neighbouring region out, its point being out of the radius', async () => {
    const t = boot();
    const { token } = await launchedSeason(t);
    await plant(t, token, FORT_MCMURRAY, 'CAN', ALBERTA);

    await expect(
      t.mutation(api.constructions.start, {
        token,
        building: 'billets',
        regionId: SASKATCHEWAN,
      }),
    ).rejects.toThrow('OUT_OF_OUTPOST_REACH');
  });

  /**
   * **Un avant-poste n'est pas un bâtiment**, et `REGION_TAKEN` ne le compte pas : le sol qu'il
   * occupe reste constructible, ce qui est tout l'intérêt de l'y planter. Ce qui prend une
   * région est le bâtiment qui s'y tient — la seconde entrée le montre.
   */
  it('never takes the region it stands in', async () => {
    const t = boot();
    const { token } = await launchedSeason(t);
    await plant(t, token, FORT_MCMURRAY, 'CAN', ALBERTA);

    await t.mutation(api.constructions.start, { token, building: 'oilWell', regionId: ALBERTA });
    await expect(
      t.mutation(api.constructions.start, { token, building: 'billets', regionId: ALBERTA }),
    ).rejects.toThrow('REGION_TAKEN');
  });

  /** The whole point of the loop: the well the nation has no ground for at home. */
  it('accepts a foreign region within the reach', async () => {
    const t = boot();
    const token = await withOutpostAtPrahova(t);
    const started = await t.mutation(api.constructions.start, {
      token,
      building: 'oilWell',
      regionId: PRAHOVA,
    });
    expect(started.finishesAt).toBeGreaterThan(Date.now());
  });

  it('refuses one outside it, and says how far the nearest outpost is', async () => {
    const t = boot();
    const token = await withOutpostAtPrahova(t);
    const refused: Record<string, unknown> = await t
      .mutation(api.constructions.start, { token, building: 'billets', regionId: RUHR })
      .then(() => ({}))
      .catch((error: { data: Record<string, unknown> }) => error.data);

    expect(refused).toMatchObject({ code: 'OUT_OF_OUTPOST_REACH', reachKm: REACH_KM });
    expect(refused.nearestKm).toBeGreaterThan(REACH_KM);
  });

  /**
   * **The two rules stack, they do not stand in for one another.** The reach says *where* a
   * building may go up, the catalogue tier says *whether the season has reached it* — so a
   * region an outpost has opened still refuses an airfield until the headquarters reaches the
   * level the catalogue opens projection at (`unlockLevel`).
   */
  it('stacks the tier of the catalogue on top of the reach', async () => {
    const t = boot();
    const token = await withOutpostAtPrahova(t);
    const opensAt = unlockLevel('airfield');
    await setHqLevel(t, token, opensAt - 1);

    await expect(
      t.mutation(api.constructions.start, { token, building: 'airfield', regionId: PRAHOVA }),
    ).rejects.toThrow('BUILDING_LOCKED');

    await setHqLevel(t, token, opensAt);

    // The reach keeps its own say at that level: an opened tier is not a passport.
    await expect(
      t.mutation(api.constructions.start, { token, building: 'airfield', regionId: RUHR }),
    ).rejects.toThrow('OUT_OF_OUTPOST_REACH');

    const started = await t.mutation(api.constructions.start, {
      token,
      building: 'airfield',
      regionId: PRAHOVA,
    });
    expect(started.finishesAt).toBeGreaterThan(Date.now());
  });

  it('keeps home free of any reach', async () => {
    const t = boot();
    const { token } = await launchedSeason(t);
    await setHqLevel(t, token, unlockLevel('billets'));
    const started = await t.mutation(api.constructions.start, {
      token,
      building: 'billets',
      regionId: MARNE,
    });
    expect(started.finishesAt).toBeGreaterThan(Date.now());
  });
});

/**
 * The pass itself is proved in `src/domain/combat.test.ts`, against the numbers of the
 * chiffrage. What is under test here is everything around it: who is found standing where, what
 * the board looks like afterwards, and the account that is left behind.
 */
describe('an attack marches at somebody', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  it('finds nobody, files nothing, and walks the column home', async () => {
    const t = boot();
    const { token } = await launchedSeason(t);
    const barracks = await raise(t, token, 'barracks', MARNE);
    const troop = await form(t, token, 'infantry', barracks);

    await t.mutation(api.movements.attack, {
      token,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [troop],
      target: { kind: 'region', regionId: PRAHOVA },
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(await engagementsIn(t)).toHaveLength(0);
    expect(await movementsOf(t, token)).toHaveLength(0);
    // Home again, in the barracks it left: the walk cost time and nothing else.
    const back = await t.run(async (ctx) => ctx.db.get(troop));
    expect(back!.stationedAt).toBe(barracks);
  });

  it('engages the troops standing in the region and files the account', async () => {
    const t = boot();
    const { token, guest } = await launchedSeason(t);
    const barracks = await raise(t, token, 'barracks', MARNE);
    const troop = await form(t, token, 'infantry', barracks);
    const theirs = await raise(t, guest, 'barracks', PRAHOVA);
    const defender = await form(t, guest, 'infantry', theirs);

    await t.mutation(api.movements.attack, {
      token,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [troop],
      target: { kind: 'region', regionId: PRAHOVA },
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    // Fifty soldiers against fifty: he loses 22, I lose 16 (chiffrage §4, plain ground).
    const [account] = await engagementsIn(t);
    expect(account).toBeDefined();
    expect(account!.cause).toBe('arrival');
    expect(await strikesIn(t, account!._id)).toHaveLength(2);
    expect((await t.run(async (ctx) => ctx.db.get(defender)))!.currentStrength).toBe(28);
    expect((await t.run(async (ctx) => ctx.db.get(troop)))!.currentStrength).toBe(34);

    // And both sides read it, each from its own side of the field.
    const mine = await t.query(api.view.playerView, { token });
    expect(mine.reports[0]!.side).toBe('attacker');
    expect(mine.reports[0]!.mine.lost).toBe(16);
    expect(mine.reports[0]!.theirs.lost).toBe(22);
    const theirsView = await t.query(api.view.playerView, { token: guest });
    expect(theirsView.reports[0]!.side).toBe('defender');
    expect(theirsView.reports[0]!.mine.lost).toBe(22);
  });

  it('refuses to march on one of my own regions', async () => {
    const t = boot();
    const { token } = await launchedSeason(t);
    const barracks = await raise(t, token, 'barracks', MARNE);
    const troop = await form(t, token, 'infantry', barracks);

    await expect(
      t.mutation(api.movements.attack, {
        token,
        origin: { kind: 'building', buildingId: barracks },
        troopIds: [troop],
        target: { kind: 'region', regionId: MARNE },
      }),
    ).rejects.toThrow('FRIENDLY_TARGET');
  });
});

/**
 * **The only bill there is** (question 18, settled 25/08). The recruitment stopped debiting
 * ammunition and the pass took it over, so this is where the resource has to be seen leaving
 * the national stock — and where a nation that let it run out has to be seen paying for it.
 */
describe('the pass is what ammunition is spent on', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  async function fight(t: ReturnType<typeof boot>, token: string, guest: string) {
    const barracks = await raise(t, token, 'barracks', MARNE);
    const troop = await form(t, token, 'infantry', barracks);
    const theirs = await raise(t, guest, 'barracks', PRAHOVA);
    const defender = await form(t, guest, 'infantry', theirs);
    await t.mutation(api.movements.attack, {
      token,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [troop],
      target: { kind: 'region', regionId: PRAHOVA },
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    return { troop, defender };
  }

  it('takes ten rounds off each side for one company apiece', async () => {
    const t = boot();
    const { token, guest } = await launchedSeason(t);
    await setAmmunition(t, token, 500);
    await setAmmunition(t, guest, 500);

    await fight(t, token, guest);

    // Fifty soldiers, one round per five points: ten, on both sides of the field.
    expect(await ammunitionOf(t, token)).toBe(490);
    expect(await ammunitionOf(t, guest)).toBe(490);
  });

  it('strikes at .60 and empties what is left when the magazine cannot cover the pass', async () => {
    const t = boot();
    const { token, guest } = await launchedSeason(t);
    await setAmmunition(t, token, 4);
    await setAmmunition(t, guest, 500);

    const { troop, defender } = await fight(t, token, guest);

    // Supplied, the reference case takes 22 off the defender and 16 off the attacker. Dry, the
    // attack is worth .60 of its strike — and the riposte, answering less damage, bites harder.
    expect((await t.run(async (ctx) => ctx.db.get(defender)))!.currentStrength).toBe(50 - 13);
    expect((await t.run(async (ctx) => ctx.db.get(troop)))!.currentStrength).toBeLessThan(34);
    // The four rounds it had went into the pass; it did not fight for free.
    expect(await ammunitionOf(t, token)).toBe(0);
  });

  it('leaves the magazine alone on a march that meets nobody', async () => {
    const t = boot();
    const { token } = await launchedSeason(t);
    await setAmmunition(t, token, 500);
    const barracks = await raise(t, token, 'barracks', MARNE);
    const troop = await form(t, token, 'infantry', barracks);

    await t.mutation(api.movements.attack, {
      token,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [troop],
      target: { kind: 'region', regionId: PRAHOVA },
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(await engagementsIn(t)).toHaveLength(0);
    expect(await ammunitionOf(t, token)).toBe(500);
  });
});

/**
 * The fan and the mutation read **one** rule (`src/domain/movement-orders.ts`): what the compass
 * rose does not offer is exactly what the server turns down. These are the server's half of that
 * promise — the fan's half is `src/domain/compass-rose.test.ts`.
 */
describe('what the server refuses is what the fan never offers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  it('refuses a march on ground of mine', async () => {
    const t = boot();
    const { token } = await launchedSeason(t);
    const barracks = await raise(t, token, 'barracks', MARNE);
    const troop = await form(t, token, 'infantry', barracks);

    await expect(
      t.mutation(api.movements.attack, {
        token,
        origin: { kind: 'building', buildingId: barracks },
        troopIds: [troop],
        target: { kind: 'region', regionId: MARNE },
      }),
    ).rejects.toThrow('FRIENDLY_TARGET');
  });

  it('refuses a column with nothing in it', async () => {
    const t = boot();
    const { token } = await launchedSeason(t);
    const barracks = await raise(t, token, 'barracks', MARNE);

    await expect(
      t.mutation(api.movements.attack, {
        token,
        origin: { kind: 'building', buildingId: barracks },
        troopIds: [],
        target: { kind: 'region', regionId: PRAHOVA },
      }),
    ).rejects.toThrow('EMPTY_MOVEMENT');
  });
});

/** The aiming card shows what the march will cost **before** the slot is spent — same grid,
 *  same pace, same rest window as the mutation that follows it. */
describe('the preview says what the march will be', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  it('answers the real route and the same duration the march takes', async () => {
    const t = boot();
    const { token } = await launchedSeason(t);
    const barracks = await raise(t, token, 'barracks', MARNE);
    const troop = await form(t, token, 'infantry', barracks);

    const preview = await t.query(api.movements.preview, {
      token,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [troop],
      target: { kind: 'region', regionId: PRAHOVA },
      type: 'attack',
    });
    expect(preview).not.toBeNull();
    expect(preview!.route.points.length).toBeGreaterThan(1);
    expect(preview!.destinationName).toBe(regionFacts(PRAHOVA)!.name);
    expect(preview!.holdUntil).toBeNull();

    const sent = await t.mutation(api.movements.attack, {
      token,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [troop],
      target: { kind: 'region', regionId: PRAHOVA },
    });
    expect(sent.minutes).toBeCloseTo(preview!.minutes, 6);
  });

  it('names the hour the column would be let in when the arrival bites a rest window', async () => {
    // The guest's declared window opens at 23h00 — the same clock the border test leans on.
    vi.setSystemTime(new Date(2026, 7, 17, 23, 0, 0));
    const t = boot();
    const { token } = await launchedSeason(t);
    const barracks = await raise(t, token, 'barracks', MARNE);
    const troop = await form(t, token, 'infantry', barracks);

    const preview = await t.query(api.movements.preview, {
      token,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [troop],
      target: { kind: 'region', regionId: PSKOV },
      type: 'attack',
    });
    expect(preview!.holdUntil).not.toBeNull();
    expect(preview!.holdUntil!).toBeGreaterThan(preview!.arrivesAt);
  });
});

/**
 * **The pace is one reading of one pile, and three surfaces answer with it.** The fan, the
 * preview and the mutation all go through `landCostOf` — a second table of what rolls is how a
 * card would promise a duration the march does not take, which is exactly the display lie the
 * previous three prompts were spent on.
 */
describe('a column whose infantry rides goes faster', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  const origin = (barracks: Id<'buildings'>) =>
    ({ kind: 'building', buildingId: barracks }) as const;
  const target = { kind: 'region', regionId: RUHR } as const;

  /** A query, so it spends no slot: two piles can be priced in one season, which is what the
   *  comparison needs — only one movement flies at a time (ADR 0006). */
  const priced = async (
    t: ReturnType<typeof boot>,
    token: string,
    barracks: Id<'buildings'>,
    troopIds: ReadonlyArray<Id<'troops'>>,
  ) => {
    const answer = await t.query(api.movements.preview, {
      token,
      origin: origin(barracks),
      troopIds: [...troopIds],
      target,
      type: 'attack',
    });
    return answer!;
  };

  it('takes 1,15/1,6 of the walk on the very same road', async () => {
    const t = boot();
    const { token } = await launchedSeason(t);
    const barracks = await raise(t, token, 'barracks', MARNE);
    const walkers = [await form(t, token, 'infantry', barracks)];
    const riders = [
      await form(t, token, 'infantry', barracks),
      await form(t, token, 'infantry', barracks),
      await form(t, token, 'landTransport', barracks),
    ];

    const from = regionFacts(MARNE)!.point;
    const to = regionFacts(RUHR)!.point;
    const onFoot = routeBetween(from, to, 'land', COST_BY_MEDIUM.land)!;
    const rolling = routeBetween(from, to, 'land', COST_BY_MEDIUM.landMotorized)!;
    // The same road, priced twice: scaling every land edge by the same factor cannot move the
    // shortest path. The polyline itself is compared by its length rather than vertex by
    // vertex — equal-cost cells are tie-broken in whatever order the heap emptied.
    expect(rolling.distanceUnits).toBeCloseTo(onFoot.distanceUnits, 9);
    expect(rolling.costUnits).toBeCloseTo(
      (onFoot.costUnits * COST_BY_MEDIUM.landMotorized) / COST_BY_MEDIUM.land,
      6,
    );

    const walked = await priced(t, token, barracks, walkers);
    const rode = await priced(t, token, barracks, riders);
    expect(walked.route.landCost).toBe(COST_BY_MEDIUM.land);
    expect(rode.route.landCost).toBe(COST_BY_MEDIUM.landMotorized);
    expect(rode.route.costUnits).toBeCloseTo(
      (walked.route.costUnits * COST_BY_MEDIUM.landMotorized) / COST_BY_MEDIUM.land,
      6,
    );
    expect(rode.minutes).toBeLessThan(walked.minutes);
  });

  it('walks again on one infantry too many', async () => {
    const t = boot();
    const { token } = await launchedSeason(t);
    const barracks = await raise(t, token, 'barracks', MARNE);
    const crowded = await priced(t, token, barracks, [
      await form(t, token, 'infantry', barracks),
      await form(t, token, 'infantry', barracks),
      await form(t, token, 'infantry', barracks),
      await form(t, token, 'landTransport', barracks),
    ]);
    const alone = await priced(t, token, barracks, [await form(t, token, 'infantry', barracks)]);
    expect(crowded.route.landCost).toBe(COST_BY_MEDIUM.land);
    expect(crowded.minutes).toBe(alone.minutes);
  });

  it('says the same duration in the fan, the preview and the march it sends', async () => {
    const t = boot();
    const { token } = await launchedSeason(t);
    const barracks = await raise(t, token, 'barracks', MARNE);
    const roles: ReadonlyArray<UnitRole> = ['infantry', 'infantry', 'landTransport'];
    const column: Array<Id<'troops'>> = [];
    for (const role of roles) column.push(await form(t, token, role, barracks));

    // The fan reads the same composition through the same module: legal here means the
    // mutation takes it, and the duration below is the one the card was showing.
    expect(
      legalMovementTypes(
        { kind: 'region', regionId: RUHR, country: 'Germany' },
        {
          roles,
          myRegionIds: new Set(),
          myOutpostIds: new Set(),
          departureBuildings: new Set<BuildingKey>(['barracks']),
          afloat: false,
          coastal: false,
        },
      ),
    ).toContain('attack');

    const preview = await priced(t, token, barracks, column);
    const sent = await t.mutation(api.movements.attack, {
      token,
      origin: origin(barracks),
      troopIds: column,
      target,
    });
    expect(sent.minutes).toBeCloseTo(preview.minutes, 6);
    expect(landCostOf(roles)).toBe(preview.route.landCost);
  });
});

describe('a raid deactivates an outpost, it never takes it', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  const prahovaPoint = () => regionFacts(PRAHOVA)!.point;

  it('clears the garrison and puts the point out of service', async () => {
    const t = boot();
    const { token, guest } = await launchedSeason(t);
    const barracks = await raise(t, token, 'barracks', MARNE);
    const first = await form(t, token, 'infantry', barracks);
    const second = await form(t, token, 'infantry', barracks);
    const outpostId = await plant(t, guest, prahovaPoint(), 'ROU');
    const held = await garrison(t, guest, outpostId);

    await t.mutation(api.movements.raid, {
      token,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [first, second],
      outpostId,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const [account] = await engagementsIn(t);
    const outpost = await t.run(async (ctx) => ctx.db.get(outpostId));
    expect(outpost).not.toBeNull();
    // Never taken: the point is still his, it is only out of service.
    expect(outpost!.playerId).toBe(await playerOf(t, guest));
    expect(outpost!.disabledUntil).toBe(account!.at + OUTPOST_DISABLED_HOURS * 3_600_000);
    expect(outpost!.immuneUntil).toBeGreaterThan(outpost!.disabledUntil!);

    // The garrison broke contact rather than dying, and it is still standing on its point.
    const broken = await t.run(async (ctx) => ctx.db.get(held));
    expect(broken!.currentStrength).toBeGreaterThan(0);
    expect(broken!.stationedAt).toBe(outpostId);

    // Its owner reads the point as out of service, counting down like every other due time.
    // L'horloge est ramenée juste après la passe : la fin de la désactivation est désormais un
    // rendez-vous planifié (ADR 0020 §6, `production.restoreAfterDisabling`), et le drainage des
    // travaux ci-dessus a donc porté le temps au-delà de la fenêtre. C'est le décompte pendant
    // la fenêtre qu'on lit ici.
    vi.setSystemTime(account!.at + 60_000);
    const owner = await t.query(api.view.playerView, { token: guest });
    const left = owner.me.outposts[0]!.disabledMinutesLeft!;
    expect(left).toBeGreaterThan(0);
    expect(left).toBeLessThanOrEqual(OUTPOST_DISABLED_HOURS * 60);
  });

  it('walks up to an ungarrisoned point and puts it out without a battle', async () => {
    const t = boot();
    const { token, guest } = await launchedSeason(t);
    const barracks = await raise(t, token, 'barracks', MARNE);
    const troop = await form(t, token, 'infantry', barracks);
    const outpostId = await plant(t, guest, prahovaPoint(), 'ROU');

    await t.mutation(api.movements.raid, {
      token,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [troop],
      outpostId,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(await engagementsIn(t)).toHaveLength(0);
    const outpost = await t.run(async (ctx) => ctx.db.get(outpostId));
    expect(outpost!.disabledUntil).not.toBeNull();
  });

  it('refuses a raid on one of mine', async () => {
    const t = boot();
    const { token } = await launchedSeason(t);
    const barracks = await raise(t, token, 'barracks', MARNE);
    const troop = await form(t, token, 'infantry', barracks);
    const outpostId = await plant(t, token, prahovaPoint(), 'ROU');

    await expect(
      t.mutation(api.movements.raid, {
        token,
        origin: { kind: 'building', buildingId: barracks },
        troopIds: [troop],
        outpostId,
      }),
    ).rejects.toThrow('FRIENDLY_TARGET');
  });
});

/**
 * The non-regression suite of ADR 0019: where a column stands stopped deciding what it may ask
 * for. A garrison on an outpost is a column like any other — it attacks, it raids, it founds.
 */
describe('a garrison marches out of its outpost', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  it('attacks a foreign region straight from the point it holds', async () => {
    const t = boot();
    const { token } = await launchedSeason(t);
    await raise(t, token, 'barracks', MARNE);
    const outpostId = await plant(t, token, regionFacts(PRAHOVA)!.point, 'ROU');
    const held = await garrison(t, token, outpostId);

    const sent = await t.mutation(api.movements.attack, {
      token,
      origin: { kind: 'outpost', outpostId },
      troopIds: [held],
      target: { kind: 'region', regionId: RUHR },
    });
    expect(sent.minutes).toBeGreaterThan(0);
    expect((await t.query(api.view.playerView, { token })).me.slots.used).toBe(1);
  });

  it("refuses a troop that is not this outpost's own garrison", async () => {
    const t = boot();
    const { token } = await launchedSeason(t);
    const barracks = await raise(t, token, 'barracks', MARNE);
    const stray = await form(t, token, 'infantry', barracks);
    const outpostId = await plant(t, token, regionFacts(PRAHOVA)!.point, 'ROU');

    await expect(
      t.mutation(api.movements.attack, {
        token,
        origin: { kind: 'outpost', outpostId },
        troopIds: [stray],
        target: { kind: 'region', regionId: RUHR },
      }),
    ).rejects.toThrow('TROOP_NOT_AT_ORIGIN');
  });
});

/**
 * The second half of ADR 0019 §1: a destination is the place the player designated, never the
 * centre of the region that happens to contain it.
 */
describe('a march aimed at a point', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  /** Deliberately off the Prahova centroid: the whole test is that the gap survives the trip. */
  const AIMED: LonLat = [25.2, 44.6];

  it('walks to that point and to no centroid', async () => {
    const t = boot();
    const { token } = await launchedSeason(t);
    const barracks = await raise(t, token, 'barracks', MARNE);
    const troop = await form(t, token, 'infantry', barracks);

    await t.mutation(api.movements.attack, {
      token,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [troop],
      target: { kind: 'point', point: { lon: AIMED[0], lat: AIMED[1] } },
    });

    const [movement] = await t.run(async (ctx) => ctx.db.query('movements').collect());
    expect(movement!.to).toEqual({ lon: AIMED[0], lat: AIMED[1] });
    expect(distanceKm(pointOf(movement!.to), regionFacts(PRAHOVA)!.point)).toBeGreaterThan(50);
    /**
     * The host is read off the geometry, never sent by the client. Romania is nobody's home
     * country, and it is still Romania: the empty string is the open sea's answer alone
     * (`hostAtPoint`), because the rules keyed on a host cannot be written on a string that
     * makes Arabia and Bolivia the same place.
     */
    expect(movement!.hostCountry).toBe('ROU');
  });

  it('answers the same route in the preview as the march will take', async () => {
    const t = boot();
    const { token } = await launchedSeason(t);
    const barracks = await raise(t, token, 'barracks', MARNE);
    const troop = await form(t, token, 'infantry', barracks);

    const seen = await t.query(api.movements.preview, {
      token,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [troop],
      target: { kind: 'point', point: { lon: AIMED[0], lat: AIMED[1] } },
      type: 'attack',
    });
    expect(seen).not.toBeNull();
    const last = seen!.route.points[seen!.route.points.length - 1]!;
    expect(distanceKm(pointOf(last), AIMED)).toBeLessThan(60);
  });

  /** Empty ground is still empty: nothing stands within reach, so there is nothing to fight. */
  it('finds nobody there and comes home rather than fighting', async () => {
    const t = boot();
    const { token } = await launchedSeason(t);
    const barracks = await raise(t, token, 'barracks', MARNE);
    const troop = await form(t, token, 'infantry', barracks);

    await t.mutation(api.movements.attack, {
      token,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [troop],
      target: { kind: 'point', point: { lon: AIMED[0], lat: AIMED[1] } },
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(await t.run(async (ctx) => (await ctx.db.query('engagements').collect()).length)).toBe(
      0,
    );
    expect(await t.run(async (ctx) => (await ctx.db.get(troop))!.stationedAt)).toBe(barracks);
  });
});

/**
 * **What a point answers when something stands on it.** The arrival stopped needing a region to
 * find defenders: it reads what holds ground within `ARRIVAL_RADIUS_KM` of where it stopped,
 * which is the same distance reading the interception has always used (ADR 0018 §3).
 */
describe('an arrival on a point finds who stands there', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  /** Deliberately far from the Prahova centroid: the defenders are found by where they stand,
   *  never by the region the point happens to fall in. */
  const AIMED: LonLat = [25.2, 44.6];

  it('engages the column posted there, centroid or no centroid', async () => {
    const t = boot();
    const { token, guest } = await launchedSeason(t);
    const barracks = await raise(t, token, 'barracks', MARNE);
    const first = await form(t, token, 'infantry', barracks);
    const second = await form(t, token, 'infantry', barracks);
    const posted = await post(t, guest, eastOf(AIMED, 10));
    expect(distanceKm(AIMED, regionFacts(PRAHOVA)!.point)).toBeGreaterThan(50);

    await t.mutation(api.movements.attack, {
      token,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [first, second],
      target: { kind: 'point', point: { lon: AIMED[0], lat: AIMED[1] } },
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const [account] = await engagementsIn(t);
    expect(account).toBeDefined();
    expect(account!.defenderId).toBe(await playerOf(t, guest));
    expect((await t.run(async (ctx) => ctx.db.get(posted)))!.currentStrength).toBeLessThan(
      nominalStrength('infantry', 1),
    );
  });

  /**
   * A garrison answers for the ground around its point too, and the account names the outpost.
   *
   * It stands there **before** the departure, which is the point of the test: an outpost at the
   * end of the road sits well inside the two hundred kilometres of the interception net, so it
   * used to fight the same order twice — once on approach, once on arrival. The test used to
   * dodge that by planting the point after the column left. One engagement is one pass
   * (ADR 0014), and this is where the arrival answers for what stands at the destination.
   */
  it('brings the garrison of a point standing within reach, and once', async () => {
    const t = boot();
    const { token, guest } = await launchedSeason(t);
    const barracks = await raise(t, token, 'barracks', MARNE);
    const troop = await form(t, token, 'infantry', barracks);
    const outpostId = await plant(t, guest, eastOf(AIMED, 10), 'ROU');
    await garrison(t, guest, outpostId);

    await t.mutation(api.movements.attack, {
      token,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [troop],
      target: { kind: 'point', point: { lon: AIMED[0], lat: AIMED[1] } },
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const accounts = await engagementsIn(t);
    expect(accounts).toHaveLength(1);
    expect(accounts[0]!.outpostId).toBe(outpostId);
    expect(accounts[0]!.cause).toBe('arrival');
    /** An attack is not a raid: the point is not put out of service by one (ADR 0004). */
    expect((await t.run(async (ctx) => ctx.db.get(outpostId)))!.disabledUntil).toBeNull();
  });

  it('finds nobody when the same column stands beyond the radius', async () => {
    const t = boot();
    const { token, guest } = await launchedSeason(t);
    const barracks = await raise(t, token, 'barracks', MARNE);
    const troop = await form(t, token, 'infantry', barracks);
    await post(t, guest, eastOf(AIMED, ARRIVAL_RADIUS_KM + 15));

    await t.mutation(api.movements.attack, {
      token,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [troop],
      target: { kind: 'point', point: { lon: AIMED[0], lat: AIMED[1] } },
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(await engagementsIn(t)).toHaveLength(0);
  });

  /** A posted column is an address like any other: it is ordered out of where it stands, and
   *  what it stands on carries no gate — it walks (ADR 0019 §1 and §2). */
  it('marches out of the point it stands on', async () => {
    const t = boot();
    const { token } = await launchedSeason(t);
    const point = regionFacts(PRAHOVA)!.point;
    const posted = await post(t, token, point);

    const sent = await t.mutation(api.movements.attack, {
      token,
      origin: { kind: 'point', point: { lon: point[0], lat: point[1] } },
      troopIds: [posted],
      target: { kind: 'region', regionId: RUHR },
    });
    expect(sent.minutes).toBeGreaterThan(0);
  });

  it('refuses a column ordered out of a point it does not stand on', async () => {
    const t = boot();
    const { token } = await launchedSeason(t);
    const point = regionFacts(PRAHOVA)!.point;
    const posted = await post(t, token, point);

    await expect(
      t.mutation(api.movements.attack, {
        token,
        origin: { kind: 'point', point: { lon: point[0] + 1, lat: point[1] } },
        troopIds: [posted],
        target: { kind: 'region', regionId: RUHR },
      }),
    ).rejects.toThrow('TROOP_NOT_AT_ORIGIN');
  });

  /** A posted column observes from its role's range, but only defends the point where it stands. */
  it('walks past a camp on its road without opening a pass', async () => {
    const t = boot();
    const { token, guest } = await launchedSeason(t);
    const barracks = await raise(t, token, 'barracks', MARNE);
    const troop = await form(t, token, 'infantry', barracks);
    const road = routeBetween(regionFacts(MARNE)!.point, regionFacts(PRAHOVA)!.point, 'land')!;
    await post(t, guest, road.points[Math.floor(road.points.length / 2)]!);

    await t.mutation(api.movements.attack, {
      token,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [troop],
      target: { kind: 'region', regionId: PRAHOVA },
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(await engagementsIn(t)).toHaveLength(0);
    expect((await t.run(async (ctx) => ctx.db.get(troop)))!.stationedAt).toBe(barracks);
  });

  /** A detector added after departure is reassessed, but being detected still starts no pass. */
  it('walks past a camp pitched after it left', async () => {
    const t = boot();
    const { token, guest } = await launchedSeason(t);
    const barracks = await raise(t, token, 'barracks', MARNE);
    const troop = await form(t, token, 'infantry', barracks);
    const road = routeBetween(regionFacts(MARNE)!.point, regionFacts(PRAHOVA)!.point, 'land')!;

    await t.mutation(api.movements.attack, {
      token,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [troop],
      target: { kind: 'region', regionId: PRAHOVA },
    });
    await post(t, guest, road.points[Math.floor(road.points.length / 2)]!);
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(await engagementsIn(t)).toHaveLength(0);
  });

  /** The inventory reads a posted column like any other: on a card of its own, at the place it
   *  was left in, and counted against the ceiling. */
  it('is served in the inventory with the country it stands in', async () => {
    const t = boot();
    const { token } = await launchedSeason(t);
    await post(t, token, regionFacts(RIYADH)!.point);

    const view = await t.query(api.view.playerView, { token });
    expect(view.me.troops).toHaveLength(1);
    expect(view.me.troops[0]!.stationedAt).toMatchObject({ kind: 'point', country: 'SAU' });
    expect(view.me.armyPresent).toEqual({ infantry: 1 });
  });
});

/**
 * **La marche** (ADR 0019 §7): the plainest order there is, and the one the game had no word
 * for. It goes to a point and the column stays — every other order comes back. Its cost, its
 * irreversibility and its domain doors are those of any other movement; what it does not have
 * is a refusal for allegiance, and what it does have is an address at the end.
 */
describe('a march goes to a point and the column stays there', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  /** Far from the Prahova centroid on purpose: what a march finds is read off distances, never
   *  off the region the coordinate happens to fall in. */
  const AIMED: LonLat = [25.2, 44.6];
  const asPoint = (point: LonLat) => ({ lon: point[0], lat: point[1] });

  it('stands the column on empty ground — no return, no engagement', async () => {
    const t = boot();
    const { token } = await launchedSeason(t);
    const barracks = await raise(t, token, 'barracks', MARNE);
    const troop = await form(t, token, 'infantry', barracks);

    await t.mutation(api.movements.marchTo, {
      token,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [troop],
      point: asPoint(AIMED),
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect((await t.run(async (ctx) => ctx.db.get(troop)))!.stationedAt).toEqual(asPoint(AIMED));
    expect(await movementsOf(t, token)).toHaveLength(0);
    expect(await engagementsIn(t)).toHaveLength(0);
  });

  /**
   * **The initiative goes to whoever was already there.** An attack buys its first blow by
   * declaring itself (ADR 0014); a march declares nothing, so it takes it. That inversion is
   * the whole difference between the two at an arrival.
   */
  it('gives the first blow to the camp it walks into', async () => {
    const t = boot();
    const { token, guest } = await launchedSeason(t);
    const barracks = await raise(t, token, 'barracks', MARNE);
    const troop = await form(t, token, 'infantry', barracks);
    const camped = await post(t, guest, eastOf(AIMED, 10));

    await t.mutation(api.movements.marchTo, {
      token,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [troop],
      point: asPoint(AIMED),
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const [account] = await engagementsIn(t);
    expect(account).toBeDefined();
    expect(account!.attackerId).toBe(await playerOf(t, guest));
    expect(account!.defenderId).toBe(await playerOf(t, token));
    expect(account!.cause).toBe('arrival');
    /** The camp struck first: the strike opening the pass is its own. */
    expect((await strikesIn(t, account!._id))[0]!.bySide).toBe('attacker');
    expect((await t.run(async (ctx) => ctx.db.get(camped)))!.playerId).toBe(
      await playerOf(t, guest),
    );
  });

  it('finds nobody a step beyond the radius, and simply stands there', async () => {
    const t = boot();
    const { token, guest } = await launchedSeason(t);
    const barracks = await raise(t, token, 'barracks', MARNE);
    const troop = await form(t, token, 'infantry', barracks);
    await post(t, guest, eastOf(AIMED, ARRIVAL_RADIUS_KM + 15));

    await t.mutation(api.movements.marchTo, {
      token,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [troop],
      point: asPoint(AIMED),
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(await engagementsIn(t)).toHaveLength(0);
    expect((await t.run(async (ctx) => ctx.db.get(troop)))!.stationedAt).toEqual(asPoint(AIMED));
  });

  /**
   * **The banal order, and the doubled pass it used to buy.** A garrison at the end of the road
   * stands inside the two hundred kilometres of the interception net *and* inside the twenty-five
   * of the arrival: it fought the same column twice, on the way in and again on the ground.
   * One engagement is one pass (ADR 0014), and at a destination it is the arrival's.
   */
  it('meets the garrison waiting at its destination once', async () => {
    const t = boot();
    const { token, guest } = await launchedSeason(t);
    const barracks = await raise(t, token, 'barracks', MARNE);
    const troop = await form(t, token, 'infantry', barracks);
    const outpostId = await plant(t, guest, eastOf(AIMED, 20), 'ROU');
    await garrison(t, guest, outpostId);

    await t.mutation(api.movements.marchTo, {
      token,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [troop],
      point: asPoint(AIMED),
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const accounts = await engagementsIn(t);
    expect(accounts).toHaveLength(1);
    expect(accounts[0]!.cause).toBe('arrival');
    expect(accounts[0]!.outpostId).toBe(outpostId);
  });

  /** A precise posted address remains passive while a movement crosses its detection range. */
  it('keeps a camp passive at its exact stored point', async () => {
    const t = boot();
    const { token, guest } = await launchedSeason(t);
    const barracks = await raise(t, token, 'barracks', MARNE);
    const troop = await form(t, token, 'infantry', barracks);
    const road = routeBetween(regionFacts(MARNE)!.point, AIMED, 'land')!;
    const middle = road.points[Math.floor(road.points.length / 2)]!;
    const camped = await post(t, guest, [middle[0] + Math.PI / 1000, middle[1] - Math.E / 1000]);

    await t.mutation(api.movements.marchTo, {
      token,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [troop],
      point: asPoint(AIMED),
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(await engagementsIn(t)).toHaveLength(0);
    expect((await t.run(async (ctx) => ctx.db.get(camped)))!.stationedAt).toEqual({
      lon: middle[0] + Math.PI / 1000,
      lat: middle[1] - Math.E / 1000,
    });
  });

  /**
   * **The ground is cleared, whoever loses it** (ADR 0019 §3, ADR 0018 §1). A routed camp used
   * to stay exactly where it stood: the winner planted himself ten kilometres away and the two
   * never met again, for the rest of the season. It walks home now — by the return every rout
   * gets, unordered, and it lands on national soil hanging from nothing that stands.
   */
  it('walks the beaten camp home and stands the column on the ground it took', async () => {
    const t = boot();
    const { token, guest } = await launchedSeason(t);
    const barracks = await raise(t, token, 'barracks', MARNE);
    const first = await form(t, token, 'infantry', barracks);
    const second = await form(t, token, 'infantry', barracks);
    const camped = await post(t, guest, eastOf(AIMED, 10));
    // Worn down before the pass: the camp opens it and still breaks under the riposte.
    await t.run(async (ctx) => ctx.db.patch(camped, { currentStrength: 30 }));

    const sent = await t.mutation(api.movements.marchTo, {
      token,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [first, second],
      point: asPoint(AIMED),
    });
    vi.advanceTimersByTime(sent.minutes * 60_000);
    await t.finishInProgressScheduledFunctions();

    const [going] = await movementsOf(t, guest);
    expect(going).toBeDefined();
    expect(going!.type).toBe('return');
    expect(going!.target.kind).toBe('home');
    expect(going!.troopIds).toContain(camped);
    /** No slot spent on it: nobody ordered this march. */
    expect((await t.query(api.view.playerView, { token: guest })).me.slots.used).toBe(0);

    // And the winner holds the ground it walked to.
    for (const troop of [first, second]) {
      expect((await t.run(async (ctx) => ctx.db.get(troop)))!.stationedAt).toEqual(asPoint(AIMED));
    }

    await t.finishAllScheduledFunctions(vi.runAllTimers);
    /** National soil, hanging from nothing that stands — the written meaning of a null address. */
    expect((await t.run(async (ctx) => ctx.db.get(camped)))!.stationedAt).toBeNull();
  });

  /** The mirror: the camp holds, and it is the marcher that walks back. A camp that wins has
   *  not moved — it was standing on its ground and it still is. */
  it('leaves the winning camp where it stands and sends the beaten column back', async () => {
    const t = boot();
    const { token, guest } = await launchedSeason(t);
    const barracks = await raise(t, token, 'barracks', MARNE);
    const worn = await form(t, token, 'infantry', barracks);
    await t.run(async (ctx) => ctx.db.patch(worn, { currentStrength: 30 }));
    const camped = await post(t, guest, eastOf(AIMED, 10));
    const second = await post(t, guest, eastOf(AIMED, 10));

    const sent = await t.mutation(api.movements.marchTo, {
      token,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [worn],
      point: asPoint(AIMED),
    });
    vi.advanceTimersByTime(sent.minutes * 60_000);
    await t.finishInProgressScheduledFunctions();

    const [back] = await movementsOf(t, token);
    expect(back).toBeDefined();
    expect(back!.type).toBe('return');
    expect(back!.troopIds).toContain(worn);
    expect(await movementsOf(t, guest)).toHaveLength(0);

    for (const troop of [camped, second]) {
      expect((await t.run(async (ctx) => ctx.db.get(troop)))!.stationedAt).toEqual(
        asPoint(eastOf(AIMED, 10)),
      );
    }

    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await t.run(async (ctx) => ctx.db.get(worn)))!.stationedAt).toBe(barracks);
  });

  /** A march stays observational even when its road crosses a posted detector. */
  it('crosses a camp standing on its road without opening a pass', async () => {
    const t = boot();
    const { token, guest } = await launchedSeason(t);
    const barracks = await raise(t, token, 'barracks', MARNE);
    const troop = await form(t, token, 'infantry', barracks);
    const road = routeBetween(regionFacts(MARNE)!.point, AIMED, 'land')!;
    await post(t, guest, road.points[Math.floor(road.points.length / 2)]!);

    await t.mutation(api.movements.marchTo, {
      token,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [troop],
      point: asPoint(AIMED),
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(await engagementsIn(t)).toHaveLength(0);
    expect((await t.run(async (ctx) => ctx.db.get(troop)))!.stationedAt).toEqual(asPoint(AIMED));
  });

  /**
   * **A slot like any other** (ADR 0006): the march is an order, and orders are what the
   * regulator counts. Nothing about "going nowhere in particular" exempts it.
   *
   * **And the ceiling is the headquarters'**, `1 + niveau` (ADR 0015) — the very number the
   * banner reads. A placeholder constant used to hold this door at one movement while `view.ts`
   * promised three: the fan then offered what the server turned down, which is the one fault
   * ADR 0015 exists to forbid.
   */
  it('spends a slot, and is refused once the headquarters has no more to give', async () => {
    const t = boot();
    const { token } = await launchedSeason(t);
    await setHqLevel(t, token, 1);
    const barracks = await raise(t, token, 'barracks', MARNE);

    const send = async (km: number) =>
      t.mutation(api.movements.marchTo, {
        token,
        origin: { kind: 'building', buildingId: barracks },
        troopIds: [await form(t, token, 'infantry', barracks)],
        point: asPoint(eastOf(AIMED, km)),
      });

    await send(0);
    await send(200);
    const held = await t.query(api.view.playerView, { token });
    expect(held.me.slots).toEqual({ used: 2, total: 2 });

    // The refusal names the level that would buy the next slot, in figures the screen never
    // recomputes — both out of `movementSlots`, like the building ceiling's own remedy.
    const refused: Record<string, unknown> = await send(400)
      .then(() => ({}))
      .catch((error: { data: Record<string, unknown> }) => error.data);
    expect(refused).toMatchObject({
      code: 'MOVEMENT_IN_FLIGHT',
      maximum: 2,
      hqLevel: 1,
      nextHqLevel: 2,
      nextSlots: 3,
    });

    // The same order goes through the moment the headquarters carries a wider one.
    await setHqLevel(t, token, 2);
    expect((await t.query(api.view.playerView, { token })).me.slots.total).toBe(3);
    await send(100);
  });

  /**
   * **A camp does not show** (ADR 0019 §6): no detection at a distance, not by a territory's
   * radius nor by another camp's. What is seen from afar is what *moves* — and a posted troop
   * is the first mobile thing the fog has ever had to hide.
   */
  it('shows an opponent nothing of a column posted next door', async () => {
    const t = boot();
    const { token, guest } = await launchedSeason(t);
    const camped = await post(t, guest, eastOf(regionFacts(MARNE)!.point, 30));
    await raise(t, token, 'barracks', MARNE);
    await form(t, token, 'infantry', null);

    const view = await t.query(api.view.playerView, { token });
    expect(view.me.troops).toHaveLength(1);
    expect(JSON.stringify(view)).not.toContain(camped);
    expect(JSON.stringify(view)).not.toContain(await playerOf(t, guest));
  });

  /**
   * **The aim says what the player does not know, and promises nothing else.** Ground outside
   * his country and outside the reach of his outposts is unrecognised — which says nothing
   * about what stands there, and nothing about recognised ground being safe.
   */
  it('answers the aim with whether the player watches that ground', async () => {
    const t = boot();
    const { token } = await launchedSeason(t);
    const barracks = await raise(t, token, 'barracks', MARNE);
    const troop = await form(t, token, 'infantry', barracks);
    const order = {
      token,
      origin: { kind: 'building', buildingId: barracks } as const,
      troopIds: [troop],
      type: 'march' as const,
    };

    const abroad = await t.query(api.movements.preview, {
      ...order,
      target: { kind: 'point', point: asPoint(AIMED) },
    });
    expect(abroad!.recognised).toBe(false);

    const home = await t.query(api.movements.preview, {
      ...order,
      target: { kind: 'point', point: asPoint(regionFacts(MARNE)!.point) },
    });
    expect(home!.recognised).toBe(true);

    /** The second source, and the one the reach was written for: an outpost watches around it. */
    await plant(t, token, eastOf(AIMED, 20), 'ROU');
    const watched = await t.query(api.movements.preview, {
      ...order,
      target: { kind: 'point', point: asPoint(AIMED) },
    });
    expect(watched!.recognised).toBe(true);
  });
});

/**
 * ADR 0013 makes the distant action expensive, never impossible (ADR 0019 §2), and design sheet
 * 09 says how: **a land troop crosses aboard a transport, or it does not cross**. The door is
 * back on the pile — which is what lets the fan be exact — and the crossing is now a fleet one
 * builds, protects and can lose rather than a supplement on a trip.
 */
describe('the door of the sea, read on the pile', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  const NORD = 'FRA-5330'; // coastal, facing the Channel
  const KENT: LonLat = [0.73, 51.21]; // across the water, and only across it
  const DOGGER: LonLat = [2.5, 54.5]; // open sea, hosted by nobody
  const HELIGOLAND: LonLat = [6.5, 54.6]; // another patch of the same water
  const MIDLANDS: LonLat = [-1.5, 52.4]; // English, and no water within a grid cell of it

  /** Le débarquement de référence : un fantassin et sa coque, partis du quai du Nord, posés
   *  ensemble sur la plage du Kent. Ce que chacun demande ensuite est l'objet des cas d'après. */
  const landAtKent = async (t: ReturnType<typeof boot>, token: string) => {
    await raise(t, token, 'barracks', NORD);
    const quay = await raise(t, token, 'port', NORD);
    const infantry = await form(t, token, 'infantry', quay);
    const cargo = await form(t, token, 'cargo', quay);
    const beach = { lon: KENT[0], lat: KENT[1] };
    await t.mutation(api.movements.marchTo, {
      token,
      origin: { kind: 'building', buildingId: quay },
      troopIds: [infantry, cargo],
      point: beach,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    return { infantry, cargo, beach };
  };

  /**
   * The whole column leaves from the quay: the transport is moored there and its passengers
   * board it there. `stationedAt` is one address per movement — the day a column may be composed
   * from several is `adresse-sur-la-carte.md`, not this prompt.
   */
  const embark = async (
    t: ReturnType<typeof boot>,
    token: string,
    roles: ReadonlyArray<UnitRole>,
    { port = true }: { port?: boolean } = {},
  ) => {
    await raise(t, token, 'barracks', NORD);
    const quay = port ? await raise(t, token, 'port', NORD) : await raise(t, token, 'depot', NORD);
    const troopIds: Array<Id<'troops'>> = [];
    for (const role of roles) troopIds.push(await form(t, token, role, quay));
    return t.mutation(api.movements.attack, {
      token,
      origin: { kind: 'building', buildingId: quay },
      troopIds,
      target: { kind: 'point', point: { lon: KENT[0], lat: KENT[1] } },
    });
  };

  /**
   * **The stranding this closes.** A fleet that reached the open sea had its address written on
   * water, and the quay was then read on ground it would never stand on again: the hulls were
   * posted there for the rest of the season with no order able to leave. `afloat` is read off
   * the departure point — `hostAtPoint` answers the empty string out there and nowhere else —
   * and it is computed at every order, never written down beside `stationedAt`.
   */
  it('lets a fleet posted on the open sea sail again with no quay under it', async () => {
    const t = boot();
    const { token } = await launchedSeason(t);
    const quay = await raise(t, token, 'port', NORD);
    const troopIds = [await form(t, token, 'escort', quay), await form(t, token, 'cargo', quay)];

    await t.mutation(api.movements.marchTo, {
      token,
      origin: { kind: 'building', buildingId: quay },
      troopIds,
      point: { lon: DOGGER[0], lat: DOGGER[1] },
    });
    /** Read before the arrival clears the row: nobody hosts that water, which is the whole of
     *  what `afloat` will find at the second departure. */
    const [sailing] = await t.run(async (ctx) => ctx.db.query('movements').collect());
    expect(sailing!.hostCountry).toBe('');
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const posted = await t.run(async (ctx) => ctx.db.get(troopIds[0]!));
    expect(posted!.stationedAt).toEqual({ lon: DOGGER[0], lat: DOGGER[1] });

    await expect(
      t.mutation(api.movements.marchTo, {
        token,
        origin: { kind: 'point', point: { lon: DOGGER[0], lat: DOGGER[1] } },
        troopIds,
        point: { lon: HELIGOLAND[0], lat: HELIGOLAND[1] },
      }),
    ).resolves.toBeDefined();
  });

  /**
   * **Le quai part de l'eau, la plage la reçoit** (décisions 71a puis 72a). Depuis que le port
   * se pose sur une cellule de côte, la colonne embarque au premier pas ; depuis que le
   * débarquement est une opération, elle ne remet pas les bottes à terre avant sa cible. Entre
   * les deux il n'y a que de la mer — c'est un débarquement, et non plus une marche qui mouille.
   */
  it('carries infantry across the Channel aboard a cargo and lands them on the shore', async () => {
    const t = boot();
    const { token } = await launchedSeason(t);
    await embark(t, token, ['infantry', 'infantry', 'cargo']);

    const [movement] = await t.run(async (ctx) => ctx.db.query('movements').collect());
    expect(movement!.legs.every((leg) => leg.medium === 'sea')).toBe(true);
    /** The transfers are billed: a crossing costs more than its distance weighted by medium. */
    expect(movement!.costUnits).toBeGreaterThan(movement!.distanceUnits);
    /** The United Kingdom is a playable nation, so the ground has a host to owe a window to. */
    expect(movement!.hostCountry).toBe('GBR');
  });

  /**
   * The same two, with nothing to ride: they route on the land alone, and the land stops at the
   * shore. `NO_LAND_ROUTE` at last says exactly what happened — no renaming needed.
   */
  it('leaves the same two on the shore when no ship carries them', async () => {
    const t = boot();
    const { token } = await launchedSeason(t);
    await expect(embark(t, token, ['infantry', 'infantry'])).rejects.toThrow('NO_LAND_ROUTE');
  });

  it('refuses a seventh passenger for six places, and says how many of each', async () => {
    const t = boot();
    const { token } = await launchedSeason(t);
    const seven: ReadonlyArray<UnitRole> = Array<UnitRole>(7).fill('infantry');

    const refused = await embark(t, token, [...seven, 'cargo']).catch(
      (problem: unknown) => problem,
    );
    expect(refused).toBeInstanceOf(ConvexError);
    expect(
      (refused as ConvexError<{ code: string; needed: number; offered: number }>).data,
    ).toMatchObject({
      code: 'NOT_ENOUGH_LIFT',
      needed: 7,
      offered: 6,
    });
  });

  /**
   * And the fan knows it **without a route**: `legalMovementTypes` reads the same pile the
   * mutation reads, so nothing is ever offered that the server then turns down (ADR 0015). No
   * Dijkstra runs on either side of this assertion.
   */
  it('refuses a cargo leaving ground with no port, and the fan says so with no route', async () => {
    const t = boot();
    const { token } = await launchedSeason(t);
    await expect(embark(t, token, ['infantry', 'cargo'], { port: false })).rejects.toThrow(
      'NO_PORT_AT_DEPARTURE',
    );

    const aim: MovementAim = {
      kind: 'point',
      lon: KENT[0],
      lat: KENT[1],
      coastal: true,
      onLand: true,
    };
    const quayless: Column = {
      roles: ['infantry', 'cargo'],
      myRegionIds: new Set([NORD]),
      myOutpostIds: new Set(),
      departureBuildings: new Set<BuildingKey>(['barracks', 'depot']),
      afloat: false,
      coastal: false,
    };
    expect(refusalOf('attack', aim, quayless)).toBe('NO_PORT_AT_DEPARTURE');
    /** Et la porte ferme le fan entier : plus rien à demander depuis ce sol-là. */
    expect(legalMovementTypes(aim, quayless)).toEqual([]);
  });

  /**
   * **Un débarquement se choisit, il ne se traverse pas** (décision 72a, 04/09). Le cargo suivait
   * ses passagers sur la jambe terrestre : la mer n'était qu'un morceau du chemin et la plage se
   * choisissait toute seule. Elle se nomme désormais, et le reste est l'ordre d'après.
   */
  it('refuses a landing anywhere but on a coast, and the fan says so with no route', async () => {
    const t = boot();
    const { token } = await launchedSeason(t);
    await raise(t, token, 'barracks', NORD);
    const quay = await raise(t, token, 'port', NORD);
    const troopIds = [await form(t, token, 'infantry', quay), await form(t, token, 'cargo', quay)];

    await expect(
      t.mutation(api.movements.marchTo, {
        token,
        origin: { kind: 'building', buildingId: quay },
        troopIds,
        point: { lon: MIDLANDS[0], lat: MIDLANDS[1] },
      }),
    ).rejects.toThrow('LANDING_NEEDS_A_COAST');

    /** Les quatre cibles, et la même réponse des deux côtés du fil — aucun Dijkstra ne tourne
     *  sous cette assertion (ADR 0015). */
    const landing: Column = {
      roles: ['infantry', 'cargo'],
      myRegionIds: new Set([NORD]),
      myOutpostIds: new Set(),
      departureBuildings: new Set<BuildingKey>(['barracks', 'port']),
      afloat: false,
      coastal: false,
    };
    const beach: MovementAim = {
      kind: 'point',
      lon: KENT[0],
      lat: KENT[1],
      coastal: true,
      onLand: true,
    };
    const inland: MovementAim = {
      kind: 'point',
      lon: MIDLANDS[0],
      lat: MIDLANDS[1],
      coastal: false,
      onLand: true,
    };
    expect(coastAtPoint(KENT)).toBe(true);
    expect(coastAtPoint(MIDLANDS)).toBe(false);
    expect(legalMovementTypes(beach, landing)).toEqual(['march', 'attack']);
    expect(legalMovementTypes(inland, landing)).toEqual([]);
    expect(refusalOf('march', inland, landing)).toBe('LANDING_NEEDS_A_COAST');
    expect(refusalOf('attack', { kind: 'region', regionId: RUHR, country: 'DEU' }, landing)).toBe(
      'LANDING_NEEDS_A_COAST',
    );
  });

  /**
   * **Tout le monde descend au même endroit** (règle 3 de la décision 72a) : deux adresses
   * rendraient le rembarquement impossible à composer (`sameStation`). Ce que chacun fait de la
   * plage lui appartient ensuite — le fantassin marche, la coque reprend la mer.
   */
  it('puts hulls and passengers ashore at one address, and each is ordered on from it', async () => {
    const t = boot();
    const { token } = await launchedSeason(t);
    const { infantry, cargo, beach } = await landAtKent(t, token);

    const ashore = await t.run(async (ctx) => [
      (await ctx.db.get(infantry))!.stationedAt,
      (await ctx.db.get(cargo))!.stationedAt,
    ]);
    expect(ashore).toEqual([beach, beach]);

    /** Le fantassin s'enfonce dans les terres, seul et à pied : plus rien ne le porte. */
    await expect(
      t.mutation(api.movements.marchTo, {
        token,
        origin: { kind: 'point', point: beach },
        troopIds: [infantry],
        point: { lon: MIDLANDS[0], lat: MIDLANDS[1] },
      }),
    ).resolves.toBeDefined();
  });

  /**
   * **La plage tient lieu du quai qu'elle n'a pas** (ADR 0019 §2, révision du 04/09). Sans cela
   * une coque débarquée resterait échouée là pour la saison — le *mouvement fantôme* que la
   * révision du 27/08 avait chassé du large, revenu par la côte.
   */
  it('lets the hull sail again off the beach it landed on, with no quay under it', async () => {
    const t = boot();
    const { token } = await launchedSeason(t);
    const { cargo, beach } = await landAtKent(t, token);

    await expect(
      t.mutation(api.movements.marchTo, {
        token,
        origin: { kind: 'point', point: beach },
        troopIds: [cargo],
        point: { lon: DOGGER[0], lat: DOGGER[1] },
      }),
    ).resolves.toBeDefined();
  });

  /**
   * **Deux géométries, deux réponses — et une coque échouée entre les deux.** La visée lisait
   * « à terre » sur la grille de routage (`onLand`) ; le départ lisait « à flot » sur le polygone
   * (`hostAtPoint`). Toute bande côtière plus étroite qu'une demi-cellule est de la terre pour
   * l'un et de la mer pour l'autre : la coque y était envoyée sans refus — la cible n'est pas à
   * terre — puis n'en repartait plus, ni à flot ni sur une plage, un quai réclamé à un point
   * que Dijkstra tient pour de l'eau. Le *mouvement fantôme*, une troisième fois. `afloat` se lit
   * désormais sur la grille, la même lecture que la visée, et la porte répond ce que la visée a
   * promis (ADR 0015).
   */
  it('lets a hull sail again from a shoreline the polygon calls land and the grid calls water', async () => {
    /** Sussex shore: inside the British polygon, in a cell whose centre is in the Channel. */
    const SUSSEX: LonLat = [0.1, 50.78];
    expect(hostAtPoint(SUSSEX)).toBe('GBR');
    expect(landAtPoint(SUSSEX)).toBe(false);
    expect(coastAtPoint(SUSSEX)).toBe(false);

    const t = boot();
    const { token } = await launchedSeason(t);
    const quay = await raise(t, token, 'port', NORD);
    const cargo = await form(t, token, 'cargo', quay);
    const shore = { lon: SUSSEX[0], lat: SUSSEX[1] };
    await t.mutation(api.movements.marchTo, {
      token,
      origin: { kind: 'building', buildingId: quay },
      troopIds: [cargo],
      point: shore,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await t.run(async (ctx) => ctx.db.get(cargo)))!.stationedAt).toEqual(shore);

    const origin = { kind: 'point' as const, point: shore };
    const target = { kind: 'point' as const, point: { lon: DOGGER[0], lat: DOGGER[1] } };
    expect(
      await t.query(api.movements.preview, {
        token,
        origin,
        troopIds: [cargo],
        type: 'march',
        target,
      }),
    ).not.toBeNull();
    await expect(
      t.mutation(api.movements.marchTo, { token, origin, troopIds: [cargo], point: target.point }),
    ).resolves.toBeDefined();
  });

  it('refuses the landed infantry a sea destination in both preview and send', async () => {
    const t = boot();
    const { token } = await launchedSeason(t);
    const { infantry, beach } = await landAtKent(t, token);
    const origin = { kind: 'point' as const, point: beach };
    const point = { lon: 1.9, lat: 52 };

    expect(
      await t.query(api.movements.preview, {
        token,
        origin,
        troopIds: [infantry],
        type: 'march',
        target: { kind: 'point', point },
      }),
    ).toBeNull();
    await expect(
      t.mutation(api.movements.marchTo, {
        token,
        origin,
        troopIds: [infantry],
        point,
      }),
    ).rejects.toThrow('LAND_TARGET_REQUIRED');
    expect((await t.run(async (ctx) => ctx.db.get(infantry)))!.stationedAt).toEqual(beach);
  });

  it('refuses the landed cargo an inland destination and keeps it free to sail', async () => {
    const t = boot();
    const { token } = await launchedSeason(t);
    const { cargo, beach } = await landAtKent(t, token);
    const origin = { kind: 'point' as const, point: beach };
    const point = { lon: MIDLANDS[0], lat: MIDLANDS[1] };

    expect(
      await t.query(api.movements.preview, {
        token,
        origin,
        troopIds: [cargo],
        type: 'march',
        target: { kind: 'point', point },
      }),
    ).toBeNull();
    await expect(
      t.mutation(api.movements.marchTo, {
        token,
        origin,
        troopIds: [cargo],
        point,
      }),
    ).rejects.toThrow('SEA_TARGET_REQUIRED');
    await expect(
      t.mutation(api.movements.marchTo, {
        token,
        origin,
        troopIds: [cargo],
        point: { lon: DOGGER[0], lat: DOGGER[1] },
      }),
    ).resolves.toBeDefined();
  });

  /** Et la pile se recompose : les deux repartent ensemble par où ils sont venus — d'une plage
   *  vers une autre, puisqu'une colonne embarquée ne se pose plus sur l'eau. */
  it('re-embarks the pair from the same address, coast to coast', async () => {
    const t = boot();
    const { token } = await launchedSeason(t);
    const { infantry, cargo, beach } = await landAtKent(t, token);
    const [lon, lat] = regionFacts(NORD)!.point;

    await expect(
      t.mutation(api.movements.marchTo, {
        token,
        origin: { kind: 'point', point: beach },
        troopIds: [infantry, cargo],
        point: { lon, lat },
      }),
    ).resolves.toBeDefined();
  });

  it('lands at Sakhalin, rejoins the cargo at its exact address and sails back to Japan', async () => {
    const t = boot();
    const { token } = await launchedSeason(t);
    const quayPoint = { lon: 141.82, lat: 43.53 };
    const quay = await raise(t, token, 'port', 'JPN-1847', quayPoint);
    const cargo = await form(t, token, 'cargo', quay);
    const infantry = await form(t, token, 'infantry', quay);
    const coast = Array.from({ length: 21 }, (_, i) => [142 + i * 0.05, 47] as LonLat).find(
      (point) => coastAtPoint(point) && hostAtPoint(point) === 'RUS',
    );
    expect(coast).toBeDefined();
    const beach = asPoint(coast!);
    await t.mutation(api.movements.marchTo, {
      token,
      origin: { kind: 'building', buildingId: quay },
      troopIds: [cargo, infantry],
      point: beach,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const inland = regionFacts('RUS-2616')!.point;
    expect(landAtPoint(inland)).toBe(true);
    await t.mutation(api.movements.marchTo, {
      token,
      origin: { kind: 'point', point: beach },
      troopIds: [infantry],
      point: asPoint(inland),
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await t.run(async (ctx) => ctx.db.get(cargo)))!.stationedAt).toEqual(beach);

    await t.mutation(api.movements.marchTo, {
      token,
      origin: { kind: 'point', point: asPoint(inland) },
      troopIds: [infantry],
      point: beach,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await t.run(async (ctx) => ctx.db.get(infantry)))!.stationedAt).toEqual(beach);

    const { movementId } = await t.mutation(api.movements.marchTo, {
      token,
      origin: { kind: 'point', point: beach },
      troopIds: [cargo, infantry],
      point: quayPoint,
    });
    const movement = await t.run(async (ctx) => ctx.db.get(movementId));
    expect(movement!.legs.every((leg) => leg.medium === 'sea')).toBe(true);
  });

  /**
   * **La règle ne fabrique pas de quai.** Un cargo posé à l'intérieur des terres est impossible
   * après ce chantier, mais une donnée d'avant-wipe peut l'être : il reste refusé, exactement
   * comme avant, parce que c'est la côte qui l'exempte et rien d'autre.
   */
  it('fabricates no quay for a hull left inland', async () => {
    const t = boot();
    const { token } = await launchedSeason(t);
    const quay = await raise(t, token, 'port', NORD);
    const cargo = await form(t, token, 'cargo', quay);
    const stranded = { lon: MIDLANDS[0], lat: MIDLANDS[1] };
    await t.run(async (ctx) => ctx.db.patch(cargo, { stationedAt: stranded }));

    await expect(
      t.mutation(api.movements.marchTo, {
        token,
        origin: { kind: 'point', point: stranded },
        troopIds: [cargo],
        point: { lon: DOGGER[0], lat: DOGGER[1] },
      }),
    ).rejects.toThrow('NO_PORT_AT_DEPARTURE');
  });

  it('asks no port of a column that only walks', async () => {
    const t = boot();
    const { token } = await launchedSeason(t);
    const barracks = await raise(t, token, 'barracks', MARNE);
    const troop = await form(t, token, 'infantry', barracks);

    await t.mutation(api.movements.attack, {
      token,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [troop],
      target: { kind: 'region', regionId: RUHR },
    });

    const [movement] = await t.run(async (ctx) => ctx.db.query('movements').collect());
    expect(movement!.legs.every((leg) => leg.medium === 'land')).toBe(true);
  });
});

describe('a posted force never starts a pass at a distance', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  it('lets an attack pass a garrison and resolve only at its destination', async () => {
    const t = boot();
    const { token, guest } = await launchedSeason(t);
    const barracks = await raise(t, token, 'barracks', MARNE);
    const troop = await form(t, token, 'infantry', barracks);

    // Halfway down the road the column is about to take, so it walks straight into the radius.
    const road = routeBetween(regionFacts(MARNE)!.point, regionFacts(PRAHOVA)!.point, 'land')!;
    const ambush = road.points[Math.floor(road.points.length / 2)]!;
    const outpostId = await plant(t, guest, ambush, 'ROU');
    const waiting = await garrison(t, guest, outpostId);

    await t.mutation(api.movements.attack, {
      token,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [troop],
      target: { kind: 'region', regionId: PRAHOVA },
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(await engagementsIn(t)).toHaveLength(0);
    expect((await t.run(async (ctx) => ctx.db.get(troop)))!.currentStrength).toBe(
      nominalStrength('infantry', 1),
    );
    expect((await t.run(async (ctx) => ctx.db.get(waiting)))!.currentStrength).toBe(
      nominalStrength('infantry', 1),
    );
  });

  it('lets a neighbouring garrison observe a raid resolved once at the aimed outpost', async () => {
    const t = boot();
    const { token, guest } = await launchedSeason(t);
    const barracks = await raise(t, token, 'barracks', MARNE);
    const column = [
      await form(t, token, 'infantry', barracks),
      await form(t, token, 'infantry', barracks),
      await form(t, token, 'infantry', barracks),
    ];
    const aimed = regionFacts(PRAHOVA)!.point;
    const raided = await plant(t, guest, aimed, 'ROU');
    const held = await garrison(t, guest, raided);
    const neighbour = await plant(t, guest, eastOf(aimed, 20), 'ROU');
    const watching = await garrison(t, guest, neighbour);

    await t.mutation(api.movements.raid, {
      token,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: column,
      outpostId: raided,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const accounts = await engagementsIn(t);
    const onTheRoad = accounts.filter((account) => account.cause === 'interception');
    const atTheEnd = accounts.filter((account) => account.cause === 'arrival');
    expect(onTheRoad).toHaveLength(0);
    expect(atTheEnd).toHaveLength(1);
    expect(atTheEnd[0]!.outpostId).toBe(raided);
    expect((await t.run(async (ctx) => ctx.db.get(raided)))!.disabledUntil).not.toBeNull();

    expect((await t.run(async (ctx) => ctx.db.get(watching)))!.currentStrength).toBe(
      nominalStrength('infantry', 1),
    );
    expect(atTheEnd[0]!.troops.some((one) => one.troopId === held)).toBe(true);
  });
});

describe('a routed column walks itself home', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  it('breaks contact, takes the road back, and does not hold a slot doing it', async () => {
    const t = boot();
    const { token, guest } = await launchedSeason(t);
    const barracks = await raise(t, token, 'barracks', MARNE);
    const worn = await form(t, token, 'infantry', barracks);
    // Thirty soldiers walking at fifty: the riposte takes it under the quarter it breaks at.
    await t.run(async (ctx) => ctx.db.patch(worn, { currentStrength: 30 }));
    const theirs = await raise(t, guest, 'barracks', PRAHOVA);
    await form(t, guest, 'infantry', theirs);

    const sent = await t.mutation(api.movements.attack, {
      token,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [worn],
      target: { kind: 'region', regionId: PRAHOVA },
    });
    vi.advanceTimersByTime(sent.minutes * 60_000);
    await t.finishInProgressScheduledFunctions();

    const [account] = await engagementsIn(t);
    expect(account!.troops.find((one) => one.troopId === worn)!.state).toBe('routed');

    const [back] = await movementsOf(t, token);
    expect(back!.type).toBe('return');
    expect(back!.troopIds).toEqual([worn]);

    // It is not an order, so it does not eat the one movement a player may have in flight.
    const other = await form(t, token, 'infantry', barracks);
    await expect(
      t.mutation(api.movements.attack, {
        token,
        origin: { kind: 'building', buildingId: barracks },
        troopIds: [other],
        target: { kind: 'region', regionId: RUHR },
      }),
    ).resolves.toBeDefined();

    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const home = await t.run(async (ctx) => ctx.db.get(worn));
    expect(home!.stationedAt).toBe(barracks);
    expect(home!.currentStrength).toBeLessThan(30);
  });
});

/**
 * **A rout refluxes to the nearest anchor** (ADR 0019 §3, amended 19/08). A force whose address
 * is a point has lost the only ground it hung from; where it goes is the nearest of the anchors
 * its owner already has — the capital, which stands for the national soil, or one of his own
 * outposts. The point that opens the terrain and feeds the army also **rallies** it.
 *
 * The case with no outpost at all is the one that did not change, and it is tested where it was
 * written: *walks the beaten camp home and stands the column on the ground it took* above — the
 * capital for a route, a `null` address at the end of it.
 */
describe('a rout refluxes to the nearest anchor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  const asPoint = (point: LonLat) => ({ lon: point[0], lat: point[1] });
  /** Arabia: neutral ground, and some three thousand kilometres from Moskva — so an outpost a
   *  few hundred kilometres away is unambiguously the nearer anchor. */
  const ARABIA: LonLat = [46.72, 24.63];

  /** Two French columns posted next to the camp, enough to break it under the riposte. */
  async function march(t: ReturnType<typeof boot>, token: string, at: LonLat, onto: LonLat) {
    const troopIds = [await post(t, token, at), await post(t, token, at)];
    const sent = await t.mutation(api.movements.marchTo, {
      token,
      origin: { kind: 'point', point: asPoint(at) },
      troopIds,
      point: asPoint(onto),
    });
    vi.advanceTimersByTime(sent.minutes * 60_000);
    await t.finishInProgressScheduledFunctions();
    return troopIds;
  }

  it('walks the beaten camp to its own outpost and leaves it there as the garrison', async () => {
    const t = boot();
    const { token, guest } = await launchedSeason(t);
    const rally = await plant(t, guest, eastOf(ARABIA, 300), 'SAU');
    const camped = await post(t, guest, ARABIA);
    // Worn down before the pass: the camp opens it and still breaks under the riposte.
    await t.run(async (ctx) => ctx.db.patch(camped, { currentStrength: 30 }));

    await march(t, token, eastOf(ARABIA, -200), ARABIA);

    const [back] = await movementsOf(t, guest);
    expect(back).toBeDefined();
    expect(back!.type).toBe('return');
    expect(back!.target).toEqual({ kind: 'outpost', outpostId: rally });
    expect(back!.troopIds).toEqual([camped]);
    /** Nobody ordered this march: it holds no slot, and it walks — the arrival is in the future. */
    expect((await t.query(api.view.playerView, { token: guest })).me.slots.used).toBe(0);
    expect(back!.arrivesAt).toBeGreaterThan(Date.now());

    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await t.run(async (ctx) => ctx.db.get(camped)))!.stationedAt).toBe(rally);
  });

  /** **A deactivated outpost rallies all the same** — it hosts its garrison while out of service
   *  (ADR 0004), so what the deactivation suspends is its effects, never its address. */
  it('rallies to an outpost that a raid has put out of service', async () => {
    const t = boot();
    const { token, guest } = await launchedSeason(t);
    const rally = await plant(t, guest, eastOf(ARABIA, 300), 'SAU');
    await t.run(async (ctx) =>
      ctx.db.patch(rally, { disabledUntil: Date.now() + OUTPOST_DISABLED_HOURS * 3_600_000 }),
    );
    const camped = await post(t, guest, ARABIA);
    await t.run(async (ctx) => ctx.db.patch(camped, { currentStrength: 30 }));

    await march(t, token, eastOf(ARABIA, -200), ARABIA);

    const [back] = await movementsOf(t, guest);
    expect(back!.target).toEqual({ kind: 'outpost', outpostId: rally });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await t.run(async (ctx) => ctx.db.get(camped)))!.stationedAt).toBe(rally);
  });

  /**
   * **The column that marched out of a camp walks back too.** It used to be skipped by the road
   * home — it hung from a point, and no building answered for it — so it reappeared at its point
   * of departure the instant the pass was resolved. Travel time is real for the beaten.
   */
  it('walks the column that left a camp, and never teleports it to where it started', async () => {
    const t = boot();
    const { token, guest } = await launchedSeason(t);
    const camp = eastOf(ARABIA, 600);
    const walker = await post(t, guest, camp);
    await t.run(async (ctx) => ctx.db.patch(walker, { currentStrength: 30 }));
    // Two companies of the guest's kept at home, well clear of the road: the rout must not put
    // him under the victory bar, or the season concludes and the walk home is rightly refused
    // a season nobody plays any more (`seasonStillPlays`).
    await form(t, guest, 'infantry', null);
    await form(t, guest, 'infantry', null);
    // Two French columns holding the ground it walks onto: they open the pass and it breaks.
    await post(t, token, ARABIA);
    await post(t, token, ARABIA);

    const sent = await t.mutation(api.movements.marchTo, {
      token: guest,
      origin: { kind: 'point', point: asPoint(camp) },
      troopIds: [walker],
      point: asPoint(ARABIA),
    });
    vi.advanceTimersByTime(sent.minutes * 60_000);
    await t.finishInProgressScheduledFunctions();

    const [back] = await movementsOf(t, guest);
    expect(back).toBeDefined();
    expect(back!.type).toBe('return');
    expect(back!.troopIds).toEqual([walker]);
    /** It leaves from the ground it broke on, not from the camp it had already left. */
    expect(back!.from).toEqual(asPoint(ARABIA));
    expect(back!.arrivesAt).toBeGreaterThan(Date.now());

    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const home = await t.run(async (ctx) => ctx.db.get(walker));
    /** No outpost of its own: the capital, and national soil hanging from nothing that stands. */
    expect(home!.stationedAt).toBeNull();
    expect(home!.stationedAt).not.toEqual(asPoint(camp));
  });

  /**
   * **A return never engages.** It can land on ground that turned against it while it walked;
   * survivors do not open a second pass for one defeat (ADR 0014). The column comes down where
   * it arrives, at its own risk — and what walks past it afterwards will find it standing.
   */
  it('lands without a fight on a rally point somebody else is now camped on', async () => {
    const t = boot();
    const { token, guest } = await launchedSeason(t);
    const rally = await plant(t, guest, eastOf(ARABIA, 300), 'SAU');
    const camped = await post(t, guest, ARABIA);
    await t.run(async (ctx) => ctx.db.patch(camped, { currentStrength: 30 }));

    await march(t, token, eastOf(ARABIA, -200), ARABIA);
    expect(await engagementsIn(t)).toHaveLength(1);

    // The winner walks up to the rally point while the beaten column is still on the road.
    await post(t, token, eastOf(ARABIA, 300));

    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await t.run(async (ctx) => ctx.db.get(camped)))!.stationedAt).toBe(rally);
    expect(await engagementsIn(t)).toHaveLength(1);
  });

  /** **The anchor is read once, at the rout.** One razed while the return flies does not move
   *  the destination: the column walks to the ground it was sent to and stands on it. */
  it('stands on the ground it reached when the rally point is gone', async () => {
    const t = boot();
    const { token, guest } = await launchedSeason(t);
    const rally = await plant(t, guest, eastOf(ARABIA, 300), 'SAU');
    const camped = await post(t, guest, ARABIA);
    await t.run(async (ctx) => ctx.db.patch(camped, { currentStrength: 30 }));

    await march(t, token, eastOf(ARABIA, -200), ARABIA);
    const [back] = await movementsOf(t, guest);
    await t.run(async (ctx) => ctx.db.delete(rally));

    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await t.run(async (ctx) => ctx.db.get(camped)))!.stationedAt).toEqual(back!.to);
  });
});

/**
 * **Nobody teleports** (ADR 0019 §3, amended 19/08). The travel time is the central lever the
 * simulation measured, and it owns no exception: the same `return` carries the beaten and the
 * winners back to the address they left.
 */
describe('a column that comes out of a pass walks back, winner or beaten', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  const asPoint = (point: LonLat) => ({ lon: point[0], lat: point[1] });
  /** Deliberately off the Prahova centroid, and far enough from it to be another place. */
  const AIMED: LonLat = [25.2, 44.6];

  it('walks the winners of an attack back to the camp they left', async () => {
    const t = boot();
    const { token, guest } = await launchedSeason(t);
    const camp = regionFacts(PRAHOVA)!.point;
    const column = [await post(t, token, camp), await post(t, token, camp)];
    const standing = await post(t, guest, AIMED);
    // Twenty soldiers: the first strike of the pass clears the ground, so the attack wins it.
    await t.run(async (ctx) => ctx.db.patch(standing, { currentStrength: 20 }));

    const sent = await t.mutation(api.movements.attack, {
      token,
      origin: { kind: 'point', point: asPoint(camp) },
      troopIds: column,
      target: { kind: 'point', point: asPoint(AIMED) },
    });
    vi.advanceTimersByTime(sent.minutes * 60_000);
    await t.finishInProgressScheduledFunctions();

    const [account] = await engagementsIn(t);
    expect(account!.winner).toBe('attacker');
    expect(await t.run(async (ctx) => ctx.db.get(standing))).toBeNull();

    /** **The winners march.** They used to be skipped by the road home — a point answered to
     *  nobody — and so stood on their camp again the instant the pass was resolved, while the
     *  beaten walked. The trip is real for both. */
    const [back] = await movementsOf(t, token);
    expect(back).toBeDefined();
    expect(back!.type).toBe('return');
    expect(back!.target).toEqual({ kind: 'point', point: asPoint(camp) });
    expect(back!.to).toEqual(asPoint(camp));
    expect([...back!.troopIds].sort()).toEqual([...column].sort());
    expect(back!.arrivesAt).toBeGreaterThan(Date.now());

    await t.finishAllScheduledFunctions(vi.runAllTimers);
    for (const troop of column) {
      expect((await t.run(async (ctx) => ctx.db.get(troop)))!.stationedAt).toEqual(asPoint(camp));
    }
  });

  it('walks the winners of an attack back into the outpost they garrison', async () => {
    const t = boot();
    const { token, guest } = await launchedSeason(t);
    const outpostId = await plant(t, token, regionFacts(PRAHOVA)!.point, 'ROU');
    const column = [await garrison(t, token, outpostId), await garrison(t, token, outpostId)];
    const standing = await post(t, guest, AIMED);
    await t.run(async (ctx) => ctx.db.patch(standing, { currentStrength: 20 }));

    const sent = await t.mutation(api.movements.attack, {
      token,
      origin: { kind: 'outpost', outpostId },
      troopIds: column,
      target: { kind: 'point', point: asPoint(AIMED) },
    });
    vi.advanceTimersByTime(sent.minutes * 60_000);
    await t.finishInProgressScheduledFunctions();

    expect((await engagementsIn(t))[0]!.winner).toBe('attacker');

    const [back] = await movementsOf(t, token);
    expect(back).toBeDefined();
    expect(back!.type).toBe('return');
    expect(back!.target).toEqual({ kind: 'outpost', outpostId });
    expect(back!.to).toEqual(asPoint(regionFacts(PRAHOVA)!.point));
    expect(back!.arrivesAt).toBeGreaterThan(Date.now());

    await t.finishAllScheduledFunctions(vi.runAllTimers);
    for (const troop of column) {
      expect((await t.run(async (ctx) => ctx.db.get(troop)))!.stationedAt).toBe(outpostId);
    }
  });
});

/**
 * **A posted troop is the fourth source of detection** (ADR 0019 §5, design sheet 04): it reveals
 * what passes within its role's range to its owner, and it pierces nothing — a thread, a
 * bearing, an estimated schedule, a medium, never the type nor the composition.
 *
 * The rows are maintained at board events and read only through the observer's own index, which
 * keeps the fan-out bounded (`WWS/docs/technique/brouillard-et-fanout.md`).
 */
describe('a posted troop sees what passes within its radius', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  /** The road the column will actually walk, and how close a point stands to it: the tests turn
   *  on the radius, so the geography is measured rather than assumed. */
  const road = () => routeBetween(regionFacts(MARNE)!.point, regionFacts(PRAHOVA)!.point, 'land')!;
  const nearestOn = (points: ReadonlyArray<LonLat>, point: LonLat) =>
    points.reduce((closest, step) => Math.min(closest, distanceKm(step, point)), Infinity);

  async function marchAcross(t: ReturnType<typeof boot>, token: string) {
    const barracks = await raise(t, token, 'barracks', MARNE);
    const troop = await form(t, token, 'infantry', barracks);
    return t.mutation(api.movements.attack, {
      token,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [troop],
      target: { kind: 'region', regionId: PRAHOVA },
    });
  }

  it('serves the thread of what walks past, and neither its type nor its composition', async () => {
    const t = boot();
    const { token, guest } = await launchedSeason(t);
    const halfway = road().points[Math.floor(road().points.length / 2)]!;
    // Forty kilometres off the road: inside the sentry's passive detection range.
    const camp = eastOf(halfway, 40);
    expect(nearestOn(road().points, camp)).toBeLessThan(DETECTION_RANGE_KM.infantry);
    await post(t, guest, camp);

    const sent = await marchAcross(t, token);
    vi.advanceTimersByTime(sent.minutes * 60_000 * 0.5);

    const watched = await t.query(api.view.playerView, { token: guest });
    expect(watched.detected).toHaveLength(1);
    const [seen] = watched.detected;
    expect(seen!.points.length).toBeGreaterThan(1);
    expect(seen!.arrivesAt).toBe(sent.arrivesAt);
    /** The fog checked by what is missing: an unidentified movement has nothing to leak because
     *  nothing was fetched (design sheet 04, convention §8). */
    expect(seen).not.toHaveProperty('type');
    expect(seen).not.toHaveProperty('roles');
    expect(seen).not.toHaveProperty('troopIds');
    expect(seen).not.toHaveProperty('playerId');

    /** And no engagement came of it: a posted detector never starts a pass at a distance. */
    expect(await engagementsIn(t)).toHaveLength(0);
  });

  it('sees nothing of the same column from beyond the radius', async () => {
    const t = boot();
    const { token, guest } = await launchedSeason(t);
    const halfway = road().points[Math.floor(road().points.length / 2)]!;
    const camp = eastOf(halfway, 150);
    expect(nearestOn(road().points, camp)).toBeGreaterThan(DETECTION_RANGE_KM.infantry);
    await post(t, guest, camp);

    const sent = await marchAcross(t, token);
    vi.advanceTimersByTime(sent.minutes * 60_000 * 0.5);

    expect((await t.query(api.view.playerView, { token: guest })).detected).toEqual([]);
  });
});

/**
 * **La porte dérobée, refermée** (29/08/2026). Elle était la tolérance du leurre : un manifeste
 * vide était un ordre. Le leurre retiré, « à zéro troupe » n'est plus une façon d'obtenir une
 * marche gratuite — un ordre qui porte des troupes en porte au moins une.
 */
describe('an empty manifest buys nothing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  const asPoint = (point: LonLat) => ({ lon: point[0], lat: point[1] });

  it('refuses a march with no troop named', async () => {
    const t = boot();
    const { token } = await launchedSeason(t);
    const barracks = await raise(t, token, 'barracks', MARNE);

    await expect(
      t.mutation(api.movements.marchTo, {
        token,
        origin: { kind: 'building', buildingId: barracks },
        troopIds: [],
        point: asPoint(regionFacts(PRAHOVA)!.point),
      }),
    ).rejects.toThrow('EMPTY_MOVEMENT');
  });

  it('refuses an attack with no troop named, and spends no slot doing it', async () => {
    const t = boot();
    const { token } = await launchedSeason(t);
    const barracks = await raise(t, token, 'barracks', MARNE);

    await expect(
      t.mutation(api.movements.attack, {
        token,
        origin: { kind: 'building', buildingId: barracks },
        troopIds: [],
        target: { kind: 'point', point: asPoint(regionFacts(PRAHOVA)!.point) },
      }),
    ).rejects.toThrow('EMPTY_MOVEMENT');
    expect((await t.query(api.view.playerView, { token })).me.slots.used).toBe(0);
  });
});

/**
 * **Le métier d'un point se règle sur le point** (décision Pierre, 29/08). Le serveur exige une
 * spécialisation à la fondation et le clic droit n'en demande aucune : il pose « relais », et le
 * panneau de l'avant-poste rattrape — tant qu'aucune passe ne s'en est servie.
 */
describe('an outpost changes trade until a pass has read it', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  const asPoint = (point: LonLat) => ({ lon: point[0], lat: point[1] });

  it('takes the change, and says so in the view', async () => {
    const t = boot();
    const { token } = await launchedSeason(t);
    const outpostId = await plant(t, token, regionFacts(PRAHOVA)!.point, 'ROU');

    expect((await t.query(api.view.playerView, { token })).me.outposts[0]).toMatchObject({
      specialization: 'relay',
      specializationLocked: false,
    });

    await t.mutation(api.movements.respecialize, {
      token,
      outpostId,
      specialization: 'listening',
    });

    expect((await t.run(async (ctx) => ctx.db.get(outpostId)))!.specialization).toBe('listening');
  });

  /**
   * Un départ **à portée** est ce qui scelle : il peut lire le relais immédiatement et fait
   * entrer le poste d'écoute dans la réévaluation événementielle.
   */
  it('seals it once a departure passes within its reach', async () => {
    const t = boot();
    const { token } = await launchedSeason(t);
    const barracks = await raise(t, token, 'barracks', MARNE);
    const troop = await form(t, token, 'infantry', barracks);
    const outpostId = await plant(t, token, regionFacts(MARNE)!.point, 'FRA');

    await t.mutation(api.movements.marchTo, {
      token,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [troop],
      point: asPoint(regionFacts(PRAHOVA)!.point),
    });

    expect((await t.query(api.view.playerView, { token })).me.outposts[0]).toMatchObject({
      specializationLocked: true,
    });
    const refused = await t
      .mutation(api.movements.respecialize, { token, outpostId, specialization: 'listening' })
      .catch((problem: unknown) => (problem as ConvexError<{ code: string }>).data);
    expect(refused).toMatchObject({ code: 'SPECIALIZATION_SEALED' });
  });

  /** Un départ à l'autre bout du monde n'a rien lu de ce point-là : sceller sur lui scellerait
   *  chaque avant-poste dans la minute qui suit sa fondation. */
  it('leaves it open when the departure never comes near', async () => {
    const t = boot();
    const { token } = await launchedSeason(t);
    const barracks = await raise(t, token, 'barracks', MARNE);
    const troop = await form(t, token, 'infantry', barracks);
    const outpostId = await plant(t, token, regionFacts(RIYADH)!.point, 'SAU');

    await t.mutation(api.movements.marchTo, {
      token,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [troop],
      point: asPoint(regionFacts(RUHR)!.point),
    });

    expect((await t.query(api.view.playerView, { token })).me.outposts[0]).toMatchObject({
      specializationLocked: false,
    });
    await t.mutation(api.movements.respecialize, {
      token,
      outpostId,
      specialization: 'listening',
    });
    expect((await t.run(async (ctx) => ctx.db.get(outpostId)))!.specialization).toBe('listening');
  });
});

/**
 * **Entering a garrison** (decisions 64b, 69a, 70b): a march aimed at a building of one's own,
 * which ends with `stationedAt` on the building rather than on the ground in front of it. It is
 * what lets the infantry board the cargo moored at that port on the next order — the case the
 * test game of 04/09 could not play.
 */
describe('a column enters a garrison of its own', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  const NORD = 'FRA-5330'; // coastal, facing the Channel
  const KENT: LonLat = [0.73, 51.21];
  /** Thirty-odd kilometres inland of the port's region point — posted, not stationed. */
  const nearby = (): { lon: number; lat: number } => {
    const [lon, lat] = regionFacts(NORD)!.point;
    return { lon: lon + 0.4, lat };
  };

  async function post(
    t: ReturnType<typeof boot>,
    token: string,
    role: UnitRole,
    at: { lon: number; lat: number },
  ): Promise<Id<'troops'>> {
    const playerId = await playerOf(t, token);
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
        stationedAt: at,
      });
    });
  }

  async function noticesOf(t: ReturnType<typeof boot>, token: string) {
    const playerId = await playerOf(t, token);
    return t.run(async (ctx) =>
      ctx.db
        .query('notices')
        .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
        .collect(),
    );
  }

  it('stations the infantry at the port it marched into, and says so by name', async () => {
    const t = boot();
    const { token } = await launchedSeason(t);
    const port = await raise(t, token, 'port', NORD);
    const camp = nearby();
    const infantry = await post(t, token, 'infantry', camp);

    await t.mutation(api.movements.enterGarrison, {
      token,
      origin: { kind: 'point', point: camp },
      troopIds: [infantry],
      buildingId: port,
    });
    const [filed] = await movementsOf(t, token);
    expect(filed!.type).toBe('march');
    expect(filed!.target).toEqual({ kind: 'building', buildingId: port });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect((await t.run(async (ctx) => ctx.db.get(infantry)))!.stationedAt).toBe(port);
    expect(await movementsOf(t, token)).toHaveLength(0);
    const entered = (await noticesOf(t, token)).filter(
      (notice) => notice.kind === 'garrisonEntered',
    );
    expect(entered).toHaveLength(1);
    expect(entered[0]).toMatchObject({ building: 'port', regionId: NORD, troops: 1 });
    expect((await noticesOf(t, token)).some((notice) => notice.kind === 'columnArrived')).toBe(
      false,
    );
    /** The modal of the port reads the same address the view serves. */
    const view = await t.query(api.view.playerView, { token });
    expect(view.me.troops.find((troop) => troop.id === infantry)?.stationedAt).toEqual({
      kind: 'building',
      buildingId: port,
    });
  });

  /** **The case that opened the yard**: infantry at the port, cargo at the port, one order. */
  it('lets the infantry sail with the cargo moored at that port on its next order', async () => {
    const t = boot();
    const { token } = await launchedSeason(t);
    const port = await raise(t, token, 'port', NORD);
    const camp = nearby();
    const infantry = await post(t, token, 'infantry', camp);
    const cargo = await form(t, token, 'cargo', port);

    await t.mutation(api.movements.enterGarrison, {
      token,
      origin: { kind: 'point', point: camp },
      troopIds: [infantry],
      buildingId: port,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    await expect(
      t.mutation(api.movements.marchTo, {
        token,
        origin: { kind: 'building', buildingId: port },
        troopIds: [cargo, infantry],
        point: { lon: KENT[0], lat: KENT[1] },
      }),
    ).resolves.toBeDefined();
    const [crossing] = await movementsOf(t, token);
    expect(crossing!.legs.some((leg) => leg.medium === 'sea')).toBe(true);
  });

  it('refuses the role the building is shut to, naming both', async () => {
    const t = boot();
    const { token } = await launchedSeason(t);
    const mine = await raise(t, token, 'mine', NORD);
    const camp = nearby();
    const armour = await post(t, token, 'armor', camp);

    const refused = await t
      .mutation(api.movements.enterGarrison, {
        token,
        origin: { kind: 'point', point: camp },
        troopIds: [armour],
        buildingId: mine,
      })
      .catch((problem: unknown) => problem);
    expect(refused).toBeInstanceOf(ConvexError);
    expect(
      (refused as ConvexError<{ code: string; role: string; building: string }>).data,
    ).toMatchObject({
      code: 'NOT_A_GARRISON_FOR',
      role: 'armor',
      building: 'mine',
    });
    /** And the fan agrees without asking: same function, same table (ADR 0015). */
    const column: Column = {
      roles: ['armor'],
      myRegionIds: new Set([NORD]),
      myOutpostIds: new Set(),
      departureBuildings: new Set(),
      afloat: false,
      coastal: false,
    };
    const aim: MovementAim = { kind: 'building', buildingId: mine, key: 'mine' };
    expect(legalMovementTypes(aim, column)).toEqual([]);
    expect(refusalOf('march', aim, column)).toBe('NOT_A_GARRISON_FOR');
  });

  it('stands the column on the point when the building fell during the march', async () => {
    const t = boot();
    const { token } = await launchedSeason(t);
    const port = await raise(t, token, 'port', NORD);
    const camp = nearby();
    const infantry = await post(t, token, 'infantry', camp);

    await t.mutation(api.movements.enterGarrison, {
      token,
      origin: { kind: 'point', point: camp },
      troopIds: [infantry],
      buildingId: port,
    });
    await t.run(async (ctx) => ctx.db.delete(port));
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const [lon, lat] = regionFacts(NORD)!.point;
    expect((await t.run(async (ctx) => ctx.db.get(infantry)))!.stationedAt).toEqual({ lon, lat });
    const notices = await noticesOf(t, token);
    expect(notices.some((notice) => notice.kind === 'garrisonEntered')).toBe(false);
    expect(notices.find((notice) => notice.kind === 'columnArrived')).toMatchObject({
      movementType: 'march',
      troops: 1,
    });
  });

  it("answers somebody else's building as unknown — the fog does not confirm it stands", async () => {
    const t = boot();
    const { token, guest } = await launchedSeason(t);
    const theirs = await raise(t, guest, 'barracks', PSKOV);
    const camp = nearby();
    const infantry = await post(t, token, 'infantry', camp);

    await expect(
      t.mutation(api.movements.enterGarrison, {
        token,
        origin: { kind: 'point', point: camp },
        troopIds: [infantry],
        buildingId: theirs,
      }),
    ).rejects.toThrow('UNKNOWN_BUILDING');
    await expect(
      t.query(api.movements.preview, {
        token,
        origin: { kind: 'point', point: camp },
        troopIds: [infantry],
        target: { kind: 'building', buildingId: theirs },
        type: 'march',
      }),
    ).rejects.toThrow('UNKNOWN_BUILDING');
  });

  /**
   * **Elle marche jusqu'au quai, pas jusqu'au centre de la région** (ADR 0013, révision du
   * 04/09). The whole point of the coast point is that it is where the building *is*: the march
   * that ends in it ends there, and the arc drawn on the board ends there too.
   */
  it('walks to the port\u2019s own quay rather than to its region\u2019s point', async () => {
    const t = boot();
    const { token } = await launchedSeason(t);
    const quay = { lon: 1.92, lat: 50.56 };
    const port = await raise(t, token, 'port', NORD, quay);
    const camp = nearby();
    const infantry = await post(t, token, 'infantry', camp);

    await t.mutation(api.movements.enterGarrison, {
      token,
      origin: { kind: 'point', point: camp },
      troopIds: [infantry],
      buildingId: port,
    });
    const [filed] = await movementsOf(t, token);
    const arrival = filed!.points[filed!.points.length - 1]!;
    expect(distanceKm([arrival.lon, arrival.lat], [quay.lon, quay.lat])).toBeLessThan(40);
    expect(distanceKm([arrival.lon, arrival.lat], regionFacts(NORD)!.point)).toBeGreaterThan(40);
  });

  it('previews the route to the building and names its region', async () => {
    const t = boot();
    const { token } = await launchedSeason(t);
    const port = await raise(t, token, 'port', NORD);
    const camp = nearby();
    const infantry = await post(t, token, 'infantry', camp);

    const preview = await t.query(api.movements.preview, {
      token,
      origin: { kind: 'point', point: camp },
      troopIds: [infantry],
      target: { kind: 'building', buildingId: port },
      type: 'march',
    });
    expect(preview).not.toBeNull();
    expect(preview!.destinationName).toBe(regionFacts(NORD)!.name);
    expect(preview!.route.mode).toBe('land');
  });
});
