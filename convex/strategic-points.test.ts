import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { heldOver } from './holding';
import { distanceKm, type LonLat } from '../src/domain/geo';
import { COST_BY_MEDIUM } from '../src/domain/routing';
import { reassessDetection } from './movement/detection';
import { hostAtPoint } from './routes';
import { BAKU_REFUEL_MS, outpostReachKm } from './constants';
import { regionFacts } from './regions';
import { handOver } from './strategicPoints';
import { drawPoints } from '../src/domain/strategic-points';
import schema from './schema';
import { modules } from './test.setup';
import {
  foundSeat,
  holdPoint,
  joinSeat,
  placeHq,
  neutralPoint,
  seatIn,
  surveyCamp,
  TEST_SEASON_SEED,
} from './seats.fixture';
import type { Seat } from './seats.fixture';

/**
 * **Les points stratégiques** (P1-P12, ADR 0027 §4) : sept lieux réels, publics, posés neutres au
 * lancement d'une Mondiale. L'infanterie les capture comme un bâtiment ; le teneur les garde sans
 * garnison, et une capture contre lui s'arrête pendant sa plage de repos.
 */
const boot = () => convexTest({ schema, modules, transactionLimits: true });
type Bench = ReturnType<typeof boot>;
const MIDDAY = Date.UTC(2026, 9, 18, 12);
const HOUR = 3_600_000;
const NO_REST = { startMinutes: 0, endMinutes: 0 };

async function launched(t: Bench, mode: 'mondiale' | 'blitz' = 'mondiale') {
  const { seat, code } = await foundSeat(t, 'Pierre', 0.5);
  const guest = await joinSeat(t, code, 'Léa');
  for (const [who, nation] of [
    [seat, 'france'],
    [guest, 'ussr'],
  ] as const) {
    await t.mutation(api.players.reserveNation, { ...who, nation });
    await t.mutation(api.players.declareReady, { ...who, ready: true });
  }
  if (mode === 'blitz') {
    await t.run(async (ctx) =>
      ctx.db.patch((await seatIn(ctx, seat)).seasonId, { mode: 'blitz', theatre: 'europe' }),
    );
  }
  await t.mutation(api.seasons.launch, seat);
  if (mode === 'mondiale') {
    await placeHq(t, seat);
    await placeHq(t, guest);
  }
  return { seat, guest };
}

const pointsOf = (t: Bench) => t.run((ctx) => ctx.db.query('strategicPoints').collect());
const playerOf = (t: Bench, seat: Seat) => t.run((ctx) => seatIn(ctx, seat));
const pointCalled = (t: Bench, key: Doc<'strategicPoints'>['key']) =>
  t.run(async (ctx) => neutralPoint(ctx, (await ctx.db.query('seasons').first())!._id, key));

/** Une infanterie posée sur le point même, prête à le prendre : la marche est celle de tout
 *  ordre, ce qui se prouve ici est ce que la prise fait du point. */
async function postedAt(t: Bench, seat: Seat, point: Doc<'strategicPoints'>, role = 'infantry') {
  const player = await playerOf(t, seat);
  return t.run((ctx) =>
    ctx.db.insert('troops', {
      seasonId: player.seasonId,
      playerId: player._id,
      role: role as 'infantry',
      tier: 1,
      nominalStrength: 50,
      currentStrength: 50,
      stationedAt: { lon: point.point.lon + 0.3, lat: point.point.lat },
    }),
  );
}

/** Ordonne la capture, et laisse la colonne arriver : la capture s'ouvre à l'arrivée. */
async function capture(t: Bench, seat: Seat, troopId: Id<'troops'>, point: Doc<'strategicPoints'>) {
  const sent = await order(t, seat, troopId, point);
  vi.advanceTimersByTime(sent.minutes * 60_000);
  await t.finishInProgressScheduledFunctions();
  return sent;
}

const order = (t: Bench, seat: Seat, troopId: Id<'troops'>, point: Doc<'strategicPoints'>) =>
  t.mutation(api.movements.capture, {
    ...seat,
    origin: {
      kind: 'point',
      point: { lon: point.point.lon + 0.3, lat: point.point.lat },
    },
    troopIds: [troopId],
    target: { kind: 'point', pointId: point._id },
  });

const restOf = (t: Bench, seat: Seat, window: Doc<'players'>['restWindow']) =>
  t.run(async (ctx) => ctx.db.patch((await seatIn(ctx, seat))._id, { restWindow: window }));

describe('the seven points of a Mondiale', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  it('are laid out at the launch, all seven, neutral, and served to everyone', async () => {
    const t = boot();
    const { seat, guest } = await launched(t);

    const points = await pointsOf(t);
    const drawn = drawPoints(TEST_SEASON_SEED);
    expect(points.map((point) => point.key).sort()).toEqual([...drawn].sort());
    expect(points.every((point) => point.holderId === null)).toBe(true);
    for (const who of [seat, guest]) {
      const served = await t.query(api.view.playerView, who);
      expect(served.strategicPoints).toHaveLength(7);
      expect(
        served.strategicPoints.every((point) => point.holder === null && !point.contested),
      ).toBe(true);
      // The front page of day 0: everyone is told the Seven.
      expect(served.notices.filter((notice) => notice.kind === 'pointsDrawn')).toHaveLength(1);
    }
  });

  /** **Singapour sur son île** (#224) : la région se lit sur l'atlas, et non sur la cellule de
   *  Johor que la grille de 25 km lui prête. */
  it('lays Singapore in the island state, not on the shore of Johor', async () => {
    const t = boot();
    await launched(t);
    expect((await pointCalled(t, 'singapore')).regionId).toBe('SGP-4872');
  });

  it('are not laid out in a Blitz', async () => {
    const t = boot();
    await launched(t, 'blitz');
    expect(await pointsOf(t)).toEqual([]);
  });
});

