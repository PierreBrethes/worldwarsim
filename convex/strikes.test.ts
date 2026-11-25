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
import { pointOfRegion, regionFacts } from './regions';
import schema from './schema';
import { fileSurvey } from './surveys';
import { modules } from './test.setup';
import { foundSeat, joinSeat, placeHq, seatIn } from './seats.fixture';
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
      disabled: true,
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
    expect(engagement).toMatchObject({ defenderId: (await playerOf(t, guest))._id });
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
