import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import type { LonLat } from '../src/domain/geo';
import type { UnitRole } from '../src/domain/ids';
import {
  EXTRACTION_PER_HOUR,
  FOOD_UPKEEP_PER_TROOP_PER_HOUR,
  OUTPOST_DISABLED_HOURS,
  outpostReachKm,
  TROOP_CAP_TARGET,
  UPKEEP_UNSUPPLIED_MULTIPLIER,
  nominalStrength,
} from './constants';
import { regionFacts } from './regions';
import { landAtPoint } from './routes';
import schema from './schema';
import { modules } from './test.setup';
import { foundSeat, joinSeat, seatIn } from './seats.fixture';
import type { Seat } from './seats.fixture';

/** Le rayon d'un point neuf : la portée suit le niveau depuis le 31/08, et ces cas plantent
 *  tous un avant-poste de niveau 1. */
const REACH_KM = outpostReachKm(1);

/**
 * **What an army costs to hold, and where it costs double** (ADR 0019 §4, `consommation-continue`
 * D1 and D3). Two facts are under test and they are not the same one: that the rate is flat per
 * troop whatever the role, and that it is multiplied by where the troop stands.
 */

const boot = () => convexTest({ schema, modules, transactionLimits: true });

const MARNE = 'FRA-5323'; // French, food deposit
const RIYADH: LonLat = [46.72, 24.63]; // Saudi — nobody's home country and nobody's outpost
const MIDDAY = new Date(2026, 7, 17, 12, 0, 0);

async function launchedSeason(t: ReturnType<typeof boot>) {
  const { seat, code } = await foundSeat(t, 'Pierre', 48, 0.5);
  const guest = await joinSeat(t, code, 'Léa');
  await t.mutation(api.players.reserveNation, { ...seat, nation: 'france' });
  await t.mutation(api.players.declareReady, { ...seat, ready: true });
  await t.mutation(api.players.reserveNation, { ...guest, nation: 'ussr' });
  await t.mutation(api.players.declareReady, { ...guest, ready: true });
  await t.mutation(api.seasons.launch, seat);
  await disbandTheGift(t, seat);
  await disbandTheGift(t, guest);
  return { seat, guest };
}

/**
 * **The company the launch hands out, taken back** (`seasons.endow`, 25/08). What this file
 * measures is an economy, and the endowment eats: cleared at the door, so a figure here still
 * says what the ground produces. The gift itself is under test in `off-season.test.ts`.
 */
async function disbandTheGift(t: ReturnType<typeof boot>, seat: Seat) {
  await t.run(async (ctx) => {
    const player = await seatIn(ctx, seat);
    const held = await ctx.db
      .query('troops')
      .withIndex('byPlayer', (q) => q.eq('playerId', player._id))
      .collect();
    for (const troop of held) await ctx.db.delete(troop._id);
  });
}

const playerOf = async (t: ReturnType<typeof boot>, seat: Seat) =>
  t.run(async (ctx) => {
    const player = await seatIn(ctx, seat);
    return player._id;
  });

/** A troop formed without paying for it: what is under test is what it eats, not what it cost. */
async function form(
  t: ReturnType<typeof boot>,
  seat: Seat,
  role: UnitRole,
  stationedAt: Id<'buildings'> | Id<'outposts'> | { lon: number; lat: number } | null,
  strengthFactor = 1,
): Promise<Id<'troops'>> {
  const playerId = await playerOf(t, seat);
  const strength = nominalStrength(role, 1);
  return t.run(async (ctx) =>
    ctx.db.insert('troops', {
      seasonId: (await ctx.db.get(playerId))!.seasonId,
      playerId,
      role,
      tier: 1 as const,
      nominalStrength: strength,
      currentStrength: strength * strengthFactor,
      stationedAt,
    }),
  );
}

async function raise(t: ReturnType<typeof boot>, seat: Seat, key: 'farm' | 'barracks') {
  const playerId = await playerOf(t, seat);
  return t.run(async (ctx) =>
    ctx.db.insert('buildings', {
      seasonId: (await ctx.db.get(playerId))!.seasonId,
      playerId,
      key,
      regionId: MARNE,
      level: 1,
    }),
  );
}

