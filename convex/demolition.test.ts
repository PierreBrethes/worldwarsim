import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { RESOURCES, type BuildingKey } from '../src/domain/ids';
import {
  BASE_CAP,
  STORAGE_CAP_PER_LEVEL,
  buildCost,
  nominalStrength,
  recruitmentCost,
} from './constants';
import { regionFacts } from './regions';
import { scoresOf } from '../src/domain/standings';
import schema from './schema';
import { modules } from './test.setup';
import { foundSeat, joinSeat, placeHq, seatIn } from './seats.fixture';
import type { Seat } from './seats.fixture';

const boot = () => convexTest({ schema, modules, transactionLimits: true });

const MARNE = 'FRA-5323'; // food
const MOSELLE = 'FRA-5328'; // coal, inland
const MEURTHE = 'FRA-5325'; // ore
const ARDENNES = 'FRA-5268'; // no deposit at all

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

async function raise(
  t: ReturnType<typeof boot>,
  seat: Seat,
  key: BuildingKey,
  regionId: string,
  level = 1,
): Promise<Id<'buildings'>> {
  return t.run(async (ctx) => {
    const player = await seatIn(ctx, seat);
    return ctx.db.insert('buildings', {
      seasonId: player.seasonId,
      playerId: player._id,
      key,
      regionId,
      level,
      outpostId: null,
    });
  });
}

const stocks = async (t: ReturnType<typeof boot>, seat: Seat) =>
  (await t.query(api.view.playerView, seat)).me.resources;

/** De quoi payer n'importe quel chantier : ce qui est sous test n'est jamais la facture. */
async function fillAll(t: ReturnType<typeof boot>, seat: Seat, stock = 10_000) {
  for (const key of RESOURCES) await fill(t, seat, key, stock);
}

async function fill(t: ReturnType<typeof boot>, seat: Seat, key: string, stock: number) {
  await t.run(async (ctx) => {
    const player = await seatIn(ctx, seat);
    const rows = await ctx.db
      .query('resources')
      .withIndex('byPlayer', (q) => q.eq('playerId', player._id))
      .collect();
    const row = rows.find((candidate) => candidate.key === key);
    if (!row) throw new Error(`no ${key} row`);
    await ctx.db.patch(row._id, { stock, updatedAt: Date.now() });
  });
}

/** Le quartier général ne se bâtit pas dans une suite : il se promeut. Un palier au-dessus de
 *  tout ce qu'on monte ici, sinon `CAPPED_BY_HQ` refuse avant la règle sous test. */
async function promoteHq(t: ReturnType<typeof boot>, seat: Seat, level: number) {
  await t.run(async (ctx) => {
    const player = await seatIn(ctx, seat);
    const held = await ctx.db
      .query('buildings')
      .withIndex('byPlayer', (q) => q.eq('playerId', player._id))
      .collect();
    const hq = held.find((building) => building.key === 'hq');
    if (!hq) throw new Error('no headquarters');
    await ctx.db.patch(hq._id, { level });
  });
}

const buildingsOf = async (t: ReturnType<typeof boot>, seat: Seat) =>
  (await t.query(api.view.playerView, seat)).me.buildings;

/** Ce que ce geste-là a déposé, jamais toute la table : une seconde dépêche dans la même course
 *  ferait dériver la suite avec le jeu. */
async function noticesOf(
  t: ReturnType<typeof boot>,
  seat: Seat,
  kind: Doc<'notices'>['kind'],
): Promise<Array<Doc<'notices'>>> {
  const rows = await t.run(async (ctx) => {
    const player = await seatIn(ctx, seat);
    return ctx.db
      .query('notices')
      .withIndex('byPlayer', (q) => q.eq('playerId', player._id))
      .collect();
  });
  return rows.filter((notice) => notice.kind === kind);
}

