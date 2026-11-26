import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import type { UnitRole } from '../src/domain/ids';
import { distanceKm } from '../src/domain/geo';
import { nominalStrength } from './constants';
import schema from './schema';
import { modules } from './test.setup';
import {
  foundSeat,
  joinSeat,
  placeHq,
  seatIn,
  surveyCamp,
  type Seat,
  unclocked,
} from './seats.fixture';

/** **La poursuite portée en Mondiale** (#655) : une attaque sur un fil en vue le suit, frappe au
 *  contact comme toute attaque, et abandonne là où elle est quand le fil sort de la vue. */
const boot = () => convexTest({ schema, modules, transactionLimits: true });
type Bench = ReturnType<typeof boot>;
const MIDDAY = Date.UTC(2026, 9, 14, 12);

async function mondiale(t: Bench) {
  const { seat, code } = await foundSeat(t, 'Pierre', 0.5);
  const guest = await joinSeat(t, code, 'Léa');
  await t.mutation(api.players.reserveNation, { ...seat, nation: 'france' });
  await t.mutation(api.players.declareReady, { ...seat, ready: true });
  await t.mutation(api.players.reserveNation, { ...guest, nation: 'germany' });
  await t.mutation(api.players.declareReady, { ...guest, ready: true });
  await t.mutation(api.seasons.launch, seat);
  await unclocked(t);
  await placeHq(t, seat);
  await placeHq(t, guest);
  return { seat, guest };
}

async function troop(
  t: Bench,
  seat: Seat,
  stationedAt: { lon: number; lat: number },
  role: UnitRole = 'infantry',
) {
  const player = await t.run((ctx) => seatIn(ctx, seat));
  const strength = nominalStrength(role, 1);
  return t.run((ctx) =>
    ctx.db.insert('troops', {
      seasonId: player.seasonId,
      playerId: player._id,
      role,
      tier: 1,
      nominalStrength: strength,
      currentStrength: strength,
      stationedAt,
    }),
  );
}

const movementOf = (t: Bench, troopId: Id<'troops'>) =>
  t.run(
    async (ctx) =>
      (await ctx.db.query('movements').collect()).find((one) => one.troopIds.includes(troopId)) ??
      null,
  );

/** Each look of every pursuit, in date order, until none is left; how many looks it took. */
async function runPursuits(t: Bench): Promise<number> {
  for (let step = 0; step < 200; step += 1) {
    const pending = (await t.run((ctx) => ctx.db.query('movements').collect()))
      .flatMap((one) => (one.pursuit === undefined ? [] : [one]))
      .sort((a, b) => a.pursuit!.checkAt - b.pursuit!.checkAt);
    const next = pending[0];
    if (next === undefined) return step;
    vi.setSystemTime(next.pursuit!.checkAt);
    await t.mutation(internal.movements.pursue, {
      movementId: next._id,
      expectedAt: next.pursuit!.checkAt,
    });
  }
  throw new Error('a pursuit that never ends');
}

/** The arc of the guest's column as the seat's board serves it. */
async function trackOf(t: Bench, seat: Seat): Promise<Id<'movements'>> {
  const board = await t.query(api.view.playerView, seat);
  const arc = board.detected?.find((seen) => seen.seenTo >= Date.now());
  if (arc === undefined) throw new Error('no column in sight');
  return arc.id as Id<'movements'>;
}

const noticesOf = (t: Bench, seat: Seat) =>
  t.run(async (ctx) => {
    const player = await seatIn(ctx, seat);
    return ctx.db
      .query('notices')
      .withIndex('byPlayer', (q) => q.eq('playerId', player._id))
      .collect();
  });

