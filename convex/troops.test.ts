import { convexTest } from 'convex-test';
import { describe, expect, it, vi } from 'vitest';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { TIERS_BY_ROLE } from '../src/domain/troops';
import type { UnitRole } from '../src/domain/ids';
import {
  BILLETS_LEVELS_TO_CAP,
  NOMINAL_STRENGTH,
  SEASON_FORMATS,
  startingStock,
  TROOP_CAP_BASE,
  TROOP_CAP_TARGET,
  recruitmentCost,
  roleHqLevel,
  tier2HqLevel,
  troopCap,
} from './constants';
import schema from './schema';
import { modules } from './test.setup';

const boot = () => convexTest(schema, modules);

/** Every test here launches a 48-hour season: the skirmish kit is the one it hands out. */
const KIT = startingStock('skirmish');

/** French regions, straight out of `region-index.json`. */
const MARNE = 'FRA-5323';
const MOSELLE = 'FRA-5328';
const ARDENNES = 'FRA-5268';
const MEUSE = 'FRA-5326';
const PAS_DE_CALAIS = 'FRA-5334'; // coastal, for the port

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
  return token;
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

/** Puts a building up without paying for it: what is under test is what a standing one does. */
async function raise(
  t: ReturnType<typeof boot>,
  token: string,
  key: 'barracks' | 'airfield' | 'port' | 'billets',
  regionId: string,
  level = 1,
): Promise<Id<'buildings'>> {
  const playerId = await playerOf(t, token);
  return t.run(async (ctx) => ctx.db.insert('buildings', { playerId, key, regionId, level }));
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

async function raze(t: ReturnType<typeof boot>, buildingId: Id<'buildings'>) {
  await t.run(async (ctx) => {
    await ctx.db.delete(buildingId);
  });
}

/** The starting kit does not pay for a season's worth of troops; this saves building a foundry. */
async function credit(t: ReturnType<typeof boot>, token: string, stock: number) {
  const playerId = await playerOf(t, token);
  await t.run(async (ctx) => {
    const rows = await ctx.db
      .query('resources')
      .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
      .collect();
    for (const row of rows) {
      if (row.key === 'alloy' || row.key === 'ammunition') {
        await ctx.db.patch(row._id, { stock, updatedAt: Date.now() });
      }
    }
  });
}

describe('a queue per projection building', () => {
  it('only starts the head batch and leaves the followers waiting', async () => {
    const t = boot();
    const token = await launchedSeason(t);
    await credit(t, token, 4000);
    // The tank opens at the level that arms its counter, one above what a skirmish plants.
    await setHqLevel(t, token, roleHqLevel('armor', 'skirmish'));
    const barracks = await raise(t, token, 'barracks', MARNE);

    await t.mutation(api.troops.recruit, { token, buildingId: barracks, role: 'infantry', tier: 1 });
    await t.mutation(api.troops.recruit, { token, buildingId: barracks, role: 'armor', tier: 1 });

    const workshop = await t.query(api.troops.workshop, { token });
    const queue = workshop.facilities.find((facility) => facility.id === barracks)!.queue;
    expect(queue.map((batch) => [batch.role, batch.started])).toEqual([
      ['infantry', true],
      ['armor', false],
    ]);
    expect(queue[1]!.minutesLeft).toBeGreaterThan(queue[0]!.minutesLeft);
  });

  it('gives two barracks two independent queues', async () => {
    const t = boot();
    const token = await launchedSeason(t);
    await credit(t, token, 4000);
    const first = await raise(t, token, 'barracks', MARNE);
    const second = await raise(t, token, 'barracks', MOSELLE);

    await t.mutation(api.troops.recruit, { token, buildingId: first, role: 'infantry', tier: 1 });
    await t.mutation(api.troops.recruit, { token, buildingId: second, role: 'infantry', tier: 1 });

    const workshop = await t.query(api.troops.workshop, { token });
    const heads = workshop.facilities.map((facility) => facility.queue.map((batch) => batch.started));
    expect(heads).toEqual([[true], [true]]);
  });

  it('refuses a role the building does not form', async () => {
    const t = boot();
    const token = await launchedSeason(t);
    await credit(t, token, 4000);
    const port = await raise(t, token, 'port', PAS_DE_CALAIS);
    const barracks = await raise(t, token, 'barracks', MARNE);

    await expect(
      t.mutation(api.troops.recruit, { token, buildingId: port, role: 'infantry', tier: 1 }),
    ).rejects.toThrow('WRONG_PROJECTION_BUILDING');
    await expect(
      t.mutation(api.troops.recruit, { token, buildingId: barracks, role: 'escort', tier: 1 }),
    ).rejects.toThrow('WRONG_PROJECTION_BUILDING');
  });

  it('refunds a waiting batch in full and refuses to cancel the one that started', async () => {
    const t = boot();
    const token = await launchedSeason(t);
    await credit(t, token, 4000);
    await setHqLevel(t, token, roleHqLevel('armor', 'skirmish'));
    const barracks = await raise(t, token, 'barracks', MARNE);
    await t.mutation(api.troops.recruit, { token, buildingId: barracks, role: 'infantry', tier: 1 });
    await t.mutation(api.troops.recruit, { token, buildingId: barracks, role: 'armor', tier: 1 });

    const before = await t.query(api.troops.workshop, { token });
    const queue = before.facilities.find((facility) => facility.id === barracks)!.queue;
    const cost = recruitmentCost('armor', 1, before.hqLevel);

    await expect(
      t.mutation(api.troops.cancel, { token, recruitmentId: queue[0]!.id }),
    ).rejects.toThrow('BATCH_ALREADY_STARTED');

    await t.mutation(api.troops.cancel, { token, recruitmentId: queue[1]!.id });

    const after = await t.query(api.troops.workshop, { token });
    expect(after.troopsQueued).toBe(1);
    expect(after.alloy.stock).toBe(before.alloy.stock + cost.alloy);
    expect(after.ammunition.stock).toBe(before.ammunition.stock + cost.ammunition);
  });
});

describe('a finished batch is a troop', () => {
  it('stands at its nominal strength, attached to the barracks that formed it', async () => {
    vi.useFakeTimers();
    try {
      const t = boot();
      const token = await launchedSeason(t);
      await credit(t, token, 4000);
      const barracks = await raise(t, token, 'barracks', MARNE);
      await t.mutation(api.troops.recruit, { token, buildingId: barracks, role: 'infantry', tier: 1 });

      await t.finishAllScheduledFunctions(vi.runAllTimers);

      const view = await t.query(api.view.playerView, { token });
      expect(view.me.troops).toHaveLength(1);
      expect(view.me.troops[0]).toMatchObject({
        role: 'infantry',
        tier: 1,
        strength: NOMINAL_STRENGTH.infantry[1],
        nominalStrength: NOMINAL_STRENGTH.infantry[1],
        stationedAt: barracks,
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
      const token = await launchedSeason(t);
      await credit(t, token, 4000);
      const barracks = await raise(t, token, 'barracks', MARNE);
      await t.mutation(api.troops.recruit, { token, buildingId: barracks, role: 'infantry', tier: 1 });
      await t.finishAllScheduledFunctions(vi.runAllTimers);

      await raze(t, barracks);

      const view = await t.query(api.view.playerView, { token });
      expect(view.me.troops).toHaveLength(1);
      expect(view.me.troops[0]!.stationedAt).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('the troop ceiling', () => {
  it('derives its step from the target alone', () => {
    expect(troopCap(0)).toBe(TROOP_CAP_BASE);
    expect(troopCap(BILLETS_LEVELS_TO_CAP)).toBe(TROOP_CAP_TARGET);
    // Past saturation it stops rather than climbing with every extra level.
    expect(troopCap(BILLETS_LEVELS_TO_CAP * 3)).toBe(TROOP_CAP_TARGET);
  });

  it('adds the levels of every billets: two at one are worth one at two', async () => {
    const t = boot();
    const spread = await launchedSeason(t);
    await raise(t, spread, 'billets', ARDENNES, 1);
    await raise(t, spread, 'billets', MEUSE, 1);

    const u = boot();
    const tall = await launchedSeason(u);
    await raise(u, tall, 'billets', ARDENNES, 2);

    const twoSites = await t.query(api.troops.workshop, { token: spread });
    const oneSite = await u.query(api.troops.workshop, { token: tall });
    expect(twoSites.troopCap).toBe(oneSite.troopCap);
    expect(twoSites.troopCap).toBe(troopCap(2));
  });

  /**
   * `cappedByHq` forbids any building from reaching the headquarters' level, so a lone billets
   * stops at four under a headquarters at five. Reaching the target costs a second site — the
   * decision of ADR 0014, not a side effect.
   */
  it('leaves a single billets at the maximum short of the target', () => {
    expect(troopCap(4)).toBe(16);
    expect(troopCap(4)).toBeLessThan(TROOP_CAP_TARGET);
  });

  it('counts the queue against the ceiling and refuses the batch past it', async () => {
    const t = boot();
    const token = await launchedSeason(t);
    await credit(t, token, 40_000);
    const barracks = await raise(t, token, 'barracks', MARNE);

    for (let index = 0; index < TROOP_CAP_BASE; index += 1) {
      await t.mutation(api.troops.recruit, { token, buildingId: barracks, role: 'infantry', tier: 1 });
    }

    const workshop = await t.query(api.troops.workshop, { token });
    expect(workshop.troopsQueued).toBe(TROOP_CAP_BASE);
    expect(workshop.troopCap).toBe(TROOP_CAP_BASE);

    await expect(
      t.mutation(api.troops.recruit, { token, buildingId: barracks, role: 'infantry', tier: 1 }),
    ).rejects.toThrow('TROOP_CAP_REACHED');
  });

  it('rises with the billets, and razing them erases no troop', async () => {
    vi.useFakeTimers();
    try {
      const t = boot();
      const token = await launchedSeason(t);
      await credit(t, token, 40_000);
      const barracks = await raise(t, token, 'barracks', MARNE);
      const billets = await raise(t, token, 'billets', ARDENNES, 2);
      await raise(t, token, 'billets', MEUSE, 2);

      const raised = await t.query(api.troops.workshop, { token });
      expect(raised.troopCap).toBe(troopCap(4));

      for (let index = 0; index < 10; index += 1) {
        await t.mutation(api.troops.recruit, { token, buildingId: barracks, role: 'infantry', tier: 1 });
      }
      await t.finishAllScheduledFunctions(vi.runAllTimers);

      await raze(t, billets);

      // Ten troops stand under a ceiling that fell back to twelve: nothing is disbanded, the
      // nation simply cannot recruit while it sits above.
      const view = await t.query(api.view.playerView, { token });
      expect(view.me.troops).toHaveLength(10);
      expect(view.me.troopCap).toBe(troopCap(2));

      for (let index = 0; index < 2; index += 1) {
        await t.mutation(api.troops.recruit, { token, buildingId: barracks, role: 'infantry', tier: 1 });
      }
      await expect(
        t.mutation(api.troops.recruit, { token, buildingId: barracks, role: 'infantry', tier: 1 }),
      ).rejects.toThrow('TROOP_CAP_REACHED');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('tiers', () => {
  /**
   * **The threshold is counted above the launch of the format** (ADR 0017), so a skirmish opens
   * mark 2 at 3 and the headquarters it is planted with — 2 — is exactly one short. The step
   * exists again in the short format, which is the whole point of the rule.
   */
  it('counts the tier-2 gate above the headquarters its format plants', () => {
    expect(tier2HqLevel('skirmish')).toBe(3);
    expect(tier2HqLevel('campaign')).toBe(2);
    for (const [format, spec] of Object.entries(SEASON_FORMATS)) {
      const threshold = tier2HqLevel(format as keyof typeof SEASON_FORMATS);
      expect(threshold).toBeGreaterThan(spec.hqLevelAtLaunch);
      expect(threshold).toBeLessThanOrEqual(spec.maxHqLevel);
    }
  });

  it('serves the threshold of the format to the workshop, rather than a constant', async () => {
    const t = boot();
    const token = await launchedSeason(t);

    const shop = await t.query(api.troops.workshop, { token });
    expect(shop.requiredHqLevel).toBe(tier2HqLevel('skirmish'));
    // The headquarters a skirmish plants is one short of it: locked at the first minute.
    expect(shop.hqLevel).toBe(SEASON_FORMATS.skirmish.hqLevelAtLaunch);
    expect(shop.tier2Unlocked).toBe(false);
  });

  it('rejects a tier the role does not have and tier 2 without the headquarters level', async () => {
    const t = boot();
    const token = await launchedSeason(t);
    await credit(t, token, 4000);
    await setHqLevel(t, token, tier2HqLevel('skirmish') - 1);
    const barracks = await raise(t, token, 'barracks', MARNE);
    const port = await raise(t, token, 'port', PAS_DE_CALAIS);

    await expect(
      t.mutation(api.troops.recruit, { token, buildingId: barracks, role: 'infantry', tier: 2 }),
    ).rejects.toThrow('TIER_2_LOCKED');
    await expect(
      t.mutation(api.troops.recruit, { token, buildingId: port, role: 'carrier', tier: 2 }),
    ).rejects.toThrow('SINGLE_TIER_ROLE');
  });

  /**
   * **The weapon and its counter arrive together.** The tank leaves the launch of a skirmish
   * for the level that opens mark-2 infantry, its answer in the damage table: a season no
   * longer spends its first thirty hours with armor nobody can reply to.
   */
  it('holds the tank at the level that opens its counter, and lets the infantry through', async () => {
    const t = boot();
    const token = await launchedSeason(t);
    await credit(t, token, 4000);
    const barracks = await raise(t, token, 'barracks', MARNE);

    // Mark-1 infantry is the age of the barracks: recruitable the minute one stands.
    await t.mutation(api.troops.recruit, { token, buildingId: barracks, role: 'infantry', tier: 1 });

    const refused: Record<string, unknown> = await t
      .mutation(api.troops.recruit, { token, buildingId: barracks, role: 'armor', tier: 1 })
      .then(() => ({}))
      .catch((error: { data: Record<string, unknown> }) => error.data);
    expect(refused).toMatchObject({
      code: 'ROLE_LOCKED',
      role: 'armor',
      requiredLevel: tier2HqLevel('skirmish'),
    });

    await setHqLevel(t, token, tier2HqLevel('skirmish'));
    const { rank } = await t.mutation(api.troops.recruit, {
      token,
      buildingId: barracks,
      role: 'armor',
      tier: 1,
    });
    expect(rank).toBe(1);
  });

  it('serves the tank’s threshold to the workshop, and nothing for the roles their building carries', async () => {
    const t = boot();
    const token = await launchedSeason(t);
    const shop = await t.query(api.troops.workshop, { token });
    for (const entry of shop.grid) {
      expect(entry.unlockedAtHqLevel).toBe(roleHqLevel(entry.role, 'skirmish'));
    }
    expect(shop.grid.find((entry) => entry.role === 'armor')?.unlockedAtHqLevel).toBe(
      tier2HqLevel('skirmish'),
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
 * The reverse of what this file used to record. Steel came from extraction outposts that do
 * not exist, so a fresh nation could produce nothing at all; the starting kit now carries an
 * advance of alloy and of ammunition, and the first light troop is affordable on the first
 * minute — once a barracks stands, which is the new gate.
 */
describe('a fresh nation', () => {
  it('forms its first troop out of the starting kit', async () => {
    const t = boot();
    const token = await launchedSeason(t);
    const barracks = await raise(t, token, 'barracks', MARNE);
    const workshop = await t.query(api.troops.workshop, { token });

    expect(workshop.alloy.stock).toBe(KIT.alloy);
    expect(workshop.grid.every((entry) => entry.unit.alloy > 0)).toBe(true);
    await t.mutation(api.troops.recruit, { token, buildingId: barracks, role: 'infantry', tier: 1 });

    const after = await t.query(api.troops.workshop, { token });
    expect(after.troopsQueued).toBe(1);
  });

  it('has no line at all before a projection building stands', async () => {
    const t = boot();
    const token = await launchedSeason(t);
    const workshop = await t.query(api.troops.workshop, { token });
    expect(workshop.facilities).toHaveLength(0);
  });
});
