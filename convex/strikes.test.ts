import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import type { BuildingKey, UnitRole } from '../src/domain/ids';
import {
  BUILDING_DISABLED_HOURS,
  BUILDING_IMMUNITY_HOURS,
  DAMAGED_HOURS,
  nominalStrength,
} from './constants';
import { push } from '../src/domain/push';
import { sparedPerResourceOf } from '../src/domain/loot';
import { capitalRegionOf, pointOfRegion, regionFacts } from './regions';
import schema from './schema';
import { fileSurvey } from './surveys';
import { onMission } from './movement/course';
import { modules } from './test.setup';
import { foundSeat, holdPoint, joinSeat, placeHq, pointIn, seatIn } from './seats.fixture';
import type { Seat } from './seats.fixture';

const boot = () => convexTest({ schema, modules, transactionLimits: true });
const HOUR = 3_600_000;
const MIDDAY = new Date(2026, 10, 25, 12, 0, 0).getTime();
const MARNE = 'FRA-5323';
const RUHR = 'DEU-1572';

async function launchedSeason(t: ReturnType<typeof boot>) {
  const { seat, code } = await foundSeat(t, 'Pierre', 0.5);
  const guest = await joinSeat(t, code, 'Léa');
  await t.mutation(api.players.reserveNation, { ...seat, nation: 'france' });
  await t.mutation(api.players.declareReady, { ...seat, ready: true });
  await t.mutation(api.players.reserveNation, { ...guest, nation: 'ussr' });
  await t.mutation(api.players.declareReady, { ...guest, ready: true });
  await t.mutation(api.seasons.launch, seat);
  await placeHq(t, seat);
  await placeHq(t, guest);
  return { seat, guest };
}

const playerOf = (t: ReturnType<typeof boot>, seat: Seat) => t.run((ctx) => seatIn(ctx, seat));

async function building(
  t: ReturnType<typeof boot>,
  seat: Seat,
  key: BuildingKey,
  regionId: string,
) {
  const player = await playerOf(t, seat);
  return t.run((ctx) =>
    ctx.db.insert('buildings', {
      seasonId: player.seasonId,
      playerId: player._id,
      key,
      regionId,
      point: pointOfRegion(regionId),
      level: 1,
    }),
  );
}

async function troop(
  t: ReturnType<typeof boot>,
  seat: Seat,
  role: UnitRole,
  stationedAt: Id<'buildings'>,
) {
  const player = await playerOf(t, seat);
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

async function observe(t: ReturnType<typeof boot>, seat: Seat, regionId = RUHR) {
  const player = await playerOf(t, seat);
  await t.run((ctx) =>
    fileSurvey(ctx, player._id, [{ point: regionFacts(regionId)!.point, radiusKm: 1 }], Date.now()),
  );
}

const noticesOf = async (t: ReturnType<typeof boot>, seat: Seat) =>
  (await t.query(api.view.playerView, seat)).notices;

const ownBuilding = async (t: ReturnType<typeof boot>, seat: Seat, id: Id<'buildings'>) =>
  (await t.query(api.view.playerView, seat)).me.buildings.find((one) => one.id === id);

/** A French bomber wing at its Marne aerodrome, aimed at a Soviet site surveyed in the Ruhr. */
async function strikeScene(t: ReturnType<typeof boot>, key: BuildingKey = 'barracks') {
  const { seat, guest } = await launchedSeason(t);
  const airfield = await building(t, seat, 'airfield', MARNE);
  const bomber = await troop(t, seat, 'bomber', airfield);
  const target = await building(t, guest, key, RUHR);
  await observe(t, seat);
  const order = {
    ...seat,
    origin: { kind: 'building' as const, buildingId: airfield },
    troopIds: [bomber],
    buildingId: target,
  };
  return { seat, guest, airfield, bomber, target, order };
}

async function strikeAndArrive(
  t: ReturnType<typeof boot>,
  order: Parameters<typeof fileStrike>[1],
) {
  const { movementId, arrivesAt } = await fileStrike(t, order);
  vi.setSystemTime(arrivesAt);
  await t.mutation(internal.movements.arrive, { movementId });
  return arrivesAt;
}

const fileStrike = (
  t: ReturnType<typeof boot>,
  order: {
    token: string;
    seasonId: Id<'seasons'>;
    origin: { kind: 'building'; buildingId: Id<'buildings'> };
    troopIds: Array<Id<'troops'>>;
    buildingId: Id<'buildings'>;
  },
) => t.mutation(api.movements.strike, order);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(MIDDAY);
});
afterEach(() => vi.useRealTimers());

