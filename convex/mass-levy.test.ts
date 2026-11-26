import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import type { BuildingKey } from '../src/domain/ids';
import { recruitmentCost } from './constants';
import { formingSiteOf, formsHere } from '../src/domain/troops';
import { pointOfRegion } from './regions';
import schema from './schema';
import { modules } from './test.setup';
import { foundSeat, joinSeat, placeHq, seatIn } from './seats.fixture';
import type { Seat } from './seats.fixture';

/**
 * **Levée en masse** (ADR 0047 §2, #685) : l'infanterie MK1 chinoise se forme dans tout
 * bâtiment chinois du sol national, à la durée d'une caserne de niveau 1.
 */
const boot = () => convexTest({ schema, modules, transactionLimits: true });
const MIDDAY = new Date(2026, 10, 26, 12, 0, 0).getTime();
const MINUTE = 60_000;
const XINJIANG = 'CHN-1756';
const MOSCOW = 'RUS-2365';

async function season(
  t: ReturnType<typeof boot>,
  nation: 'china' | 'japan' = 'china',
  other: 'ussr' | 'japan' = 'ussr',
) {
  const { seat, code } = await foundSeat(t, 'Pierre', 0.5);
  const guest = await joinSeat(t, code, 'Léa');
  await t.mutation(api.players.reserveNation, { ...seat, nation });
  await t.mutation(api.players.declareReady, { ...seat, ready: true });
  await t.mutation(api.players.reserveNation, { ...guest, nation: other });
  await t.mutation(api.players.declareReady, { ...guest, ready: true });
  await t.mutation(api.seasons.launch, seat);
  await placeHq(t, seat);
  await placeHq(t, guest);
  return { seat, guest };
}

const playerOf = (t: ReturnType<typeof boot>, seat: Seat) => t.run((ctx) => seatIn(ctx, seat));

async function raise(
  t: ReturnType<typeof boot>,
  seat: Seat,
  key: BuildingKey,
  regionId: string,
  level = 1,
): Promise<Id<'buildings'>> {
  const player = await playerOf(t, seat);
  return t.run((ctx) =>
    ctx.db.insert('buildings', {
      seasonId: player.seasonId,
      playerId: player._id,
      key,
      regionId,
      point: pointOfRegion(regionId),
      level,
    }),
  );
}

const form = (
  t: ReturnType<typeof boot>,
  seat: Seat,
  buildingId: Id<'buildings'>,
  role: 'infantry' | 'armor' = 'infantry',
  tier: 1 | 2 = 1,
) => t.mutation(api.troops.recruit, { ...seat, buildingId, role, tier });

const queueOf = (t: ReturnType<typeof boot>, buildingId: Id<'buildings'>) =>
  t.run((ctx) =>
    ctx.db
      .query('recruitments')
      .withIndex('byBuilding', (q) => q.eq('buildingId', buildingId))
      .collect(),
  );

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(MIDDAY);
});
afterEach(() => vi.useRealTimers());

