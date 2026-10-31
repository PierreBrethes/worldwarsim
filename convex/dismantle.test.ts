import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { RESOURCES, type BuildingKey } from '../src/domain/ids';
import { buildCost, outpostReachKm } from './constants';
import { regionFacts } from './regions';
import { surveyFoundation } from './surveys';
import schema from './schema';
import { modules } from './test.setup';
import { foundSeat, joinSeat, placeHq, seatIn, pointIn } from './seats.fixture';
import type { Seat } from './seats.fixture';

const boot = () => convexTest({ schema, modules, transactionLimits: true });

/** Le pétrole roumain : le sol de personne, loin de toute capitale — ce qu'un avant-poste est
 *  fait pour tenir, et ce que le démantèlement fait perdre. */
const PRAHOVA = 'ROU-310';
const PARIS = 'FRA-5333';

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

/** Posé à la main : ce qui est sous test est le démantèlement, pas la marche qui plante le
 *  point — elle a ses propres tests (`movements.test.ts`). */
async function plant(
  t: ReturnType<typeof boot>,
  seat: Seat,
  regionId = PRAHOVA,
  level = 1,
): Promise<Id<'outposts'>> {
  const region = regionFacts(regionId)!;
  return t.run(async (ctx) => {
    const player = await seatIn(ctx, seat);
    const ground = {
      point: { lon: region.point[0], lat: region.point[1] },
      hostCountry: region.country,
      regionId,
    };
    const outpostId = await ctx.db.insert('outposts', {
      seasonId: player.seasonId,
      playerId: player._id,
      ...ground,
      level,
      specialization: 'relay',
      foundedAt: Date.now(),
      disabledUntil: null,
      immuneUntil: null,
    });
    /** Le sol neuf entre dans les relevés comme la fondation l'écrit : sans lui, la carte du
     *  joueur ignore une couleur que la vérité lui donne (ADR 0020 §5). */
    await surveyFoundation(ctx, player.seasonId, region.point, outpostReachKm(level), Date.now());
    return outpostId;
  });
}

async function anchor(
  t: ReturnType<typeof boot>,
  seat: Seat,
  key: BuildingKey,
  regionId: string,
  outpostId: Id<'outposts'> | null,
  level = 1,
): Promise<Id<'buildings'>> {
  return t.run(async (ctx) => {
    const player = await seatIn(ctx, seat);
    return ctx.db.insert('buildings', {
      seasonId: player.seasonId,
      playerId: player._id,
      key,
      regionId,
      point: pointIn(regionId),
      level,
      outpostId,
    });
  });
}

async function station(
  t: ReturnType<typeof boot>,
  seat: Seat,
  outpostId: Id<'outposts'>,
): Promise<Id<'troops'>> {
  return t.run(async (ctx) => {
    const player = await seatIn(ctx, seat);
    return ctx.db.insert('troops', {
      seasonId: player.seasonId,
      playerId: player._id,
      role: 'infantry',
      tier: 1,
      nominalStrength: 50,
      currentStrength: 50,
      stationedAt: outpostId,
    });
  });
}

async function fillAll(t: ReturnType<typeof boot>, seat: Seat, stock = 10_000) {
  await t.run(async (ctx) => {
    const player = await seatIn(ctx, seat);
    for (const row of await ctx.db
      .query('resources')
      .withIndex('byPlayer', (q) => q.eq('playerId', player._id))
      .collect()) {
      if (RESOURCES.includes(row.key))
        await ctx.db.patch(row._id, { stock, updatedAt: Date.now() });
    }
  });
}

const noticesOf = async (t: ReturnType<typeof boot>, seat: Seat, kind: Doc<'notices'>['kind']) => {
  const rows = await t.run(async (ctx) => {
    const player = await seatIn(ctx, seat);
    return ctx.db
      .query('notices')
      .withIndex('byPlayer', (q) => q.eq('playerId', player._id))
      .collect();
  });
  return rows.filter((notice) => notice.kind === kind);
};

const outpostsOf = async (t: ReturnType<typeof boot>, seat: Seat) =>
  (await t.query(api.view.playerView, seat)).me.outposts;