describe('filing a strike', () => {
  it('files the surveyed enemy building as a strike from the aerodrome', async () => {
    const t = boot();
    const { order, target, bomber, seat } = await strikeScene(t);

    const { movementId } = await fileStrike(t, order);

    expect(await t.run((ctx) => ctx.db.get(movementId))).toMatchObject({
      playerId: (await playerOf(t, seat))._id,
      target: { kind: 'building', buildingId: target },
      strike: { buildingId: target, surveyed: { key: 'barracks', regionId: RUHR } },
      troopIds: [bomber],
    });
  });

  it('keeps its course: a strike is a mission, which a carrier doctrine cannot steer away', async () => {
    const t = boot();
    const { order } = await strikeScene(t);
    const { movementId } = await fileStrike(t, order);

    const filed = await t.run((ctx) => ctx.db.get(movementId));
    expect(onMission(filed!)).toBe(true);
  });

  it('refuses a column without a bomber, and files nothing', async () => {
    const t = boot();
    const { order, seat, airfield } = await strikeScene(t);
    const fighter = await troop(t, seat, 'fighter', airfield);

    await expect(fileStrike(t, { ...order, troopIds: [fighter] })).rejects.toThrow(
      'STRIKE_NEEDS_BOMBER',
    );
    expect(await t.run((ctx) => ctx.db.query('movements').collect())).toEqual([]);
  });

  it('refuses a building this player has not surveyed', async () => {
    const t = boot();
    const { order, guest } = await strikeScene(t);
    const unseen = await building(t, guest, 'port', 'ROU-310');

    await expect(fileStrike(t, { ...order, buildingId: unseen })).rejects.toThrow(
      'UNKNOWN_BUILDING',
    );
  });

  /** ADR 0046 §6 : rien ne part d'un aérodrome désactivé. */
  it('lets nothing take off from a disabled aerodrome', async () => {
    const t = boot();
    const { order, airfield } = await strikeScene(t);
    await t.run((ctx) => ctx.db.patch(airfield, { disabledUntil: MIDDAY + HOUR }));

    await expect(fileStrike(t, order)).rejects.toThrow('BUILDING_DISABLED');
  });
});

describe('a disabled barracks', () => {
  it('forms nothing', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const barracks = await building(t, seat, 'barracks', MARNE);
    await t.run((ctx) => ctx.db.patch(barracks, { disabledUntil: MIDDAY + HOUR }));

    await expect(
      t.mutation(api.troops.recruit, {
        ...seat,
        buildingId: barracks,
        role: 'infantry',
        tier: 1,
      }),
    ).rejects.toThrow('BUILDING_DISABLED');
  });
});

describe('the owner struck is warned on his device', () => {
  it('with a phrase that names no building and no country, once a bomber has held', async () => {
    const t = boot();
    const { order, guest } = await strikeScene(t, 'mine');
    await t.mutation(api.notifications.subscribe, {
      token: guest.token,
      endpoint: 'https://fcm.googleapis.com/lea',
      p256dh: 'p256dh',
      auth: 'auth',
      userAgent: 'Mozilla/5.0',
    });
    const player = await playerOf(t, guest);

    await strikeAndArrive(t, order);

    const rows = await t.run(async (ctx) =>
      (await ctx.db.query('pushQueue').collect()).filter(
        (row) => row.accountId === player.accountId,
      ),
    );
    expect(rows.map((row) => row.phrase)).toEqual([push.buildingStruck('damaged')]);
  });
});