describe('the Mass Levy: a Chinese building of the national soil forms the MK1 infantry', () => {
  it('forms in a farm, a warehouse and the headquarters, at the infantry price', async () => {
    const t = boot();
    const { seat } = await season(t);
    for (const key of ['farm', 'warehouse', 'depot'] as const) {
      const building = await raise(t, seat, key, XINJIANG);
      const { cost } = await form(t, seat, building);
      expect(cost).toEqual(recruitmentCost('infantry', 1));
      expect(await queueOf(t, building)).toHaveLength(1);
    }
    const hq = (await t.query(api.view.playerView, seat)).me.buildings.find((b) => b.key === 'hq')!;
    await form(t, seat, hq.id as Id<'buildings'>);
    expect(await queueOf(t, hq.id as Id<'buildings'>)).toHaveLength(1);
  });

  it('dates the batch at a level 1 barracks, whatever the level of the building', async () => {
    const t = boot();
    const { seat } = await season(t);
    const warehouse = await raise(t, seat, 'warehouse', XINJIANG, 5);
    await form(t, seat, warehouse);
    const [batch] = await queueOf(t, warehouse);
    expect(batch!.finishesAt).toBe(MIDDAY + recruitmentCost('infantry', 1).minutes * MINUTE);
  });

  it('keeps the barracks’ own gain of level', async () => {
    const t = boot();
    const { seat } = await season(t);
    const barracks = await raise(t, seat, 'barracks', XINJIANG, 3);
    await form(t, seat, barracks);
    const [batch] = await queueOf(t, barracks);
    expect(batch!.finishesAt!).toBeLessThan(
      MIDDAY + recruitmentCost('infantry', 1).minutes * MINUTE,
    );
  });

  it('says the first tier alone for the MK2, and the building for another role', async () => {
    const t = boot();
    const { seat } = await season(t);
    const farm = await raise(t, seat, 'farm', XINJIANG);
    await expect(form(t, seat, farm, 'infantry', 2)).rejects.toThrow(/LEVY_FIRST_TIER_ONLY/);
    await expect(form(t, seat, farm, 'armor')).rejects.toThrow(/WRONG_PROJECTION_BUILDING/);
    expect(await queueOf(t, farm)).toHaveLength(0);
  });

  it('forms nothing on a foreign soil, even in a Chinese building', async () => {
    const t = boot();
    const { seat } = await season(t);
    const abroad = await raise(t, seat, 'warehouse', MOSCOW);
    await expect(form(t, seat, abroad)).rejects.toThrow(/WRONG_PROJECTION_BUILDING/);
  });

  it('forms nothing for the holder who is not Chinese, and forms again for the one who retakes it', async () => {
    const t = boot();
    const { seat, guest } = await season(t, 'china', 'japan');
    const warehouse = await raise(t, seat, 'warehouse', XINJIANG);
    const owner = await playerOf(t, seat);
    const captor = await playerOf(t, guest);
    await t.run((ctx) => ctx.db.patch(warehouse, { playerId: captor._id }));
    await expect(form(t, guest, warehouse)).rejects.toThrow(/WRONG_PROJECTION_BUILDING/);
    await t.run((ctx) => ctx.db.patch(warehouse, { playerId: owner._id }));
    await form(t, seat, warehouse);
    expect(await queueOf(t, warehouse)).toHaveLength(1);
  });

  it('reads the national soil the same way on the client (the view) and on the server', async () => {
    const t = boot();
    const { seat } = await season(t);
    const soil = await raise(t, seat, 'warehouse', XINJIANG);
    const abroad = await raise(t, seat, 'warehouse', MOSCOW);
    const view = await t.query(api.view.playerView, seat);
    for (const id of [soil, abroad]) {
      const building = view.me.buildings.find((one) => one.id === id)!;
      const client = formsHere({
        ...formingSiteOf(view, building),
        role: 'infantry',
        tier: 1,
      });
      const server = await form(t, seat, id).then(
        () => true,
        () => false,
      );
      expect(client, building.regionId).toBe(server);
    }
    expect(view.me.buildings.find((one) => one.id === soil)).toBeDefined();
  });

  it('refuses an outpost: it is not a building and has no queue', async () => {
    const t = boot();
    const { seat } = await season(t);
    const player = await playerOf(t, seat);
    const outpost = await t.run((ctx) =>
      ctx.db.insert('outposts', {
        seasonId: player.seasonId,
        playerId: player._id,
        point: pointOfRegion(XINJIANG),
        hostCountry: 'CHN',
        regionId: XINJIANG,
        level: 1,
        foundedAt: Date.now() - 1,
        disabledUntil: null,
        immuneUntil: null,
      }),
    );
    await expect(form(t, seat, outpost as unknown as Id<'buildings'>)).rejects.toThrow();
    expect(await t.run((ctx) => ctx.db.query('recruitments').collect())).toHaveLength(0);
  });

  it('refuses a disabled building as a barracks is', async () => {
    const t = boot();
    const { seat } = await season(t);
    const farm = await raise(t, seat, 'farm', XINJIANG);
    await t.run((ctx) => ctx.db.patch(farm, { disabledUntil: MIDDAY + 60 * MINUTE }));
    await expect(form(t, seat, farm)).rejects.toThrow(/BUILDING_DISABLED/);
  });

  it('serves the workshop a facility for each of them, and none to another nation', async () => {
    const t = boot();
    const { seat } = await season(t);
    const farm = await raise(t, seat, 'farm', XINJIANG);
    const abroad = await raise(t, seat, 'warehouse', MOSCOW);
    const facilities = (await t.query(api.troops.workshop, seat)).facilities;
    expect(facilities.map((f) => f.id)).toContain(farm);
    expect(facilities.map((f) => f.id)).not.toContain(abroad);

    const { guest } = await season(t, 'china', 'japan');
    const japanese = await raise(t, guest, 'farm', 'JPN-1860');
    expect((await t.query(api.troops.workshop, guest)).facilities.map((f) => f.id)).not.toContain(
      japanese,
    );
  });
});
