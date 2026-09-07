import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import type { LonLat } from '../src/domain/geo';
import type { BuildingKey, ResourceKey } from '../src/domain/ids';
import { unlinkedProducers } from '../src/domain/next-actions';
import type { PlayerView } from '../src/domain/player-view';
import {
  EXTRACTION_PER_HOUR,
  OUTPOST_DISABLED_HOURS,
  OUTPOST_UPKEEP_PER_HOUR_PER_LEVEL,
  outpostReachKm,
} from './constants';
import { heldOver } from './holding';
import { regionFacts, regionOfOutpost } from './regions';
import { reportChange, settleBeforeChange } from './production';
import { economyOf, settle } from './resources';
import schema from './schema';
import { surveyFoundation } from './surveys';
import { modules } from './test.setup';

/**
 * **Un bâtiment ne produit que relié** (ADR 0020 §6). Ce fichier tient la règle par où elle
 * mord : le sol national qui ne se coupe jamais, l'avant-poste qui se fait désactiver, le voisin
 * qui se plante plus près, et le lot d'arsenal qu'une chaîne coupée refuse.
 *
 * L'heure est fausse partout : la coupure prend effet **à la date où elle se produit**, et c'est
 * exactement ce qu'un test de stock à deux dates mesure.
 */

const boot = () => convexTest(schema, modules);

const MARNE = 'FRA-5323'; // nourriture, sol français
const MEURTHE = 'FRA-5325'; // minerai, sol français
const PRAHOVA = 'ROU-310'; // pétrole roumain, le sol de personne
/** Le point de la Prahova lui-même : un avant-poste planté dessus tient sa propre région. */
const PRAHOVA_POINT = regionFacts(PRAHOVA)!.point;
/** Une région roumaine voisine, dans la portée d'un point de Prahova. */
const BUZAU = 'ROU-314';

const MIDDAY = Date.UTC(2026, 8, 7, 12);
const HOUR = 3_600_000;

async function launchedSeason(t: ReturnType<typeof boot>) {
  const { code, token } = await t.mutation(api.seasons.create, {
    nickname: 'Pierre',
    durationHours: 48,
    compensation: 0.5,
  });
  const { token: guest } = await t.mutation(api.seasons.join, { code, nickname: 'Léa' });
  await t.mutation(api.players.reserveNation, { token, nation: 'france' });
  await t.mutation(api.players.declareReady, { token, ready: true });
  await t.mutation(api.players.reserveNation, { token: guest, nation: 'ussr' });
  await t.mutation(api.players.declareReady, { token: guest, ready: true });
  await t.mutation(api.seasons.launch, { token });
  await disband(t, token);
  await disband(t, guest);
  return { token, guest };
}

const seatOf = (t: ReturnType<typeof boot>, token: string) =>
  t.run(async (ctx) => {
    const player = await ctx.db
      .query('players')
      .withIndex('byToken', (q) => q.eq('token', token))
      .unique();
    if (!player) throw new Error('player not found');
    return player;
  });

/** La compagnie offerte au lancement mange : ce qu'on mesure ici est ce que le sol rend. */
async function disband(t: ReturnType<typeof boot>, token: string) {
  const player = await seatOf(t, token);
  await t.run(async (ctx) => {
    const held = await ctx.db
      .query('troops')
      .withIndex('byPlayer', (q) => q.eq('playerId', player._id))
      .collect();
    for (const troop of held) await ctx.db.delete(troop._id);
  });
}

async function raise(
  t: ReturnType<typeof boot>,
  token: string,
  key: BuildingKey,
  regionId: string,
  level = 1,
): Promise<Id<'buildings'>> {
  const player = await seatOf(t, token);
  return t.run(async (ctx) =>
    ctx.db.insert('buildings', {
      seasonId: player.seasonId,
      playerId: player._id,
      key,
      regionId,
      level,
    }),
  );
}

/** Un point planté à la main, relevé comme la fondation le fait — ce qui est sous test est la
 *  couleur et ce qu'elle relie, pas la marche qui plante. */