describe('a barracks disabled by a strike', () => {
  const batch = (t: ReturnType<typeof boot>, barracks: Id<'buildings'>, seat: Seat, rank: number) =>
    playerOf(t, seat).then((player) =>
      t.run((ctx) =>
        ctx.db.insert('recruitments', {
          playerId: player._id,
          buildingId: barracks,
          role: 'infantry',
          tier: 1,
          rank,
          finishesAt: null,
        }),
      ),
    );

  it('freezes its queue until it is back: nothing is delivered, the time left is kept, the wake-up forms on', async () => {
    const t = boot();
    const { order, guest, target } = await strikeScene(t, 'barracks');
    await t.run((ctx) => ctx.db.patch(target, { damagedUntil: MIDDAY + 30 * HOUR }));
    const head = await batch(t, target, guest, 0);
    const next = await batch(t, target, guest, 1);
    const troopsBefore = (await t.run((ctx) => ctx.db.query('troops').collect())).length;
    const { movementId, arrivesAt: at } = await fileStrike(t, order);
    const dated = at + 2 * HOUR;
    await t.run((ctx) => ctx.db.patch(head, { finishesAt: dated }));

    vi.setSystemTime(at);
    await t.mutation(internal.movements.arrive, { movementId });
    const frozen = (await t.run((ctx) => ctx.db.get(head)))!;
    expect(frozen.finishesAt).toBeNull();
    expect(frozen.frozenMs).toBe(2 * HOUR);

    /** The old date comes round while the barracks is out: the batch is not delivered. */
    vi.setSystemTime(dated + 1);
    await t.mutation(internal.troops.deliver, { recruitmentId: head });
    expect(await t.run((ctx) => ctx.db.get(head))).not.toBeNull();
    expect(await t.run((ctx) => ctx.db.query('troops').collect())).toHaveLength(troopsBefore);

    const restoredAt = at + BUILDING_DISABLED_HOURS * HOUR + 1;
    vi.setSystemTime(restoredAt);
    await t.mutation(internal.production.restoreAfterDisabling, {
      seasonId: (await playerOf(t, guest)).seasonId,
      at: restoredAt - 1,
    });
    const woken = (await t.run((ctx) => ctx.db.get(head)))!;
    expect(woken.finishesAt).toBe(restoredAt + 2 * HOUR);
    expect((await t.run((ctx) => ctx.db.get(next)))!.finishesAt).toBeNull();
  });

  it('forms on when the wake-up runs at the very instant it is back', async () => {
    const t = boot();
    const { order, guest, target } = await strikeScene(t, 'barracks');
    await t.run((ctx) => ctx.db.patch(target, { damagedUntil: MIDDAY + 30 * HOUR }));
    const head = await batch(t, target, guest, 0);
    const { movementId, arrivesAt: at } = await fileStrike(t, order);
    await t.run((ctx) => ctx.db.patch(head, { finishesAt: at + 2 * HOUR }));
    vi.setSystemTime(at);
    await t.mutation(internal.movements.arrive, { movementId });

    const back = at + BUILDING_DISABLED_HOURS * HOUR;
    vi.setSystemTime(back);
    await t.mutation(internal.production.restoreAfterDisabling, {
      seasonId: (await playerOf(t, guest)).seasonId,
      at: back,
    });
    expect((await t.run((ctx) => ctx.db.get(head)))!.finishesAt).toBe(back + 1 + 2 * HOUR);
  });

  it('refuses to cancel a frozen batch, which had started', async () => {
    const t = boot();
    const { order, guest, target } = await strikeScene(t, 'barracks');
    await t.run((ctx) => ctx.db.patch(target, { damagedUntil: MIDDAY + 30 * HOUR }));
    const head = await batch(t, target, guest, 0);
    const { movementId, arrivesAt: at } = await fileStrike(t, order);
    await t.run((ctx) => ctx.db.patch(head, { finishesAt: at + 2 * HOUR }));
    vi.setSystemTime(at);
    await t.mutation(internal.movements.arrive, { movementId });

    const player = await playerOf(t, guest);
    await expect(
      t.mutation(api.troops.cancel, {
        token: guest.token,
        seasonId: player.seasonId,
        recruitmentId: head,
      }),
    ).rejects.toThrow(/BATCH_ALREADY_STARTED/);
  });
});

