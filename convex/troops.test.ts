import { pointOfRegion } from './regions';
import { convexTest } from 'convex-test';
import { describe, expect, it, vi } from 'vitest';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { TIERS_BY_ROLE } from '../src/domain/troops';
import type { ResearchCard, ResourceKey, UnitRole } from '../src/domain/ids';
import {
  COST_BY_ROLE,
  MONDIALE_TROOP_BOUND,
  NOMINAL_STRENGTH,
  STARTING_KIT,
  TIER_2_FACTOR,
  recruitmentCost,
} from './constants';
import schema from './schema';
import { modules } from './test.setup';
import { foundSeat, joinSeat, placeHq, seatIn } from './seats.fixture';
import type { Seat } from './seats.fixture';

const boot = () => convexTest({ schema, modules, transactionLimits: true });

const KIT = STARTING_KIT;

/** French regions, straight out of `region-index.json`. */
const MARNE = 'FRA-5323';
const MOSELLE = 'FRA-5328';
const PAS_DE_CALAIS = 'FRA-5334'; // coastal, for the port

async function launchedSeason(t: ReturnType<typeof boot>) {
  const { seat, code } = await foundSeat(t, 'Pierre', 0.5);
  const guest = await joinSeat(t, code, 'Léa');
  await t.mutation(api.players.reserveNation, { ...seat, nation: 'france' });
  await t.mutation(api.players.declareReady, { ...seat, ready: true });
  await t.mutation(api.players.reserveNation, { ...guest, nation: 'ussr' });
  await t.mutation(api.players.declareReady, { ...guest, ready: true });
  await t.mutation(api.seasons.launch, seat);
  await placeHq(t, seat);
  await disbandTheGift(t, seat);
  return seat;
}

/**
 * **The company the launch hands out, taken back** (`seasons.endow`, 25/08). Every count in
 * this file is about an army a test formed on purpose, so the endowment is cleared at the door
 * rather than added to twenty expectations. What it *is* is graved in `off-season.test.ts`,
 * where the endowment itself is under test.
 */
async function disbandTheGift(t: ReturnType<typeof boot>, ...seats: ReadonlyArray<Seat>) {
  for (const seat of seats) {
    const playerId = await playerOf(t, seat);
    await t.run(async (ctx) => {
      const held = await ctx.db
        .query('troops')
        .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
        .collect();
      for (const troop of held) await ctx.db.delete(troop._id);
    });
  }
}

async function playerOf(t: ReturnType<typeof boot>, seat: Seat) {
  return t.run(async (ctx) => {
    const player = await seatIn(ctx, seat);
    return player._id;
  });
}

/** Puts a building up without paying for it: what is under test is what a standing one does. */
async function raise(
  t: ReturnType<typeof boot>,
  seat: Seat,
  key: 'barracks' | 'airfield' | 'port',
  regionId: string,
  level = 1,
): Promise<Id<'buildings'>> {
  const playerId = await playerOf(t, seat);
  return t.run(async (ctx) => {
    const seasonId = (await ctx.db.get(playerId))!.seasonId;
    return ctx.db.insert('buildings', {
      seasonId,
      playerId,
      key,
      regionId,
      point: pointOfRegion(regionId),
      level,
    });
  });
}

