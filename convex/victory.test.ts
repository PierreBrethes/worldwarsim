import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import type { LonLat } from '../src/domain/geo';
import { regionFacts } from './regions';
import schema from './schema';
import { modules } from './test.setup';

/**
 * **The test victory — scaffolding under test, not a design decision** (`src/domain/victory.ts`).
 * What these cases pin down is the awkward half of the rule: a count read at the instant, so a
 * player who rebuilds walks out of his executioner's tally, and a concluded season that still
 * reads but no longer plays.
 */

const boot = () => convexTest(schema, modules);

const MARNE = 'FRA-5323'; // where the French barracks stands
const PRAHOVA = 'ROU-310'; // Romanian, nobody's home country — where the point is planted

/** Away from anyone's rest window, so nothing stalls at a border. */
const MIDDAY = new Date(2026, 7, 17, 12, 0, 0);

const NATIONS = ['france', 'ussr', 'germany', 'japan'] as const;

async function launchedSeason(t: ReturnType<typeof boot>, players: number) {
  const { code, token } = await t.mutation(api.seasons.create, {
    nickname: 'Pierre',
    format: 'skirmish',
    durationHours: 48,
    compensation: 0.5,
  });
  const tokens = [token];
  for (let seat = 1; seat < players; seat += 1) {
    const joined = await t.mutation(api.seasons.join, { code, nickname: `Joueur ${seat}` });
    tokens.push(joined.token);
  }
  for (const [seat, seated] of tokens.entries()) {
    await t.mutation(api.players.reserveNation, { token: seated, nation: NATIONS[seat]! });
    await t.mutation(api.players.declareReady, { token: seated, ready: true });
  }
  await t.mutation(api.seasons.launch, { token });
  await disbandTheGift(t, ...tokens);
  return tokens;
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

async function raise(t: ReturnType<typeof boot>, token: string, regionId: string) {
  const playerId = await playerOf(t, token);
  return t.run(async (ctx) =>
    ctx.db.insert('buildings', {
      seasonId: (await ctx.db.get(playerId))!.seasonId,
      playerId,
      key: 'barracks' as const,
      regionId,
      level: 1,
    }),
  );
}

/** A troop formed without paying for it: what is under test is the bar, not the production. */
async function form(
  t: ReturnType<typeof boot>,
  token: string,
  stationedAt: Id<'buildings'> | Id<'outposts'> | null,
): Promise<Id<'troops'>> {
  const playerId = await playerOf(t, token);
  return t.run(async (ctx) =>
    ctx.db.insert('troops', {
      seasonId: (await ctx.db.get(playerId))!.seasonId,
      playerId,
      role: 'infantry' as const,
      tier: 1 as const,
      nominalStrength: 50,
      currentStrength: 50,
      stationedAt,
    }),
  );
}

/** A column left standing on the map — the third form of an address (ADR 0019 §1). */
async function post(t: ReturnType<typeof boot>, token: string, point: LonLat) {
  const playerId = await playerOf(t, token);
  return t.run(async (ctx) =>
    ctx.db.insert('troops', {
      seasonId: (await ctx.db.get(playerId))!.seasonId,
      playerId,
      role: 'infantry' as const,
      tier: 1 as const,
      nominalStrength: 50,
      currentStrength: 50,
      stationedAt: { lon: point[0], lat: point[1] },
    }),
  );
}

async function plant(t: ReturnType<typeof boot>, token: string, point: LonLat) {
  const playerId = await playerOf(t, token);
  return t.run(async (ctx) =>
    ctx.db.insert('outposts', {
      seasonId: (await ctx.db.get(playerId))!.seasonId,
      playerId,
      point: { lon: point[0], lat: point[1] },
      hostCountry: 'ROU',
      level: 1,
      specialization: 'relay' as const,
      foundedAt: Date.now(),
      disabledUntil: null,
      immuneUntil: null,
    }),
  );
}

async function seasonOf(t: ReturnType<typeof boot>) {
  return t.run(async (ctx) => (await ctx.db.query('seasons').collect())[0]!);
}

/**
 * France walks three columns onto the garrison the victim planted in Romania — enough men that
 * the pass leaves the defence well under half of what it was formed at.
 */
async function overrun(t: ReturnType<typeof boot>, attacker: string, victim: string) {
  const barracks = await raise(t, attacker, MARNE);
  const column = [
    await form(t, attacker, barracks),
    await form(t, attacker, barracks),
    await form(t, attacker, barracks),
  ];
  const outpost = await plant(t, victim, regionFacts(PRAHOVA)!.point);
  await form(t, victim, outpost);

  await t.mutation(api.movements.attack, {
    token: attacker,
    origin: { kind: 'building', buildingId: barracks },
    troopIds: column,
    target: { kind: 'outpost', outpostId: outpost },
  });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
}

describe('the simplified Domination', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  it('credits the attacker of the pass that crosses the bar, and at two players takes the season', async () => {
    const t = boot();
    const [attacker, victim] = await launchedSeason(t, 2);
    await overrun(t, attacker!, victim!);

    const [engagement] = await t.run(async (ctx) => ctx.db.query('engagements').collect());
    expect(engagement!.reducedDefender).toBe(true);

    const season = await seasonOf(t);
    expect(season.status).toBe('concluded');
    expect(season.winnerId).toBe(await playerOf(t, attacker!));
    // The season is dated by the pass that took it, not by the moment somebody reads it.
    expect(season.concludedAt).toBe(engagement!.at);

    // Public and named — the departure from design sheet 05 the scaffold makes on purpose.
    const board = (await t.query(api.view.playerView, { token: victim! })).season.reduction;
    expect(board.target).toBe(1);
    expect(board.winnerNation).toBe('france');
    expect(board.standings.find((seat) => seat.nation === 'france')!.reduced).toBe(1);
    expect(board.standings.find((seat) => seat.nation === 'ussr')!.isReduced).toBe(true);
  });

  /**
   * **The threshold is read at the evaluation, never at the launch** — which is what makes a
   * season joinable while it runs (`seasons.enterWar`). Three nations ask for one scalp; the
   * hour a fourth enters the war, they ask for two. Sitting in the lobby of a running season
   * moves nothing: a seat is not a belligerent.
   */
  it('recounts the threshold when a nation enters the war after the launch', async () => {
    const t = boot();
    const [creator] = await launchedSeason(t, 3);
    const targetNow = async () =>
      (await t.query(api.view.playerView, { token: creator! })).season.reduction.target;
    expect(await targetNow()).toBe(1);

    const { code } = await seasonOf(t);
    const { token: late } = await t.mutation(api.seasons.join, { code, nickname: 'Tard' });
    expect(await targetNow()).toBe(1);

    await t.mutation(api.players.reserveNation, { token: late, nation: 'japan' });
    await t.mutation(api.seasons.enterWar, { token: late });
    expect(await targetNow()).toBe(2);
  });

  /**
   * **A pass won by a camp counts, and its owner ordered nothing during it** (ADR 0019 §3,
   * ratified 18/08). `resolveContact` credits the attacker, and at a camp the attacker is the
   * force that was already standing there — so a player advances his condition while asleep.
   * That is the payment of the bet: posting the camp was the order, and it cost a slot and a
   * troop out of twenty-four. This test is here so the next reader finds a decision rather than
   * a surprise.
   */
  it('credits the camp that never ordered anything with the pass it won', async () => {
    const t = boot();
    const [walker, camper] = await launchedSeason(t, 2);
    const point = regionFacts(PRAHOVA)!.point;
    const camped = await post(t, camper!, point);

    const barracks = await raise(t, walker!, MARNE);
    const worn = await form(t, walker!, barracks);
    await t.run(async (ctx) => ctx.db.patch(worn, { currentStrength: 30 }));

    await t.mutation(api.movements.marchTo, {
      token: walker!,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [worn],
      point: { lon: point[0], lat: point[1] },
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const [engagement] = await t.run(async (ctx) => ctx.db.query('engagements').collect());
    expect(engagement!.attackerId).toBe(await playerOf(t, camper!));
    expect(engagement!.reducedDefender).toBe(true);
    /** Nothing was ordered on that side: the camp is still the only movement-free force there. */
    expect((await t.query(api.view.playerView, { token: camper! })).me.slots.used).toBe(0);
    expect((await t.run(async (ctx) => ctx.db.get(camped)))!.playerId).toBe(
      await playerOf(t, camper!),
    );

    const season = await seasonOf(t);
    expect(season.status).toBe('concluded');
    expect(season.winnerId).toBe(await playerOf(t, camper!));
  });

  it('lets a player who rebuilds over the bar leave his executioner’s count', async () => {
    const t = boot();
    // Four seats, so the target is two: one reduction is not a season, and the count stays
    // readable while it moves.
    const [attacker, victim] = await launchedSeason(t, 4);
    await overrun(t, attacker!, victim!);

    const tallyOf = async () => {
      const board = (await t.query(api.view.playerView, { token: attacker! })).season.reduction;
      return board.standings.find((seat) => seat.nation === 'france')!.reduced;
    };

    expect((await seasonOf(t)).status).toBe('launched');
    expect(await tallyOf()).toBe(1);

    // He rebuilds: two fresh troops at home, and he is over the bar again.
    const victimId = await playerOf(t, victim!);
    await t.run(async (ctx) => {
      for (const troop of await ctx.db
        .query('troops')
        .withIndex('byPlayer', (q) => q.eq('playerId', victimId))
        .collect()) {
        await ctx.db.patch(troop._id, { currentStrength: troop.nominalStrength });
      }
    });

    expect(await tallyOf()).toBe(0);
    const board = (await t.query(api.view.playerView, { token: attacker! })).season.reduction;
    expect(board.target).toBe(2);
    expect(board.standings.find((seat) => seat.nation === 'ussr')!.isReduced).toBe(false);
  });

  it('reads a concluded season and plays nothing on it', async () => {
    const t = boot();
    const [attacker, victim] = await launchedSeason(t, 2);
    await overrun(t, attacker!, victim!);
    expect((await seasonOf(t)).status).toBe('concluded');

    // The board still answers: the wipe is manual, and one reads the game back before erasing it.
    const view = await t.query(api.view.playerView, { token: victim! });
    expect(view.season.reduction.winnerNation).toBe('france');
    expect(view.journal ?? []).toBeDefined();

    const barracks = await raise(t, victim!, MARNE);
    const troop = await form(t, victim!, barracks);

    await expect(
      t.mutation(api.movements.attack, {
        token: victim!,
        origin: { kind: 'building', buildingId: barracks },
        troopIds: [troop],
        target: { kind: 'region', regionId: PRAHOVA },
      }),
    ).rejects.toThrow('SEASON_CONCLUDED');

    await expect(
      t.mutation(api.constructions.start, { token: victim!, building: 'farm', regionId: MARNE }),
    ).rejects.toThrow('SEASON_CONCLUDED');

    await expect(
      t.mutation(api.troops.recruit, {
        token: victim!,
        buildingId: barracks,
        role: 'infantry',
        tier: 1,
      }),
    ).rejects.toThrow('SEASON_CONCLUDED');
  });
});