/**
 * **Un point à soi se démonte** (décision de Pierre, 16/09, Registre 27). Ce qu'il emporte n'est
 * pas ce qu'un mât emporte : un avant-poste est un **site** — il colore un sol, il ancre des
 * bâtiments, il héberge une garnison — et les trois partent avec lui.
 */
describe('démanteler un avant-poste', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /** Cas 4 : la couleur, les bâtiments ancrés, la garnison au sol, aucun remboursement. */
  it('efface le point, ce qu’il ancre et la couleur, et rend la garnison au sol', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const point = await plant(t, seat);
    const mine = await anchor(t, seat, 'oilWell', PRAHOVA, point);
    const troop = await station(t, seat, point);

    /** La couleur perdue est annoncée avant le clic, et c'est la même lecture que le serveur
     *  refera : la zone hachurée d'un point hors service sort de la même fonction. */
    const announced = await t.query(api.outposts.soleHold, { ...seat, outpostId: point });
    expect(announced.regions).toBeGreaterThan(0);
    const coloured = (await t.query(api.control.held, seat)).find(
      (holder) => holder.nickname === 'Pierre',
    );
    expect(coloured?.regions.map((region) => region.id)).toContain(PRAHOVA);

    const before = (await t.query(api.view.playerView, seat)).me.resources.steel.stock;
    const done = await t.mutation(api.outposts.dismantle, { ...seat, outpostId: point });
    expect(done.buildings).toBe(1);

    const view = await t.query(api.view.playerView, seat);
    expect(view.me.outposts).toHaveLength(0);
    expect(view.me.buildings.some((building) => building.id === mine)).toBe(false);
    /** **Aucun remboursement** (5a) : ni la fondation, ni les élévations, ni l'acier du mât. */
    expect(view.me.resources.steel.stock).toBeCloseTo(before, 5);

    /** La garnison passe au sol, au point — elle ne meurt pas (règle 3, ADR 0019). */
    const posted = view.me.troops.find((candidate) => candidate.id === troop);
    expect(posted?.stationedAt.kind).toBe('point');

    const said = await noticesOf(t, seat, 'outpostDismantled');
    expect(said).toHaveLength(1);
    expect(said[0]).toMatchObject({ hostCountry: 'ROU', level: 1, buildings: 1 });
  });

  /**
   * **La couleur part avec le point, et le sol du joueur est relevé** (décision (a) du 31/10). Le
   * point tenait la région à jour ; démantelé, le serveur relève le sol au point : la région
   * n'est plus à lui et sort de sa carte, au lieu de rester un souvenir daté.
   */
  it('relève le sol au démantèlement : la région sort de la carte du joueur', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const point = await plant(t, seat);
    const readOf = async () =>
      (await t.query(api.control.held, seat))
        .find((holder) => holder.nickname === 'Pierre')
        ?.regions.find((region) => region.id === PRAHOVA);

    expect((await readOf())?.state).toBe('current');
    await t.mutation(api.outposts.dismantle, { ...seat, outpostId: point });
    expect(await readOf()).toBeUndefined();
  });

  /** Un mât sur le sol national ne dépend d'aucun point : il reste debout. */
  it('laisse debout ce que le point n’ancrait pas', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const point = await plant(t, seat);
    const home = await anchor(t, seat, 'listening', PARIS, null);

    await t.mutation(api.outposts.dismantle, { ...seat, outpostId: point });
    const view = await t.query(api.view.playerView, seat);
    expect(view.me.buildings.some((building) => building.id === home)).toBe(true);
  });

  /** Cas 5 : une élévation en file s'annule selon la règle de la file — ce qui n'a pas commencé
   *  revient entier, et l'entrée part dans tous les cas. */
  it('annule l’élévation en file et rend ce que la file rend', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const point = await plant(t, seat);
    await fillAll(t, seat);
    /** Une première entrée occupe la tête de file, donc l'élévation attend et n'a pas commencé :
     *  c'est le seul état où la file rembourse. */
    await t.mutation(api.constructions.start, {
      ...seat,
      building: 'oilWell',
      regionId: PRAHOVA,
      point: pointIn(PRAHOVA),
    });
    await t.mutation(api.constructions.raiseOutpost, { ...seat, outpostId: point });

    const before = (await t.query(api.view.playerView, seat)).me.resources.steel.stock;
    const done = await t.mutation(api.outposts.dismantle, { ...seat, outpostId: point });
    expect(done.refunded.steel).toBe(buildCost('outpost', 2).steel);

    const view = await t.query(api.view.playerView, seat);
    expect(view.me.constructionQueue.some((work) => work.outpostId === point)).toBe(false);
    expect(view.me.resources.steel.stock).toBeCloseTo(before + (done.refunded.steel ?? 0), 5);
  });

  /** Un chantier de fondation se démantèle comme le reste : ce qu'on retire est une promesse. */
  it('démantèle un point encore en chantier', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const point = await plant(t, seat);
    await t.run(async (ctx) => ctx.db.patch(point, { standsAt: Date.now() + 3_600_000 }));

    await t.mutation(api.outposts.dismantle, { ...seat, outpostId: point });
    expect(await outpostsOf(t, seat)).toHaveLength(0);
  });

  /** Le point d'un autre n'est pas à nous, et le mot est le même que pour un mât. */
  it('refuse le point d’un autre', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const point = await plant(t, guest);
    await expect(t.mutation(api.outposts.dismantle, { ...seat, outpostId: point })).rejects.toThrow(
      'NOT_YOURS',
    );
  });

  /**
   * **On ne retire pas la route sous une colonne** : un relais dans la portée duquel un mouvement
   * marche a déjà payé son allure. C'est la lecture qui scelle le métier du point, et il n'y en a
   * pas deux (`specializationsServed`).
   */
  it('refuse tant qu’une colonne s’appuie sur le point', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const point = await plant(t, seat);
    const troop = await station(t, seat, point);
    const region = regionFacts(PRAHOVA)!;

    await t.mutation(api.movements.marchTo, {
      ...seat,
      origin: { kind: 'outpost', outpostId: point },
      troopIds: [troop],
      point: { lon: region.point[0] + 0.4, lat: region.point[1] },
    });

    await expect(t.mutation(api.outposts.dismantle, { ...seat, outpostId: point })).rejects.toThrow(
      'OUTPOST_SERVING',
    );
  });
});