describe('the strike at its arrival', () => {
  it('takes an unguarded building down to damaged, tells both sides, and flies home', async () => {
    const t = boot();
    const { order, seat, guest, target, bomber, airfield } = await strikeScene(t);

    const at = await strikeAndArrive(t, order);

    expect(await ownBuilding(t, guest, target)).toMatchObject({
      integrity: 'damaged',
      restoresAt: at + DAMAGED_HOURS * HOUR,
    });
    expect(
      (await noticesOf(t, guest)).filter((one) => one.kind === 'buildingStruck'),
    ).toMatchObject([
      { building: 'barracks', integrity: 'damaged', restoresAt: at + DAMAGED_HOURS * HOUR },
    ]);
    expect(
      (await noticesOf(t, seat)).filter((one) => one.kind === 'strikeDelivered'),
    ).toMatchObject([{ building: 'barracks', notch: 'damaged', destroyed: 0 }]);
    const home = await t.run((ctx) => ctx.db.query('movements').collect());
    expect(home).toMatchObject([{ type: 'return', troopIds: [bomber] }]);
    expect((await t.run((ctx) => ctx.db.get(bomber)))?.stationedAt).toBe(airfield);
  });

  /** Le brouillard (ADR 0046 §7) : l'état ne se sert qu'au propriétaire. */
  it('serves the state to the owner alone', async () => {
    const t = boot();
    const { order, seat } = await strikeScene(t);
    await strikeAndArrive(t, order);

    const mine = JSON.stringify(await t.query(api.view.playerView, seat));
    expect(mine).not.toContain('"integrity"');
    expect(mine).not.toContain('restoresAt');
  });

  it('disables a damaged building, settles its heap, and brings it back intact and sheltered', async () => {
    const t = boot();
    const { order, guest, target } = await strikeScene(t, 'mine');
    await t.run((ctx) => ctx.db.patch(target, { damagedUntil: MIDDAY + 30 * HOUR }));

    const at = await strikeAndArrive(t, order);

    const disabledUntil = at + BUILDING_DISABLED_HOURS * HOUR;
    expect(await t.run((ctx) => ctx.db.get(target))).toMatchObject({
      disabledUntil,
      immuneUntil: disabledUntil + BUILDING_IMMUNITY_HOURS * HOUR,
    });
    expect((await t.run((ctx) => ctx.db.get(target)))?.damagedUntil).toBeUndefined();
    expect(await ownBuilding(t, guest, target)).toMatchObject({
      integrity: 'disabled',
      restoresAt: disabledUntil,
    });
    const heap = await t.run((ctx) =>
      ctx.db
        .query('heaps')
        .withIndex('byBuilding', (q) => q.eq('buildingId', target))
        .unique(),
    );
    expect(heap?.settledAt).toBe(at);
    const jobs = await t.run((ctx) => ctx.db.system.query('_scheduled_functions').collect());
    expect(
      jobs.some(
        (job) => job.name.includes('restoreAfterDisabling') && job.scheduledTime === disabledUntil,
      ),
    ).toBe(true);

    vi.setSystemTime(disabledUntil + 1);
    expect((await ownBuilding(t, guest, target))?.integrity).toBeUndefined();
  });

  /** Sous l'initiative, l'escorte abattait le chasseur avant qu'il ne tire : la garnison tire d'abord. */
  it('is fired on first by the garrison, and a bomber put to flight lands no blow', async () => {
    const t = boot();
    const { order, seat, guest, target, airfield } = await strikeScene(t, 'airfield');
    const escort = [
      await troop(t, seat, 'fighter', airfield),
      await troop(t, seat, 'fighter', airfield),
    ];
    await troop(t, guest, 'fighter', target);

    await strikeAndArrive(t, { ...order, troopIds: [...order.troopIds, ...escort] });

    expect((await t.run((ctx) => ctx.db.get(target)))?.damagedUntil).toBeUndefined();
    expect(
      (await noticesOf(t, seat)).filter((one) => one.kind === 'strikeDelivered'),
    ).toMatchObject([{ notch: null }]);
    expect((await noticesOf(t, guest)).some((one) => one.kind === 'buildingStruck')).toBe(false);
    const [engagement] = await t.run((ctx) => ctx.db.query('engagements').collect());
    expect(engagement).toMatchObject({
      defenderId: (await playerOf(t, guest))._id,
      defence: true,
    });
    /** Le rejeu le sait : il raconte la garnison qui tire la première, aux deux camps. */
    const replay = (who: Seat) =>
      t.query(api.replay.replayOf, { ...who, combatId: engagement!._id });
    expect(await replay(seat)).toMatchObject({ side: 'attacker', defence: true });
    expect(await replay(guest)).toMatchObject({ side: 'defender', defence: true });
  });

  it('meets only the troops posted on the building, not a column that left it', async () => {
    const t = boot();
    const { order, guest, target } = await strikeScene(t, 'airfield');
    const away = await troop(t, guest, 'fighter', target);
    const player = await playerOf(t, guest);
    await t.run((ctx) =>
      ctx.db.insert('movements', {
        seasonId: player.seasonId,
        playerId: player._id,
        type: 'march',
        fromBuildingId: target,
        target: { kind: 'region', regionId: RUHR },
        from: { lon: 7, lat: 51 },
        to: { lon: 7.1, lat: 51 },
        hostCountry: 'DEU',
        points: [
          { lon: 7, lat: 51 },
          { lon: 7.1, lat: 51 },
        ],
        legs: [{ medium: 'air', distanceUnits: 1 }],
        distanceUnits: 1,
        costUnits: 1,
        troopIds: [away],
        departedAt: MIDDAY,
        arrivesAt: MIDDAY + 100 * HOUR,
      }),
    );

    await strikeAndArrive(t, order);

    expect(await t.run((ctx) => ctx.db.query('engagements').collect())).toEqual([]);
    expect((await ownBuilding(t, guest, target))?.integrity).toBe('damaged');
  });

  it('clips the stock a disabled warehouse no longer holds, and tells its owner', async () => {
    const t = boot();
    const { order, guest, target } = await strikeScene(t, 'warehouse');
    await t.run((ctx) => ctx.db.patch(target, { damagedUntil: MIDDAY + 30 * HOUR }));
    const player = await playerOf(t, guest);
    await t.run(async (ctx) => {
      for (const row of await ctx.db
        .query('resources')
        .withIndex('byPlayer', (q) => q.eq('playerId', player._id))
        .collect())
        await ctx.db.patch(row._id, { stock: 1_000_000, updatedAt: Date.now() });
    });

    await strikeAndArrive(t, order);

    const [struck] = (await noticesOf(t, guest)).filter((one) => one.kind === 'buildingStruck');
    expect(struck).toMatchObject({ integrity: 'disabled' });
    expect(struck && 'storageLost' in struck && (struck.storageLost?.food ?? 0) > 0).toBe(true);
  });

  /** **Dakar** (ADR 0032) : le teneur garde 600 par ressource, que l'entrepôt frappé ne couvre plus. */
  it('keeps to the holder of Dakar what a struck warehouse spares him, as a plunder does', async () => {
    const t = boot();
    const { order, seat, guest, target } = await strikeScene(t, 'warehouse');
    await holdPoint(t, seat, 'dakar', guest);
    await t.run((ctx) => ctx.db.patch(target, { damagedUntil: MIDDAY + 30 * HOUR }));
    const player = await playerOf(t, guest);
    await t.run(async (ctx) => {
      for (const row of await ctx.db
        .query('resources')
        .withIndex('byPlayer', (q) => q.eq('playerId', player._id))
        .collect())
        await ctx.db.patch(row._id, { stock: 1_000_000, updatedAt: Date.now() });
    });

    await strikeAndArrive(t, order);

    const food = await t.run(async (ctx) =>
      (
        await ctx.db
          .query('resources')
          .withIndex('byPlayer', (q) => q.eq('playerId', player._id))
          .collect()
      ).find((row) => row.key === 'food'),
    );
    expect(food?.stock).toBe(sparedPerResourceOf(true));
  });

  it('finds a building disabled since, and says so to the one who flew', async () => {
    const t = boot();
    const { order, seat, guest, target } = await strikeScene(t);
    const { movementId, arrivesAt } = await fileStrike(t, order);
    await t.run((ctx) => ctx.db.patch(target, { disabledUntil: arrivesAt + HOUR }));
    vi.setSystemTime(arrivesAt);
    await t.mutation(internal.movements.arrive, { movementId });

    expect(
      (await noticesOf(t, seat)).filter((one) => one.kind === 'strikeFoundNothing'),
    ).toMatchObject([{ building: 'barracks', reason: 'disabled' }]);
    expect((await noticesOf(t, guest)).some((one) => one.kind === 'buildingStruck')).toBe(false);
    expect(await t.run((ctx) => ctx.db.query('movements').collect())).toMatchObject([
      { type: 'return' },
    ]);
  });

  it('finds a building razed since', async () => {
    const t = boot();
    const { order, seat, target } = await strikeScene(t);
    const { movementId, arrivesAt } = await fileStrike(t, order);
    await t.run((ctx) => ctx.db.delete(target));
    vi.setSystemTime(arrivesAt);
    await t.mutation(internal.movements.arrive, { movementId });

    expect(
      (await noticesOf(t, seat)).filter((one) => one.kind === 'strikeFoundNothing'),
    ).toMatchObject([{ building: 'barracks', reason: 'gone' }]);
  });

  /** ADR 0046 §5 : rétabli, il est à l'abri — et seul le terrain l'apprend à l'attaquant. */
  it('finds a building sheltered since its restoration', async () => {
    const t = boot();
    const { order, seat, target } = await strikeScene(t);
    const { movementId, arrivesAt } = await fileStrike(t, order);
    await t.run((ctx) =>
      ctx.db.patch(target, { disabledUntil: arrivesAt - 1, immuneUntil: arrivesAt + HOUR }),
    );
    vi.setSystemTime(arrivesAt);
    await t.mutation(internal.movements.arrive, { movementId });

    expect(
      (await noticesOf(t, seat)).filter((one) => one.kind === 'strikeFoundNothing'),
    ).toMatchObject([{ reason: 'immune' }]);
    expect((await t.run((ctx) => ctx.db.get(target)))?.damagedUntil).toBeUndefined();
  });
});