describe('a pursuit in a Mondiale (#655)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  it('chases a column in sight, looks at the pace of a Mondiale, and strikes it whole', async () => {
    const t = boot();
    const { seat, guest } = await mondiale(t);
    const from = { lon: 6.0, lat: 50.6 };
    const theirs = [await troop(t, guest, from), await troop(t, guest, from)];
    const at = { lon: 6.2, lat: 50.9 };
    const ours = await troop(t, seat, at, 'armor');
    await t.mutation(api.movements.marchTo, {
      ...guest,
      origin: { kind: 'point', point: from },
      troopIds: theirs,
      point: { lon: 9.0, lat: 50.6 },
    });
    await t.mutation(api.movements.attack, {
      ...seat,
      origin: { kind: 'point', point: at },
      troopIds: [ours],
      target: { kind: 'track', movementId: await trackOf(t, seat) },
    });
    const chase = await movementOf(t, ours);
    expect(chase?.pursuit?.troopId).toBe(theirs[0]);
    /** Un regard toutes les dix minutes, pas toutes les quinze secondes de la Blitz. */
    expect(chase!.pursuit!.checkAt - MIDDAY).toBeGreaterThan(15_000);

    await runPursuits(t);
    const [engagement] = await t.run((ctx) => ctx.db.query('engagements').collect());
    expect(engagement).toBeDefined();
    /** **Comme toute attaque** : toute la colonne se défend, pas sa seule tête. */
    const defended = new Set(
      engagement!.troops.filter((one) => one.side === 'defender').map((one) => one.troopId),
    );
    for (const id of theirs) expect(defended.has(id)).toBe(true);
    /** Et qui tient encore debout rentre, comme après tout assaut de Mondiale. */
    expect(await movementOf(t, ours)).toMatchObject({ type: 'return' });
  });

  it('gives up where it stands when the column leaves its sight, and says so', async () => {
    const t = boot();
    const { seat, guest } = await mondiale(t);
    const from = { lon: 13.4, lat: 52.5 };
    const theirs = await troop(t, guest, from);
    /** Un guetteur près de Berlin la voit à l'ordre, puis tombe : la cible sort de la vue. */
    const spotter = await troop(t, seat, { lon: 13.6, lat: 52.6 });
    const paris = { lon: 2.35, lat: 48.85 };
    const hunter = await troop(t, seat, paris);
    await t.mutation(api.movements.marchTo, {
      ...guest,
      origin: { kind: 'point', point: from },
      troopIds: [theirs],
      point: { lon: 18.0, lat: 52.4 },
    });
    await t.mutation(api.movements.attack, {
      ...seat,
      origin: { kind: 'point', point: paris },
      troopIds: [hunter],
      target: { kind: 'track', movementId: await trackOf(t, seat) },
    });
    const chase = (await movementOf(t, hunter))!;
    await t.run((ctx) => ctx.db.delete(spotter));
    await runPursuits(t);

    expect(await movementOf(t, hunter)).toBeNull();
    const stood = (await t.run((ctx) => ctx.db.get(hunter)))!.stationedAt as {
      lon: number;
      lat: number;
    };
    /** Là où elle est : sortie de Paris, loin du bout de sa route. */
    expect(distanceKm([stood.lon, stood.lat], [paris.lon, paris.lat])).toBeGreaterThan(1);
    expect(distanceKm([stood.lon, stood.lat], [chase.to.lon, chase.to.lat])).toBeGreaterThan(100);
    expect((await noticesOf(t, seat)).some((notice) => notice.kind === 'pursuitLost')).toBe(true);
  });

  it('arms a pursuit on the bench, one rendezvous each', async () => {
    const t = boot();
    const { seat, guest } = await mondiale(t);
    const from = { lon: 6.0, lat: 50.6 };
    const theirs = await troop(t, guest, from);
    const at = { lon: 6.2, lat: 50.9 };
    const ours = await troop(t, seat, at);
    await t.mutation(api.movements.marchTo, {
      ...guest,
      origin: { kind: 'point', point: from },
      troopIds: [theirs],
      point: { lon: 9.0, lat: 50.6 },
    });
    const player = await t.run((ctx) => seatIn(ctx, seat));
    const armed = await t.mutation(internal.dev.benchPursuits, {
      playerId: player._id,
      from: at,
      ids: [ours],
    });
    expect(armed).toHaveLength(1);
    const jobs = await t.run((ctx) => ctx.db.system.query('_scheduled_functions').collect());
    expect(
      jobs.filter((job) => job.name.includes('pursue') && job.state.kind === 'pending'),
    ).toHaveLength(1);
  });

  /** Décision de Pierre du 26/11 : une Guerre éclair ne prend pas une colonne poursuivie. */
  it('refuses a Guerre éclair whose first target is a column it chases', async () => {
    const t = boot();
    const { seat, guest } = await mondiale(t);
    const from = { lon: 6.2, lat: 50.9 };
    const ours = await troop(t, seat, from);
    const at = { lon: 6.0, lat: 50.6 };
    const tanks = await troop(t, guest, at, 'armor');
    await t.mutation(api.movements.marchTo, {
      ...seat,
      origin: { kind: 'point', point: from },
      troopIds: [ours],
      point: { lon: 3.5, lat: 50.9 },
    });
    await expect(
      t.mutation(api.movements.attack, {
        ...guest,
        origin: { kind: 'point', point: at },
        troopIds: [tanks],
        target: { kind: 'track', movementId: await trackOf(t, guest) },
        then: { kind: 'point', point: { lon: 5.6, lat: 50.6 } },
      }),
    ).rejects.toThrow(/CHAIN_POSITION_ONLY/);
    expect(await movementOf(t, tanks)).toBeNull();
  });

  it('aims at a camp posed in sight as at a position, as before', async () => {
    const t = boot();
    const { seat, guest } = await mondiale(t);
    const camp = { lon: 6.0, lat: 50.6 };
    await troop(t, guest, camp);
    const campId = await surveyCamp(t, seat, camp);
    const at = { lon: 6.2, lat: 50.9 };
    const ours = await troop(t, seat, at);
    await t.mutation(api.movements.attack, {
      ...seat,
      origin: { kind: 'point', point: at },
      troopIds: [ours],
      target: { kind: 'camp', campId },
    });
    expect((await movementOf(t, ours))?.pursuit).toBeUndefined();
  });
});
