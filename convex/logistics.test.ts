import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import type { UnitRole } from '../src/domain/ids';
import type { LonLat } from '../src/domain/geo';
import { nominalStrength } from './constants';
import { pointOfRegion } from './regions';
import schema from './schema';
import { modules } from './test.setup';
import { foundSeat, joinSeat, placeHq, seatIn, unclocked, type Seat } from './seats.fixture';

/**
 * **La logistique passe par les pièces** (ADR 0028 §4) : le dépôt d'avant-poste, charger,
 * livrer, la tournée, l'interception.
 */
const boot = () => convexTest({ schema, modules, transactionLimits: true });
type Bench = ReturnType<typeof boot>;

const MIDDAY = new Date(2026, 7, 17, 12, 0, 0);
/** Près de Ploiești : personne n'y est chez soi. */
const PRAHOVA = 'ROU-310';
const PLOIESTI: LonLat = [pointOfRegion(PRAHOVA).lon, pointOfRegion(PRAHOVA).lat];

async function launchedSeason(t: Bench) {
  const { seat, code } = await foundSeat(t, 'Pierre', 0.5);
  const guest = await joinSeat(t, code, 'Léa');
  await t.mutation(api.players.reserveNation, { ...seat, nation: 'france' });
  await t.mutation(api.players.declareReady, { ...seat, ready: true });
  await t.mutation(api.players.reserveNation, { ...guest, nation: 'ussr' });
  await t.mutation(api.players.declareReady, { ...guest, ready: true });
  await t.mutation(api.seasons.launch, seat);
  await unclocked(t);
  await placeHq(t, seat);
  await placeHq(t, guest);
  for (const one of [seat, guest]) {
    const playerId = await playerOf(t, one);
    await t.run(async (ctx) => {
      for (const troop of await ctx.db
        .query('troops')
        .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
        .collect())
        await ctx.db.delete(troop._id);
    });
  }
  return { seat, guest };
}

const playerOf = (t: Bench, seat: Seat) => t.run(async (ctx) => (await seatIn(ctx, seat))._id);

async function form(
  t: Bench,
  seat: Seat,
  role: UnitRole,
  stationedAt: Id<'buildings'> | Id<'outposts'> | null,
) {
  const playerId = await playerOf(t, seat);
  const strength = nominalStrength(role, 1);
  return t.run(async (ctx) =>
    ctx.db.insert('troops', {
      seasonId: (await ctx.db.get(playerId))!.seasonId,
      playerId,
      role,
      tier: 1,
      nominalStrength: strength,
      currentStrength: strength,
      stationedAt,
    }),
  );
}

async function plant(t: Bench, seat: Seat, point: LonLat, level = 1) {
  const playerId = await playerOf(t, seat);
  return t.run(async (ctx) =>
    ctx.db.insert('outposts', {
      seasonId: (await ctx.db.get(playerId))!.seasonId,
      playerId,
      point: { lon: point[0], lat: point[1] },
      hostCountry: 'ROU',
      regionId: PRAHOVA,
      level,
      specialization: 'relay',
      foundedAt: Date.now() - 1,
      disabledUntil: null,
      immuneUntil: null,
    }),
  );
}

async function stockOf(t: Bench, seat: Seat, key: string) {
  return (await t.query(api.view.playerView, seat)).me.resources[key as 'ammunition']!.stock;
}

const get = <T extends Id<'troops'> | Id<'outposts'>>(t: Bench, id: T) =>
  t.run(async (ctx) => ctx.db.get(id as Id<'troops'>));
const depotOf = (t: Bench, id: Id<'outposts'>) =>
  t.run(async (ctx) => (await ctx.db.get(id))!.depot);

describe('the outpost depot', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  it('rearms a troop anchored in an outpost reach from its depot, never from the board', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const outpost = await plant(t, seat, PLOIESTI);
    await t.run(async (ctx) =>
      ctx.db.patch(outpost, { depot: { ammunition: 50, oil: 0, coal: 0 } }),
    );
    const rifles = await form(t, seat, 'infantry', outpost);
    await t.run(async (ctx) => ctx.db.patch(rifles, { rounds: 0 }));
    const board = await stockOf(t, seat, 'ammunition');

    await t.mutation(api.movements.marchTo, {
      ...seat,
      origin: { kind: 'outpost', outpostId: outpost },
      troopIds: [rifles],
      point: { lon: PLOIESTI[0] + 0.3, lat: PLOIESTI[1] },
    });

    expect((await get(t, rifles))!.rounds).toBe(3);
    expect(await depotOf(t, outpost)).toEqual({ ammunition: 20, oil: 0, coal: 0 });
    expect(await stockOf(t, seat, 'ammunition')).toBe(board);
  });

  it('leaves a troop by an empty depot as it is, whatever the board holds', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const outpost = await plant(t, seat, PLOIESTI);
    const rifles = await form(t, seat, 'infantry', outpost);
    await t.run(async (ctx) => ctx.db.patch(rifles, { rounds: 1 }));

    await t.mutation(api.movements.marchTo, {
      ...seat,
      origin: { kind: 'outpost', outpostId: outpost },
      troopIds: [rifles],
      point: { lon: PLOIESTI[0] + 0.3, lat: PLOIESTI[1] },
    });

    expect((await get(t, rifles))!.rounds).toBe(1);
  });

  it('serves the depot and its capacity on my outpost, and which depot rearms each troop', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const outpost = await plant(t, seat, PLOIESTI, 2);
    const rifles = await form(t, seat, 'infantry', outpost);

    const view = await t.query(api.view.playerView, seat);
    expect(view.me.outposts[0]).toMatchObject({
      depot: { ammunition: 0, oil: 0, coal: 0 },
      depotCapacity: 800,
    });
    expect(view.me.troops.find((troop) => troop.id === rifles)?.depotId).toBe(outpost);
  });
});
