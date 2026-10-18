import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { heldOver } from './holding';
import { regionFacts } from './regions';
import { STRATEGIC_POINT_KEYS } from '../src/domain/strategic-points';
import schema from './schema';
import { modules } from './test.setup';
import { foundSeat, joinSeat, placeHq, seatIn } from './seats.fixture';
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