describe('raser un bâtiment', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /** Cas 1 : la région redevient libre, l'emplacement rendu, et rien ne revient en caisse. */
  it('efface le bâtiment, libère sa région et son emplacement, et ne rend rien', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    await promoteHq(t, seat, 3);
    /** Une station d'écoute, et pas une mine : la pose d'une dette du socle est **hors compte**
     *  (ADR 0020 §10), donc elle ne prouverait rien d'un emplacement rendu. */
    const station = await raise(t, seat, 'listening', ARDENNES, 2);

    const before = await stocks(t, seat);
    const slotsBefore = (await t.query(api.view.playerView, seat)).me.siteSlots[0]!.taken;
    await t.mutation(api.buildings.demolish, { ...seat, buildingId: station });

    const view = await t.query(api.view.playerView, seat);
    expect(view.me.buildings.some((building) => building.id === station)).toBe(false);
    expect(view.me.resources.alloy.stock).toBeCloseTo(before.alloy.stock, 5);
    expect(view.me.siteSlots[0]!.taken).toBe(slotsBefore - 1);

    // La région ne refuse plus : une caserne s'y met en file là où la station se tenait.
    await fillAll(t, seat);
    await expect(
      t.mutation(api.constructions.start, { ...seat, building: 'barracks', regionId: ARDENNES }),
    ).resolves.toBeDefined();
  });

  /** Cas 2 : la garnison ne meurt pas, et la file de la caserne se rembourse selon sa règle. */
  it('pose la garnison au sol et reprend le lot en attente', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    await promoteHq(t, seat, 3);
    await fillAll(t, seat);
    const barracks = await raise(t, seat, 'barracks', MARNE, 2);
    await t.run(async (ctx) => {
      const player = await seatIn(ctx, seat);
      const strength = nominalStrength('infantry', 1);
      await ctx.db.insert('troops', {
        seasonId: player.seasonId,
        playerId: player._id,
        role: 'infantry',
        tier: 1,
        nominalStrength: strength,
        currentStrength: strength,
        stationedAt: barracks,
      });
    });
    // Deux lots : le premier court — il ne se rembourse pas —, le second attend.
    await t.mutation(api.troops.recruit, {
      ...seat,
      buildingId: barracks,
      role: 'infantry',
      tier: 1,
    });
    await t.mutation(api.troops.recruit, {
      ...seat,
      buildingId: barracks,
      role: 'infantry',
      tier: 1,
    });
    const waiting = recruitmentCost('infantry', 1, 1).alloy;

    const before = (await stocks(t, seat)).alloy.stock;
    await t.mutation(api.buildings.demolish, { ...seat, buildingId: barracks });

    const view = await t.query(api.view.playerView, seat);
    expect(view.me.resources.alloy.stock).toBeCloseTo(before + waiting, 5);
    const point = regionFacts(MARNE)!.point;
    const garrison = view.me.troops.filter(
      (troop) => troop.stationedAt.kind === 'point' && troop.stationedAt.lonLat[0] === point[0],
    );
    expect(garrison).toHaveLength(1);
    expect(await noticesOf(t, seat, 'buildingDemolished')).toMatchObject([
      { building: 'barracks', regionId: MARNE, level: 2 },
    ]);
  });

  /** Cas 3 : le plafond tombe avec l'entrepôt, et le surplus est écrêté — les heures d'avant
   *  étant réglées à l'ancienne forme. */
  it('écrête le stock au nouveau plafond, sans toucher aux heures déjà tenues', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const warehouse = await raise(t, seat, 'warehouse', ARDENNES, 1);
    const withStore = BASE_CAP + STORAGE_CAP_PER_LEVEL;
    await fill(t, seat, 'coal', withStore);

    await t.mutation(api.buildings.demolish, { ...seat, buildingId: warehouse });

    const view = await t.query(api.view.playerView, seat);
    expect(view.me.resources.coal.cap).toBe(BASE_CAP);
    expect(view.me.resources.coal.stock).toBeCloseTo(BASE_CAP, 5);
  });

  /** Cas 4 : le quartier général ne se rase pas — et la rose n'en propose pas la branche. */
  it('refuse le quartier général', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const hq = (await buildingsOf(t, seat)).find((building) => building.key === 'hq')!;
    await expect(
      t.mutation(api.buildings.demolish, { ...seat, buildingId: hq.id as Id<'buildings'> }),
    ).rejects.toThrow(/HQ_NEVER_DEMOLISHED/);
  });

  /** Cas 5 : un mât adverse n'est pas un bâtiment qu'on rase. */
  it('refuse le bâtiment d’un autre', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const theirs = await raise(t, guest, 'mine', 'RUS-2335');
    await expect(
      t.mutation(api.buildings.demolish, { ...seat, buildingId: theirs }),
    ).rejects.toThrow(/NOT_YOURS/);
  });

  /** Cas 6 : le socle est un don de lancement, fait une fois. */
  it('ne redemande pas la dette de socle qu’un bâtiment rasé avait acquittée', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const owed = (await t.query(api.view.playerView, seat)).me.foundation;
    const due = owed.find((debt) => debt.key === 'mine' && debt.deposit === 'coal')!;
    expect(due).toBeDefined();

    await t.mutation(api.constructions.start, { ...seat, building: 'mine', regionId: MOSELLE });
    const placed = (await buildingsOf(t, seat)).find((building) => building.regionId === MOSELLE)!;
    expect(
      (await t.query(api.view.playerView, seat)).me.foundation.some(
        (debt) => debt.key === 'mine' && debt.deposit === 'coal',
      ),
    ).toBe(false);

    await t.mutation(api.buildings.demolish, {
      ...seat,
      buildingId: placed.id as Id<'buildings'>,
    });
    expect(
      (await t.query(api.view.playerView, seat)).me.foundation.some(
        (debt) => debt.key === 'mine' && debt.deposit === 'coal',
      ),
    ).toBe(false);
    // Et la dette du fer, elle, n'a pas bougé : une dette se solde sur son gisement.
    expect(
      (await t.query(api.view.playerView, seat)).me.foundation.some(
        (debt) => debt.key === 'mine' && debt.deposit === 'ore',
      ),
    ).toBe(true);
  });

  /** L'élévation en file sur ce mât part avec lui, remboursée : rien ne doit rebâtir sur une
   *  région qu'on vient de libérer. */
  it('reprend l’élévation en file et la rembourse', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    await promoteHq(t, seat, 3);
    await fillAll(t, seat);
    const station = await raise(t, seat, 'listening', MEURTHE, 1);
    // Une première entrée occupe la tête — elle court, donc la seconde attend, et c'est celle-là
    // qui se rembourse.
    await t.mutation(api.constructions.start, { ...seat, building: 'billets', regionId: ARDENNES });
    await t.mutation(api.constructions.start, {
      ...seat,
      building: 'listening',
      regionId: MEURTHE,
    });
    const refund = buildCost('listening', 2).alloy ?? 0;

    const before = (await stocks(t, seat)).alloy.stock;
    await t.mutation(api.buildings.demolish, { ...seat, buildingId: station });

    const view = await t.query(api.view.playerView, seat);
    expect(view.me.resources.alloy.stock).toBeCloseTo(before + refund, 5);
    const filed = [
      ...(view.me.construction === null ? [] : [view.me.construction]),
      ...view.me.constructionQueue,
    ];
    expect(filed.some((work) => work.regionId === MEURTHE)).toBe(false);
  });

  /** Cas 7 : le classement lit ce qui est debout — l'alliage d'un bâtiment rasé en sort. */
  it('retire l’alliage du bâtiment rasé du score d’industrie', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const mine = await raise(t, seat, 'mine', MOSELLE, 2);

    const withMine = industryOf(await buildingsOf(t, seat));
    await t.mutation(api.buildings.demolish, { ...seat, buildingId: mine });
    const without = industryOf(await buildingsOf(t, seat));

    expect(withMine - without).toBe(buildCost('mine', 1).alloy! + buildCost('mine', 2).alloy!);
  });
});

/** Le barème, lu sur ce que la vue sert comme debout : c'est exactement ce que `convex/press.ts`
 *  lui donne, et le point du cas 7 est qu'un bâtiment rasé n'y est plus. */
const industryOf = (buildings: ReadonlyArray<{ key: BuildingKey; level: number }>): number =>
  scoresOf({
    buildings: buildings.map((building) => ({
      key: building.key,
      level: building.level,
      disabled: false,
    })),
    troops: [],
    engagements: 0,
    heldCount: 0,
    heldByAnyone: 0,
    alloy: {
      ofLevel: (key, level) => buildCost(key as BuildingKey, level).alloy ?? 0,
      ofTroop: () => 0,
    },
  }).industry;