describe('taking a strategic point', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  it('is done by infantry in six hours, held by its taker, coloured, and told to the table', async () => {
    const t = boot();
    const { seat, guest } = await launched(t);
    const lisbon = await pointCalled(t, 'lisbon');
    await capture(t, seat, await postedAt(t, seat, lisbon), lisbon);

    const [running] = await t.run((ctx) => ctx.db.query('captures').collect());
    expect(running).toBeDefined();
    const arrivedAt = running!.progressAt;
    expect(running!.completesAt - arrivedAt).toBe(6 * HOUR);
    // Contested for everyone, and by nobody named.
    const seen = (await t.query(api.view.playerView, guest)).strategicPoints;
    expect(seen.find((point) => point.key === 'lisbon')).toMatchObject({
      holder: null,
      contested: true,
    });

    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const taken = await pointCalled(t, 'lisbon');
    const me = await playerOf(t, seat);
    expect(taken.holderId).toBe(me._id);
    expect(taken.heldSince).toBe(running!.completesAt);
    const holder = await t.run(async (ctx) =>
      (await heldOver(ctx, me.seasonId, [regionFacts(lisbon.regionId)!], Date.now())).get(
        lisbon.regionId,
      ),
    );
    expect(holder).toBe(me._id);
    for (const who of [seat, guest]) {
      const player = await playerOf(t, who);
      const told = await t.run(async (ctx) =>
        (
          await ctx.db
            .query('notices')
            .withIndex('byPlayer', (q) => q.eq('playerId', player._id))
            .collect()
        ).filter((notice) => notice.kind === 'pointTaken'),
      );
      expect(told).toMatchObject([{ key: 'lisbon', nation: 'france' }]);
    }
  });

  it('wants infantry, and is not taken from oneself', async () => {
    const t = boot();
    const { seat } = await launched(t);
    const narvik = await pointCalled(t, 'narvik');
    await expect(order(t, seat, await postedAt(t, seat, narvik, 'armor'), narvik)).rejects.toThrow(
      'CAPTURE_NEEDS_INFANTRY',
    );
    await t.run((ctx) =>
      ctx.db.patch(narvik._id, { holderId: null, heldSince: null }).then(async () => {
        const me = (await ctx.db.query('players').collect()).find((p) => p.nation === 'france')!;
        await ctx.db.patch(narvik._id, { holderId: me._id, heldSince: MIDDAY });
      }),
    );
    await expect(order(t, seat, await postedAt(t, seat, narvik), narvik)).rejects.toThrow(
      'FRIENDLY_TARGET',
    );
  });

  it('stands still through its holder’s rest window, and warns him', async () => {
    const t = boot();
    const { seat, guest } = await launched(t);
    const narvik = await pointCalled(t, 'narvik');
    const holder = await playerOf(t, guest);
    await t.run((ctx) => ctx.db.patch(narvik._id, { holderId: holder._id, heldSince: MIDDAY }));
    // He sleeps through the whole afternoon the capture runs into.
    await restOf(t, guest, { startMinutes: 13 * 60, endMinutes: 20 * 60 });
    await restOf(t, seat, NO_REST);
    await capture(t, seat, await postedAt(t, seat, narvik), narvik);

    const [running] = await t.run((ctx) => ctx.db.query('captures').collect());
    expect(running!.defenderId).toBe(holder._id);
    expect(running!.completesAt - running!.progressAt).toBeGreaterThan(6 * HOUR);
    const alarms = await t.run(async (ctx) =>
      (
        await ctx.db
          .query('notices')
          .withIndex('byPlayer', (q) => q.eq('playerId', holder._id))
          .collect()
      ).filter((notice) => notice.kind === 'captureStarted'),
    );
    expect(alarms).toHaveLength(1);
  });
});

/**
 * **La victoire de la Mondiale** (M1, M4, M12) : quatre points tenus vingt-quatre heures
 * d'affilée prennent la saison ; à l'horloge, le cumul d'heures de points tenus, puis le
 * territoire.
 */
