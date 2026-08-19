import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { distanceKm, type LonLat } from '../src/domain/geo';
import {
  ARRIVAL_RADIUS_KM,
  nominalStrength,
  OUTPOST_DISABLED_HOURS,
  OUTPOST_REACH_KM,
  REST_WINDOW_MINUTES,
  SCOUT_RADIUS_KM,
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
import { pointOf } from './movements';
import { routeBetween } from './routes';
import schema from './schema';
import { modules } from './test.setup';

const boot = () => convexTest(schema, modules);

const MARNE = 'FRA-5323'; // where the barracks stands
const PRAHOVA = 'ROU-310'; // Romanian oil, 1 800 km east — nobody's home country
const RUHR = 'DEU-1572'; // German, and far out of any Romanian reach
const RIYADH = 'SAU-1097'; // Ar Riyad — a second neutral, to prove neutrals are not one country
const PSKOV = 'RUS-2335'; // Soviet, so somebody sleeps there

async function launchedSeason(t: ReturnType<typeof boot>) {
  const { code, token } = await t.mutation(api.seasons.create, {
    nickname: 'Pierre',
    durationHours: 48,
    compensation: 0.5,
  });
  const { token: guest } = await t.mutation(api.seasons.join, { code, nickname: 'Léa' });
  await t.mutation(api.players.reserveNation, { token, nation: 'france' });
  await t.mutation(api.players.chooseDoctrine, { token, doctrine: 'hegemony' });
  await t.mutation(api.players.declareReady, { token, ready: true });
  await t.mutation(api.players.reserveNation, { token: guest, nation: 'ussr' });
  await t.mutation(api.players.chooseDoctrine, { token: guest, doctrine: 'domination' });
  await t.mutation(api.players.declareReady, { token: guest, ready: true });
  await t.mutation(api.seasons.launch, { token });
  return { token, guest };
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
): Promise<Id<'buildings'>> {
  const playerId = await playerOf(t, token);
  return t.run(async (ctx) => ctx.db.insert('buildings', { playerId, key, regionId, level: 1 }));
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
  return t.run(async (ctx) =>
    ctx.db.insert('troops', {
      playerId,
      role,
      tier: 1,
      nominalStrength: strength,
      currentStrength: strength,
      stationedAt,
    }),
  );
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

/** An outpost planted without walking to it: what is under test is what happens *at* it. */
async function plant(
  t: ReturnType<typeof boot>,
  token: string,
  point: LonLat,
  hostCountry: string,
): Promise<Id<'outposts'>> {
  const playerId = await playerOf(t, token);
  return t.run(async (ctx) =>
    ctx.db.insert('outposts', {
      playerId,
      point: { lon: point[0], lat: point[1] },
      hostCountry,
      level: 1,
      specialization: 'relay',
      foundedAt: Date.now(),
      disabledUntil: null,
      immuneUntil: null,
    }),
  );
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
        token,
        point: asPoint(regionFacts(RUHR)!.point),
        specialization: 'relay',
        troopIds: [posted],
      }),
    ).rejects.toThrow('TROOP_NOT_AT_ORIGIN');

    await expect(
      t.mutation(api.movements.foundOutpostHere, {
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
      token,
      point: { lon: point[0], lat: point[1] },
      specialization: 'relay',
      troopIds: [await post(t, token, point)],
    });
    return token;
  }

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

    expect(refused).toMatchObject({ code: 'OUT_OF_OUTPOST_REACH', reachKm: OUTPOST_REACH_KM });
    expect(refused.nearestKm).toBeGreaterThan(OUTPOST_REACH_KM);
  });

  /**
   * **The two rules stack, they do not stand in for one another.** The reach says *where* a
   * building may go up, the catalogue tier says *whether the season has reached it* — so a
   * region an outpost has opened still refuses an airfield until the headquarters reaches the
   * level this format opens projection at (`unlockLevel`, one step for a skirmish).
   */
  it('stacks the tier of the catalogue on top of the reach', async () => {
    const t = boot();
    const token = await withOutpostAtPrahova(t);
    const opensAt = unlockLevel('airfield', 'skirmish');
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
    expect(account!.strikes).toHaveLength(2);
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

  /**
   * **A posted column orders nothing, and defends the ground it stands on** — the amendment of
   * ADR 0019 §3. It reaches for nobody: a column passes within `ARRIVAL_RADIUS_KM` of the camp,
   * which is a meeting and not a blockade, and the pass is the camp's.
   */
  it('crosses a camp its road walks into', async () => {
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

    const [account] = await engagementsIn(t);
    expect(account).toBeDefined();
    /** The camp struck: it holds the terrain, the column is the one surprised (ADR 0014). */
    expect(account!.attackerId).toBe(await playerOf(t, guest));
    expect(account!.cause).toBe('interception');
  });

  /** **The geometry is read once, at departure** (ADR 0018 §3, ADR 0019 §6). A camp pitched
   *  behind a marching column never meets it: the renseignement is a bet, not a reaction. */
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
    expect(account!.strikes[0]!.bySide).toBe('attacker');
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

  /**
   * **The camp is found again after the round trip** — written into the contact, read back out
   * of the database, resolved. Its point used to travel as a string built and taken apart by
   * hand: when the reading missed, the pass was scheduled, nobody was found, and nothing at all
   * happened, without a word. The coordinate is deliberately one no rounding would survive.
   */
  it('resolves the crossing against the camp whose point made the round trip', async () => {
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

    const [account] = await engagementsIn(t);
    expect(account).toBeDefined();
    expect(account!.attackerId).toBe(await playerOf(t, guest));
    /** It was there, and it took the riposte: the pass was resolved against troops, not
     *  against an empty reference. */
    expect(account!.troops.some((one) => one.troopId === camped)).toBe(true);
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

  /** The crossing of §2, ordered as a march this time: the road, not the destination. */
  it('crosses a camp standing on its road, and the camp opens the pass', async () => {
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

    const [account] = await engagementsIn(t);
    expect(account).toBeDefined();
    expect(account!.attackerId).toBe(await playerOf(t, guest));
  });

  /** **A slot like any other** (ADR 0006): the march is an order, and orders are what the
   *  regulator counts. Nothing about "going nowhere in particular" exempts it. */
  it('spends a slot, and is refused once none is left', async () => {
    const t = boot();
    const { token } = await launchedSeason(t);
    const barracks = await raise(t, token, 'barracks', MARNE);
    const first = await form(t, token, 'infantry', barracks);
    const second = await form(t, token, 'infantry', barracks);

    await t.mutation(api.movements.marchTo, {
      token,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [first],
      point: asPoint(AIMED),
    });
    expect((await t.query(api.view.playerView, { token })).me.slots.used).toBe(1);

    await expect(
      t.mutation(api.movements.marchTo, {
        token,
        origin: { kind: 'building', buildingId: barracks },
        troopIds: [second],
        point: asPoint(eastOf(AIMED, 200)),
      }),
    ).rejects.toThrow('MOVEMENT_IN_FLIGHT');
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

  it('carries infantry across the Channel aboard a cargo, by land and sea', async () => {
    const t = boot();
    const { token } = await launchedSeason(t);
    await embark(t, token, ['infantry', 'infantry', 'cargo']);

    const [movement] = await t.run(async (ctx) => ctx.db.query('movements').collect());
    expect(movement!.legs.some((leg) => leg.medium === 'sea')).toBe(true);
    expect(movement!.legs.some((leg) => leg.medium === 'land')).toBe(true);
    /** The transfer is billed: a crossing costs more than its distance weighted by medium. */
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

    const aim: MovementAim = { kind: 'point', lon: KENT[0], lat: KENT[1] };
    const quayless: Column = {
      roles: ['infantry', 'cargo'],
      myRegionIds: new Set([NORD]),
      myOutpostIds: new Set(),
      departureBuildings: new Set<BuildingKey>(['barracks', 'depot']),
    };
    expect(refusalOf('attack', aim, quayless)).toBe('NO_PORT_AT_DEPARTURE');
    expect(legalMovementTypes(aim, quayless)).toEqual([]);
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

describe('an interception inverts the initiative', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  it('lets the garrison on the road strike first', async () => {
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

    const [account] = await engagementsIn(t);
    expect(account).toBeDefined();
    expect(account!.cause).toBe('interception');
    // The one who was already there is the attacker of the pass — that is the counter-power.
    expect(account!.attackerId).toBe(await playerOf(t, guest));
    expect(account!.defenderId).toBe(await playerOf(t, token));
    // It struck first: the marching column took the heavier toll of the two.
    expect((await t.run(async (ctx) => ctx.db.get(troop)))!.currentStrength).toBe(28);
    expect((await t.run(async (ctx) => ctx.db.get(waiting)))!.currentStrength).toBe(34);
  });

  /**
   * **A garrison keeps its net for everything it is not the target of** (ADR 0019 §3). The
   * exclusion is derived from `defenceOf` — the very function the arrival will call — so a raid
   * on A silences A's garrison and nothing else. A blind radius around the aim used to cost the
   * neighbouring point its whole two hundred kilometres, which is a garrison watching an enemy
   * column pass under its walls.
   */
  it('leaves the neighbouring garrison its net, and still resolves the raid once', async () => {
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
    expect(onTheRoad).toHaveLength(1);
    /** One pass at A, and the raid did what a raid comes for. */
    expect(atTheEnd).toHaveLength(1);
    expect(atTheEnd[0]!.outpostId).toBe(raided);
    expect((await t.run(async (ctx) => ctx.db.get(raided)))!.disabledUntil).not.toBeNull();

    /** B fought on the road, A only at its own point. */
    expect(onTheRoad[0]!.troops.some((one) => one.troopId === watching)).toBe(true);
    expect(onTheRoad[0]!.troops.some((one) => one.troopId === held)).toBe(false);
  });

  it('lets what survives the ambush walk on to the end of its road', async () => {
    const t = boot();
    const { token, guest } = await launchedSeason(t);
    const barracks = await raise(t, token, 'barracks', MARNE);
    const troop = await form(t, token, 'infantry', barracks);
    const road = routeBetween(regionFacts(MARNE)!.point, regionFacts(PRAHOVA)!.point, 'land')!;
    const outpostId = await plant(
      t,
      guest,
      road.points[Math.floor(road.points.length / 2)]!,
      'ROU',
    );
    await garrison(t, guest, outpostId);

    await t.mutation(api.movements.attack, {
      token,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [troop],
      target: { kind: 'region', regionId: PRAHOVA },
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    /** Wounded, not stopped: the interception is a pass on the way, never a cancellation of the
     *  order. The column walked to the end and came back from it. */
    const survivor = await t.run(async (ctx) => ctx.db.get(troop));
    expect(survivor!.currentStrength).toBeGreaterThan(0);
    expect(survivor!.currentStrength).toBeLessThan(nominalStrength('infantry', 1));
    expect(survivor!.stationedAt).toBe(barracks);
    expect(await movementsOf(t, token)).toHaveLength(0);
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
 * winners. Two roads used to be missing — a column that broke contact after leaving an outpost,
 * and any winner that had left a plain point — and both ended the same way, with the troops
 * standing at their point of departure the instant the pass was resolved.
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

  it('walks the garrison that left an outpost back to its anchor, never straight into it', async () => {
    const t = boot();
    const { token, guest } = await launchedSeason(t);
    const held = await plant(t, guest, regionFacts(PRAHOVA)!.point, 'ROU');
    const worn = await garrison(t, guest, held);
    // Thirty soldiers walking at fifty: the ambush takes it under the quarter it breaks at.
    await t.run(async (ctx) => ctx.db.patch(worn, { currentStrength: 30 }));

    // Halfway down the road it is about to take, so it walks straight into the radius.
    const road = routeBetween(regionFacts(PRAHOVA)!.point, regionFacts(RUHR)!.point, 'land')!;
    const ambush = road.points[Math.floor(road.points.length / 2)]!;
    await garrison(t, token, await plant(t, token, ambush, 'DEU'));

    const sent = await t.mutation(api.movements.attack, {
      token: guest,
      origin: { kind: 'outpost', outpostId: held },
      troopIds: [worn],
      target: { kind: 'region', regionId: RUHR },
    });
    vi.advanceTimersByTime(sent.minutes * 60_000);
    await t.finishInProgressScheduledFunctions();

    const [account] = await engagementsIn(t);
    expect(account!.cause).toBe('interception');
    expect(account!.troops.find((one) => one.troopId === worn)!.state).toBe('routed');

    /** The road home is a real one: it used to have none — an outpost address answered to
     *  neither of the two functions — so the garrison reappeared on its point at once. */
    const [back] = await movementsOf(t, guest);
    expect(back).toBeDefined();
    expect(back!.type).toBe('return');
    expect(back!.target).toEqual({ kind: 'outpost', outpostId: held });
    expect(back!.troopIds).toEqual([worn]);
    expect(back!.arrivesAt).toBeGreaterThan(Date.now());
    /** It leaves from where it broke, not from the point it had already left. */
    expect(back!.from).not.toEqual(asPoint(regionFacts(PRAHOVA)!.point));

    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await t.run(async (ctx) => ctx.db.get(worn)))!.stationedAt).toBe(held);
  });

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
 * what passes within `SCOUT_RADIUS_KM` to its owner, and it pierces nothing — a thread, a
 * bearing, an estimated schedule, a medium, never the type nor the composition.
 *
 * The rows are written at the departure of the movement and never recomputed, which is both the
 * answer to the fan-out (`WWS/docs/technique/brouillard-et-fanout.md`) and a design decision: one
 * posts a sentry for what will pass, not for what is passing.
 */
describe('a posted troop sees what passes within its radius', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  const asPoint = (point: LonLat) => ({ lon: point[0], lat: point[1] });

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
    // Forty kilometres off the road: inside the sentry's radius, well outside the twenty-five
    // that would make it a crossing instead of a sighting.
    const camp = eastOf(halfway, 40);
    expect(nearestOn(road().points, camp)).toBeLessThan(SCOUT_RADIUS_KM);
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

    /** And no engagement came of it: forty kilometres is a sighting, not a meeting. */
    expect(await engagementsIn(t)).toHaveLength(0);
  });

  it('sees nothing of the same column from beyond the radius', async () => {
    const t = boot();
    const { token, guest } = await launchedSeason(t);
    const halfway = road().points[Math.floor(road().points.length / 2)]!;
    const camp = eastOf(halfway, 150);
    expect(nearestOn(road().points, camp)).toBeGreaterThan(SCOUT_RADIUS_KM);
    await post(t, guest, camp);

    const sent = await marchAcross(t, token);
    vi.advanceTimersByTime(sent.minutes * 60_000 * 0.5);

    expect((await t.query(api.view.playerView, { token: guest })).detected).toEqual([]);
  });

  /**
   * **The rule the screen has to say out loud.** The survey is computed at the departure of the
   * movement, once, against what already stands — the same instant as the interception
   * (ADR 0018 §3). One posts a sentry in anticipation of what will pass; a sentry posted after
   * the fact catches nothing, and that is the design rather than a hole in it.
   */
  it('never sees a movement that left before it was posted', async () => {
    const t = boot();
    const { token, guest } = await launchedSeason(t);
    const sent = await marchAcross(t, token);

    const halfway = road().points[Math.floor(road().points.length / 2)]!;
    await post(t, guest, eastOf(halfway, 40));
    vi.advanceTimersByTime(sent.minutes * 60_000 * 0.5);

    expect((await t.query(api.view.playerView, { token: guest })).detected).toEqual([]);
  });

  /** **A troop in flight watches nothing**: it stands nowhere, which is the same reading that
   *  keeps a column from defending the ground it left. */
  it('watches nothing while it is itself marching', async () => {
    const t = boot();
    const { token, guest } = await launchedSeason(t);
    const halfway = road().points[Math.floor(road().points.length / 2)]!;
    const camp = eastOf(halfway, 40);
    const walker = await post(t, guest, camp);

    await t.mutation(api.movements.marchTo, {
      token: guest,
      origin: { kind: 'point', point: asPoint(camp) },
      troopIds: [walker],
      point: asPoint(regionFacts(RIYADH)!.point),
    });

    const sent = await marchAcross(t, token);
    vi.advanceTimersByTime(sent.minutes * 60_000 * 0.5);

    expect((await t.query(api.view.playerView, { token: guest })).detected).toEqual([]);
  });
});
