import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { heldOver } from './holding';
import type { LonLat } from '../src/domain/geo';
import { regionFacts } from './regions';
import { handOver } from './strategicPoints';
import { STRATEGIC_POINT_KEYS } from '../src/domain/strategic-points';
import schema from './schema';
import { modules } from './test.setup';
import { foundSeat, joinSeat, placeHq, seatIn, surveyCamp } from './seats.fixture';
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
const pointCalled = async (t: Bench, key: Doc<'strategicPoints'>['key']) =>
  (await pointsOf(t)).find((point) => point.key === key)!;

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
    expect(points.map((point) => point.key).sort()).toEqual([...STRATEGIC_POINT_KEYS].sort());
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
      for (const point of await ctx.db.query('strategicPoints').collect()) {
        if (keys.includes(point.key)) await handOver(ctx, point, player._id, Date.now());
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
    expect(longest.get('tangier')).toBeNull();
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

  const holdPoint = (t: Bench, seat: Seat, key: Doc<'strategicPoints'>['key']) =>
    t.run(async (ctx) => {
      const player = await seatIn(ctx, seat);
      const point = (await ctx.db.query('strategicPoints').collect()).find((p) => p.key === key)!;
      await ctx.db.patch(point._id, { holderId: player._id, heldSince: Date.now() });
    });
  const posted = async (t: Bench, seat: Seat, role: 'escort' | 'infantry', at: LonLat) => {
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

  /** Halifax : vos mouvements maritimes ne prennent pas de slot. */
  it('lets the holder of Halifax sail with every slot taken, and counts no fleet on his banner', async () => {
    const t = boot();
    const { seat } = await launched(t);
    const ATLANTIC: LonLat = [-30, 45];
    const FURTHER: LonLat = [-32, 46];
    const LOIRET: LonLat = [2.3, 47.9];
    const BEAUCE: LonLat = [1.6, 48.3];
    const { total } = (await t.query(api.view.playerView, seat)).me.slots;
    for (let rank = 0; rank < total; rank += 1) {
      await sail(t, seat, await posted(t, seat, 'infantry', LOIRET), LOIRET, BEAUCE);
    }
    const fleet = await posted(t, seat, 'escort', ATLANTIC);
    await expect(sail(t, seat, fleet, ATLANTIC, FURTHER)).rejects.toThrow('MOVEMENT_IN_FLIGHT');

    await holdPoint(t, seat, 'halifax');
    await sail(t, seat, fleet, ATLANTIC, FURTHER);
    expect((await t.query(api.view.playerView, seat)).me.slots.used).toBe(total);
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