async function plant(
  t: ReturnType<typeof boot>,
  token: string,
  point: LonLat,
  regionId: string,
  level = 1,
): Promise<Id<'outposts'>> {
  const player = await seatOf(t, token);
  const ground = { point: { lon: point[0], lat: point[1] }, hostCountry: 'ROU', regionId };
  return t.run(async (ctx) => {
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
    await surveyFoundation(
      ctx,
      player.seasonId,
      point,
      outpostReachKm(level),
      regionOfOutpost(ground),
      Date.now(),
    );
    return outpostId;
  });
}

const fill = async (
  t: ReturnType<typeof boot>,
  token: string,
  key: ResourceKey,
  stock: number,
): Promise<void> => {
  const player = await seatOf(t, token);
  await t.run(async (ctx) => {
    const rows = await ctx.db
      .query('resources')
      .withIndex('byPlayer', (q) => q.eq('playerId', player._id))
      .collect();
    const row = rows.find((candidate) => candidate.key === key);
    if (!row) throw new Error(`no ${key} row`);
    await ctx.db.patch(row._id, { stock, updatedAt: Date.now() });
  });
};

const stockOf = async (
  t: ReturnType<typeof boot>,
  token: string,
  key: ResourceKey,
): Promise<number> => {
  const player = await seatOf(t, token);
  return t.run(async (ctx) => (await economyOf(ctx, player._id, Date.now())).stocks[key]);
};

const rateOf = async (
  t: ReturnType<typeof boot>,
  token: string,
  key: ResourceKey,
): Promise<number> => {
  const player = await seatOf(t, token);
  return t.run(async (ctx) => (await economyOf(ctx, player._id, Date.now())).ratePerHour[key]);
};

const view = async (t: ReturnType<typeof boot>, token: string): Promise<PlayerView> =>
  (await t.query(api.view.playerView, { token })) as unknown as PlayerView;

/** Le journal se dérive des notices côté client (`domain/journal.ts`) : ce qu'on tient ici est
 *  la ligne déposée, qui est ce que le serveur doit écrire — et à qui. */
const noticesOf = async (
  t: ReturnType<typeof boot>,
  token: string,
  kind: Doc<'notices'>['kind'],
) => {
  const player = await seatOf(t, token);
  const filed = await t.run(async (ctx) =>
    ctx.db
      .query('notices')
      .withIndex('byPlayer', (q) => q.eq('playerId', player._id))
      .collect(),
  );
  return filed.filter((notice) => notice.kind === kind);
};

/**
 * **Le geste entier d'un changement de couleur** : régler, écrire, rendre compte — les trois dans
 * une seule transaction, exactement comme les deux appelants du jeu le font (`movements.ts`,
 * `movement/arrival.ts`). Ce qui est sous test ici est l'économie ; la marche qui amène le raid a
 * ses propres cas (`movements.test.ts`).
 */
const changeColour = (
  t: ReturnType<typeof boot>,
  seasonId: Id<'seasons'>,
  at: number,
  write: (ctx: Parameters<Parameters<ReturnType<typeof boot>['run']>[0]>[0]) => Promise<void>,
): Promise<null> =>
  t.run(async (ctx) => {
    const before = await settleBeforeChange(ctx, seasonId, at);
    await write(ctx);
    await reportChange(ctx, seasonId, before, at);
    return null;
  });

const disable = async (t: ReturnType<typeof boot>, outpostId: Id<'outposts'>, at: number) => {
  const outpost = (await t.run(async (ctx) => ctx.db.get(outpostId))) as Doc<'outposts'>;
  await changeColour(t, outpost.seasonId, at, async (ctx) => {
    await ctx.db.patch(outpostId, { disabledUntil: at + OUTPOST_DISABLED_HOURS * HOUR });
  });
};

