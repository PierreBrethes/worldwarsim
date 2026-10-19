import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { pointOfRegion, regionFacts } from './regions';
import { reassessDetection, reassessLootCrateDetection } from './movement/detection';
import { economyOf, settle } from './resources';
import schema from './schema';
import { modules } from './test.setup';
import { foundSeat, joinSeat, seatIn } from './seats.fixture';
import type { Seat } from './seats.fixture';

/**
 * **Un événement répété ne laisse qu'un job en attente** (#146). Chaque règlement et chaque
 * réévaluation replanifiaient sans rien annuler : la file des jobs grossissait d'un job par
 * mutation. On garde l'id du job, on annule avant de replanifier, et on ne replanifie que si
 * l'échéance change.
 */
const boot = () => convexTest({ schema, modules, transactionLimits: true });
type Bench = ReturnType<typeof boot>;

const PRAHOVA = 'ROU-310';
const MIDDAY = new Date(2026, 7, 17, 12, 0, 0);
const HOUR = 3_600_000;

async function launchedSeason(t: Bench) {
  const { seat, code } = await foundSeat(t, 'Pierre', 0.5);
  const guest = await joinSeat(t, code, 'Léa');
  await t.mutation(api.players.reserveNation, { ...seat, nation: 'france' });
  await t.mutation(api.players.declareReady, { ...seat, ready: true });
  await t.mutation(api.players.reserveNation, { ...guest, nation: 'ussr' });
  await t.mutation(api.players.declareReady, { ...guest, ready: true });
  await t.mutation(api.seasons.launch, seat);
  return { seat, guest };
}

const playerOf = (t: Bench, seat: Seat): Promise<Id<'players'>> =>
  t.run(async (ctx) => (await seatIn(ctx, seat))._id);

async function station(t: Bench, playerId: Id<'players'>) {
  await t.run(async (ctx) => {
    await ctx.db.insert('buildings', {
      seasonId: (await ctx.db.get(playerId))!.seasonId,
      playerId,
      key: 'listening',
      regionId: PRAHOVA,
      point: pointOfRegion(PRAHOVA),
      level: 1,
    });
  });
}

async function setCoal(t: Bench, playerId: Id<'players'>, stock: number) {
  await t.run(async (ctx) => {
    for (const row of await ctx.db
      .query('resources')
      .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
      .collect())
      if (row.key === 'coal') await ctx.db.patch(row._id, { stock, updatedAt: Date.now() });
  });
}

/** Les jobs en attente d'une fonction, par son nom de module. */
const pendingOf = (t: Bench, name: string) =>
  t.run(async (ctx) =>
    (await ctx.db.system.query('_scheduled_functions').collect()).filter(
      (job) => job.name === name && job.state.kind === 'pending',
    ),
  );