describe('winning the race', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  const give = (t: Bench, seat: Seat, keys: ReadonlyArray<Doc<'strategicPoints'>['key']>) =>
    t.run(async (ctx) => {
      const player = await seatIn(ctx, seat);
      for (const key of keys) {
        await handOver(ctx, await neutralPoint(ctx, seat.seasonId, key), player._id, Date.now());
      }
    });
  const seasonOf = (t: Bench) => t.run(async (ctx) => (await ctx.db.query('seasons').first())!);

  it('goes to whoever holds four points for a full day', async () => {
    const t = boot();
    const { seat } = await launched(t);
    await give(t, seat, ['lisbon', 'tangier', 'narvik']);
    expect((await seasonOf(t)).raceLeaderId).toBeUndefined();

    await give(t, seat, ['istanbul']);
    const racing = await seasonOf(t);
    expect(racing.raceLeaderId).toBe((await playerOf(t, seat))._id);
    expect(racing.raceSince).toBe(MIDDAY);
    expect((await t.query(api.view.playerView, seat)).season.race).toEqual({
      leaderNation: 'france',
      endsAt: MIDDAY + 24 * HOUR,
    });

    vi.setSystemTime(MIDDAY + 24 * HOUR);
    await t.mutation(internal.race.closeRace, { seasonId: racing._id, since: MIDDAY });
    const won = await seasonOf(t);
    expect(won.status).toBe('concluded');
    expect(won.winnerId).toBe((await playerOf(t, seat))._id);
    expect(won.verdict?.reason).toBe('points');
    // The countdown is gone with the race it counted.
    expect((await t.query(api.view.playerView, seat)).season.race).toBeNull();
  });

  /** **Qui dépose les armes sort de la course** : ses points redeviennent neutres, et un point
   *  que ses troupes prendraient encore ne compte pour personne. */
  it('drops a leader who surrenders, and counts no point for a defeated seat', async () => {
    const t = boot();
    const { seat, code } = await foundSeat(t, 'Pierre', 0.5);
    const guest = await joinSeat(t, code, 'Léa');
    const third = await joinSeat(t, code, 'Marc');
    for (const [who, nation] of [
      [seat, 'france'],
      [guest, 'ussr'],
      [third, 'germany'],
    ] as const) {
      await t.mutation(api.players.reserveNation, { ...who, nation });
      await t.mutation(api.players.declareReady, { ...who, ready: true });
    }
    await t.mutation(api.seasons.launch, seat);
    await give(t, seat, ['lisbon', 'tangier', 'narvik', 'istanbul']);
    expect((await seasonOf(t)).raceLeaderId).toBe((await playerOf(t, seat))._id);

    await t.mutation(api.players.surrender, seat);
    expect((await seasonOf(t)).raceLeaderId).toBeUndefined();
    expect((await pointsOf(t)).every((point) => point.holderId === null)).toBe(true);
    await give(t, seat, ['lisbon', 'tangier', 'narvik', 'istanbul']);
    expect((await seasonOf(t)).raceLeaderId).toBeUndefined();
  });

  it('restarts the countdown when the leader falls below four, and not before', async () => {
    const t = boot();
    const { seat, guest } = await launched(t);
    await give(t, seat, ['lisbon', 'tangier', 'narvik', 'istanbul']);

    vi.setSystemTime(MIDDAY + 10 * HOUR);
    await give(t, guest, ['narvik']);
    expect((await seasonOf(t)).raceLeaderId).toBeUndefined();

    vi.setSystemTime(MIDDAY + 24 * HOUR);
    const season = await seasonOf(t);
    await t.mutation(internal.race.closeRace, { seasonId: season._id, since: MIDDAY });
    expect((await seasonOf(t)).status).toBe('launched');
  });

  it('serves the hours its holder held a point before, to everyone', async () => {
    const t = boot();
    const { seat, guest } = await launched(t);
    await give(t, seat, ['narvik']);
    vi.setSystemTime(MIDDAY + 10 * HOUR);
    await give(t, guest, ['narvik']);
    vi.setSystemTime(MIDDAY + 12 * HOUR);
    await give(t, seat, ['narvik']);

    for (const who of [seat, guest]) {
      const narvik = (await t.query(api.view.playerView, who)).strategicPoints.find(
        (point) => point.key === 'narvik',
      );
      // Taken back at midnight: ten hours already his, and the clock runs again from now.
      expect(narvik?.holder).toEqual({ nation: 'france', heldMs: 10 * HOUR });
      expect(narvik?.heldSince).toBe(MIDDAY + 12 * HOUR);
    }
  });

  it('goes at the clock to the most hours of points held', async () => {
    const t = boot();
    const { seat, guest } = await launched(t);
    await give(t, seat, ['lisbon']);
    vi.setSystemTime(MIDDAY + 5 * HOUR);
    await give(t, guest, ['narvik', 'tangier']);

    const season = await seasonOf(t);
    const endsAt = season.launchedAt! + season.durationHours! * HOUR;
    vi.setSystemTime(endsAt);
    await t.mutation(internal.race.closeAtClock, { seasonId: season._id, expectedAt: endsAt });
    const over = await seasonOf(t);
    expect(over.status).toBe('concluded');
    // Two points from 17:00 outweigh one from noon over a week.
    expect(over.winnerId).toBe((await playerOf(t, guest))._id);
    expect(over.verdict?.reason).toBe('clock');
  });

  it('serves, once the season is over, who held each place the longest', async () => {
    const t = boot();
    const { seat, guest } = await launched(t);
    await give(t, seat, ['narvik', 'lisbon']);
    vi.setSystemTime(MIDDAY + 10 * HOUR);
    await give(t, guest, ['narvik']);
    const during = (await t.query(api.view.playerView, seat)).strategicPoints;
    expect(during.every((point) => point.longest === null)).toBe(true);

    const season = await seasonOf(t);
    const endsAt = season.launchedAt! + season.durationHours! * HOUR;
    vi.setSystemTime(endsAt - 2 * HOUR);
    await give(t, seat, ['narvik']);
    vi.setSystemTime(endsAt);
    await t.mutation(internal.race.closeAtClock, { seasonId: season._id, expectedAt: endsAt });
    vi.setSystemTime(endsAt + 5 * HOUR);

    const longest = new Map(
      (await t.query(api.view.playerView, guest)).strategicPoints.map((point) => [
        point.key,
        point.longest,
      ]),
    );
    // Counted to the end of the season, not to the hour one reads it.
    expect(longest.get('lisbon')).toEqual({ nation: 'france', heldMs: endsAt - MIDDAY });
    // Twelve hours in two stints lose to his one stint in between.
    expect(longest.get('narvik')).toEqual({
      nation: 'ussr',
      heldMs: endsAt - 2 * HOUR - (MIDDAY + 10 * HOUR),
    });
    const never = drawPoints(TEST_SEASON_SEED).find((key) => key !== 'narvik' && key !== 'lisbon')!;
    expect(longest.get(never)).toBeNull();
  });

  it('counts at the clock the hours of points held and lost', async () => {
    const t = boot();
    const { seat, guest } = await launched(t);
    await give(t, seat, ['narvik', 'tangier', 'istanbul']);
    const season = await seasonOf(t);
    const endsAt = season.launchedAt! + season.durationHours! * HOUR;
    vi.setSystemTime(season.launchedAt! + (endsAt - season.launchedAt!) * 0.6);
    await give(t, guest, ['narvik', 'tangier', 'istanbul']);

    vi.setSystemTime(endsAt);
    await t.mutation(internal.race.closeAtClock, { seasonId: season._id, expectedAt: endsAt });
    // Three points lost after 60 % of the season outweigh the same three for the last 40 %.
    expect((await seasonOf(t)).winnerId).toBe((await playerOf(t, seat))._id);
  });

  it('is scheduled at the length set in the lobby', async () => {
    const t = boot();
    await launched(t);
    const season = await seasonOf(t);
    const jobs = await t.run((ctx) => ctx.db.system.query('_scheduled_functions').collect());
    expect(
      jobs.some(
        (job) =>
          job.name.includes('closeAtClock') &&
          job.scheduledTime === season.launchedAt! + season.durationHours! * HOUR,
      ),
    ).toBe(true);
  });
});