describe('a building only produces when its region carries its colour', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  /** Cas 1 : le sol national est toujours relié — rien ne le prend (ADR 0004). */
  it('leaves a mine on national soil untouched', async () => {
    const t = boot();
    const { token } = await launchedSeason(t);
    await raise(t, token, 'mine', MEURTHE);

    const site = (await view(t, token)).me.extraction.find((one) => one.regionId === MEURTHE);
    expect(site?.linked).toBe(true);
    expect(site?.perHour).toBe(EXTRACTION_PER_HOUR.ore);
  });

  /** Cas 2, premier temps : sous un avant-poste vivant, le puits rend. */
  it('yields under a living outpost', async () => {
    const t = boot();
    const { token } = await launchedSeason(t);
    await plant(t, token, PRAHOVA_POINT, PRAHOVA);
    await raise(t, token, 'oilWell', PRAHOVA);

    const site = (await view(t, token)).me.extraction.find((one) => one.regionId === PRAHOVA);
    expect(site?.linked).toBe(true);
    expect(site?.perHour).toBe(EXTRACTION_PER_HOUR.oil);
  });

  /**
   * Cas 2, second temps : **le même point désactivé par un raid** (ADR 0020 §7). Le débit tombe
   * à zéro à l'heure de la désactivation, et le stock réglé à cette date est celui des heures
   * que le point a bien tenues — jamais une heure de plus.
   */
  it('yields nothing from the hour the outpost goes out of service, and not one hour before', async () => {
    const t = boot();
    const { token } = await launchedSeason(t);
    const outpostId = await plant(t, token, PRAHOVA_POINT, PRAHOVA);
    await raise(t, token, 'oilWell', PRAHOVA);
    await fill(t, token, 'oil', 0);

    // Trois heures de plein débit, puis le raid.
    const raidedAt = MIDDAY + 3 * HOUR;
    vi.setSystemTime(raidedAt);
    await disable(t, outpostId, raidedAt);

    const atRaid = await stockOf(t, token, 'oil');
    expect(atRaid).toBeCloseTo(3 * EXTRACTION_PER_HOUR.oil, 2);

    // Cinq heures de plus, hors service : rien n'a bougé, au centième.
    vi.setSystemTime(raidedAt + 5 * HOUR);
    expect(await rateOf(t, token, 'oil')).toBe(0);
    expect(await stockOf(t, token, 'oil')).toBeCloseTo(atRaid, 2);

    const site = (await view(t, token)).me.extraction.find((one) => one.regionId === PRAHOVA);
    expect(site?.linked).toBe(false);
    expect(site?.perHour).toBe(0);
  });

  /**
   * **La couleur revient seule, et la dépêche avec elle.** La fin d'une désactivation est le seul
   * événement de couleur que personne n'ordonne : le raid en a pris le rendez-vous, et le
   * règlement se fait **à `disabledUntil` exactement** — les heures hors service restent à zéro,
   * quelle que soit l'heure à laquelle le travail se réveille.
   */
  it('gives the colour back at the end of the window, without crediting the hours it lost', async () => {
    const t = boot();
    const { token } = await launchedSeason(t);
    const outpostId = await plant(t, token, PRAHOVA_POINT, PRAHOVA);
    await raise(t, token, 'oilWell', PRAHOVA);
    await fill(t, token, 'oil', 0);
    await disable(t, outpostId, MIDDAY);

    const player = await seatOf(t, token);
    const backAt = MIDDAY + OUTPOST_DISABLED_HOURS * HOUR;
    // Le travail se réveille en retard, exprès : c'est le cas que la borne inclusive tient.
    vi.setSystemTime(backAt + 2 * HOUR);
    await t.mutation(internal.production.restoreAfterDisabling, {
      seasonId: player.seasonId,
      at: backAt,
    });

    expect(await noticesOf(t, token, 'productionRestored')).toMatchObject([{ sites: 1 }]);
    expect((await view(t, token)).me.regions.find((one) => one.id === PRAHOVA)?.linked).toBe(true);
    // Deux heures de plein débit depuis le retour, et pas une des heures perdues.
    expect(await stockOf(t, token, 'oil')).toBeCloseTo(2 * EXTRACTION_PER_HOUR.oil, 2);
  });

  /**
   * Cas 3 : deux points se disputent la région, le plus proche l'emporte. L'adversaire se plante
   * plus près, mon extracteur passe hors réseau — et la dépêche est chez moi, chez moi seul.
   */
  it('cuts the further outpost and files the dispatch at the owner only', async () => {
    const t = boot();
    const { token, guest } = await launchedSeason(t);
    // Mon point tient la Buzău depuis la Prahova, et j'y bâtis.
    await plant(t, token, PRAHOVA_POINT, PRAHOVA);
    await raise(t, token, 'mine', BUZAU);
    expect((await view(t, token)).me.regions.find((one) => one.id === BUZAU)?.linked).toBe(true);

    // L'adversaire se plante dans la Buzău même : à distance nulle, il la tient.
    const buzau = regionFacts(BUZAU)!.point;
    const rival = await seatOf(t, guest);
    await changeColour(t, rival.seasonId, Date.now(), async (ctx) => {
      const ground = {
        point: { lon: buzau[0], lat: buzau[1] },
        hostCountry: 'ROU',
        regionId: BUZAU,
      };
      await ctx.db.insert('outposts', {
        seasonId: rival.seasonId,
        playerId: rival._id,
        ...ground,
        level: 1,
        specialization: 'relay',
        foundedAt: Date.now(),
        disabledUntil: null,
        immuneUntil: null,
      });
    });

    const mine = (await view(t, token)).me.regions.find((one) => one.id === BUZAU);
    expect(mine?.linked).toBe(false);
    expect(await noticesOf(t, token, 'productionCut')).toMatchObject([
      { sites: 1, hostCountry: 'ROU' },
    ]);
    expect(await noticesOf(t, guest, 'productionCut')).toEqual([]);
  });

  /** Cas 4 : une fonderie coupée ne convertit pas, et refuse le lot. */
  it('refuses a lot on a cut chain', async () => {
    const t = boot();
    const { token } = await launchedSeason(t);
    const outpostId = await plant(t, token, PRAHOVA_POINT, PRAHOVA);
    await raise(t, token, 'arsenal', PRAHOVA);
    await fill(t, token, 'alloy', 500);

    const running = (await view(t, token)).me.chains.find((chain) => chain.by === 'arsenal');
    expect(running?.state).not.toBe('unlinked');

    vi.setSystemTime(MIDDAY + HOUR);
    await disable(t, outpostId, MIDDAY + HOUR);

    const cut = (await view(t, token)).me.chains.find((chain) => chain.by === 'arsenal');
    expect(cut?.state).toBe('unlinked');
    expect(cut?.perHour).toBe(0);

    await expect(
      t.mutation(api.industry.order, { token, chain: 'arsenal', quantity: 4 }),
    ).rejects.toThrow(/SITE_UNLINKED/);
  });

  /**
   * Cas 5 : la couleur est **une seule lecture**. Ce que `control.held` peint et ce que la
   * production relie sortent de la même fonction — un test qui appelle les deux et compare.
   */
  it('paints and links off one and the same reading', async () => {
    const t = boot();
    const { token } = await launchedSeason(t);
    await plant(t, token, PRAHOVA_POINT, PRAHOVA);
    await raise(t, token, 'oilWell', PRAHOVA);
    const player = await seatOf(t, token);

    const painted = await t.query(api.control.held, { token });
    const mine = painted.find((holder) => holder.playerId === player._id);
    const regions = new Set(mine?.regions.map((region) => region.id));

    /** La vérité, lue par la fonction unique — rendue en paires, un `Map` ne franchit pas la
     *  frontière d'une transaction de test. */
    const truth = await t.run(async (ctx) => [
      ...(await heldOver(
        ctx,
        player.seasonId,
        [regionFacts(PRAHOVA)!, regionFacts(MARNE)!],
        Date.now(),
      )),
    ]);
    const holderOf = new Map(truth);

    // La région du point et le sol national : peintes chez lui, tenues par lui, reliées.
    const seen = await view(t, token);
    for (const regionId of [PRAHOVA, MARNE]) {
      expect(regions.has(regionId)).toBe(true);
      expect(holderOf.get(regionId)).toBe(player._id);
      expect(seen.me.regions.find((one) => one.id === regionId)?.linked).toBe(true);
    }
  });

  /** Cas 6 : un observateur lit le tampon, il n'a rien à cliquer — et la carte reste absente. */
  it('serves the state to an observer and no action', async () => {
    const t = boot();
    const { token } = await launchedSeason(t);
    const outpostId = await plant(t, token, PRAHOVA_POINT, PRAHOVA);
    await raise(t, token, 'oilWell', PRAHOVA);
    await disable(t, outpostId, MIDDAY);
    await t.mutation(api.players.surrender, { token });

    const seen = await view(t, token);
    expect(seen.me.defeated).toBe(true);
    expect(seen.me.regions.find((one) => one.id === PRAHOVA)?.linked).toBe(false);
    // La carte « à faire maintenant » n'existe pas pour un observateur (décision du 31/08) ;
    // l'état, lui, se lit toujours.
    expect(unlinkedProducers(seen)).toHaveLength(1);
  });

  /** La carte « à faire maintenant » compte les sites coupés, et mène au premier. */
  it('raises one line for the cut sites, whatever their number', async () => {
    const t = boot();
    const { token } = await launchedSeason(t);
    const outpostId = await plant(t, token, PRAHOVA_POINT, PRAHOVA);
    const well = await raise(t, token, 'oilWell', PRAHOVA);
    await raise(t, token, 'arsenal', BUZAU);
    await disable(t, outpostId, MIDDAY);

    const cut = unlinkedProducers(await view(t, token));
    expect(cut.map((building) => building.id)).toContain(well);
    expect(cut).toHaveLength(2);
  });

  /** Le stockage, la projection et le QG ne produisent rien : rien ne s'y coupe. */
  it('never cuts what does not produce', async () => {
    const t = boot();
    const { token } = await launchedSeason(t);
    const outpostId = await plant(t, token, PRAHOVA_POINT, PRAHOVA);
    await raise(t, token, 'warehouse', PRAHOVA);
    await raise(t, token, 'barracks', BUZAU);
    await disable(t, outpostId, MIDDAY);

    expect(unlinkedProducers(await view(t, token))).toHaveLength(0);
  });

  /** L'entretien de l'avant-poste ne bouge pas : la désactivation prend ce que le point *donne*,
   *  elle ne fait pas de remise (ADR 0020 §10). */
  it('keeps billing the outpost while it is out of service', async () => {
    const t = boot();
    const { token } = await launchedSeason(t);
    const outpostId = await plant(t, token, PRAHOVA_POINT, PRAHOVA);
    await disable(t, outpostId, MIDDAY);

    const player = await seatOf(t, token);
    const upkeep = await t.run(async (ctx) => (await economyOf(ctx, player._id, MIDDAY)).upkeep);
    expect(upkeep.outpostPerHour.coal).toBe(OUTPOST_UPKEEP_PER_HOUR_PER_LEVEL.coal);
  });

  /** Rien n'est stocké de la couleur : un règlement de plus ne change pas un chiffre. */
  it('settles twice to the same figure', async () => {
    const t = boot();
    const { token } = await launchedSeason(t);
    await raise(t, token, 'mine', MEURTHE);
    await fill(t, token, 'ore', 0);
    const player = await seatOf(t, token);

    vi.setSystemTime(MIDDAY + 2 * HOUR);
    const once = await t.run(async (ctx) => (await settle(ctx, player._id, Date.now())).stocks.ore);
    const twice = await t.run(
      async (ctx) => (await settle(ctx, player._id, Date.now())).stocks.ore,
    );
    expect(twice).toBeCloseTo(once, 6);
  });
});