/**
 * **Le QG et le centre de recherche frappés** (ADR 0046 §8, #648) : la France est frappée cette
 * fois, par des bombardiers soviétiques partis de la Ruhr sur Paris.
 */
const PARIS = capitalRegionOf('france');
const ARDENNES = 'FRA-5268';

async function fillAll(t: ReturnType<typeof boot>, seat: Seat) {
  const player = await playerOf(t, seat);
  await t.run(async (ctx) => {
    for (const row of await ctx.db
      .query('resources')
      .withIndex('byPlayer', (q) => q.eq('playerId', player._id))
      .collect())
      await ctx.db.patch(row._id, { stock: 350, updatedAt: Date.now() });
  });
}

const hqOf = async (t: ReturnType<typeof boot>, seat: Seat) => {
  const player = await playerOf(t, seat);
  return t.run(async (ctx) =>
    (
      await ctx.db
        .query('buildings')
        .withIndex('byPlayer', (q) => q.eq('playerId', player._id))
        .collect()
    ).find((one) => one.key === 'hq')!,
  );
};

async function centerOf(t: ReturnType<typeof boot>, seat: Seat) {
  const player = await playerOf(t, seat);
  const { lon, lat } = pointOfRegion(PARIS);
  return t.run((ctx) =>
    ctx.db.insert('buildings', {
      seasonId: player.seasonId,
      playerId: player._id,
      key: 'researchCenter',
      regionId: PARIS,
      point: { lon: lon + 0.6, lat },
      level: 1,
    }),
  );
}