async function plant(
  t: ReturnType<typeof boot>,
  seat: Seat,
  point: LonLat,
  { disabled = false }: { disabled?: boolean } = {},
) {
  const playerId = await playerOf(t, seat);
  return t.run(async (ctx) =>
    ctx.db.insert('outposts', {
      seasonId: (await ctx.db.get(playerId))!.seasonId,
      playerId,
      point: { lon: point[0], lat: point[1] },
      hostCountry: 'SAU',
      level: 1,
      specialization: 'relay' as const,
      foundedAt: Date.now(),
      disabledUntil: disabled ? Date.now() + OUTPOST_DISABLED_HOURS * 3_600_000 : null,
      immuneUntil: null,
    }),
  );
}

const upkeepOf = async (t: ReturnType<typeof boot>, seat: Seat) =>
  (await t.query(api.view.playerView, seat)).me.upkeep;

/** A point a given distance due east of another, at this latitude. */
const eastOf = (point: LonLat, km: number): LonLat => [
  point[0] + km / (111.32 * Math.cos((point[1] * Math.PI) / 180)),
  point[1],
];

const asPoint = (point: LonLat) => ({ lon: point[0], lat: point[1] });

describe('an army eats a flat rate, whatever it is made of', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  it('takes nothing from a nation holding no troop', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    await raise(t, seat, 'farm');

    const view = await t.query(api.view.playerView, seat);
    expect(view.me.upkeep.troops).toBe(0);
    expect(view.me.upkeep.foodPerHour).toBe(0);
    expect(view.me.resources.food.ratePerHour).toBe(EXTRACTION_PER_HOUR.food);
    expect(view.me.starving).toBe(false);
  });

  /** The whole of D1: `nominalStrength` is not the same unit from one role to the next, so the
   *  rate reads none of it. Twenty-four of anything eat twenty-four forfaits. */
  it('charges the ceiling of an army as many forfaits as it has troops, roles apart', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const roles: ReadonlyArray<UnitRole> = ['infantry', 'armor', 'carrier', 'bomber', 'cargo'];
    for (let rank = 0; rank < TROOP_CAP_TARGET; rank += 1) {
      await form(t, seat, roles[rank % roles.length]!, null);
    }

    const upkeep = await upkeepOf(t, seat);
    expect(upkeep.troops).toBe(TROOP_CAP_TARGET);
    expect(upkeep.foodPerHour).toBe(TROOP_CAP_TARGET * FOOD_UPKEEP_PER_TROOP_PER_HOUR);
  });

  /** The intention of `chiffrage-combat.md` §5, kept for free: losing men is never an economy. */
  it('charges a troop at a tenth of its strength what it charges a full one', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    await form(t, seat, 'infantry', null, 0.1);
    await form(t, guest, 'infantry', null);

    expect((await upkeepOf(t, seat)).foodPerHour).toBe((await upkeepOf(t, guest)).foodPerHour);
  });

  /** Half the point of the mechanism: a nation growing 12 and eating 24 must read −12. */
  it('serves a food rate net of the army, and lets it go negative', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    await raise(t, seat, 'farm');
    for (let rank = 0; rank < 24; rank += 1) await form(t, seat, 'infantry', null);

    const view = await t.query(api.view.playerView, seat);
    expect(view.me.resources.food.ratePerHour).toBe(
      EXTRACTION_PER_HOUR.food - 24 * FOOD_UPKEEP_PER_TROOP_PER_HOUR,
    );
    expect(view.me.resources.food.ratePerHour).toBeLessThan(0);
  });
});

