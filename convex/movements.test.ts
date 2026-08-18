import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { distanceKm, type LonLat } from '../src/domain/geo';
import {
  nominalStrength,
  OUTPOST_DISABLED_HOURS,
  OUTPOST_REACH_KM,
  REST_WINDOW_MINUTES,
  unlockLevel,
} from './constants';
import { ConvexError } from 'convex/values';
import type { BuildingKey, UnitRole } from '../src/domain/ids';
import {
  legalMovementTypes,
  refusalOf,
  type Column,
  type MovementAim,
} from '../src/domain/movement-orders';
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

/** Away from anyone's rest window, so the march is the only thing being measured. */
const MIDDAY = new Date(2026, 7, 17, 12, 0, 0);

describe('a land movement founds an outpost', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  it('leaves a barracks, walks the grid, and plants the point on arrival', async () => {
    const t = boot();
    const { token } = await launchedSeason(t);
    const barracks = await raise(t, token, 'barracks', MARNE);
    const troop = await form(t, token, 'infantry', barracks);

    const sent = await t.mutation(api.movements.foundOutpost, {
      token,
      origin: { kind: 'building', buildingId: barracks },
      regionId: PRAHOVA,
      specialization: 'relay',
      troopIds: [troop],
    });

    // Marne to Prahova is some 1 800 km of road: the trip is counted, never instant.
    expect(sent.minutes).toBeGreaterThan(20);
    expect(await outpostsOf(t, token)).toHaveLength(0);

    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const [outpost] = await outpostsOf(t, token);
    expect(outpost).toBeDefined();
    expect(outpost!.hostCountry).toBe('ROU');
    expect(outpost!.specialization).toBe('relay');
    expect(outpost!.level).toBe(1);
    expect(
      distanceKm([outpost!.point.lon, outpost!.point.lat], regionFacts(PRAHOVA)!.point),
    ).toBeLessThan(1);
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
    const barracks = await raise(t, token, 'barracks', MARNE);

    for (const regionId of [PRAHOVA, RIYADH]) {
      await t.mutation(api.movements.foundOutpost, {
        token,
        origin: { kind: 'building', buildingId: barracks },
        regionId,
        specialization: 'relay',
        troopIds: [await form(t, token, 'infantry', barracks)],
      });
      // One movement slot: the second column leaves only once the first has planted its point.
      await t.finishAllScheduledFunctions(vi.runAllTimers);
    }

    const hosts = (await outpostsOf(t, token)).map((outpost) => outpost.hostCountry);
    expect([...hosts].sort()).toEqual(['ROU', 'SAU']);
  });

  it('hangs the column on the outpost it founded, and nowhere else', async () => {
    const t = boot();
    const { token } = await launchedSeason(t);
    const barracks = await raise(t, token, 'barracks', MARNE);
    const troop = await form(t, token, 'infantry', barracks);

    await t.mutation(api.movements.foundOutpost, {
      token,
      origin: { kind: 'building', buildingId: barracks },
      regionId: PRAHOVA,
      specialization: 'listening',
      troopIds: [troop],
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const [outpost] = await outpostsOf(t, token);
    const carried = await t.run(async (ctx) => ctx.db.get(troop));
    expect(carried!.stationedAt).toBe(outpost!._id);

    // The board reads it as a garrison in Romania, not as a column standing at home.
    const view = await t.query(api.view.playerView, { token });
    expect(view.me.outposts[0]!.garrison).toBe(1);
    expect(view.me.armyPresent.infantry ?? 0).toBe(0);

    // It still stands, so it still costs a place under the ceiling.
    expect(view.me.troops).toHaveLength(1);
    expect((await t.query(api.troops.workshop, { token })).troopsInService).toBe(1);

    // And it is no longer in a barracks: nothing can send it out again from one.
    await expect(
      t.mutation(api.movements.foundOutpost, {
        token,
        origin: { kind: 'building', buildingId: barracks },
        regionId: RUHR,
        specialization: 'relay',
        troopIds: [troop],
      }),
    ).rejects.toThrow('TROOP_NOT_AT_ORIGIN');
  });

  it('carries infantry, from any address of mine, one column at a time', async () => {
    const t = boot();
    const { token } = await launchedSeason(t);
    const barracks = await raise(t, token, 'barracks', MARNE);
    const infantry = await form(t, token, 'infantry', barracks);
    const armor = await form(t, token, 'armor', barracks);
    const elsewhere = await form(t, token, 'infantry', null);
    const send = (over: Record<string, unknown>) =>
      t.mutation(api.movements.foundOutpost, {
        token,
        origin: { kind: 'building', buildingId: barracks },
        regionId: PRAHOVA,
        specialization: 'relay',
        troopIds: [infantry],
        ...over,
      });

    // A land column leaves from any address of mine, port included: ADR 0013 gates the sea and
    // the air at departure, never the march (ADR 0019 §2).
    await expect(send({ troopIds: [] })).rejects.toThrow('EMPTY_MOVEMENT');
    await expect(send({ troopIds: [armor] })).rejects.toThrow('INFANTRY_ONLY');
    await expect(send({ troopIds: [elsewhere] })).rejects.toThrow('TROOP_NOT_AT_ORIGIN');

    await send({});
    await expect(send({})).rejects.toThrow('MOVEMENT_IN_FLIGHT');
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

    const sent = await t.mutation(api.movements.foundOutpost, {
      token,
      origin: { kind: 'building', buildingId: barracks },
      regionId: PSKOV,
      specialization: 'relay',
      troopIds: [troop],
    });

    vi.advanceTimersByTime(sent.minutes * 60_000);
    await t.finishInProgressScheduledFunctions();

    const [held] = await movementsOf(t, token);
    expect(held).toBeDefined();
    expect(await outpostsOf(t, token)).toHaveLength(0);
    // The guest sleeps from 23h00: the column stands at the border until the window closes.
    const exit = new Date(held!.arrivesAt);
    expect(exit.getHours() * 60 + exit.getMinutes()).toBe(23 * 60 + REST_WINDOW_MINUTES - 1440);

    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await outpostsOf(t, token)).toHaveLength(1);
  });

  it('lets a column reach neutral ground while its neighbour sleeps', async () => {
    vi.setSystemTime(new Date(2026, 7, 17, 23, 0, 0));
    const t = boot();
    const { token } = await launchedSeason(t);
    const barracks = await raise(t, token, 'barracks', MARNE);
    const troop = await form(t, token, 'infantry', barracks);

    await t.mutation(api.movements.foundOutpost, {
      token,
      origin: { kind: 'building', buildingId: barracks },
      regionId: PRAHOVA,
      specialization: 'relay',
      troopIds: [troop],
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(await outpostsOf(t, token)).toHaveLength(1);
  });
});

describe('an outpost opens a radius to build in', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  async function withOutpostAtPrahova(t: ReturnType<typeof boot>) {
    const { token } = await launchedSeason(t);
    const barracks = await raise(t, token, 'barracks', MARNE);
    const troop = await form(t, token, 'infantry', barracks);
    await t.mutation(api.movements.foundOutpost, {
      token,
      origin: { kind: 'building', buildingId: barracks },
      regionId: PRAHOVA,
      specialization: 'relay',
      troopIds: [troop],
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
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

  it('refuses a foundation on ground of mine', async () => {
    const t = boot();
    const { token } = await launchedSeason(t);
    const barracks = await raise(t, token, 'barracks', MARNE);
    const troop = await form(t, token, 'infantry', barracks);

    await expect(
      t.mutation(api.movements.foundOutpost, {
        token,
        origin: { kind: 'building', buildingId: barracks },
        regionId: MARNE,
        specialization: 'relay',
        troopIds: [troop],
      }),
    ).rejects.toThrow('FRIENDLY_TARGET');
  });

  it('refuses a foundation carried by anything but infantry', async () => {
    const t = boot();
    const { token } = await launchedSeason(t);
    const barracks = await raise(t, token, 'barracks', MARNE);
    const tank = await form(t, token, 'armor', barracks);

    await expect(
      t.mutation(api.movements.foundOutpost, {
        token,
        origin: { kind: 'building', buildingId: barracks },
        regionId: PRAHOVA,
        specialization: 'relay',
        troopIds: [tank],
      }),
    ).rejects.toThrow('INFANTRY_ONLY');
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
      type: 'outpost',
    });
    expect(preview).not.toBeNull();
    expect(preview!.route.points.length).toBeGreaterThan(1);
    expect(preview!.destinationName).toBe(regionFacts(PRAHOVA)!.name);
    expect(preview!.holdUntil).toBeNull();

    const sent = await t.mutation(api.movements.foundOutpost, {
      token,
      origin: { kind: 'building', buildingId: barracks },
      regionId: PRAHOVA,
      specialization: 'relay',
      troopIds: [troop],
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

  it('founds a second point from the first — no barracks anywhere in the chain', async () => {
    const t = boot();
    const { token } = await launchedSeason(t);
    await raise(t, token, 'barracks', MARNE);
    const outpostId = await plant(t, token, regionFacts(PRAHOVA)!.point, 'ROU');
    const held = await garrison(t, token, outpostId);

    await t.mutation(api.movements.foundOutpost, {
      token,
      origin: { kind: 'outpost', outpostId },
      regionId: RUHR,
      specialization: 'relay',
      troopIds: [held],
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(await t.run(async (ctx) => (await ctx.db.query('outposts').collect()).length)).toBe(2);
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

  /** Nobody defends a coordinate yet: the column finds empty ground and turns around. */
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

    await t.mutation(api.movements.foundOutpost, {
      token,
      origin: { kind: 'building', buildingId: barracks },
      regionId: PRAHOVA,
      specialization: 'relay',
      troopIds: [troop],
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

  it('lets what survives the ambush walk on and plant its point', async () => {
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

    await t.mutation(api.movements.foundOutpost, {
      token,
      origin: { kind: 'building', buildingId: barracks },
      regionId: PRAHOVA,
      specialization: 'relay',
      troopIds: [troop],
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const planted = await outpostsOf(t, token);
    expect(planted).toHaveLength(1);
    expect((await t.run(async (ctx) => ctx.db.get(troop)))!.stationedAt).toBe(planted[0]!._id);
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
      t.mutation(api.movements.foundOutpost, {
        token,
        origin: { kind: 'building', buildingId: barracks },
        regionId: RUHR,
        specialization: 'relay',
        troopIds: [other],
      }),
    ).resolves.toBeDefined();

    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const home = await t.run(async (ctx) => ctx.db.get(worn));
    expect(home!.stationedAt).toBe(barracks);
    expect(home!.currentStrength).toBeLessThan(30);
  });
});