/** Le bombardier soviétique de la Ruhr, et la cible française déjà endommagée : le coup désactive. */
async function hqStrikeScene(t: ReturnType<typeof boot>, key: 'hq' | 'researchCenter' = 'hq') {
  const { seat, guest } = await launchedSeason(t);
  const airfield = await building(t, guest, 'airfield', RUHR);
  const bomber = await troop(t, guest, 'bomber', airfield);
  const hq = await hqOf(t, seat);
  const target = key === 'hq' ? hq._id : await centerOf(t, seat);
  await t.run((ctx) => ctx.db.patch(target, { damagedUntil: MIDDAY + 30 * HOUR }));
  const raider = await playerOf(t, guest);
  await t.run((ctx) =>
    fileSurvey(ctx, raider._id, [{ point: regionFacts(PARIS)!.point, radiusKm: 120 }], Date.now()),
  );
  const order = {
    ...guest,
    origin: { kind: 'building' as const, buildingId: airfield },
    troopIds: [bomber],
    buildingId: target,
  };
  return { seat, guest, hq, target, order };
}

const restore = async (t: ReturnType<typeof boot>, seat: Seat, at: number) =>
  t.mutation(internal.production.restoreAfterDisabling, {
    seasonId: (await playerOf(t, seat)).seasonId,
    at,
  });

const worksOf = async (t: ReturnType<typeof boot>, seat: Seat) => {
  const player = await playerOf(t, seat);
  return t.run((ctx) =>
    ctx.db
      .query('constructions')
      .withIndex('byPlayer', (q) => q.eq('playerId', player._id))
      .collect(),
  );
};