/** The headquarters is not raised, it is promoted: one already stands on the capital. */
async function setHqLevel(t: ReturnType<typeof boot>, seat: Seat, level: number) {
  const playerId = await playerOf(t, seat);
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

async function raze(t: ReturnType<typeof boot>, buildingId: Id<'buildings'>) {
  await t.run(async (ctx) => {
    await ctx.db.delete(buildingId);
  });
}

/** The starting kit does not pay for a season's worth of troops; this saves building a mine. */
/** Hands the player research cards, as if they had come to their end. */
async function researched(
  t: ReturnType<typeof boot>,
  seat: Seat,
  cards: ReadonlyArray<ResearchCard>,
) {
  const playerId = await playerOf(t, seat);
  await t.run(async (ctx) => {
    await ctx.db.patch(playerId, { researched: [...cards] });
  });
}

async function credit(t: ReturnType<typeof boot>, seat: Seat, stock: number) {
  const playerId = await playerOf(t, seat);
  await t.run(async (ctx) => {
    const rows = await ctx.db
      .query('resources')
      .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
      .collect();
    for (const row of rows) {
      if (row.key === 'steel') {
        await ctx.db.patch(row._id, { stock, updatedAt: Date.now() });
      }
    }
  });
}

/** Sets one stock to a figure, whatever it was. */
async function setStock(
  t: ReturnType<typeof boot>,
  seat: Seat,
  key: ResourceKey,
  stock: number,
): Promise<void> {
  const playerId = await playerOf(t, seat);
  await t.run(async (ctx) => {
    const rows = await ctx.db
      .query('resources')
      .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
      .collect();
    for (const row of rows) {
      if (row.key === key) await ctx.db.patch(row._id, { stock, updatedAt: Date.now() });
    }
  });
}

/** The ammunition stock, read the way the board reads it — the workshop no longer serves it. */
async function ammunitionOf(t: ReturnType<typeof boot>, seat: Seat): Promise<number> {
  const view = await t.query(api.view.playerView, seat);
  return view.me.resources.ammunition.stock;
}

describe('a queue per projection building', () => {
  it('only starts the head batch on a first-level site and leaves the followers waiting', async () => {
    const t = boot();
    const seat = await launchedSeason(t);
    await credit(t, seat, 4000);
    await researched(t, seat, ['infantryMk2', 'armor']);
    const barracks = await raise(t, seat, 'barracks', MARNE);

    await t.mutation(api.troops.recruit, {
      ...seat,
      buildingId: barracks,
      role: 'infantry',
      tier: 1,
    });
    await t.mutation(api.troops.recruit, { ...seat, buildingId: barracks, role: 'armor', tier: 1 });

    const workshop = await t.query(api.troops.workshop, seat);
    const queue = workshop.facilities.find((facility) => facility.id === barracks)!.queue;
    expect(queue.map((batch) => [batch.role, batch.started])).toEqual([
      ['infantry', true],
      ['armor', false],
    ]);
    expect(queue[1]!.minutesLeft).toBeGreaterThan(queue[0]!.minutesLeft);
  });

  /** **Un niveau accélère** (ADR 0031) : une troupe à la fois, 20 % plus vite au niveau 2. */
  it('forms one troop at a time, faster with each level of its site', async () => {
    const t = boot();
    const seat = await launchedSeason(t);
    await credit(t, seat, 4000);
    await setHqLevel(t, seat, 2);
    const barracks = await raise(t, seat, 'barracks', MARNE, 2);
    for (let batch = 0; batch < 2; batch += 1)
      await t.mutation(api.troops.recruit, {
        ...seat,
        buildingId: barracks,
        role: 'infantry',
        tier: 1,
      });

    const workshop = await t.query(api.troops.workshop, seat);
    const queue = workshop.facilities.find((facility) => facility.id === barracks)!.queue;
    expect(queue.map((batch) => batch.started)).toEqual([true, false]);
    const minutes = Math.round(recruitmentCost('infantry', 1).minutes * 0.8);
    expect(queue[0]!.minutesLeft).toBeCloseTo(minutes, 0);
    expect(queue[1]!.minutesLeft).toBeCloseTo(2 * minutes, 0);
  });

  /** Le gain vaut pour la suite : le lot en cours garde sa date, le suivant ne part pas plus tôt. */
  it('keeps the due time of the batch under way when its site is raised', async () => {
    const t = boot();
    const seat = await launchedSeason(t);
    await credit(t, seat, 4000);
    await setHqLevel(t, seat, 2);
    const barracks = await raise(t, seat, 'barracks', MARNE);
    for (let batch = 0; batch < 2; batch += 1)
      await t.mutation(api.troops.recruit, {
        ...seat,
        buildingId: barracks,
        role: 'infantry',
        tier: 1,
      });

    const playerId = await playerOf(t, seat);
    const constructionId = await t.run(async (ctx) => {
      const site = (await ctx.db.get(barracks))!;
      return ctx.db.insert('constructions', {
        playerId,
        building: 'barracks',
        regionId: site.regionId,
        point: site.point,
        level: 2,
        rank: 0,
        finishesAt: Date.now(),
      });
    });
    const before = await t.query(api.troops.workshop, seat);
    await t.mutation(internal.constructions.finish, { constructionId });

    const workshop = await t.query(api.troops.workshop, seat);
    const queue = workshop.facilities.find((facility) => facility.id === barracks)!.queue;
    expect(queue.map((batch) => batch.started)).toEqual([true, false]);
    const head = before.facilities.find((facility) => facility.id === barracks)!.queue[0]!;
    expect(before.loadedAt + head.minutesLeft * 60_000).toBeCloseTo(
      workshop.loadedAt + queue[0]!.minutesLeft * 60_000,
      -3,
    );
  });

  it('gives two barracks two independent queues', async () => {
    const t = boot();
    const seat = await launchedSeason(t);
    await credit(t, seat, 4000);
    const first = await raise(t, seat, 'barracks', MARNE);
    const second = await raise(t, seat, 'barracks', MOSELLE);

    await t.mutation(api.troops.recruit, { ...seat, buildingId: first, role: 'infantry', tier: 1 });
    await t.mutation(api.troops.recruit, {
      ...seat,
      buildingId: second,
      role: 'infantry',
      tier: 1,
    });

    const workshop = await t.query(api.troops.workshop, seat);
    const heads = workshop.facilities.map((facility) =>
      facility.queue.map((batch) => batch.started),
    );
    expect(heads).toEqual([[true], [true]]);
  });

  it('refuses a role the building does not form', async () => {
    const t = boot();
    const seat = await launchedSeason(t);
    await credit(t, seat, 4000);
    const port = await raise(t, seat, 'port', PAS_DE_CALAIS);
    const barracks = await raise(t, seat, 'barracks', MARNE);

    await expect(
      t.mutation(api.troops.recruit, { ...seat, buildingId: port, role: 'infantry', tier: 1 }),
    ).rejects.toThrow('WRONG_PROJECTION_BUILDING');
    await expect(
      t.mutation(api.troops.recruit, { ...seat, buildingId: barracks, role: 'escort', tier: 1 }),
    ).rejects.toThrow('WRONG_PROJECTION_BUILDING');
  });

  it('refunds a waiting batch in full and refuses to cancel the one that started', async () => {
    const t = boot();
    const seat = await launchedSeason(t);
    await credit(t, seat, 4000);
    await researched(t, seat, ['infantryMk2', 'armor']);
    const barracks = await raise(t, seat, 'barracks', MARNE);
    await t.mutation(api.troops.recruit, {
      ...seat,
      buildingId: barracks,
      role: 'infantry',
      tier: 1,
    });
    await t.mutation(api.troops.recruit, { ...seat, buildingId: barracks, role: 'armor', tier: 1 });

    const before = await t.query(api.troops.workshop, seat);
    const queue = before.facilities.find((facility) => facility.id === barracks)!.queue;
    const cost = recruitmentCost('armor', 1);

    await expect(
      t.mutation(api.troops.cancel, { ...seat, recruitmentId: queue[0]!.id }),
    ).rejects.toThrow('BATCH_ALREADY_STARTED');

    await t.mutation(api.troops.cancel, { ...seat, recruitmentId: queue[1]!.id });

    const after = await t.query(api.troops.workshop, seat);
    expect(after.troopsQueued).toBe(1);
    expect(after.steel.stock).toBe(before.steel.stock + cost.costs.steel!);
  });
});

describe('a finished batch is a troop', () => {
  it('stands at its nominal strength, attached to the barracks that formed it', async () => {
    vi.useFakeTimers();
    try {
      const t = boot();
      const seat = await launchedSeason(t);
      await credit(t, seat, 4000);
      const barracks = await raise(t, seat, 'barracks', MARNE);
      await t.mutation(api.troops.recruit, {
        ...seat,
        buildingId: barracks,
        role: 'infantry',
        tier: 1,
      });

      await t.finishAllScheduledFunctions(vi.runAllTimers);

      const view = await t.query(api.view.playerView, seat);
      expect(view.me.troops).toHaveLength(1);
      expect(view.me.troops[0]).toMatchObject({
        role: 'infantry',
        tier: 1,
        strength: NOMINAL_STRENGTH.infantry[1],
        nominalStrength: NOMINAL_STRENGTH.infantry[1],
        stationedAt: { kind: 'building', buildingId: barracks },
      });
      expect(view.me.armyPresent).toEqual({ infantry: 1 });
    } finally {
      vi.useRealTimers();
    }
  });

  it('comes home rather than dying when its building is gone', async () => {
    vi.useFakeTimers();
    try {
      const t = boot();
      const seat = await launchedSeason(t);
      await credit(t, seat, 4000);
      const barracks = await raise(t, seat, 'barracks', MARNE);
      await t.mutation(api.troops.recruit, {
        ...seat,
        buildingId: barracks,
        role: 'infantry',
        tier: 1,
      });
      await t.finishAllScheduledFunctions(vi.runAllTimers);

      await raze(t, barracks);

      const view = await t.query(api.view.playerView, seat);
      expect(view.me.troops).toHaveLength(1);
      /** No address the game can place — `home`, and the schema says in writing what that
       *  means: on national ground, hanging from nothing that stands (ADR 0019 §1). */
      expect(view.me.troops[0]!.stationedAt).toEqual({ kind: 'home' });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('the invisible troop bound', () => {
  it('serves no ceiling to the screen', async () => {
    const t = boot();
    const seat = await launchedSeason(t);
    expect(await t.query(api.troops.workshop, seat)).not.toHaveProperty('troopCap');
    expect((await t.query(api.view.playerView, seat)).me).not.toHaveProperty('troopCap');
  });

  it('counts the queue against the bound and refuses the batch past it, in clear', async () => {
    const t = boot();
    const seat = await launchedSeason(t);
    await credit(t, seat, 40_000);
    const barracks = await raise(t, seat, 'barracks', MARNE);
    const playerId = await playerOf(t, seat);
    await t.run(async (ctx) => {
      const seasonId = (await ctx.db.get(playerId))!.seasonId;
      for (let index = 0; index < MONDIALE_TROOP_BOUND - 1; index += 1) {
        await ctx.db.insert('troops', {
          seasonId,
          playerId,
          role: 'infantry',
          tier: 1,
          nominalStrength: 1,
          currentStrength: 1,
          stationedAt: { lon: 2.3, lat: 48.9 },
        });
      }
    });

    // One short of the bound: the last place is taken by a queued batch, which counts.
    await t.mutation(api.troops.recruit, {
      ...seat,
      buildingId: barracks,
      role: 'infantry',
      tier: 1,
    });
    await expect(
      t.mutation(api.troops.recruit, { ...seat, buildingId: barracks, role: 'infantry', tier: 1 }),
    ).rejects.toThrow('TROOP_BOUND_REACHED');
  });
});

describe('tiers', () => {
  it('rejects a tier the role does not have, and mark 2 before its card, naming the card', async () => {
    const t = boot();
    const seat = await launchedSeason(t);
    await credit(t, seat, 4000);
    const barracks = await raise(t, seat, 'barracks', MARNE);
    const port = await raise(t, seat, 'port', PAS_DE_CALAIS);

    const refused: Record<string, unknown> = await t
      .mutation(api.troops.recruit, { ...seat, buildingId: barracks, role: 'infantry', tier: 2 })
      .then(() => ({}))
      .catch((error: { data: Record<string, unknown> }) => error.data);
    expect(refused).toMatchObject({ code: 'RESEARCH_REQUIRED', card: 'infantryMk2' });
    await expect(
      t.mutation(api.troops.recruit, { ...seat, buildingId: port, role: 'carrier', tier: 2 }),
    ).rejects.toThrow('SINGLE_TIER_ROLE');

    await researched(t, seat, ['infantryMk2']);
    const { rank } = await t.mutation(api.troops.recruit, {
      ...seat,
      buildingId: barracks,
      role: 'infantry',
      tier: 2,
    });
    expect(rank).toBe(0);
  });

  /** **La recherche débloque, un niveau rend** (ADR 0028 §5) : ni le QG ni le site n'ouvrent le blindé. */
  it('holds the tank behind its card whatever the levels, and lets the infantry through at once', async () => {
    const t = boot();
    const seat = await launchedSeason(t);
    await credit(t, seat, 4000);
    await setHqLevel(t, seat, 5);
    const barracks = await raise(t, seat, 'barracks', MARNE, 5);

    await t.mutation(api.troops.recruit, {
      ...seat,
      buildingId: barracks,
      role: 'infantry',
      tier: 1,
    });
    await expect(
      t.mutation(api.troops.recruit, { ...seat, buildingId: barracks, role: 'armor', tier: 1 }),
    ).rejects.toThrow('RESEARCH_REQUIRED');

    await researched(t, seat, ['infantryMk2', 'armor']);
    await t.mutation(api.troops.recruit, { ...seat, buildingId: barracks, role: 'armor', tier: 1 });
  });

  it('serves each piece its card', async () => {
    const t = boot();
    const seat = await launchedSeason(t);
    const shop = await t.query(api.troops.workshop, seat);
    const lockOf = (role: UnitRole) => shop.grid.find((entry) => entry.role === role)!;
    expect(lockOf('infantry').unit.lockedBy).toBeNull();
    expect(lockOf('infantry').unitTier2?.lockedBy).toBe('infantryMk2');
    expect(lockOf('armor').unit.lockedBy).toBe('armor');
    expect(lockOf('cargo').unit.lockedBy).toBeNull();
    expect(lockOf('fighter').unit.lockedBy).toBe('aviation');
  });

  it('gives every role a nominal strength for exactly the tiers it knows', () => {
    for (const [role, tiers] of Object.entries(NOMINAL_STRENGTH) as ReadonlyArray<
      [UnitRole, Record<string, number | undefined>]
    >) {
      expect(Object.keys(tiers).map(Number).sort()).toEqual(
        TIERS_BY_ROLE[role] === 2 ? [1, 2] : [1],
      );
    }
  });
});

/**
 * **A troop is bought in steel and in nothing else** (question 18, settled 25/08). Ammunition
 * used to be billed here *as well* as at the pass, which priced the same rounds twice; the
 * recruitment now says the whole of its price, and the whole of its price is what it takes.
 */
describe('a price mixes the family (ADR 0028 §2)', () => {
  it('costs steel plus the resource of the family, for every role', () => {
    const family = { infantry: 'food', armor: 'oil', cargo: 'coal', fighter: 'oil' } as const;
    for (const [role, resource] of Object.entries(family) as ReadonlyArray<
      [UnitRole, 'food' | 'oil' | 'coal']
    >) {
      const { costs } = recruitmentCost(role, 1);
      expect(Object.keys(costs).sort(), role).toEqual([resource, 'steel'].sort());
    }
    for (const role of Object.keys(COST_BY_ROLE) as ReadonlyArray<UnitRole>) {
      expect(Object.keys(recruitmentCost(role, 1).costs), role).toHaveLength(2);
    }
  });

  it('scales both figures with the mark', () => {
    const one = recruitmentCost('infantry', 1).costs;
    const two = recruitmentCost('infantry', 2).costs;
    expect(two.steel).toBe(Math.round(one.steel! * TIER_2_FACTOR));
    expect(two.food).toBe(Math.round(one.food! * TIER_2_FACTOR));
  });

  it('takes the food with the steel, and hands both back when a waiting batch is withdrawn', async () => {
    const t = boot();
    const seat = await launchedSeason(t);
    const barracks = await raise(t, seat, 'barracks', MARNE);
    const food = (await t.query(api.view.playerView, seat)).me.resources.food.stock;
    const price = recruitmentCost('infantry', 1).costs;

    // Two batches: the second one waits, so it can be withdrawn.
    for (let rank = 0; rank < 2; rank += 1) {
      await t.mutation(api.troops.recruit, {
        ...seat,
        buildingId: barracks,
        role: 'infantry',
        tier: 1,
      });
    }
    const spent = (await t.query(api.view.playerView, seat)).me.resources.food.stock;
    expect(spent).toBeCloseTo(food - 2 * price.food!, 0);

    const queue = (await t.query(api.troops.workshop, seat)).facilities.find(
      (facility) => facility.id === barracks,
    )!.queue;
    await t.mutation(api.troops.cancel, { ...seat, recruitmentId: queue[1]!.id });
    const back = (await t.query(api.view.playerView, seat)).me.resources.food.stock;
    expect(back).toBeCloseTo(food - price.food!, 0);
  });

  it('refuses a troop whose family resource is short, and names it', async () => {
    const t = boot();
    const seat = await launchedSeason(t);
    const barracks = await raise(t, seat, 'barracks', MARNE);
    await setStock(t, seat, 'food', 0);

    await expect(
      t.mutation(api.troops.recruit, { ...seat, buildingId: barracks, role: 'infantry', tier: 1 }),
    ).rejects.toThrow('INSUFFICIENT_RESOURCE');
    expect((await t.query(api.troops.workshop, seat)).troopsQueued).toBe(0);
  });
});

describe('what a recruitment costs', () => {
  it('debits the steel of the announced price and not one round', async () => {
    const t = boot();
    const seat = await launchedSeason(t);
    const barracks = await raise(t, seat, 'barracks', MARNE);
    const before = await t.query(api.troops.workshop, seat);
    const shown = before.grid.find((entry) => entry.role === 'infantry')!.unit;

    const { cost } = await t.mutation(api.troops.recruit, {
      ...seat,
      buildingId: barracks,
      role: 'infantry',
      tier: 1,
    });

    // The price on the card, the price the mutation answers, the steel that actually left.
    expect(cost.costs).toEqual(shown.costs);
    const after = await t.query(api.troops.workshop, seat);
    expect(after.steel.stock).toBe(before.steel.stock - shown.costs.steel!);
    expect(await ammunitionOf(t, seat)).toBe(KIT.ammunition);
  });

  it('hands the same steel back and takes no round back when a waiting batch is withdrawn', async () => {
    const t = boot();
    const seat = await launchedSeason(t);
    const barracks = await raise(t, seat, 'barracks', MARNE);
    const before = await t.query(api.troops.workshop, seat);

    await t.mutation(api.troops.recruit, {
      ...seat,
      buildingId: barracks,
      role: 'infantry',
      tier: 1,
    });
    await t.mutation(api.troops.recruit, {
      ...seat,
      buildingId: barracks,
      role: 'infantry',
      tier: 1,
    });
    const queue = (await t.query(api.troops.workshop, seat)).facilities.find(
      (facility) => facility.id === barracks,
    )!.queue;
    await t.mutation(api.troops.cancel, { ...seat, recruitmentId: queue[1]!.id });

    const after = await t.query(api.troops.workshop, seat);
    const one = before.grid.find((entry) => entry.role === 'infantry')!.unit.costs.steel!;
    expect(after.steel.stock).toBe(before.steel.stock - one);
    expect(await ammunitionOf(t, seat)).toBe(KIT.ammunition);
  });
});

/**
 * The reverse of what this file used to record. Steel came from extraction outposts that do
 * not exist, so a fresh nation could produce nothing at all; the starting kit now carries an
 * advance of steel and of ammunition, and the first light troop is affordable on the first
 * minute — once a barracks stands, which is the new gate.
 */
describe('a fresh nation', () => {
  it('forms its first troop out of the starting kit', async () => {
    const t = boot();
    const seat = await launchedSeason(t);
    const barracks = await raise(t, seat, 'barracks', MARNE);
    const workshop = await t.query(api.troops.workshop, seat);

    expect(workshop.steel.stock).toBe(KIT.steel);
    expect(workshop.grid.every((entry) => (entry.unit.costs.steel ?? 0) > 0)).toBe(true);
    await t.mutation(api.troops.recruit, {
      ...seat,
      buildingId: barracks,
      role: 'infantry',
      tier: 1,
    });

    const after = await t.query(api.troops.workshop, seat);
    expect(after.troopsQueued).toBe(1);
  });

  it('has no line at all before a projection building stands', async () => {
    const t = boot();
    const seat = await launchedSeason(t);
    const workshop = await t.query(api.troops.workshop, seat);
    expect(workshop.facilities).toHaveLength(0);
  });
});