/**
 * **Les règles que les Sept cassent** (P11). Narvik se lit dans `production.test.ts`, avec le
 * réseau qu'il casse ; les autres ici.
 */
describe('the rules the points break', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  const posted = async (
    t: Bench,
    seat: Seat,
    role: 'escort' | 'infantry' | 'armor' | 'landTransport',
    at: LonLat,
    fuel?: number,
  ) => {
    const player = await playerOf(t, seat);
    return t.run((ctx) =>
      ctx.db.insert('troops', {
        seasonId: player.seasonId,
        playerId: player._id,
        role,
        tier: 1,
        nominalStrength: 50,
        currentStrength: 50,
        stationedAt: { lon: at[0], lat: at[1] },
        ...(fuel === undefined ? {} : { fuel }),
      }),
    );
  };
  const sail = (t: Bench, seat: Seat, troopId: Id<'troops'>, from: LonLat, to: LonLat) =>
    t.mutation(api.movements.marchTo, {
      ...seat,
      origin: { kind: 'point', point: { lon: from[0], lat: from[1] } },
      troopIds: [troopId],
      point: { lon: to[0], lat: to[1] },
    });

  /** Lisbonne : vous lisez la nation de tout ce que vous relevez — et rien d'autre. */
  it('tells the holder of Lisbon the nation of a camp he sights, and nobody else', async () => {
    const t = boot();
    const { seat, guest } = await launched(t);
    const CAMP: LonLat = [24, 50];
    await posted(t, guest, 'infantry', CAMP);
    await surveyCamp(t, seat, { lon: CAMP[0], lat: CAMP[1] });
    const campsOf = async () => (await t.query(api.view.playerView, seat)).camps;
    expect((await campsOf())[0]).not.toHaveProperty('nation');

    await holdPoint(t, seat, 'lisbon');
    expect((await campsOf())[0]).toMatchObject({ nation: 'ussr' });
  });

  /** Rangoun : la fiche de la tournée dit « mi-portée » à son maître seul (la règle : `detection.test.ts`). */
  it('tells the holder of Rangoon his tour is sighted at half reach, while he holds it', async () => {
    const t = boot();
    const { seat } = await launched(t);
    const truck = await posted(t, seat, 'landTransport', FIELD);
    const base = await t.run(async (ctx) => {
      const player = await seatIn(ctx, seat);
      return ctx.db.insert('outposts', {
        seasonId: player.seasonId,
        playerId: player._id,
        point: { lon: FIELD[0], lat: FIELD[1] },
        hostCountry: 'ROU',
        level: 1,
        specialization: 'listening',
        foundedAt: Date.now(),
        disabledUntil: null,
        immuneUntil: null,
      });
    });
    await t.run((ctx) =>
      ctx.db.patch(truck, {
        tour: { base, stops: [], consigne: { ammunition: 0, oil: 0, coal: 0 }, next: 0 },
      }),
    );
    const tourOf = async () =>
      (await t.query(api.view.playerView, seat)).me.troops.find((one) => one.id === truck)?.tour;
    expect(await tourOf()).not.toHaveProperty('veiled');
    await holdPoint(t, seat, 'rangoon');
    expect(await tourOf()).toMatchObject({ veiled: true });
  });

  /** Rangoun change de main : seules les tournées de ses deux teneurs changent de portée, pour
   *  tous ceux qui les écoutent — un tiers compris. La relecture qui s'en tient à eux rend ce
   *  qu'une réévaluation entière rendrait (#171). */
  it('re-reads the tours of its two holders when Rangoon changes hands, for a third who listens too, and leaves a full pass nothing to change', async () => {
    const t = boot();
    const { seat, code } = await foundSeat(t, 'Pierre', 0.5);
    const guest = await joinSeat(t, code, 'Léa');
    const third = await joinSeat(t, code, 'Marc');
    for (const [who, nation] of [
      [seat, 'france'],
      [guest, 'ussr'],
      [third, 'germany'],
    ] as const) {
      await t.mutation(api.players.reserveNation, { ...who, nation });
      await t.mutation(api.players.declareReady, { ...who, ready: true });
    }
    await t.mutation(api.seasons.launch, seat);
    for (const who of [seat, guest, third]) await placeHq(t, who);
    const players = [await playerOf(t, seat), await playerOf(t, guest)];
    const listener = await playerOf(t, third);
    /** Chacun écoute d'un avant-poste, et la tournée de l'autre passe aux trois quarts de sa
     *  portée : vue à portée pleine, pas à mi-portée. Le tiers écoute aux deux mêmes endroits. */
    const reach = outpostReachKm(1);
    const ears: ReadonlyArray<LonLat> = [
      [24, 50],
      [20, 47],
    ];
    await t.run(async (ctx) => {
      for (const [k, player] of players.entries()) {
        const ear = ears[k]!;
        for (const playerId of [player._id, listener._id])
          await ctx.db.insert('outposts', {
            seasonId: player.seasonId,
            playerId,
            point: { lon: ear[0], lat: ear[1] },
            hostCountry: hostAtPoint(ear),
            level: 1,
            specialization: 'listening',
            foundedAt: Date.now() - 1,
            disabledUntil: null,
            immuneUntil: null,
          });
        const passed = ears[1 - k]!;
        const road: LonLat = [passed[0], passed[1] + (reach * 0.75) / 111.32];
        const from: LonLat = [road[0] - 2, road[1]];
        const to: LonLat = [road[0] + 2, road[1]];
        const base = await ctx.db.insert('outposts', {
          seasonId: player.seasonId,
          playerId: player._id,
          point: { lon: from[0], lat: from[1] },
          hostCountry: hostAtPoint(from),
          level: 1,
          specialization: 'relay',
          foundedAt: Date.now() - 1,
          disabledUntil: null,
          immuneUntil: null,
        });
        const truck = await ctx.db.insert('troops', {
          seasonId: player.seasonId,
          playerId: player._id,
          role: 'landTransport',
          tier: 1,
          nominalStrength: 50,
          currentStrength: 50,
          stationedAt: null,
          tour: { base, stops: [], consigne: { ammunition: 0, oil: 0, coal: 0 }, next: 0 },
        });
        const distanceUnits = distanceKm(from, to);
        await ctx.db.insert('movements', {
          seasonId: player.seasonId,
          playerId: player._id,
          type: 'march',
          fromBuildingId: null,
          target: { kind: 'point', point: { lon: to[0], lat: to[1] } },
          from: { lon: from[0], lat: from[1] },
          to: { lon: to[0], lat: to[1] },
          hostCountry: hostAtPoint(to),
          points: [
            { lon: from[0], lat: from[1] },
            { lon: to[0], lat: to[1] },
          ],
          legs: [{ medium: 'land', distanceUnits }],
          distanceUnits,
          costUnits: distanceUnits * COST_BY_MEDIUM.land,
          landCost: COST_BY_MEDIUM.land,
          troopIds: [truck],
          departedAt: Date.now(),
          arrivesAt: Date.now() + 3 * HOUR,
        });
      }
      await reassessDetection(ctx, seat.seasonId);
    });

    const ledger = () =>
      t.run(async (ctx) =>
        (await ctx.db.query('sightings').collect())
          .map((row) => JSON.stringify([row.movementId, row.playerId, row.from, row.to]))
          .sort(),
      );
    /** Les relevés encore ouverts de chacun : un par tournée adverse vue. */
    const seenBy = () =>
      t.run(async (ctx) => {
        const rows = await ctx.db.query('sightings').collect();
        return [...players, listener].map(
          (player) =>
            rows.filter((row) => row.playerId === player._id && row.to > Date.now()).length,
        );
      });
    const give = (holder: Id<'players'> | null) =>
      t.run(async (ctx) =>
        handOver(ctx, await neutralPoint(ctx, seat.seasonId, 'rangoon'), holder, Date.now()),
      );
    const fullPassChangesNothing = async () => {
      const relit = await ledger();
      await t.run((ctx) => reassessDetection(ctx, seat.seasonId));
      expect(await ledger()).toEqual(relit);
    };

    expect(await seenBy()).toEqual([1, 1, 2]);
    await give(players[0]!._id);
    expect(await seenBy()).toEqual([1, 0, 1]);
    await fullPassChangesNothing();
    await give(players[1]!._id);
    expect(await seenBy()).toEqual([0, 1, 1]);
    await fullPassChangesNothing();
    await give(null);
    expect(await seenBy()).toEqual([1, 1, 2]);
    await fullPassChangesNothing();
  });

  /** Halifax : un mouvement maritime à la fois ne prend pas de slot (ADR 0032). */
  it('lets the holder of Halifax sail one fleet at a time with every slot taken, and says so on his banner', async () => {
    const t = boot();
    const { seat } = await launched(t);
    const ATLANTIC: LonLat = [-30, 45];
    const FURTHER: LonLat = [-32, 46];
    const OTHER: LonLat = [-28, 44];
    const LOIRET: LonLat = [2.3, 47.9];
    const BEAUCE: LonLat = [1.6, 48.3];
    const { total } = (await t.query(api.view.playerView, seat)).me.slots;
    for (let rank = 0; rank < total; rank += 1) {
      await sail(t, seat, await posted(t, seat, 'infantry', LOIRET), LOIRET, BEAUCE);
    }
    const fleet = await posted(t, seat, 'escort', ATLANTIC);
    const second = await posted(t, seat, 'escort', OTHER);
    await expect(sail(t, seat, fleet, ATLANTIC, FURTHER)).rejects.toThrow('MOVEMENT_IN_FLIGHT');

    await holdPoint(t, seat, 'halifax');
    await sail(t, seat, fleet, ATLANTIC, FURTHER);
    const { slots } = (await t.query(api.view.playerView, seat)).me;
    expect(slots).toMatchObject({ used: total, maritime: 1, halifax: true });
    // The free place is taken: a second fleet at sea pays its slot like anyone.
    await expect(sail(t, seat, second, OTHER, FURTHER)).rejects.toThrow('MOVEMENT_IN_FLIGHT');
  });

  const FIELD: LonLat = [24, 50];
  const NEXT: LonLat = [25, 50];
  /** About six hundred kilometres east: two steps of fuel for a plain engine, one at Singapore. */
  const FAR: LonLat = [29.5, 50];
  const fuelOf = async (t: Bench, troopId: Id<'troops'>) =>
    t.run(async (ctx) => (await ctx.db.get(troopId))!.fuel);
  const troopOf = (t: Bench, seat: Seat, troopId: Id<'troops'>) =>
    t
      .query(api.view.playerView, seat)
      .then((view) => view.me.troops.find((one) => one.id === troopId));

  /** Bakou : un cran de plein toutes les 12 h, hors ancre, sans toucher au stock (ADR 0032). */
  it('gives the holder of Baku one step of fuel back every twelve hours on a stopped troop, and says when', async () => {
    const t = boot();
    const { seat } = await launched(t);
    const tank = await posted(t, seat, 'armor', FIELD, 0);
    await holdPoint(t, seat, 'baku');
    const before = (await t.query(api.view.playerView, seat)).me.resources.oil!.stock;
    // Not yet: the road is refused, and the sheet gives the hour of the next step.
    await expect(sail(t, seat, tank, FIELD, NEXT)).rejects.toThrow('NOT_ENOUGH_FUEL');
    expect((await troopOf(t, seat, tank))!.refuelAt).toBeCloseTo(MIDDAY + BAKU_REFUEL_MS, -1);

    vi.setSystemTime(new Date(MIDDAY + BAKU_REFUEL_MS + 1));
    expect((await troopOf(t, seat, tank))!.supplies).toMatchObject({ fuel: 1 });
    const asked = {
      ...seat,
      origin: { kind: 'point' as const, point: { lon: FIELD[0], lat: FIELD[1] } },
      troopIds: [tank],
      target: { kind: 'point' as const, point: { lon: NEXT[0], lat: NEXT[1] } },
      type: 'march' as const,
    };
    expect((await t.query(api.movements.preview, asked))!.fuel).toMatchObject({ short: null });
    await sail(t, seat, tank, FIELD, NEXT);
    // The step regained was paid for the road, and no oil left the personal board for it.
    expect(await fuelOf(t, tank)).toBe(0);
    expect(
      (await t.query(api.view.playerView, seat)).me.resources.oil!.stock,
    ).toBeGreaterThanOrEqual(before);
  });

  it('counts no step for the days a troop waited before its owner took Baku', async () => {
    const t = boot();
    const { seat } = await launched(t);
    const tank = await posted(t, seat, 'armor', FIELD, 0);
    vi.setSystemTime(new Date(MIDDAY + 3 * 24 * 3_600_000));
    await holdPoint(t, seat, 'baku');
    expect((await troopOf(t, seat, tank))!.supplies).toMatchObject({ fuel: 0 });
    vi.setSystemTime(new Date(MIDDAY + 3 * 24 * 3_600_000 + BAKU_REFUEL_MS + 1));
    expect((await troopOf(t, seat, tank))!.supplies).toMatchObject({ fuel: 1 });
  });

  it('writes what the former holder had earned when Baku changes hands', async () => {
    const t = boot();
    const { seat, guest } = await launched(t);
    const tank = await posted(t, seat, 'armor', FIELD, 0);
    await holdPoint(t, seat, 'baku');
    vi.setSystemTime(new Date(MIDDAY + 2 * BAKU_REFUEL_MS + 1));
    await holdPoint(t, seat, 'baku', guest);
    expect(await fuelOf(t, tank)).toBe(2);
    vi.setSystemTime(new Date(MIDDAY + 20 * BAKU_REFUEL_MS));
    expect((await troopOf(t, seat, tank))!.supplies).toMatchObject({ fuel: 2 });
  });

  it('restarts the clock of every troop of a column, passengers too, at its arrival', async () => {
    const t = boot();
    const { seat } = await launched(t);
    const truck = await posted(t, seat, 'landTransport', FIELD, 4);
    const rider = await posted(t, seat, 'infantry', FIELD);
    await t.mutation(api.movements.marchTo, {
      ...seat,
      origin: { kind: 'point', point: { lon: FIELD[0], lat: FIELD[1] } },
      troopIds: [truck, rider],
      point: { lon: NEXT[0], lat: NEXT[1] },
    });
    const fuelAts = await t.run(async (ctx) => [
      (await ctx.db.get(truck))!.fuelAt,
      (await ctx.db.get(rider))!.fuelAt,
    ]);
    expect(fuelAts[1]).toBeGreaterThan(MIDDAY);
    expect(fuelAts[1]).toBe(fuelAts[0]);
  });

  it('stops refuelling the moment Baku is lost', async () => {
    const t = boot();
    const { seat, guest } = await launched(t);
    const tank = await posted(t, seat, 'armor', FIELD, 0);
    await holdPoint(t, seat, 'baku');
    await holdPoint(t, seat, 'baku', guest);
    vi.setSystemTime(new Date(MIDDAY + 2 * BAKU_REFUEL_MS));
    await expect(sail(t, seat, tank, FIELD, NEXT)).rejects.toThrow('NOT_ENOUGH_FUEL');
  });

  /** Singapour : −20 % de plein pour les camions et les cargos, au cran près (ADR 0032). */
  it('takes a fifth off the fuel of a truck of the holder of Singapore, and tells him before the order', async () => {
    const t = boot();
    const { seat } = await launched(t);
    const truck = await posted(t, seat, 'landTransport', FIELD, 1);
    const tank = await posted(t, seat, 'armor', FIELD, 1);
    const preview = (troopId: Id<'troops'>) =>
      t.query(api.movements.preview, {
        ...seat,
        origin: { kind: 'point', point: { lon: FIELD[0], lat: FIELD[1] } },
        troopIds: [troopId],
        target: { kind: 'point', point: { lon: FAR[0], lat: FAR[1] } },
        type: 'march',
      });
    // Two steps asked, one held: refused, for both.
    expect((await preview(truck))!.fuel).toMatchObject({
      gauge: { held: 1, eaten: 2, spared: 0, short: 1 },
      eased: null,
    });
    await expect(sail(t, seat, truck, FIELD, FAR)).rejects.toThrow('NOT_ENOUGH_FUEL');

    await holdPoint(t, seat, 'singapore');
    expect((await preview(truck))!.fuel).toMatchObject({
      gauge: { held: 1, eaten: 1, spared: 1, short: 0 },
      short: null,
      eased: { from: 2, to: 1 },
    });
    // The rule is for trucks and cargos: a tank still pays its road in full.
    expect((await preview(tank))!.fuel).toMatchObject({
      gauge: { eaten: 2, spared: 0 },
      eased: null,
    });
    await sail(t, seat, truck, FIELD, FAR);
    expect(await fuelOf(t, truck)).toBe(0);
    await expect(sail(t, seat, tank, FIELD, FAR)).rejects.toThrow('NOT_ENOUGH_FUEL');
  });

  /** Istanbul : une fois par jour, le dernier télégramme privé entre deux joueurs. */
  it('lets the holder of Istanbul read the last private telegram between two others, once a day', async () => {
    const t = boot();
    const { seat, code } = await foundSeat(t, 'Pierre', 0.5);
    const guest = await joinSeat(t, code, 'Léa');
    const third = await joinSeat(t, code, 'Marc');
    for (const [who, nation] of [
      [seat, 'france'],
      [guest, 'ussr'],
      [third, 'germany'],
    ] as const) {
      await t.mutation(api.players.reserveNation, { ...who, nation });
      await t.mutation(api.players.declareReady, { ...who, ready: true });
    }
    await t.mutation(api.seasons.launch, seat);
    const marc = await playerOf(t, third);
    const lea = await playerOf(t, guest);
    await t.mutation(api.messages.post, { ...guest, text: 'on frappe à l’aube', to: marc._id });
    vi.setSystemTime(MIDDAY + 2_000);
    await t.mutation(api.messages.post, { ...third, text: 'compris', to: lea._id });

    const listen = () =>
      t.mutation(api.strategicPoints.listen, { ...seat, between: ['ussr', 'germany'] });
    await expect(listen()).rejects.toThrow('POINT_NOT_HELD');
    await holdPoint(t, seat, 'istanbul');
    expect(await listen()).toMatchObject({ from: 'germany', to: 'ussr', text: 'compris' });
    await expect(listen()).rejects.toThrow('POWER_SPENT');

    const stamped = (await t.query(api.messages.recent, guest)).direct.find(
      (channel) => channel.with === marc._id,
    );
    expect(stamped!.messages.map((message) => message.readAtIstanbul)).toEqual([false, true]);

    vi.setSystemTime(MIDDAY + 25 * HOUR);
    await expect(listen()).resolves.not.toBeNull();
  });

  /** Tanger : vous seul commercez avec le comptoir neutre, trois contre un, une fois par édition. */
  it('lets the holder of Tangier trade three for one at the counter, once an edition', async () => {
    const t = boot();
    const { seat, guest } = await launched(t);
    const me = await playerOf(t, seat);
    const lea = await playerOf(t, guest);
    await t.run(async (ctx) => {
      for (const row of await ctx.db.query('resources').collect()) {
        if (row.playerId !== me._id && row.playerId !== lea._id) continue;
        await ctx.db.patch(row._id, { stock: row.key === 'food' ? 400 : 0, updatedAt: Date.now() });
      }
    });
    const trade = () =>
      t.mutation(api.strategicPoints.trade, { ...seat, give: 'food', get: 'ammunition' });
    await expect(trade()).rejects.toThrow('POINT_NOT_HELD');
    await holdPoint(t, seat, 'tangier');
    await t.run(async (ctx) => {
      const row = (
        await ctx.db
          .query('resources')
          .withIndex('byPlayer', (q) => q.eq('playerId', me._id))
          .collect()
      ).find((one) => one.key === 'ammunition')!;
      await ctx.db.patch(row._id, { stock: 400 });
    });
    // Full stocks: the counter takes nothing, and the rule is not spent.
    await expect(trade()).rejects.toThrow('STORAGE_FULL');
    await t.run(async (ctx) => {
      const row = (
        await ctx.db
          .query('resources')
          .withIndex('byPlayer', (q) => q.eq('playerId', me._id))
          .collect()
      ).find((one) => one.key === 'ammunition')!;
      await ctx.db.patch(row._id, { stock: 0 });
    });
    expect(await trade()).toEqual({ gave: 300, got: 100 });
    await expect(trade()).rejects.toThrow('POWER_SPENT');
    // A new holder does not inherit the counter spent.
    await holdPoint(t, guest, 'tangier');
    await expect(
      t.mutation(api.strategicPoints.trade, { ...guest, give: 'food', get: 'ammunition' }),
    ).resolves.toEqual({ gave: 300, got: 100 });
    const stocks = (await t.query(api.view.playerView, seat)).me.resources;
    expect(stocks.food.stock).toBeLessThanOrEqual(100);
    expect(stocks.ammunition.stock).toBeGreaterThanOrEqual(100);
  });
});