describe('a headquarters struck', () => {
  it('is disabled, never razed: its level holds, and its owner plays on', async () => {
    const t = boot();
    const { order, seat, hq } = await hqStrikeScene(t);

    const at = await strikeAndArrive(t, order);

    expect(await ownBuilding(t, seat, hq._id)).toMatchObject({
      integrity: 'disabled',
      restoresAt: at + BUILDING_DISABLED_HOURS * HOUR,
      level: hq.level,
    });
    expect((await noticesOf(t, seat)).filter((one) => one.kind === 'buildingStruck')).toMatchObject(
      [{ building: 'hq', integrity: 'disabled' }],
    );
    expect((await t.query(api.view.playerView, seat)).me.defeated).toBe(false);
  });

  it('launches no construction, no raise and no research while it is out, and says why', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const hq = await hqOf(t, seat);
    await centerOf(t, seat);
    await fillAll(t, seat);
    const player = await playerOf(t, seat);
    const outpost = (specialty: 'general' | 'store', level: number) =>
      t.run((ctx) =>
        ctx.db.insert('outposts', {
          seasonId: player.seasonId,
          playerId: player._id,
          point: pointIn(ARDENNES),
          hostCountry: 'FRA',
          level,
          specialty,
          foundedAt: Date.now() - 1,
          disabledUntil: null,
          immuneUntil: null,
        }),
      );
    const low = await outpost('general', 1);
    const stored = await outpost('store', 2);
    await t.run((ctx) => ctx.db.patch(hq._id, { disabledUntil: MIDDAY + HOUR }));

    const refused = 'BUILDING_DISABLED';
    await expect(
      t.mutation(api.constructions.start, {
        ...seat,
        building: 'hq',
        regionId: PARIS,
        point: hq.point,
      }),
    ).rejects.toThrow(refused);
    await expect(
      t.mutation(api.constructions.start, {
        ...seat,
        building: 'barracks',
        regionId: ARDENNES,
        point: pointIn(ARDENNES),
      }),
    ).rejects.toThrow(refused);
    await expect(
      t.mutation(api.constructions.raiseOutpost, { ...seat, outpostId: low, specialty: 'fort' }),
    ).rejects.toThrow(refused);
    await expect(
      t.mutation(api.constructions.respecializeOutpost, {
        ...seat,
        outpostId: stored,
        specialty: 'fort',
      }),
    ).rejects.toThrow(refused);
    await expect(t.mutation(api.research.start, { ...seat, card: 'infantryMk2' })).rejects.toThrow(
      refused,
    );
    expect(await worksOf(t, seat)).toEqual([]);
  });

  it('still lets its troops march out: a player struck answers back', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const hq = await hqOf(t, seat);
    const infantry = await troop(t, seat, 'infantry', hq._id);
    await t.run((ctx) => ctx.db.patch(hq._id, { disabledUntil: MIDDAY + HOUR }));

    await expect(
      t.mutation(api.movements.marchTo, {
        ...seat,
        origin: { kind: 'building', buildingId: hq._id },
        troopIds: [infantry],
        point: pointIn(ARDENNES),
      }),
    ).resolves.toBeDefined();
  });

  it('freezes the running construction until it is back, then runs what was left of it', async () => {
    const t = boot();
    const { order, seat, hq } = await hqStrikeScene(t);
    const { movementId, arrivesAt: at } = await fileStrike(t, order);
    vi.setSystemTime(at - 10 * 60_000);
    await fillAll(t, seat);
    await t.mutation(api.constructions.start, {
      ...seat,
      building: 'hq',
      regionId: PARIS,
      point: hq.point,
    });
    const [work] = await worksOf(t, seat);
    const dated = work!.finishesAt!;
    expect(dated).toBeGreaterThan(at);

    vi.setSystemTime(at);
    await t.mutation(internal.movements.arrive, { movementId });
    const left = dated - at;
    expect(await worksOf(t, seat)).toMatchObject([{ finishesAt: null, frozenMs: left }]);
    expect((await t.query(api.view.playerView, seat)).me.construction).toMatchObject({
      id: work!._id,
      frozen: true,
      minutesLeft: left / 60_000,
    });
    await expect(
      t.mutation(api.constructions.cancel, { ...seat, constructionId: work!._id }),
    ).rejects.toThrow('CONSTRUCTION_ALREADY_STARTED');

    /** Son ancienne date passe, et tout réveil de la file pendant l'absence : rien ne bouge. */
    vi.setSystemTime(dated + 1);
    await t.mutation(internal.constructions.finish, { constructionId: work!._id });
    await t.mutation(internal.constructions.resume, { playerId: (await playerOf(t, seat))._id });
    expect(await worksOf(t, seat)).toMatchObject([{ finishesAt: null, frozenMs: left }]);
    expect((await hqOf(t, seat)).level).toBe(hq.level);

    const back = at + BUILDING_DISABLED_HOURS * HOUR;
    vi.setSystemTime(back);
    await restore(t, seat, back);
    const jobs = await t.run((ctx) => ctx.db.system.query('_scheduled_functions').collect());
    expect(
      jobs.some(
        (job) =>
          job.name.includes('constructions') &&
          job.name.includes('resume') &&
          job.scheduledTime === back + 1,
      ),
    ).toBe(true);
    vi.setSystemTime(back + 1);
    await t.mutation(internal.constructions.resume, { playerId: (await playerOf(t, seat))._id });
    const [woken] = await worksOf(t, seat);
    expect(woken?.finishesAt).toBe(back + 1 + left);
    expect(woken?.frozenMs).toBeUndefined();
  });

  /** L'invariant Échéance : à son retour, la tête figée relit sa règle comme toute tête de file. */
  it('rereads the rule of a frozen work at its return, and refunds one whose right is gone', async () => {
    const t = boot();
    const { order, seat } = await hqStrikeScene(t);
    const { movementId, arrivesAt: at } = await fileStrike(t, order);
    vi.setSystemTime(at - 10 * 60_000);
    await fillAll(t, seat);
    await t.mutation(api.constructions.start, {
      ...seat,
      building: 'barracks',
      regionId: ARDENNES,
      point: pointIn(ARDENNES),
    });
    vi.setSystemTime(at);
    await t.mutation(internal.movements.arrive, { movementId });
    expect(await worksOf(t, seat)).toMatchObject([{ finishesAt: null }]);
    /** Pendant l'absence, une mine se pose sur ce point : la caserne n'y a plus sa place. */
    await building(t, seat, 'mine', ARDENNES);
    await t.run(async (ctx) => {
      const player = await seatIn(ctx, seat);
      const mine = (
        await ctx.db
          .query('buildings')
          .withIndex('byPlayer', (q) => q.eq('playerId', player._id))
          .collect()
      ).find((one) => one.key === 'mine' && one.regionId === ARDENNES)!;
      await ctx.db.patch(mine._id, { point: pointIn(ARDENNES) });
    });

    const back = at + BUILDING_DISABLED_HOURS * HOUR + 1;
    vi.setSystemTime(back);
    await t.mutation(internal.constructions.resume, { playerId: (await playerOf(t, seat))._id });

    expect(await worksOf(t, seat)).toEqual([]);
    expect(
      (await noticesOf(t, seat)).filter((one) => one.kind === 'constructionCancelled'),
    ).toMatchObject([{ building: 'barracks' }]);
  });
});