describe('scheduled jobs', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  it('keeps one dry-coal wake-up over two reassessments an hour apart', async () => {
    const t = boot();
    const { guest } = await launchedSeason(t);
    const playerId = await playerOf(t, guest);
    await station(t, playerId);
    await setCoal(t, playerId, 50);

    const seasonId = guest.seasonId;
    await t.run((ctx) => reassessDetection(ctx, seasonId));
    expect(await pendingOf(t, 'listening:reassess')).toHaveLength(1);
    const [first] = await pendingOf(t, 'listening:reassess');

    vi.setSystemTime(MIDDAY.getTime() + HOUR);
    await t.run((ctx) => reassessDetection(ctx, seasonId));
    const after = await pendingOf(t, 'listening:reassess');
    expect(after).toHaveLength(1);
    expect(after[0]!._id).toBe(first!._id);
  });

  it('moves the dry-coal wake-up when the date changes, and drops it once silent', async () => {
    const t = boot();
    const { guest } = await launchedSeason(t);
    const playerId = await playerOf(t, guest);
    await station(t, playerId);
    await setCoal(t, playerId, 50);
    const seasonId = guest.seasonId;
    await t.run((ctx) => reassessDetection(ctx, seasonId));
    const [first] = await pendingOf(t, 'listening:reassess');

    await setCoal(t, playerId, 5);
    await t.run((ctx) => reassessDetection(ctx, seasonId));
    const moved = await pendingOf(t, 'listening:reassess');
    expect(moved).toHaveLength(1);
    expect(moved[0]!._id).not.toBe(first!._id);
    expect(moved[0]!.scheduledTime).toBeLessThan(first!.scheduledTime);

    await setCoal(t, playerId, 0);
    await t.run((ctx) => reassessDetection(ctx, seasonId));
    expect(await pendingOf(t, 'listening:reassess')).toHaveLength(0);
  });

  it('files one wake-up for two settlements of a silent player', async () => {
    const t = boot();
    const { guest } = await launchedSeason(t);
    const playerId = await playerOf(t, guest);
    await station(t, playerId);
    await setCoal(t, playerId, 0);

    await t.run((ctx) => settle(ctx, playerId, Date.now()));
    await t.run((ctx) => settle(ctx, playerId, Date.now() + 1));
    expect(await pendingOf(t, 'listening:reassess')).toHaveLength(1);
  });

  it('files one queue wake-up for two settlements of a starving player', async () => {
    const t = boot();
    const { guest } = await launchedSeason(t);
    const playerId = await playerOf(t, guest);
    await t.run(async (ctx) => {
      for (const row of await ctx.db
        .query('resources')
        .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
        .collect())
        if (row.key === 'food') await ctx.db.patch(row._id, { stock: 0, updatedAt: Date.now() });
      // Twenty mouths and no farm: the food rate is negative.
      for (let mouth = 0; mouth < 20; mouth += 1)
        await ctx.db.insert('troops', {
          seasonId: guest.seasonId,
          playerId,
          role: 'infantry',
          tier: 1,
          nominalStrength: 100,
          currentStrength: 100,
          stationedAt: null,
        });
    });
    const starving = await t.run(
      async (ctx) => (await economyOf(ctx, playerId, Date.now())).starving,
    );
    expect(starving).toBe(true);

    await t.run((ctx) => settle(ctx, playerId, Date.now()));
    await t.run((ctx) => settle(ctx, playerId, Date.now() + 1));
    expect(await pendingOf(t, 'troops:resumeQueues')).toHaveLength(1);
  });

  it('keeps the crate jobs whose date did not move, and drops those that did', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const mover = await playerOf(t, seat);
    const watcher = await playerOf(t, guest);
    const seasonId = seat.seasonId;
    const [from, to] = [regionFacts('FRA-5323')!.point, regionFacts(PRAHOVA)!.point];
    const at = { lon: 8, lat: 49 };
    const movementId = await t.run(async (ctx) => {
      const troopId = await ctx.db.insert('troops', {
        seasonId,
        playerId: mover,
        role: 'infantry',
        tier: 1,
        nominalStrength: 100,
        currentStrength: 100,
        stationedAt: null,
      });
      return ctx.db.insert('movements', {
        seasonId,
        playerId: mover,
        type: 'march',
        fromBuildingId: null,
        target: { kind: 'point', point: { lon: to[0], lat: to[1] } },
        from: { lon: from[0], lat: from[1] },
        to: { lon: to[0], lat: to[1] },
        hostCountry: 'ROU',
        points: [
          { lon: from[0], lat: from[1] },
          { lon: to[0], lat: to[1] },
        ],
        legs: [{ medium: 'land', distanceUnits: 1500 }],
        distanceUnits: 1500,
        costUnits: 1500,
        landCost: 1,
        troopIds: [troopId],
        departedAt: Date.now(),
        arrivesAt: Date.now() + 72 * HOUR,
      });
    });
    expect(movementId).toBeDefined();
    await t.run(async (ctx) => {
      const engagementId = await ctx.db.insert('engagements', {
        seasonId,
        attackerId: mover,
        defenderId: watcher,
        cause: 'arrival',
        point: at,
        hostCountry: 'DEU',
        at: Date.now(),
        winner: 'attacker',
        outpostId: null,
        disabledUntil: null,
        troops: [],
      });
      const zero = { ammunition: 0, oil: 0, coal: 0, food: 0, steel: 0 };
      const recoveryId = await ctx.db.insert('lootRecoveries', {
        seasonId,
        engagementId,
        dispossessedPlayerId: watcher,
        recoveringPlayerId: mover,
        point: at,
        at: Date.now(),
        recovered: zero,
        remainder: zero,
      });
      // Right on the road, midway: the column enters and leaves its circle.
      const mid = { lon: (from[0] + to[0]) / 2, lat: (from[1] + to[1]) / 2 };
      await ctx.db.insert('lootCrates', {
        seasonId,
        recoveryId,
        point: mid,
        appearedAt: Date.now(),
        expiresAt: Date.now() + 200 * HOUR,
        loot: zero,
      });
    });

    await t.run((ctx) => reassessLootCrateDetection(ctx, seasonId));
    const jobs = () => t.run((ctx) => ctx.db.query('lootCrateDetectionJobs').collect());
    const first = await jobs();
    expect(first.length).toBeGreaterThan(0);

    await t.run((ctx) => reassessLootCrateDetection(ctx, seasonId));
    const second = await jobs();
    expect(second.map((job) => [job._id, job.scheduledJobId])).toEqual(
      first.map((job) => [job._id, job.scheduledJobId]),
    );
    expect(await pendingOf(t, 'lootCrates:refreshDetection')).toHaveLength(first.length);
  });
});