describe('where a troop stands decides what it eats', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  const homePoint = () => regionFacts(MARNE)!.point;

  it('charges the end of the world the multiplier it charges home once', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    await form(t, seat, 'infantry', asPoint(homePoint()));
    await form(t, guest, 'infantry', asPoint(RIYADH));

    const home = await upkeepOf(t, seat);
    const abroad = await upkeepOf(t, guest);
    expect(home.unsupplied).toBe(0);
    expect(abroad.unsupplied).toBe(1);
    expect(abroad.foodPerHour / home.foodPerHour).toBe(UPKEEP_UNSUPPLIED_MULTIPLIER);
  });

  /**
   * **A column eats the home rate on the road, and the far rate only from its arrival.**
   * `standAt` moved the troops to their new address without settling first, so the next reading
   * charged the whole march at the raised rate of the place they had only just reached.
   */
  it('charges the raised rate from the arrival, not over the whole march', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    await disbandTheGift(t, seat);
    const troop = await form(t, seat, 'infantry', asPoint(homePoint()));
    const playerId = await playerOf(t, seat);
    await t.run(async (ctx) => {
      const row = (
        await ctx.db
          .query('resources')
          .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
          .collect()
      ).find((candidate) => candidate.key === 'food')!;
      await ctx.db.patch(row._id, { stock: 1_000, updatedAt: Date.now() });
    });

    const sent = await t.mutation(api.movements.marchTo, {
      ...seat,
      origin: { kind: 'point', point: asPoint(homePoint()) },
      troopIds: [troop],
      point: asPoint(RIYADH),
    });
    vi.advanceTimersByTime(sent.minutes * 60_000 + 1);
    await t.finishInProgressScheduledFunctions();

    const hours = (sent.minutes * 60_000 + 1) / 3_600_000;
    const view = await t.query(api.view.playerView, seat);
    expect(view.me.resources.food.stock).toBeCloseTo(
      1_000 - hours * FOOD_UPKEEP_PER_TROOP_PER_HOUR,
      0,
    );
  });

  /** **The outpost feeds** (ADR 0019 §4): it does not project force, it supplies it. */
  it('feeds a column standing inside the reach of one of its own points', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    await plant(t, seat, RIYADH);
    await form(t, seat, 'infantry', asPoint(eastOf(RIYADH, REACH_KM / 2)));

    const upkeep = await upkeepOf(t, seat);
    expect(upkeep.unsupplied).toBe(0);
    expect(upkeep.foodPerHour).toBe(FOOD_UPKEEP_PER_TROOP_PER_HOUR);
  });

  /**
   * **Aucun quai ne nourrit le large** (règle 5 du 18/09). Une pile qui *reste* en mer est un
   * ordre depuis cette date, donc la question s'est posée : mouillée dans le rayon d'un de ses
   * propres points, elle était nourrie au tarif du pays — la géométrie répondait oui à une
   * question que personne n'avait posée. Le ravitaillement en mer par un port ami à portée reste
   * ouvert (`QUESTIONS.md` 🟡) ; il ne sera pas un effet de bord d'un rayon terrestre.
   */
  it('feeds nobody at sea, even moored inside the reach of one of its own points', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    /** Le point est sur la côte saoudienne : son rayon couvre le large juste à côté. */
    const shore: LonLat = [49.9, 27.0];
    await plant(t, seat, shore);
    const offshore = eastOf(shore, REACH_KM / 3);
    expect(landAtPoint(offshore)).toBe(false);
    await form(t, seat, 'cargo', asPoint(offshore));

    const upkeep = await upkeepOf(t, seat);
    expect(upkeep.unsupplied).toBe(1);
    expect(upkeep.foodPerHour).toBe(FOOD_UPKEEP_PER_TROOP_PER_HOUR * UPKEEP_UNSUPPLIED_MULTIPLIER);
  });

  it('charges the raised rate a step beyond that reach', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    await plant(t, seat, RIYADH);
    await form(t, seat, 'infantry', asPoint(eastOf(RIYADH, REACH_KM + 50)));

    expect((await upkeepOf(t, seat)).unsupplied).toBe(1);
  });

  /**
   * **An allied point does not supply** — a decision, not an oversight (ADR 0019 §4 and §5):
   * supply would become a diplomatic currency before diplomacy is an object of the game.
   */
  it('leaves a column standing under somebody else’s point at the raised rate', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    await plant(t, guest, RIYADH);
    await form(t, seat, 'infantry', asPoint(eastOf(RIYADH, REACH_KM / 2)));

    const upkeep = await upkeepOf(t, seat);
    expect(upkeep.unsupplied).toBe(1);
    expect(upkeep.foodPerHour).toBe(FOOD_UPKEEP_PER_TROOP_PER_HOUR * UPKEEP_UNSUPPLIED_MULTIPLIER);
  });

  /**
   * **A deactivated point feeds nobody**, and that is what the raid gains from this decision
   * (ADR 0019, "ce que la décision fait gagner au raid"): until now a raid cut an exploitation
   * under a military word; it can now starve the army camped in the radius. It comes back with
   * the point, and nothing dies of it in the meantime.
   */
  it('stops feeding while the point is out of service, and feeds again when it comes back', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    await plant(t, seat, RIYADH, { disabled: true });
    await form(t, seat, 'infantry', asPoint(eastOf(RIYADH, REACH_KM / 2)));

    expect((await upkeepOf(t, seat)).unsupplied).toBe(1);

    vi.advanceTimersByTime((OUTPOST_DISABLED_HOURS + 1) * 3_600_000);
    expect((await upkeepOf(t, seat)).unsupplied).toBe(0);
  });

  /** The surcharge has to be visible where the player looks at the troop, not on a ledger. */
  it('marks the troop that pays double, on its own card', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const home = await form(t, seat, 'infantry', asPoint(homePoint()));
    const abroad = await form(t, seat, 'infantry', asPoint(RIYADH));

    const view = await t.query(api.view.playerView, seat);
    expect(view.me.troops.find((troop) => troop.id === home)!.supplied).toBe(true);
    expect(view.me.troops.find((troop) => troop.id === abroad)!.supplied).toBe(false);
  });

  /** A garrison stands on its own point, which is an anchor by construction — and a troop the
   *  game cannot place at all is at home (`null`), never an expedition. */
  it('feeds a garrison off the point it holds, and a homeless troop off the nation', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const outpostId = await plant(t, seat, RIYADH);
    await form(t, seat, 'infantry', outpostId);
    await form(t, seat, 'infantry', null);

    expect((await upkeepOf(t, seat)).unsupplied).toBe(0);
  });
});