describe('a research centre struck', () => {
  it('suspends the running card until it is back, and its old date researches nothing', async () => {
    const t = boot();
    const { order, seat, target } = await hqStrikeScene(t, 'researchCenter');
    await fillAll(t, seat);
    const { finishesAt } = await t.mutation(api.research.start, { ...seat, card: 'infantryMk2' });
    const started = Date.now();
    const total = finishesAt! - started;

    const at = await strikeAndArrive(t, order);

    const player = await playerOf(t, seat);
    expect(player.research).toMatchObject({
      card: 'infantryMk2',
      since: null,
      remainingMs: total - (at - started),
    });
    expect((await ownBuilding(t, seat, target))?.integrity).toBe('disabled');
    await expect(t.mutation(api.research.start, { ...seat, card: 'escort' })).rejects.toThrow(
      'BUILDING_DISABLED',
    );

    vi.setSystemTime(finishesAt! + 1);
    await t.mutation(internal.research.finish, { playerId: player._id, finishesAt: finishesAt! });
    expect((await playerOf(t, seat)).researched ?? []).not.toContain('infantryMk2');

    /** Le retour se réveille à la milliseconde de sa date, encore incluse dans l'absence. */
    const back = at + BUILDING_DISABLED_HOURS * HOUR;
    vi.setSystemTime(back);
    await restore(t, seat, back);
    expect((await playerOf(t, seat)).research).toMatchObject({
      since: back + 1,
      remainingMs: total - (at - started),
    });
  });
});
