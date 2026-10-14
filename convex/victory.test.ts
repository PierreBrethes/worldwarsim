import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import type { LonLat } from '../src/domain/geo';
import { regionFacts } from './regions';
import schema from './schema';
import { modules } from './test.setup';
import { attacking, foundSeat, joinSeat, seatIn, surveyCamp } from './seats.fixture';
import type { Seat } from './seats.fixture';

/**
 * **The test victory — scaffolding under test, not a design decision** (`src/domain/victory.ts`).
 * What these cases pin down is the awkward half of the rule: a count read at the instant, so a
 * player who rebuilds walks out of his executioner's tally, and a concluded season that still
 * reads but no longer plays.
 */

const boot = () => convexTest({ schema, modules, transactionLimits: true });

const MARNE = 'FRA-5323'; // where the French barracks stands
const PRAHOVA = 'ROU-310'; // Romanian, nobody's home country — where the point is planted

/** Away from anyone's rest window, so nothing stalls at a border. */
const MIDDAY = new Date(2026, 7, 17, 12, 0, 0);

const NATIONS = ['france', 'ussr', 'germany', 'japan'] as const;

async function launchedSeason(t: ReturnType<typeof boot>, players: number) {
  const { seat, code } = await foundSeat(t, 'Pierre', 0.5);
  const seats = [seat];
  for (let rank = 1; rank < players; rank += 1) {
    seats.push(await joinSeat(t, code, `Joueur ${rank}`));
  }
  for (const [rank, seated] of seats.entries()) {
    await t.mutation(api.players.reserveNation, { ...seated, nation: NATIONS[rank]! });
    await t.mutation(api.players.declareReady, { ...seated, ready: true });
  }
  await t.mutation(api.seasons.launch, seat);
  await disbandTheGift(t, ...seats);
  return seats;
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

async function raise(t: ReturnType<typeof boot>, seat: Seat, regionId: string) {
  const playerId = await playerOf(t, seat);
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
  seat: Seat,
  stationedAt: Id<'buildings'> | Id<'outposts'> | null,
): Promise<Id<'troops'>> {
  const playerId = await playerOf(t, seat);
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
async function post(t: ReturnType<typeof boot>, seat: Seat, point: LonLat) {
  const playerId = await playerOf(t, seat);
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

async function plant(t: ReturnType<typeof boot>, seat: Seat, point: LonLat) {
  const playerId = await playerOf(t, seat);
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
async function overrun(t: ReturnType<typeof boot>, attacker: Seat, victim: Seat) {
  const barracks = await raise(t, attacker, MARNE);
  /** Deux colonnes, pas trois : la déroute ne se lit qu'une fois la passe finie, donc une
   *  troisième frappe achèverait le défenseur au lieu de le casser — et un joueur sans une seule
   *  troupe debout ne peut plus rien reconstruire. La seconde part entamée pour la même raison :
   *  à pleine force les deux frappes l'effacent tout juste. */
  const column = [await form(t, attacker, barracks), await form(t, attacker, barracks)];
  await t.run(async (ctx) => ctx.db.patch(column[1]!, { currentStrength: 30 }));
  const outpost = await plant(t, victim, regionFacts(PRAHOVA)!.point);
  await form(t, victim, outpost);

  await attacking(t, {
    ...attacker,
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
    expect((await t.query(api.view.playerView, victim!)).season.reduction.winnerNation).toBe(
      'france',
    );
    const board = await t.query(api.victory.board, victim!);
    expect(board.target).toBe(1);
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
    const targetNow = async () => (await t.query(api.victory.board, creator!)).target;
    expect(await targetNow()).toBe(1);

    const { code } = await seasonOf(t);
    const late = await joinSeat(t, code, 'Tard');
    expect(await targetNow()).toBe(1);

    await t.mutation(api.players.reserveNation, { ...late, nation: 'japan' });
    await t.mutation(api.seasons.enterWar, late);
    expect(await targetNow()).toBe(2);
  });

  /**
   * **La saison se gagne sur un ordre, et sur rien d'autre** (ADR 0024 §3, révision de l'ADR
   * 0019 §3). Un camp gagnait autrefois la passe qu'une marche imprudente lui amenait, et son
   * maître avançait sa condition en dormant. L'embuscade automatique est retirée : ce qui réduit
   * un joueur est désormais l'assaut que quelqu'un a voulu — et la riposte du camp, elle, reste
   * automatique, parce qu'un absent n'est jamais sans défense.
   */
  it('credits the assault somebody ordered, never a pass nobody wanted', async () => {
    const t = boot();
    const [attacker, camper] = await launchedSeason(t, 2);
    const point = regionFacts(PRAHOVA)!.point;
    const camped = await post(t, camper!, point);
    await t.run(async (ctx) => ctx.db.patch(camped, { currentStrength: 30 }));

    const barracks = await raise(t, attacker!, MARNE);
    const column = await form(t, attacker!, barracks);
    const campId = await surveyCamp(t, attacker!, { lon: point[0], lat: point[1] });

    await attacking(t, {
      ...attacker!,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [column],
      target: { kind: 'camp', campId },
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const [engagement] = await t.run(async (ctx) => ctx.db.query('engagements').collect());
    expect(engagement!.attackerId).toBe(await playerOf(t, attacker!));
    expect(engagement!.reducedDefender).toBe(true);

    const season = await seasonOf(t);
    expect(season.status).toBe('concluded');
    expect(season.winnerId).toBe(await playerOf(t, attacker!));
  });

  /** **Une marche ne réduit personne** : elle s'arrête à côté du camp, et il ne se passe rien. */
  it('leaves a march that stops beside a camp without a pass at all', async () => {
    const t = boot();
    const [walker, camper] = await launchedSeason(t, 2);
    const point = regionFacts(PRAHOVA)!.point;
    await post(t, camper!, point);

    const barracks = await raise(t, walker!, MARNE);
    const worn = await form(t, walker!, barracks);
    await t.run(async (ctx) => ctx.db.patch(worn, { currentStrength: 30 }));

    await t.mutation(api.movements.marchTo, {
      ...walker!,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [worn],
      point: { lon: point[0], lat: point[1] },
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(await t.run(async (ctx) => ctx.db.query('engagements').collect())).toEqual([]);
    expect((await seasonOf(t)).status).toBe('launched');
  });

  it('lets a player who rebuilds over the bar leave his executioner’s count', async () => {
    const t = boot();
    // Four seats, so the target is two: one reduction is not a season, and the count stays
    // readable while it moves.
    const [attacker, victim] = await launchedSeason(t, 4);
    await overrun(t, attacker!, victim!);

    const tallyOf = async () => {
      const board = await t.query(api.victory.board, attacker!);
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
    const board = await t.query(api.victory.board, attacker!);
    expect(board.target).toBe(2);
    expect(board.standings.find((seat) => seat.nation === 'ussr')!.isReduced).toBe(false);
  });

  /**
   * **Le dernier coup est celui qui compte** : un joueur mis sous la barre par deux mains
   * différentes appartient à la seconde, sans quoi un coup porté le mardi paierait toute la
   * saison et deux joueurs tiendraient le même scalp.
   */
  it('gives the scalp to the hand of the last blow, not the first', async () => {
    const t = boot();
    const [first, victim, second] = await launchedSeason(t, 4);
    await overrun(t, first!, victim!);

    const [opening] = await t.run(async (ctx) => ctx.db.query('engagements').collect());
    const secondId = await playerOf(t, second!);
    await t.run(async (ctx) => {
      const { _id, _creationTime, ...blow } = opening!;
      void _id;
      void _creationTime;
      await ctx.db.insert('engagements', {
        ...blow,
        attackerId: secondId,
        at: opening!.at + 60_000,
        reducedDefender: true,
      });
    });

    const reducedBy = async (nation: string) => {
      const board = await t.query(api.victory.board, first!);
      return board.standings.find((seat) => seat.nation === nation)!.reduced;
    };
    expect(await reducedBy('germany')).toBe(1);
    expect(await reducedBy('france')).toBe(0);
  });

  /** **La cible d'un bombardement ne sait pas d'où vient le coup** (B20, A3) — pas même par la
   *  dépêche de réduction, qui nommait le tireur. */
  it('names the hand of a bombardment to the gunner only', async () => {
    const t = boot();
    const [attacker, victim] = await launchedSeason(t, 2);
    await overrun(t, attacker!, victim!);
    const [engagement] = await t.run(async (ctx) => ctx.db.query('engagements').collect());
    await t.run((ctx) => ctx.db.patch(engagement!._id, { cause: 'bombardment' }));

    const reducedOf = async (seat: typeof attacker) =>
      (await t.query(api.view.playerView, seat!)).reports.find(
        (report) => report.id === engagement!._id,
      )!.reduced;
    expect(await reducedOf(attacker)).toEqual({ by: 'france', whom: expect.any(String) });
    expect((await reducedOf(victim))!.by).toBeNull();
  });

  it('reads a concluded season and plays nothing on it', async () => {
    const t = boot();
    const [attacker, victim] = await launchedSeason(t, 2);
    await overrun(t, attacker!, victim!);
    expect((await seasonOf(t)).status).toBe('concluded');

    // The board still answers: the wipe is manual, and one reads the game back before erasing it.
    const view = await t.query(api.view.playerView, victim!);
    expect(view.season.reduction.winnerNation).toBe('france');
    expect(view.journal ?? []).toBeDefined();

    const barracks = await raise(t, victim!, MARNE);
    const troop = await form(t, victim!, barracks);

    await expect(
      attacking(t, {
        ...victim!,
        origin: { kind: 'building', buildingId: barracks },
        troopIds: [troop],
        target: { kind: 'region', regionId: PRAHOVA },
      }),
    ).rejects.toThrow('SEASON_CONCLUDED');

    await expect(
      t.mutation(api.constructions.start, { ...victim!, building: 'farm', regionId: MARNE }),
    ).rejects.toThrow('SEASON_CONCLUDED');

    await expect(
      t.mutation(api.troops.recruit, {
        ...victim!,
        buildingId: barracks,
        role: 'infantry',
        tier: 1,
      }),
    ).rejects.toThrow('SEASON_CONCLUDED');
  });
});