describe('a dry reserve stops the queue and kills nothing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  /** Five mouths and no farm: the starting kit of food is gone well inside the window, and the
   *  army stays under the ceiling of the billets so a batch can still be ordered. */
  const starve = async (t: ReturnType<typeof boot>, seat: Seat) => {
    for (let rank = 0; rank < 5; rank += 1) await form(t, seat, 'infantry', null);
    vi.advanceTimersByTime(30 * 3_600_000);
  };

  it('floors the reserve, loses no troop, and says so out loud', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    await starve(t, seat);

    const view = await t.query(api.view.playerView, seat);
    expect(view.me.resources.food.stock).toBe(0);
    expect(view.me.starving).toBe(true);
    expect(view.me.troops).toHaveLength(5);
  });

  /**
   * **The queue stops, it is never cancelled** (D3): the batch keeps its rank and its matter and
   * is simply not dated, so nothing is lost by a famine and nothing has to be re-ordered.
   */
  it('refuses to date a head while the nation is hungry, and dates it when the food returns', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const barracks = await raise(t, seat, 'barracks');
    await starve(t, seat);

    const { recruitmentId } = await t.mutation(api.troops.recruit, {
      ...seat,
      buildingId: barracks,
      role: 'infantry',
      tier: 1,
    });
    expect((await t.run(async (ctx) => ctx.db.get(recruitmentId)))!.finishesAt).toBeNull();

    // A convoy of food arrives — here, the hand of a test; in a season, a farm going up.
    const playerId = await playerOf(t, seat);
    await t.run(async (ctx) => {
      const row = (
        await ctx.db
          .query('resources')
          .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
          .collect()
      ).find((candidate) => candidate.key === 'food')!;
      await ctx.db.patch(row._id, { stock: 5_000, updatedAt: Date.now() });
    });
    expect((await t.query(api.view.playerView, seat)).me.starving).toBe(false);

    // Ordering again is one of the events that restarts a line: `startHead` is idempotent and
    // picks up the head the famine left undated.
    await t.mutation(api.troops.recruit, {
      ...seat,
      buildingId: barracks,
      role: 'infantry',
      tier: 1,
    });
    expect((await t.run(async (ctx) => ctx.db.get(recruitmentId)))!.finishesAt).not.toBeNull();
  });
});

/**
 * **A delivered troop starts eating when it arrives, not when the nation was last read.**
 * `deliver` inserted the troop without settling first, so the next reading charged its upkeep
 * backwards over the whole time it spent in the barracks queue.
 */
describe('a delivered troop', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  it('eats from the moment it arrives, not from the last settlement', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    await disbandTheGift(t, seat);
    const barracks = await raise(t, seat, 'barracks');
    const playerId = await playerOf(t, seat);
    await t.run(async (ctx) => {
      const row = (
        await ctx.db
          .query('resources')
          .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
          .collect()
      ).find((candidate) => candidate.key === 'food')!;
      await ctx.db.patch(row._id, { stock: 1_000, updatedAt: Date.now() });
    });

    const { recruitmentId } = await t.mutation(api.troops.recruit, {
      ...seat,
      buildingId: barracks,
      role: 'infantry',
      tier: 1,
    });
    const finishesAt = (await t.run(async (ctx) => ctx.db.get(recruitmentId)))!.finishesAt!;
    vi.advanceTimersByTime(finishesAt - Date.now() + 1);
    await t.finishInProgressScheduledFunctions();

    const view = await t.query(api.view.playerView, seat);
    expect(view.me.troops).toHaveLength(1);
    // Nobody ate during the hours of the queue: the reserve is the one the order left.
    expect(view.me.resources.food.stock).toBeCloseTo(1_000, 0);
  });
});