/**
 * **Hong Kong** : son teneur lit la dépêche de chaque capture d'un point, avec qui l'a pris et à
 * qui — rien de plus que la capture, que toute la table lit déjà ; la règle s'éteint à la perte.
 */
describe('Hong Kong', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  const told = (t: Bench, seat: Seat) =>
    t.run(async (ctx) => {
      const player = await seatIn(ctx, seat);
      return (
        await ctx.db
          .query('notices')
          .withIndex('byPlayer', (q) => q.eq('playerId', player._id))
          .collect()
      ).filter((notice) => notice.kind === 'pointTaken');
    });

  it('tells its holder who took a point, and from whom, wherever it is', async () => {
    const t = boot();
    const { seat, guest } = await launched(t);
    await holdPoint(t, guest, 'hongKong');
    const lisbon = await holdPoint(t, guest, 'lisbon');
    const point = await pointCalled(t, 'lisbon');
    expect(lisbon).toBe(point._id);
    await capture(t, seat, await postedAt(t, seat, point), point);
    vi.advanceTimersByTime(7 * HOUR);
    await t.finishInProgressScheduledFunctions();

    expect(await told(t, guest)).toMatchObject([
      { key: 'lisbon', nation: 'france', hongKong: true, from: 'ussr' },
    ]);
    // The taker reads the plain public dispatch, no more.
    const plain = await told(t, seat);
    expect(plain).toMatchObject([{ key: 'lisbon', nation: 'france' }]);
    expect(plain[0]).not.toHaveProperty('hongKong');
    expect(plain[0]).not.toHaveProperty('from');
  });

  it('says a point was neutral when nobody held it, and stops with the point', async () => {
    const t = boot();
    const { seat, guest } = await launched(t);
    await holdPoint(t, guest, 'hongKong');
    const narvik = await pointCalled(t, 'narvik');
    await capture(t, seat, await postedAt(t, seat, narvik), narvik);
    vi.advanceTimersByTime(7 * HOUR);
    await t.finishInProgressScheduledFunctions();
    const [first] = await told(t, guest);
    expect(first).toMatchObject({ key: 'narvik', hongKong: true });
    expect(first).not.toHaveProperty('from');

    // Hong Kong falls to the other side: Lisbon's capture is no longer read by its old holder.
    await holdPoint(t, seat, 'hongKong');
    const lisbon = await pointCalled(t, 'lisbon');
    await capture(t, seat, await postedAt(t, seat, lisbon), lisbon);
    vi.advanceTimersByTime(7 * HOUR);
    await t.finishInProgressScheduledFunctions();
    expect((await told(t, guest)).filter((notice) => 'hongKong' in notice)).toHaveLength(1);
  });
});
