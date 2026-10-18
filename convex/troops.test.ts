import { convexTest } from 'convex-test';
import { describe, expect, it, vi } from 'vitest';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { TIERS_BY_ROLE } from '../src/domain/troops';
import type { UnitRole } from '../src/domain/ids';
import {
  HQ_LEVEL_AT_LAUNCH,
  MAX_HQ_LEVEL,
  MONDIALE_TROOP_BOUND,
  NOMINAL_STRENGTH,
  STARTING_KIT,
  ROLE_SITE_LEVEL,
  TIER_2_HQ_LEVEL,
  recruitmentCost,
  roleHqLevel,
  roleSiteLevel,
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
    return ctx.db.insert('buildings', { seasonId, playerId, key, regionId, level });
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

/** The ammunition stock, read the way the board reads it — the workshop no longer serves it. */
async function ammunitionOf(t: ReturnType<typeof boot>, seat: Seat): Promise<number> {
  const view = await t.query(api.view.playerView, seat);
  return view.me.resources.ammunition.stock;
}

describe('a queue per projection building', () => {
  it('only starts the head batch and leaves the followers waiting', async () => {
    const t = boot();
    const seat = await launchedSeason(t);
    await credit(t, seat, 4000);
    // The tank opens at the level that arms its counter, one above what the season plants —
    // and, since 67b, on a barracks raised to its own level.
    await setHqLevel(t, seat, ROLE_SITE_LEVEL.armor);
    const barracks = await raise(t, seat, 'barracks', MARNE, ROLE_SITE_LEVEL.armor);

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
    await setHqLevel(t, seat, ROLE_SITE_LEVEL.armor);
    const barracks = await raise(t, seat, 'barracks', MARNE, ROLE_SITE_LEVEL.armor);
    await t.mutation(api.troops.recruit, {
      ...seat,
      buildingId: barracks,
      role: 'infantry',
      tier: 1,
    });
    await t.mutation(api.troops.recruit, { ...seat, buildingId: barracks, role: 'armor', tier: 1 });

    const before = await t.query(api.troops.workshop, seat);
    const queue = before.facilities.find((facility) => facility.id === barracks)!.queue;
    const cost = recruitmentCost('armor', 1, before.hqLevel);

    await expect(
      t.mutation(api.troops.cancel, { ...seat, recruitmentId: queue[0]!.id }),
    ).rejects.toThrow('BATCH_ALREADY_STARTED');

    await t.mutation(api.troops.cancel, { ...seat, recruitmentId: queue[1]!.id });

    const after = await t.query(api.troops.workshop, seat);
    expect(after.troopsQueued).toBe(1);
    expect(after.steel.stock).toBe(before.steel.stock + cost.steel);
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
  /**
   * **The threshold is counted above the launch, never in the absolute** (ADR 0017): written as
   * an absolute it would open mark 2 wherever the headquarters happens to be planted, and a
   * step that does not exist is not a step.
   */
  it('counts the tier-2 gate above the headquarters the season plants', () => {
    expect(TIER_2_HQ_LEVEL).toBe(2);
    expect(TIER_2_HQ_LEVEL).toBeGreaterThan(HQ_LEVEL_AT_LAUNCH);
    expect(TIER_2_HQ_LEVEL).toBeLessThanOrEqual(MAX_HQ_LEVEL);
  });

  it('serves the threshold to the workshop, rather than leaving it to a constant', async () => {
    const t = boot();
    const seat = await launchedSeason(t);

    const shop = await t.query(api.troops.workshop, seat);
    expect(shop.requiredHqLevel).toBe(TIER_2_HQ_LEVEL);
    // The headquarters the season plants is one short of it: locked at the first minute.
    expect(shop.hqLevel).toBe(HQ_LEVEL_AT_LAUNCH);
    expect(shop.tier2Unlocked).toBe(false);
  });

  it('rejects a tier the role does not have and tier 2 without the headquarters level', async () => {
    const t = boot();
    const seat = await launchedSeason(t);
    await credit(t, seat, 4000);
    await setHqLevel(t, seat, TIER_2_HQ_LEVEL - 1);
    const barracks = await raise(t, seat, 'barracks', MARNE);
    const port = await raise(t, seat, 'port', PAS_DE_CALAIS);

    await expect(
      t.mutation(api.troops.recruit, { ...seat, buildingId: barracks, role: 'infantry', tier: 2 }),
    ).rejects.toThrow('TIER_2_LOCKED');
    await expect(
      t.mutation(api.troops.recruit, { ...seat, buildingId: port, role: 'carrier', tier: 2 }),
    ).rejects.toThrow('SINGLE_TIER_ROLE');
  });

  /**
   * **The weapon and its counter arrive together.** The tank leaves the launch headquarters for
   * the level that opens mark-2 infantry, its answer in the damage table: a season no longer
   * spends its first thirty hours with armor nobody can reply to.
   */
  it('holds the tank at the level that opens its counter, and lets the infantry through', async () => {
    const t = boot();
    const seat = await launchedSeason(t);
    await credit(t, seat, 4000);
    const barracks = await raise(t, seat, 'barracks', MARNE, ROLE_SITE_LEVEL.armor);

    // Mark-1 infantry is the age of the barracks: recruitable the minute one stands.
    await t.mutation(api.troops.recruit, {
      ...seat,
      buildingId: barracks,
      role: 'infantry',
      tier: 1,
    });

    const refused: Record<string, unknown> = await t
      .mutation(api.troops.recruit, { ...seat, buildingId: barracks, role: 'armor', tier: 1 })
      .then(() => ({}))
      .catch((error: { data: Record<string, unknown> }) => error.data);
    expect(refused).toMatchObject({
      code: 'ROLE_LOCKED',
      role: 'armor',
      requiredLevel: TIER_2_HQ_LEVEL,
    });

    await setHqLevel(t, seat, TIER_2_HQ_LEVEL);
    const { rank } = await t.mutation(api.troops.recruit, {
      ...seat,
      buildingId: barracks,
      role: 'armor',
      tier: 1,
    });
    expect(rank).toBe(1);
  });

  /**
   * **Le second verrou est local, et il ne remplace pas le premier** (67b) : le transport
   * terrestre attend une caserne, le blindé attend la caserne *et* le quartier général. Un
   * seul test les tient ensemble — c'est le seul endroit où l'on voit qu'ils ne se confondent
   * pas.
   */
  it('holds a role until the site that forms it is raised to its level', async () => {
    const t = boot();
    const seat = await launchedSeason(t);
    await credit(t, seat, 4000);
    await setHqLevel(t, seat, MAX_HQ_LEVEL);
    const barracks = await raise(t, seat, 'barracks', MARNE);

    const refused: Record<string, unknown> = await t
      .mutation(api.troops.recruit, {
        ...seat,
        buildingId: barracks,
        role: 'landTransport',
        tier: 1,
      })
      .then(() => ({}))
      .catch((error: { data: Record<string, unknown> }) => error.data);
    expect(refused).toMatchObject({
      code: 'SITE_LEVEL_LOCKED',
      building: 'barracks',
      requiredLevel: roleSiteLevel('landTransport'),
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(barracks, { level: roleSiteLevel('landTransport') });
    });
    const { rank } = await t.mutation(api.troops.recruit, {
      ...seat,
      buildingId: barracks,
      role: 'landTransport',
      tier: 1,
    });
    expect(rank).toBe(0);

    // The headquarters is at its maximum and the barracks is not: the tank still waits.
    await expect(
      t.mutation(api.troops.recruit, { ...seat, buildingId: barracks, role: 'armor', tier: 1 }),
    ).rejects.toThrow('SITE_LEVEL_LOCKED');
  });

  it('serves the tank’s threshold to the workshop, and nothing for the roles their building carries', async () => {
    const t = boot();
    const seat = await launchedSeason(t);
    const shop = await t.query(api.troops.workshop, seat);
    for (const entry of shop.grid) {
      expect(entry.unlockedAtHqLevel).toBe(roleHqLevel(entry.role));
      expect(entry.unlockedAtSiteLevel).toBe(roleSiteLevel(entry.role));
    }
    expect(shop.grid.find((entry) => entry.role === 'armor')?.unlockedAtHqLevel).toBe(
      TIER_2_HQ_LEVEL,
    );
    expect(shop.grid.find((entry) => entry.role === 'infantry')?.unlockedAtHqLevel).toBe(0);
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
    expect(cost.steel).toBe(shown.steel);
    const after = await t.query(api.troops.workshop, seat);
    expect(after.steel.stock).toBe(before.steel.stock - shown.steel);
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
    const one = before.grid.find((entry) => entry.role === 'infantry')!.unit.steel;
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
    expect(workshop.grid.every((entry) => entry.unit.steel > 0)).toBe(true);
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