/**
 * **Une pile armée sur un point à soi n'a qu'une branche** (décision du 16/09) : entrer en
 * garnison. La marche existe sur le sien et sur lui seul ; l'assaut y reste fratricide.
 */
describe('entrer en garnison dans son propre avant-poste', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('accepte la marche vers le sien et refuse l’assaut', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const point = await plant(t, seat);
    const far = await plant(t, seat, 'ROU-311');
    const troop = await station(t, seat, far);

    await expect(
      t.mutation(api.movements.attack, {
        ...seat,
        origin: { kind: 'outpost', outpostId: far },
        troopIds: [troop],
        target: { kind: 'outpost', outpostId: point },
      }),
    ).rejects.toThrow('FRIENDLY_TARGET');

    const sent = await t.mutation(api.movements.enterOutpost, {
      ...seat,
      origin: { kind: 'outpost', outpostId: far },
      troopIds: [troop],
      outpostId: point,
    });
    expect(sent).toBeTruthy();

    /** La colonne arrive et **entre** : son adresse est le point, pas le sol devant lui. */
    await t.run(async (ctx) => {
      const movements = await ctx.db.query('movements').collect();
      for (const movement of movements) await ctx.db.patch(movement._id, { arrivesAt: Date.now() });
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const inside = await t.run(async (ctx) => ctx.db.get(troop));
    expect(inside?.stationedAt).toBe(point);
  });

  it('refuse la marche vers un avant-poste qui n’est pas le sien', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const theirs = await plant(t, guest);
    const mine = await plant(t, seat, 'ROU-311');
    const troop = await station(t, seat, mine);

    await expect(
      t.mutation(api.movements.enterOutpost, {
        ...seat,
        origin: { kind: 'outpost', outpostId: mine },
        troopIds: [troop],
        outpostId: theirs,
      }),
    ).rejects.toThrow('POINT_TARGET_ONLY');
  });
});
